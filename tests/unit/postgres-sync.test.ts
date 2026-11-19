import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { demoChanges } from '../../src/lib/demo';
import { rowsOf, type Row } from '../../src/lib/domain';
import { AuditDatabase, Repository, recordId } from '../../src/lib/local';
import { synchronize, type Transport } from '../../src/lib/sync';

type DbRow = Row & { updated_at: string };
const decode = ({ updated_at, ...row }: DbRow) =>
  ({ ...row, updatedAt: updated_at }) as Row;

it('synchronizes the entire catalog to PostgreSQL and resolves actual cross-device response conflicts', async () => {
  const db = new PGlite();
  const laptopDb = new AuditDatabase('postgres-laptop');
  const phoneDb = new AuditDatabase('postgres-phone');
  const owner = crypto.randomUUID();
  const laptop = new Repository(owner, laptopDb),
    phone = new Repository(owner, phoneDb);

  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;`);
    await db.exec(
      await readFile('supabase/migrations/202611190001_auditflow.sql', 'utf8'),
    );
    await db.query('insert into auth.users values ($1)', [owner]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);

    const remote: Transport = {
      async push(actor, { key, base, change }) {
        type Result = {
          result:
            | { state: 'applied'; row: DbRow }
            | { state: 'conflict'; row: DbRow | null; reason?: string };
        };
        const query = await db.query<Result>(
          'select public.apply_auditflow_mutation($1,$2,$3,$4,$5,$6,$7) as result',
          [
            actor,
            key,
            change.id,
            change.kind,
            base,
            JSON.stringify(change.data),
            change.deleted ?? false,
          ],
        );
        const { result } = query.rows[0];
        return result.state === 'applied'
          ? { state: 'applied', row: decode(result.row) }
          : { ...result, row: result.row && decode(result.row) };
      },
      async pull(actor, cursor) {
        const result = await db.query<DbRow>(
          'select id,kind,data,deleted,version,revision,updated_at::text from public.auditflow_records where owner_id = $1 and revision > $2 order by revision limit 250',
          [actor, cursor],
        );
        return result.rows.map(decode);
      },
    };

    await laptop.seed(await demoChanges());
    await synchronize(laptop, remote);
    await synchronize(phone, remote);
    expect(await laptop.pending()).toEqual([]);
    const records = await phone.records();
    expect(rowsOf(records, 'audit')).toHaveLength(12);
    expect(rowsOf(records, 'capa')).toHaveLength(3);

    const audit = rowsOf(records, 'audit').find(
      (item) => item.data.status === 'in_progress',
    );
    expect(audit).toBeDefined();
    const snapshot = rowsOf(records, 'snapshot').find(
      (item) => item.id === audit?.data.snapshotId,
    );
    if (!audit || !snapshot)
      throw Error('The demo needs an in-progress audit.');
    const question = snapshot.data.sections[0].questions[0];
    await laptop.answer(audit.id, question.id, {
      value: 'no',
      notes: 'Laptop recorded an issue.',
    });
    await phone.answer(audit.id, question.id, {
      value: 'na',
      notes: 'Phone follow-up.',
    });
    await synchronize(laptop, remote);
    await synchronize(phone, remote);
    expect((await phone.conflicts())[0]?.remote?.data).toMatchObject({
      value: 'no',
      notes: 'Laptop recorded an issue.',
    });
    const id = await recordId(audit.id, question.id);
    await phone.resolve(id, 'local');
    await synchronize(phone, remote);
    await synchronize(laptop, remote);
    expect(
      (await laptop.records()).find((row) => row.id === id)?.data,
    ).toMatchObject({ value: 'na', notes: 'Phone follow-up.' });
    expect(await phone.pending()).toEqual([]);
  } finally {
    await Promise.all([db.close(), phoneDb.delete(), laptopDb.delete()]);
  }
}, 15_000);
