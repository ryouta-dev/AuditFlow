import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AuditDatabase,
  Repository,
  recordId,
  type Mutation,
} from '../../src/lib/local';
import { synchronize, type Transport } from '../../src/lib/sync';
import { blankQuestion, type Data, type Row } from '../../src/lib/domain';

const databases: AuditDatabase[] = [];
function device(owner = 'alice') {
  const db = new AuditDatabase(`auditflow-test-${crypto.randomUUID()}`);
  databases.push(db);
  return new Repository(owner, db);
}
afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

function server() {
  const records = new Map<string, Row>(),
    receipts = new Map<string, Row>();
  let revision = 0;
  const calls: Mutation[] = [];
  const transport: Transport = {
    async push(owner, mutation) {
      calls.push(mutation);
      const prior = receipts.get(`${owner}:${mutation.key}`);
      if (prior) return { state: 'applied', row: prior };
      const current = records.get(`${owner}:${mutation.change.id}`);
      if (current && mutation.base !== current.version)
        return { state: 'conflict', row: current };
      const row = {
        ...mutation.change,
        deleted: mutation.change.deleted ?? false,
        version: mutation.base + 1,
        revision: ++revision,
        updatedAt: new Date().toISOString(),
      } as Row;
      records.set(`${owner}:${row.id}`, row);
      receipts.set(`${owner}:${mutation.key}`, row);
      return { state: 'applied', row };
    },
    async pull(owner, cursor) {
      return Array.from(records.entries())
        .filter(
          ([key, row]) => key.startsWith(`${owner}:`) && row.revision > cursor,
        )
        .map(([, row]) => row)
        .sort((a, b) => a.revision - b.revision);
    },
  };
  return { transport, calls };
}

const question = { ...blankQuestion(), title: 'Exit is unobstructed' };
const auditId = crypto.randomUUID();
const audit: Data<'audit'> = {
  snapshotId: crypto.randomUUID(),
  title: 'Building check',
  entity: 'Building A',
  date: '2026-11-19',
  location: '',
  notes: '',
  status: 'in_progress',
  events: [{ status: 'in_progress', at: '2026-11-19T00:00:00.000Z' }],
};

describe('offline queue', () => {
  it('commits data and operations before close and retries an ambiguous acknowledged request with its original key', async () => {
    const first = device();
    const cloud = server();
    await first.write({ kind: 'audit', id: auditId, data: audit });
    await first.answer(auditId, question.id, { value: 'yes' });
    await first.answer(auditId, question.id, { notes: 'Saved before closing' });
    const name = first.store.name;
    first.store.close();
    const reopened = new AuditDatabase(name);
    databases.push(reopened);
    const next = new Repository('alice', reopened);
    expect((await next.pending()).map((op) => op.change.kind)).toEqual([
      'audit',
      'answer',
    ]);
    let dropped = false;
    const flaky: Transport = {
      ...cloud.transport,
      async push(owner, mutation) {
        const result = await cloud.transport.push(owner, mutation);
        if (mutation.change.kind === 'answer' && !dropped) {
          dropped = true;
          throw Error('Connection dropped after commit');
        }
        return result;
      },
    };
    await expect(synchronize(next, flaky)).rejects.toThrow(
      'Connection dropped',
    );
    const pending = (await next.pending())[0];
    await next.answer(auditId, question.id, {
      notes: 'Edit after connection dropped',
    });
    expect((await next.pending()).map((op) => op.base)).toEqual([0, 1]);
    await synchronize(next, flaky);
    expect(
      cloud.calls
        .filter((op) => op.change.kind === 'answer')
        .map((op) => op.key)
        .slice(0, 2),
    ).toEqual([pending.key, pending.key]);
    expect(await next.pending()).toEqual([]);
    expect(
      (await next.records()).find((row) => row.kind === 'answer'),
    ).toMatchObject({
      version: 2,
      data: { value: 'yes', notes: 'Edit after connection dropped' },
    });
    expect(await new Repository('bob', reopened).records()).toEqual([]);
  });

  it('merges different questions and preserves both versions of an overlapping response', async () => {
    const laptop = device(),
      phone = device();
    const cloud = server();
    const other = blankQuestion();
    await laptop.write({ kind: 'audit', id: auditId, data: audit });
    await synchronize(laptop, cloud.transport);
    await synchronize(phone, cloud.transport);
    await laptop.answer(auditId, question.id, {
      value: 'yes',
      notes: 'Laptop',
    });
    await phone.answer(auditId, other.id, { value: 'na' });
    await phone.answer(auditId, question.id, { value: 'no', notes: 'Phone' });
    await synchronize(laptop, cloud.transport);
    await synchronize(phone, cloud.transport);
    const id = await recordId(auditId, question.id);
    expect((await phone.conflicts())[0].remote?.data).toMatchObject({
      value: 'yes',
      notes: 'Laptop',
    });
    expect(
      (await phone.records()).find((row) => row.id === id)?.data,
    ).toMatchObject({ value: 'no', notes: 'Phone' });
    await phone.resolve(id, 'local');
    await synchronize(phone, cloud.transport);
    await synchronize(laptop, cloud.transport);
    expect(await phone.conflicts()).toEqual([]);
    expect(
      (await laptop.records())
        .filter((row) => row.kind === 'answer')
        .map((row) => row.data.value)
        .sort(),
    ).toEqual(['na', 'no']);
  });

  it('preserves lifecycle events even when consecutive changes concern the same record', async () => {
    const repo = device();
    await repo.write({ kind: 'audit', id: auditId, data: audit });
    await repo.write({
      kind: 'audit',
      id: auditId,
      data: {
        ...audit,
        status: 'completed',
        events: [
          ...audit.events,
          { status: 'completed', at: '2026-11-19T01:00:00.000Z' },
        ],
      },
    });
    expect((await repo.pending()).map((op) => op.base)).toEqual([0, 1]);
  });
});
