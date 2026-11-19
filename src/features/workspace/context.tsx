'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEMO, Repository, type Conflict, type Mutation } from '@/lib/local';
import { demoChanges } from '@/lib/demo';
import { synchronize, transport } from '@/lib/sync';
import type { Row } from '@/lib/domain';
import type { Identity } from './session';
import { useLanguage } from './language';

type State = {
  identity: Identity;
  demo: boolean;
  repo: Repository;
  rows: Row[];
  pending: Mutation[];
  conflicts: Conflict[];
  ready: boolean;
  offlineReady: boolean;
  online: boolean;
  syncing: boolean;
  synced: boolean;
  syncError: string;
  retry: () => void;
};
const Context = createContext<State | null>(null);
export function useWorkspace() {
  const context = useContext(Context);
  const language = useLanguage();
  if (!context) throw new Error('Workspace context is missing.');
  return { ...context, ...language };
}

function useNetwork() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    addEventListener('online', update);
    addEventListener('offline', update);
    return () => {
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function WorkspaceProvider({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  const { locale } = useLanguage();
  const repo = useMemo(() => new Repository(identity.id), [identity.id]);
  const demo = identity.id === DEMO;
  const rows = useLiveQuery(repo.records, [repo]);
  const pending = useLiveQuery(repo.pending, [repo]);
  const conflicts = useLiveQuery(repo.conflicts, [repo]);
  const online = useNetwork();
  const [offlineReady, setOfflineReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [demoReady, setDemoReady] = useState(false);
  useEffect(() => {
    if (!demo) return;
    let active = true;
    repo.store.meta
      .get(repo.owner)
      .then(async (meta) => {
        if (!meta?.seeded) await repo.seed(await demoChanges(locale));
      })
      .catch((error) => {
        if (active)
          setSyncError(
            error instanceof Error ? error.message : 'Demo setup failed.',
          );
      })
      .finally(() => {
        if (active) setDemoReady(true);
      });
    return () => {
      active = false;
    };
  }, [demo, repo, locale]);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    )
      return;
    const worker = navigator.serviceWorker;
    const check = () => setOfflineReady(Boolean(worker.controller));
    check();
    worker.addEventListener('controllerchange', check);
    worker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch(() => setOfflineReady(false));
    return () => worker.removeEventListener('controllerchange', check);
  }, []);

  useEffect(() => {
    if (demo || !online) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function cycle() {
      if (controller.signal.aborted) return;
      try {
        const waiting = await repo.pending();
        if (controller.signal.aborted) return;
        if (waiting.length && !(await repo.conflicts()).length)
          setSyncing(true);
        await synchronize(repo, transport, controller.signal);
        if (controller.signal.aborted) return;
        failures = 0;
        setSyncError('');
        setSynced(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        setSynced(false);
        setSyncError(
          error instanceof Error ? error.message : 'Could not synchronize.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setSyncing(false);
          timer = setTimeout(
            cycle,
            failures ? Math.min(60_000, 2000 * 2 ** (failures - 1)) : 2500,
          );
        }
      }
    }
    void cycle();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [demo, online, repo, retryKey]);

  return (
    <Context.Provider
      value={{
        identity,
        demo,
        repo,
        rows: rows ?? [],
        pending: pending ?? [],
        conflicts: conflicts ?? [],
        ready: Boolean(rows && pending && conflicts) && (!demo || demoReady),
        offlineReady,
        online,
        syncing: online && syncing,
        synced: online && synced,
        syncError,
        retry: () => setRetryKey((value) => value + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
