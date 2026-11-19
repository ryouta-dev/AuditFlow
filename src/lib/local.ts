import Dexie, { type EntityTable, type Table } from 'dexie';
import {
  answerIndex,
  rowsOf,
  schemas,
  summarize,
  type Change,
  type Data,
  type Row,
} from './domain';

export const DEMO = 'demo';
type LocalRow = Row & { owner: string };
export type Mutation = {
  seq?: number;
  owner: string;
  key: string;
  change: Change;
  base: number;
  attempted: boolean;
};
export type Conflict = {
  owner: string;
  id: string;
  remote: Row | null;
  reason?: string;
};
type Meta = { owner: string; cursor: number; seeded?: boolean };

export class AuditDatabase extends Dexie {
  records!: Table<LocalRow, [string, string]>;
  pending!: EntityTable<Mutation, 'seq'>;
  conflicts!: Table<Conflict, [string, string]>;
  meta!: EntityTable<Meta, 'owner'>;

  constructor(name = 'AuditFlow') {
    super(name);
    this.version(1).stores({
      records: '[owner+id], owner',
      pending: '++seq, owner, &key',
      conflicts: '[owner+id], owner',
      meta: 'owner',
    });
  }
}

export const db = new AuditDatabase();
const isSameRecord = (op: Mutation, id: string) => op.change.id === id;

export async function recordId(parent: string, key: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${parent}/${key}`),
  );
  const hex = Array.from(new Uint8Array(bytes).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export class Repository {
  constructor(
    readonly owner: string,
    readonly store = db,
  ) {}

  records = () =>
    this.store.records.where('owner').equals(this.owner).toArray();
  pending = () =>
    this.store.pending.where('owner').equals(this.owner).sortBy('seq');
  conflicts = () =>
    this.store.conflicts.where('owner').equals(this.owner).toArray();

  async write(...changes: Change[]) {
    await this.store.transaction(
      'rw',
      [this.store.records, this.store.pending],
      async () => {
        for (const change of changes) await this.commit(change);
      },
    );
  }

  async answer(
    auditId: string,
    questionId: string,
    patch: Partial<Pick<Data<'answer'>, 'value' | 'notes'>>,
  ) {
    const id = await recordId(auditId, questionId);
    await this.store.transaction(
      'rw',
      [this.store.records, this.store.pending],
      async () => {
        const audit = await this.store.records.get([this.owner, auditId]);
        if (
          audit?.kind !== 'audit' ||
          audit.deleted ||
          ['completed', 'archived'].includes(audit.data.status)
        )
          throw new Error('Reopen the inspection before editing answers.');
        const current = await this.store.records.get([this.owner, id]);
        const prior =
          current?.kind === 'answer'
            ? current.data
            : { auditId, questionId, value: null, notes: '' };
        await this.commit({ kind: 'answer', id, data: { ...prior, ...patch } });
      },
    );
  }

  async setInspectionStatus(
    id: string,
    from: Data<'audit'>['status'],
    to: 'completed' | 'in_progress' | 'archived',
  ) {
    return this.store.transaction(
      'rw',
      [this.store.records, this.store.pending],
      async () => {
        const audit = await this.store.records.get([this.owner, id]);
        if (
          audit?.kind !== 'audit' ||
          audit.deleted ||
          audit.data.status !== from ||
          from === 'archived' ||
          from === to ||
          (from === 'completed' && to !== 'in_progress' && to !== 'archived')
        ) {
          throw new Error(
            'This inspection changed. Reload it before continuing.',
          );
        }
        if (to === 'completed') {
          const snapshot = await this.store.records.get([
            this.owner,
            audit.data.snapshotId,
          ]);
          if (snapshot?.kind !== 'snapshot' || snapshot.deleted)
            throw new Error('The checklist version is unavailable.');
          const answers = answerIndex(
            rowsOf(await this.records(), 'answer'),
            id,
          );
          if (summarize(snapshot.data, answers).missing.length) return false;
        }
        await this.commit({
          kind: 'audit',
          id,
          data: {
            ...audit.data,
            status: to,
            events: [
              ...audit.data.events,
              { status: to, at: new Date().toISOString() },
            ],
          },
        });
        return true;
      },
    );
  }

  async seed(changes: Change[]) {
    return this.store.transaction(
      'rw',
      [this.store.records, this.store.pending, this.store.meta],
      async () => {
        const meta = await this.store.meta.get(this.owner);
        if (meta?.seeded) return false;
        for (const change of changes) await this.commit(change);
        await this.store.meta.put({
          owner: this.owner,
          cursor: meta?.cursor ?? 0,
          seeded: true,
        });
        return true;
      },
    );
  }

  private async commit(change: Change) {
    if (!schemas[change.kind].safeParse(change.data).success)
      throw new Error('Check all fields and try again.');
    const current = await this.store.records.get([this.owner, change.id]);
    if (
      current &&
      (current.kind !== change.kind ||
        current.deleted ||
        current.kind === 'snapshot')
    )
      throw new Error('This record can no longer be edited.');
    const version = current?.version ?? 0;
    const revision = current?.revision ?? 0;
    await this.store.records.put({
      ...change,
      owner: this.owner,
      version: version + Number(this.owner === DEMO),
      revision,
      deleted: change.deleted ?? false,
      updatedAt: new Date().toISOString(),
    });
    if (this.owner === DEMO) return;

    const ops = await this.pending();
    const latest = ops.at(-1);
    const carriesHistory = change.kind === 'audit' || change.kind === 'capa';
    const sameHistory =
      !carriesHistory ||
      ((latest?.change.kind === 'audit' || latest?.change.kind === 'capa') &&
        JSON.stringify(latest.change.data.events) ===
          JSON.stringify(change.data.events));
    if (
      latest &&
      isSameRecord(latest, change.id) &&
      !latest.attempted &&
      !change.deleted &&
      sameHistory
    ) {
      await this.store.pending.put({ ...latest, change });
    } else {
      const prior = ops.findLast((op) => isSameRecord(op, change.id));
      await this.store.pending.add({
        owner: this.owner,
        key: crypto.randomUUID(),
        change,
        base: prior ? prior.base + 1 : version,
        attempted: false,
      });
    }
  }

  async next(): Promise<Mutation | undefined> {
    return this.store.transaction(
      'rw',
      [this.store.pending, this.store.conflicts],
      async () => {
        if ((await this.conflicts()).length) return;
        const op = (await this.pending())[0];
        if (op && !op.attempted)
          await this.store.pending.put({ ...op, attempted: true });
        return op;
      },
    );
  }

  async acknowledge(op: Mutation, remote: Row) {
    await this.store.transaction(
      'rw',
      [this.store.records, this.store.pending],
      async () => {
        if (
          op.seq === undefined ||
          (await this.store.pending.get(op.seq))?.key !== op.key
        )
          return;
        await this.store.pending.delete(op.seq);
        const more = (await this.pending()).some((item) =>
          isSameRecord(item, remote.id),
        );
        const current = await this.store.records.get([this.owner, remote.id]);
        if (more && current) {
          await this.store.records.put({
            ...current,
            version: remote.version,
            revision: remote.revision,
          });
        } else if (!current || remote.revision >= current.revision) {
          await this.store.records.put({ ...remote, owner: this.owner });
        }
      },
    );
  }

  async flag(op: Mutation, remote: Row | null, reason?: string) {
    await this.store.transaction(
      'rw',
      [this.store.pending, this.store.conflicts],
      async () => {
        if (
          op.seq !== undefined &&
          (await this.store.pending.get(op.seq))?.key === op.key
        )
          await this.store.conflicts.put({
            owner: this.owner,
            id: op.change.id,
            remote,
            reason,
          });
      },
    );
  }

  async resolve(id: string, choice: 'local' | 'server') {
    await this.store.transaction(
      'rw',
      [this.store.records, this.store.pending, this.store.conflicts],
      async () => {
        const conflict = await this.store.conflicts.get([this.owner, id]);
        const current = await this.store.records.get([this.owner, id]);
        if (!conflict || !current) return;
        if (choice === 'local' && !canKeepLocal(current, conflict))
          throw new Error(
            'Keep the server version to preserve record history.',
          );
        const matches = (await this.pending()).filter((item) =>
          isSameRecord(item, id),
        );
        await this.store.pending.bulkDelete(
          matches.flatMap((item) => (item.seq === undefined ? [] : [item.seq])),
        );
        if (choice === 'local') {
          const first = matches[0];
          if (!first || !conflict.remote) return;
          await this.store.records.put({
            ...current,
            version: conflict.remote.version,
            revision: conflict.remote.revision,
          });
          await this.store.pending.put({
            ...first,
            change: {
              id: current.id,
              kind: current.kind,
              data: current.data,
              deleted: current.deleted,
            } as Change,
            base: conflict.remote.version,
            key: crypto.randomUUID(),
            attempted: false,
          });
        } else if (conflict.remote) {
          await this.store.records.put({
            ...conflict.remote,
            owner: this.owner,
          });
        } else {
          await this.store.records.delete([this.owner, id]);
        }
        await this.store.conflicts.delete([this.owner, id]);
      },
    );
  }

  async cursor() {
    return (await this.store.meta.get(this.owner))?.cursor ?? 0;
  }

  async pull(rows: Row[]) {
    if (!rows.length) return;
    await this.store.transaction(
      'rw',
      [
        this.store.records,
        this.store.pending,
        this.store.conflicts,
        this.store.meta,
      ],
      async () => {
        const pending = new Set(
          (await this.pending()).map((item) => item.change.id),
        );
        const conflicts = new Map(
          (await this.conflicts()).map((item) => [item.id, item]),
        );
        for (const row of rows) {
          const conflict = conflicts.get(row.id);
          if (conflict && row.revision > (conflict.remote?.revision ?? 0))
            await this.store.conflicts.put({ ...conflict, remote: row });
          if (pending.has(row.id)) continue;
          const local = await this.store.records.get([this.owner, row.id]);
          if (!local || row.revision > local.revision)
            await this.store.records.put({ ...row, owner: this.owner });
        }
        const meta = await this.store.meta.get(this.owner);
        await this.store.meta.put({
          ...meta,
          owner: this.owner,
          cursor: Math.max(
            meta?.cursor ?? 0,
            ...rows.map((row) => row.revision),
          ),
        });
      },
    );
  }
}

export function canKeepLocal(current: Row, { remote, reason }: Conflict) {
  if (
    reason ||
    !remote ||
    remote.deleted ||
    current.kind !== remote.kind ||
    current.kind === 'snapshot'
  )
    return false;
  if (
    current.kind === 'audit' &&
    remote.kind === 'audit' &&
    ['completed', 'archived'].includes(remote.data.status)
  )
    return false;
  if (
    (current.kind === 'audit' || current.kind === 'capa') &&
    (remote.kind === 'audit' || remote.kind === 'capa')
  ) {
    return (
      JSON.stringify(current.data.events) === JSON.stringify(remote.data.events)
    );
  }
  return true;
}
