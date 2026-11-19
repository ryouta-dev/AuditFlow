import type { Row } from './domain';
import { Repository, type Mutation } from './local';
import { supabase } from './supabase';

type RemoteRow = Omit<Row, 'updatedAt'> & { updated_at: string };
const recordColumns = 'id,kind,version,revision,deleted,updated_at,data';
type PushResult =
  | { state: 'applied'; row: Row }
  | { state: 'conflict'; row: Row | null; reason?: string };

export interface Transport {
  push(
    owner: string,
    mutation: Mutation,
    signal?: AbortSignal,
  ): Promise<PushResult>;
  pull(owner: string, cursor: number, signal?: AbortSignal): Promise<Row[]>;
}

function decode(row: RemoteRow): Row {
  const { updated_at, ...fields } = row;
  return { ...fields, updatedAt: updated_at } as Row;
}

export const transport: Transport = {
  async push(owner, op, signal) {
    if (!supabase) throw new Error('Connect Supabase to synchronize.');
    const { id, kind, data, deleted = false } = op.change;
    const request = supabase.rpc('apply_auditflow_mutation', {
      p_owner: owner,
      p_key: op.key,
      p_id: id,
      p_kind: kind,
      p_base: op.base,
      p_data: data,
      p_deleted: deleted,
    });
    const result = await (signal ? request.abortSignal(signal) : request);
    if (
      kind === 'audit' &&
      result.error?.code === '23514' &&
      result.error.message === 'AuditFlow: incomplete conformity results'
    ) {
      const current = supabase
        .from('auditflow_records')
        .select(recordColumns)
        .eq('owner_id', owner)
        .eq('id', id);
      const remote = await (
        signal ? current.abortSignal(signal) : current
      ).maybeSingle();
      if (remote.error) throw new Error(remote.error.message);
      return {
        state: 'conflict',
        row: remote.data ? decode(remote.data as RemoteRow) : null,
        reason:
          'The server is missing an observation or outcome. Keep the server status and review the checklist before completing again.',
      };
    }
    if (result.error) throw new Error(result.error.message);
    const payload = result.data as
      | { state: 'applied'; row: RemoteRow }
      | { state: 'conflict'; row: RemoteRow | null; reason?: string };
    return payload.state === 'applied'
      ? { state: 'applied', row: decode(payload.row) }
      : {
          state: 'conflict',
          row: payload.row && decode(payload.row),
          reason: payload.reason,
        };
  },
  async pull(owner, cursor, signal) {
    if (!supabase) throw new Error('Connect Supabase to synchronize.');
    const request = supabase
      .from('auditflow_records')
      .select(recordColumns)
      .eq('owner_id', owner)
      .gt('revision', cursor)
      .order('revision')
      .limit(250);
    const result = await (signal ? request.abortSignal(signal) : request);
    if (result.error) throw new Error(result.error.message);
    return (result.data as RemoteRow[]).map(decode);
  },
};

export async function synchronize(
  repo: Repository,
  remote: Transport,
  signal?: AbortSignal,
) {
  const run = async () => {
    let pushError;
    try {
      while (!signal?.aborted) {
        const op = await repo.next();
        if (!op) break;
        const outcome = await remote.push(repo.owner, op, signal);
        if (outcome.state === 'conflict') {
          await repo.flag(op, outcome.row, outcome.reason);
          break;
        }
        await repo.acknowledge(op, outcome.row);
      }
    } catch (failure) {
      pushError = failure;
    }
    while (!signal?.aborted) {
      const changes = await remote.pull(
        repo.owner,
        await repo.cursor(),
        signal,
      );
      if (!changes.length) break;
      await repo.pull(changes);
      if (changes.length < 250) break;
    }
    if (pushError) throw pushError;
  };
  if (typeof navigator !== 'undefined' && navigator.locks)
    await navigator.locks.request(
      `auditflow-sync-${repo.owner}`,
      { signal },
      run,
    );
  else await run();
}
