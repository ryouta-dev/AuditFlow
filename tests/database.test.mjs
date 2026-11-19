import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('Postgres validates inspectors, ownership, versions, completion, and storage access', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
    create table storage.objects (name text, bucket_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
  `);
  for (const migration of [
    '202611190001_auditflow.sql',
    '202611190002_evidence_bucket.sql',
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}`, import.meta.url),
        'utf8',
      ),
    );
  const alice = randomUUID(),
    bob = randomUUID();
  await db.query('insert into auth.users values ($1),($2)', [alice, bob]);
  async function role(name, id = '') {
    await db.exec(name === 'anon' ? 'set role anon' : 'set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  }
  const uid = {
    template: randomUUID(),
    snapshot: randomUUID(),
    audit: randomUUID(),
    question: randomUUID(),
    draft: randomUUID(),
  };
  const blueprint = {
    name: 'Facility readiness',
    description: '',
    sections: [
      {
        id: randomUUID(),
        title: 'Safety',
        questions: [
          {
            id: uid.question,
            title: 'Exit is clear',
            description: '',
            type: 'boolean',
            required: true,
            weight: 2,
            severity: 'high',
            options: [],
          },
        ],
      },
    ],
  };
  const audit = {
    snapshotId: uid.snapshot,
    title: 'Warehouse audit',
    entity: 'Warehouse',
    location: '',
    date: '2026-11-19',
    notes: '',
    status: 'in_progress',
    events: [{ status: 'in_progress', at: '2026-11-19T00:00:00.000Z' }],
  };
  const completed = {
    ...audit,
    status: 'completed',
    events: [
      ...audit.events,
      { status: 'completed', at: '2026-11-19T01:00:00.000Z' },
    ],
  };
  const params =
    'select public.apply_auditflow_mutation($1,$2,$3,$4,$5,$6,$7) as result';
  const send = (
    actor,
    id,
    kind,
    data,
    base = 0,
    key = randomUUID(),
    deleted = false,
  ) =>
    db
      .query(params, [
        actor,
        key,
        id,
        kind,
        base,
        JSON.stringify(data),
        deleted,
      ])
      .then((result) => result.rows[0].result);

  await role('anon');
  await assert.rejects(
    db.query('select * from public.auditflow_records'),
    /permission denied/,
  );
  await assert.rejects(
    send(alice, uid.template, 'template', { ...blueprint, status: 'draft' }),
    /permission denied/,
  );
  await role('authenticated', alice);
  await assert.rejects(
    send(bob, uid.template, 'template', { ...blueprint, status: 'draft' }),
    /Account mismatch/,
  );
  await assert.rejects(
    db.query('delete from public.auditflow_records'),
    /permission denied/,
  );
  const key = randomUUID();
  const created = await send(
    alice,
    uid.template,
    'template',
    { ...blueprint, status: 'draft' },
    0,
    key,
  );
  assert.deepEqual(
    await send(
      alice,
      uid.template,
      'template',
      { ...blueprint, status: 'draft' },
      0,
      key,
    ),
    created,
  );
  await assert.rejects(
    send(
      alice,
      uid.template,
      'template',
      { ...blueprint, status: 'archived' },
      0,
      key,
    ),
    /reused/,
  );
  const invalid = { ...blueprint, sections: [] };
  await assert.rejects(
    send(alice, uid.snapshot, 'snapshot', {
      ...invalid,
      templateId: uid.template,
      number: 1,
    }),
    /Invalid checklist version/,
  );
  const snapshot = await send(alice, uid.snapshot, 'snapshot', {
    ...blueprint,
    templateId: uid.template,
    number: 1,
  });
  assert.equal(snapshot.row.data.number, 1);
  const second = await send(alice, randomUUID(), 'snapshot', {
    ...blueprint,
    templateId: uid.template,
    number: 1,
  });
  assert.equal(second.row.data.number, 2);
  await assert.rejects(
    send(
      alice,
      uid.snapshot,
      'snapshot',
      { ...blueprint, templateId: uid.template, number: 1 },
      1,
    ),
    /immutable/,
  );
  await send(
    alice,
    uid.template,
    'template',
    { ...blueprint, status: 'published' },
    1,
  );
  await send(alice, uid.audit, 'audit', audit);
  const blockedCompletion = await send(alice, uid.audit, 'audit', completed, 1);
  assert.equal(blockedCompletion.state, 'conflict');
  assert.match(blockedCompletion.reason, /missing required answers/);
  const hex = createHash('sha256')
    .update(`${uid.audit}/${uid.question}`)
    .digest('hex');
  const answerId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const answer = {
    auditId: uid.audit,
    questionId: uid.question,
    value: 'yes',
    notes: 'Clear',
  };
  await assert.rejects(
    send(alice, randomUUID(), 'answer', answer),
    /Invalid response/,
  );
  await assert.rejects(
    send(alice, answerId, 'answer', { ...answer, value: 'invalid' }),
    /Invalid response/,
  );
  await send(alice, answerId, 'answer', answer);
  const conflict = await send(alice, answerId, 'answer', {
    ...answer,
    value: 'no',
  });
  assert.equal(conflict.state, 'conflict');
  assert.equal(conflict.row.data.value, 'yes');
  await send(alice, uid.audit, 'audit', completed, 1);
  const locked = await send(
    alice,
    answerId,
    'answer',
    { ...answer, value: 'no' },
    1,
  );
  assert.equal(locked.state, 'conflict');
  assert.match(locked.reason, /finalized elsewhere/);
  await assert.rejects(
    send(alice, uid.audit, 'audit', { ...completed, title: 'Changed' }, 2),
    /Invalid inspection transition/,
  );
  const reopen = {
    ...completed,
    status: 'in_progress',
    events: [
      ...completed.events,
      { status: 'in_progress', at: '2026-11-19T02:00:00.000Z' },
    ],
  };
  await send(alice, uid.audit, 'audit', reopen, 2);
  await send(alice, answerId, 'answer', { ...answer, value: 'na' }, 1);
  await send(alice, uid.draft, 'template', { ...blueprint, status: 'draft' });
  assert.equal(
    (
      await send(
        alice,
        uid.draft,
        'template',
        { ...blueprint, status: 'draft' },
        1,
        randomUUID(),
        true,
      )
    ).row.deleted,
    true,
  );
  await db.query(
    "insert into storage.objects values ($1, 'auditflow-evidence')",
    [`${alice}/${uid.audit}/photo.png`],
  );
  assert.equal(
    (await db.query('select * from storage.objects')).rows.length,
    1,
  );

  await role('authenticated', bob);
  assert.deepEqual(
    (
      await db.query(
        'select * from public.auditflow_records where owner_id = $1',
        [alice],
      )
    ).rows,
    [],
  );
  await assert.rejects(
    send(bob, randomUUID(), 'audit', audit),
    /Invalid inspection/,
  );
  await assert.rejects(
    db.query("insert into storage.objects values ($1, 'auditflow-evidence')", [
      `${bob}/${uid.audit}/photo.png`,
    ]),
    /row-level security/,
  );
  assert.deepEqual((await db.query('select * from storage.objects')).rows, []);
  const own = await send(bob, uid.template, 'template', {
    ...blueprint,
    status: 'draft',
  });
  assert.equal(own.row.version, 1);
  assert.equal(
    (await db.query('select * from public.auditflow_records')).rows.length,
    1,
  );
});
