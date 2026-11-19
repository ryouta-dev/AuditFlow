'use client';

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type {
  AiConnection,
  SuggestedCapa,
  SuggestedFinding,
} from '@/lib/ai/contracts';
import type { Data } from '@/lib/domain';

export type AiMode = 'manual' | 'assistant' | 'review';
type Draft =
  | { kind: 'template'; value: Data<'template'> }
  | { kind: 'finding'; auditId: string; value: SuggestedFinding }
  | { kind: 'capa'; findingId: string; value: SuggestedCapa }
  | { kind: 'report'; auditId: string; value: string };

const Session = createContext<{
  mode: AiMode;
  setMode: (mode: AiMode) => void;
  config: AiConnection | null;
  setConfig: (config: AiConnection | null) => void;
  draft: Draft | null;
  setDraft: Dispatch<SetStateAction<Draft | null>>;
} | null>(null);

export function AiSession({
  children,
  demo,
}: {
  children: ReactNode;
  demo: boolean;
}) {
  const [mode, setMode] = useState<AiMode>(demo ? 'assistant' : 'manual');
  const [config, setConfig] = useState<AiConnection | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <Session.Provider
      value={{ mode, setMode, config, setConfig, draft, setDraft }}
    >
      {children}
    </Session.Provider>
  );
}

export function useAiSession() {
  const session = useContext(Session);
  if (!session) throw new Error('AI session context is missing.');
  return session;
}
