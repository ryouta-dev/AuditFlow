'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import {
  aiRequestSchema,
  aiResponseSchema,
  assistantTasks,
  credentialsSchema,
  defaultEndpoint,
  directAiRequestSchema,
  directCredentialsSchema,
  directEndpoint,
  maxContext,
  maxPrompt,
  providerModels,
  providerNames,
  riverEndpoint,
  type AiConfig,
  type AiConnection,
  type AiResult,
  type AiTask,
} from '@/lib/ai/contracts';
import { generate } from '@/lib/ai/provider';
import {
  answerIndex,
  blankQuestion,
  hasFinalReport,
  responseLabel,
  rowsOf,
  statusLabel,
  summarize,
  type Row,
} from '@/lib/domain';
import {
  formatPercent,
  type Locale,
  type Message,
  type Translate,
} from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/features/workspace/context';
import { Alert, go, PageTitle } from '@/features/workspace/ui';
import { useAiSession, type AiMode } from './session';
import { assignmentFormats, readAssignment } from './assignment';

const tools = {
  checklist: 'Draft a checklist',
  inspection: 'Discuss an inspection',
  capa: 'Suggest CAPA',
  report: 'Draft a report conclusion',
  review: 'Review inspection responses',
} as const;

const errors: Partial<Record<string, Message>> = {
  local_river_only: 'Open AuditFlow on localhost to use River.',
  insecure_origin: 'AI requires HTTPS or localhost.',
  sign_in: 'Sign in again to use AI.',
  auth_unavailable: 'AI could not verify your session. Try again shortly.',
  invalid_request: 'Check the model, API key, and request text.',
  provider_auth: 'The provider rejected the API key or model access.',
  provider_limit: 'Check your provider credits and usage limits.',
  provider_unavailable: 'The provider is unavailable or rejected the request.',
  invalid_proposal:
    'The provider returned an incomplete or invalid proposal. Try a shorter request.',
  timeout: 'The AI request timed out. Try again.',
  rate_limit: 'Wait for the current request or try again in a minute.',
};

function contextFor(
  rows: Row[],
  task: AiTask,
  audit: Row<'audit'> | undefined,
  finding: Row<'finding'> | undefined,
  t: Translate,
  locale: Locale,
) {
  if (task === 'checklist' || !audit) return '';
  const findings = rowsOf(rows, 'finding').filter(
    (row) => row.data.auditId === audit.id,
  );
  const formatFinding = (row: Row<'finding'>) =>
    `${row.data.title} [${statusLabel(t, row.data.severity)} · ${statusLabel(t, row.data.status)}]\n${row.data.details}`.trim();
  if (task === 'capa') return finding ? formatFinding(finding) : '';

  const snapshot = rowsOf(rows, 'snapshot').find(
    (row) => row.id === audit.data.snapshotId,
  );
  if (!snapshot) return '';
  const answers = answerIndex(rowsOf(rows, 'answer'), audit.id);
  const summary = summarize(snapshot.data, answers);
  const lines = [
    `${t('Checklist')}: ${snapshot.data.name}`,
    `${t('Status')}: ${statusLabel(t, audit.data.status)}`,
    `${t('Compliance score')}: ${summary.score === null ? t('N/A') : formatPercent(summary.score, locale)}`,
    '',
    ...snapshot.data.sections.flatMap((section) => [
      section.title,
      ...section.questions.map(
        (question) =>
          `• ${question.title} — ${responseLabel(question, answers[question.id]?.data.value, t)}`,
      ),
      '',
    ]),
  ];
  if (task === 'report' && findings.length) {
    const actions = rowsOf(rows, 'capa');
    lines.push(
      t('Findings and corrective actions'),
      ...findings.map((row) => {
        const action = actions.find((item) => item.data.findingId === row.id);
        return (
          formatFinding(row) +
          (action
            ? `\n${t('Corrective action')}: ${action.data.corrective} [${statusLabel(t, action.data.status)}]\n`
            : '\n')
        );
      }),
    );
  }
  return lines.join('\n').trim();
}

function Connection({ disabled }: { disabled: boolean }) {
  const { t } = useWorkspace();
  const { config: active, setConfig } = useAiSession();
  const config = active && 'provider' in active ? active : null;
  const [provider, setProvider] = useState<AiConfig['provider']>(
    config?.provider ?? 'openai',
  );
  const [model, setModel] = useState<string>(
    config?.model ?? providerModels.openai[0],
  );
  const [invalid, setInvalid] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  function useKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const data = new FormData(event.currentTarget);
    const next = credentialsSchema.safeParse({
      provider,
      model,
      apiKey: data.get('key'),
    });
    setInvalid(!next.success);
    if (!next.success) return;
    setConfig(next.data);
    event.currentTarget.reset();
  }

  return (
    <form ref={form} className="panel form-panel stack" onSubmit={useKey}>
      <div className="settings-card-heading">
        <span className="tile-icon">
          <KeyRound size={19} />
        </span>
        <h2>{t('Provider connection')}</h2>
      </div>
      <p className="muted small-copy">
        {t(
          'The key is kept in this tab’s memory. Reloading or signing out requires entering it again.',
        )}
      </p>
      <fieldset className="ai-fields stack" disabled={disabled}>
        <label>
          {t('Provider')}
          <select
            value={provider}
            onChange={(event) => {
              const selected = event.target.value as AiConfig['provider'];
              setProvider(selected);
              setModel(providerModels[selected][0]);
            }}
          >
            {Object.entries(providerNames).map(([code, name]) => (
              <option value={code} key={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Model')}
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            {providerModels[provider].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('API key')}
          <input
            type="password"
            name="key"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={512}
          />
        </label>
        <button className="button primary">
          {t('Use key for this session')}
        </button>
      </fieldset>
      {invalid && (
        <Alert>
          {t('Choose a supported model and enter a valid API key.')}
        </Alert>
      )}
      {config && (
        <div className="stack">
          <div className="local-save">
            <ShieldCheck size={17} />
            <span>
              {t('Key entered for this session')} ·{' '}
              {providerNames[config.provider]} · {config.model}
            </span>
          </div>
          <button
            type="button"
            className="button secondary self-start"
            onClick={() => {
              setConfig(null);
              form.current?.reset();
            }}
          >
            {t('Forget key')}
          </button>
        </div>
      )}
    </form>
  );
}

function DirectConnection({ disabled }: { disabled: boolean }) {
  const { t } = useWorkspace();
  const { config: active, setConfig } = useAiSession();
  const config = active && 'endpoint' in active ? active : null;
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? defaultEndpoint);
  const [model, setModel] = useState(config?.model ?? '');
  const [invalid, setInvalid] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const data = new FormData(event.currentTarget);
    const next = directCredentialsSchema.safeParse({
      endpoint,
      model,
      apiKey: data.get('key'),
    });
    setInvalid(!next.success);
    if (!next.success) return;
    setConfig(next.data);
    const key = event.currentTarget.elements.namedItem('key');
    if (key instanceof HTMLInputElement) key.value = '';
  }

  return (
    <form ref={form} className="panel form-panel stack" onSubmit={connect}>
      <div className="settings-card-heading">
        <span className="tile-icon">
          <KeyRound size={19} />
        </span>
        <h2>{t('Provider connection')}</h2>
      </div>
      <p className="muted small-copy">
        {t(
          directEndpoint(endpoint)?.href === riverEndpoint
            ? 'River requests go through the local AuditFlow server.'
            : 'The browser sends requests directly to the API address you enter.',
        )}
      </p>
      <fieldset className="ai-fields stack" disabled={disabled}>
        <label>
          {t('API endpoint')}
          <input
            type="url"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            maxLength={512}
            required
            spellCheck={false}
          />
        </label>
        <label>
          {t('API key')}
          <input
            type="password"
            name="key"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={512}
          />
        </label>
        <details className="history">
          <summary>{t('Model settings')}</summary>
          <label>
            {t('Model')}
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              maxLength={90}
              placeholder={t('Choose automatically from the endpoint')}
              spellCheck={false}
            />
          </label>
        </details>
        <button className="button primary">
          {t('Use key for this session')}
        </button>
      </fieldset>
      {invalid && (
        <Alert>
          {t('Enter a valid API key and an HTTPS or localhost endpoint.')}
        </Alert>
      )}
      <p className="muted small-copy">
        {t(
          'The key is kept in this tab’s memory. Reloading or signing out requires entering it again.',
        )}
      </p>
      {config && (
        <div className="stack">
          <div className="local-save">
            <ShieldCheck size={17} />
            <span>
              {t('Key entered for this session')} ·{' '}
              {new URL(config.endpoint).host} · {config.model}
            </span>
          </div>
          <button
            type="button"
            className="button secondary self-start"
            onClick={() => {
              setConfig(null);
              form.current?.reset();
            }}
          >
            {t('Forget key')}
          </button>
        </div>
      )}
    </form>
  );
}

function Proposal({
  result,
  audit,
  finding,
}: {
  result: AiResult;
  audit?: Row<'audit'>;
  finding?: Row<'finding'>;
}) {
  const { t } = useWorkspace();
  const { setDraft } = useAiSession();
  return (
    <section className="panel form-panel stack" aria-live="polite">
      <div>
        <h2>{t('AI proposal')}</h2>
        <p className="muted small-copy">
          {t('Review the proposal before using it.')}
        </p>
      </div>
      {result.task === 'checklist' && (
        <>
          <div>
            <h3>{result.proposal.name}</h3>
            <p className="muted preserve">{result.proposal.description}</p>
          </div>
          {result.proposal.sections.map((section, i) => (
            <div key={i} className="ai-proposal-item">
              <strong>{section.title}</strong>
              <ul>
                {section.questions.map((question, j) => (
                  <li key={j}>{question.title}</li>
                ))}
              </ul>
            </div>
          ))}
          <button
            className="button primary self-start"
            onClick={() => {
              const { name, description, sections } = result.proposal;
              setDraft({
                kind: 'template',
                value: {
                  name,
                  description,
                  status: 'draft',
                  sections: sections.map((section) => ({
                    title: section.title,
                    id: crypto.randomUUID(),
                    questions: section.questions.map((question) => ({
                      ...blankQuestion(),
                      ...question,
                    })),
                  })),
                },
              });
              go('/templates/new');
            }}
          >
            {t('Open in checklist editor')}
          </button>
        </>
      )}
      {(result.task === 'inspection' || result.task === 'report') && (
        <>
          <p className="preserve">{result.proposal.text}</p>
          {result.task === 'report' && audit && (
            <button
              className="button primary self-start"
              onClick={() => {
                setDraft({
                  kind: 'report',
                  auditId: audit.id,
                  value: result.proposal.text,
                });
                go(`/reports/${audit.id}`);
              }}
            >
              {t('Open in report preview')}
            </button>
          )}
        </>
      )}
      {result.task === 'capa' && (
        <>
          {(
            [
              { label: 'Root cause', value: result.proposal.rootCause },
              { label: 'Corrective action', value: result.proposal.corrective },
              { label: 'Preventive action', value: result.proposal.preventive },
            ] as const
          ).map(({ label, value }) => (
            <div className="ai-proposal-item" key={label}>
              <strong>{t(label)}</strong>
              <p className="preserve">{value}</p>
            </div>
          ))}
          {finding && (
            <button
              className="button primary self-start"
              onClick={() => {
                setDraft({
                  kind: 'capa',
                  findingId: finding.id,
                  value: result.proposal,
                });
                go(`/findings/${finding.id}`);
              }}
            >
              {t('Open CAPA draft')}
            </button>
          )}
        </>
      )}
      {result.task === 'review' && (
        <>
          {result.proposal.observation && (
            <p className="preserve">{result.proposal.observation}</p>
          )}
          {!result.proposal.findings.length && (
            <p>{t('No findings were suggested.')}</p>
          )}
          {result.proposal.findings.map((item, i) => (
            <div className="ai-proposal-item stack" key={i}>
              <div>
                <strong>{item.title}</strong>{' '}
                <span className="muted small-copy">
                  · {statusLabel(t, item.severity)}
                </span>
              </div>
              <p className="preserve">{item.details}</p>
              {audit && (
                <button
                  className="button secondary self-start"
                  onClick={() => {
                    setDraft({
                      kind: 'finding',
                      auditId: audit.id,
                      value: item,
                    });
                    go(`/findings/new/${audit.id}`);
                  }}
                >
                  {t('Open finding draft')}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function RequestForm({
  task,
  startingContext,
  audit,
  finding,
  disabled,
  config,
}: {
  task: AiTask;
  startingContext: string;
  audit?: Row<'audit'>;
  finding?: Row<'finding'>;
  disabled: boolean;
  config: AiConnection;
}) {
  const { t, locale, identity } = useWorkspace();
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState(() =>
    startingContext.slice(0, maxContext),
  );
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<Message>();
  const [working, setWorking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filePreview, setFilePreview] = useState<{
    name: string;
    limited: boolean;
  }>();
  const [result, setResult] = useState<AiResult>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const direct = 'endpoint' in config;
  const river = direct && config.endpoint === riverEndpoint;
  const provider = direct
    ? new URL(config.endpoint).host
    : providerNames[config.provider];
  const requirePrompt =
    task === 'inspection' ||
    (task === 'checklist' && context.trim().length < 3);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setImporting(true);
    setApproved(false);
    setError(undefined);
    try {
      const imported = await readAssignment(file);
      if (imported.error) {
        const messages = {
          unsupported: 'Choose a TXT, Markdown, PDF, or DOCX file.',
          too_large: 'The file is larger than 8 MB.',
          empty:
            'No readable text was found. Paste the assignment text or use a text-based file.',
          unreadable:
            'Could not read the file. Try another format or paste the text.',
        } as const;
        setError(messages[imported.error]);
        return;
      }
      setContext(imported.text);
      setFilePreview({ name: file.name, limited: imported.limited });
    } finally {
      setImporting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || importing || !approved || controller.current) return;
    const fields = {
      config,
      task,
      locale,
      prompt,
      context,
    };
    const operation = new AbortController();
    controller.current = operation;
    setWorking(true);
    setError(undefined);
    setResult(undefined);
    setApproved(false);
    try {
      if (direct && !river) {
        const input = directAiRequestSchema.safeParse(fields);
        if (!input.success) {
          setError('Check the model, API key, and request text.');
          return;
        }
        const signal = AbortSignal.any([
          operation.signal,
          AbortSignal.timeout(25_000),
        ]);
        try {
          const proposal = await generate(input.data, fetch, signal);
          if (typeof proposal === 'string')
            setError(
              errors[proposal] ??
                'The provider is unavailable or rejected the request.',
            );
          else setResult(proposal);
        } catch {
          if (!operation.signal.aborted)
            setError(
              signal.aborted
                ? 'The AI request timed out. Try again.'
                : navigator.onLine
                  ? 'Check the API endpoint and whether it allows browser requests (CORS).'
                  : 'Reconnect to use AI.',
            );
        }
        return;
      }
      const input = (river ? directAiRequestSchema : aiRequestSchema).safeParse(
        fields,
      );
      if (!input.success) {
        setError('Check the model, API key, and request text.');
        return;
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (!river) {
        const auth = await supabase?.auth.getSession();
        const session = auth?.data.session;
        if (!session || session.user.id !== identity.id) {
          setError('Sign in again to use AI.');
          return;
        }
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(river ? '/api/ai/river' : '/api/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify(input.data),
        signal: operation.signal,
        cache: 'no-store',
        redirect: 'error',
      });
      const body = await response.json();
      if (!response.ok) {
        const key =
          typeof body?.error === 'string' && Object.hasOwn(errors, body.error)
            ? errors[body.error]
            : undefined;
        setError(key ?? 'The provider is unavailable or rejected the request.');
        return;
      }
      const parsed = aiResponseSchema.safeParse(body);
      if (parsed.success && parsed.data.task === task) setResult(parsed.data);
      else
        setError(
          'The provider returned an incomplete or invalid proposal. Try a shorter request.',
        );
    } catch {
      if (!operation.signal.aborted)
        setError(
          navigator.onLine
            ? 'The provider is unavailable or rejected the request.'
            : 'Reconnect to use AI.',
        );
    } finally {
      controller.current = null;
      if (!operation.signal.aborted) setWorking(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="panel form-panel stack">
        <h2>{t(tools[task])}</h2>
        <fieldset
          className="ai-fields stack"
          disabled={disabled || working || importing}
        >
          {task === 'checklist' && (
            <>
              <label>
                {t('Upload assignment file')}
                <input
                  type="file"
                  accept={assignmentFormats}
                  onChange={(event) => void importFile(event)}
                />
              </label>
              <p className="muted small-copy">
                {t(
                  'TXT, Markdown, PDF with selectable text, or DOCX · up to 8 MB. Only the reviewed text is sent.',
                )}
              </p>
              {filePreview && (
                <p className="muted small-copy" role="status">
                  {t('Text extracted from {name}', { name: filePreview.name })}
                </p>
              )}
              {filePreview?.limited && (
                <p className="muted small-copy">
                  {t(
                    'Only part of the document fits in the preview. Check what will be sent.',
                  )}
                </p>
              )}
              <label>
                {t('Assignment text')}
                <textarea
                  value={context}
                  rows={6}
                  maxLength={maxContext}
                  placeholder={t(
                    'Paste the assignment text or load it from a file.',
                  )}
                  onChange={(event) => {
                    setContext(event.target.value);
                    setApproved(false);
                  }}
                />
              </label>
            </>
          )}
          <label>
            {t(
              requirePrompt
                ? 'What should AI help with?'
                : 'Additional instructions',
            )}
            <textarea
              value={prompt}
              rows={3}
              maxLength={maxPrompt}
              minLength={requirePrompt ? 3 : undefined}
              required={requirePrompt}
              placeholder={
                task === 'checklist'
                  ? t('e.g. Create a weekly workshop safety checklist')
                  : task === 'inspection'
                    ? t('e.g. What should I follow up on first?')
                    : undefined
              }
              onChange={(event) => {
                setPrompt(event.target.value);
                setApproved(false);
              }}
            />
          </label>
          {task !== 'checklist' && (
            <>
              <p className="muted small-copy">
                {t('The preview omits account, location, and inspector notes.')}
              </p>
              {startingContext.length > maxContext && (
                <p className="muted small-copy">
                  {t(
                    'The preview includes the first {count} characters. Edit it to include the information you need.',
                    { count: maxContext },
                  )}
                </p>
              )}
              <label>
                {t('Text to send')}
                <textarea
                  value={context}
                  rows={9}
                  maxLength={maxContext}
                  minLength={3}
                  required
                  onChange={(event) => {
                    setContext(event.target.value);
                    setApproved(false);
                  }}
                />
              </label>
            </>
          )}
          <p className="muted small-copy">
            {t('Review the text and remove private details before sending.')}
          </p>
          {(direct
            ? new URL(config.endpoint).hostname === 'openrouter.ai'
            : config.provider === 'openrouter') && (
            <p className="muted small-copy">
              {t('OpenRouter passes the reviewed text to the model provider.')}
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
            {t('I reviewed the text and agree to send it to {provider}.', {
              provider,
            })}
          </label>
          <button className="button primary self-start" disabled={!approved}>
            <Sparkles size={16} />
            {t(working ? 'Waiting for the provider…' : 'Send to {provider}', {
              provider,
            })}
          </button>
          <p className="muted small-copy">
            {t('Requests use your provider account and may incur charges.')}
          </p>
        </fieldset>
        {importing && (
          <p className="muted" role="status">
            {t('Extracting text…')}
          </p>
        )}
        {error && <Alert>{t(error)}</Alert>}
      </form>
      {result && <Proposal result={result} audit={audit} finding={finding} />}
    </>
  );
}

export function AiStudio({ findingTarget }: { findingTarget?: string }) {
  const { rows, demo, online, t, locale } = useWorkspace();
  const { mode, setMode, config } = useAiSession();
  const initialFinding = rowsOf(rows, 'finding').find(
    (row) => row.id === findingTarget,
  );
  const [selectedTool, setTool] = useState<AiTask>(
    initialFinding ? 'capa' : 'checklist',
  );
  const [auditId, setAuditId] = useState(initialFinding?.data.auditId ?? '');
  const [findingId, setFindingId] = useState(initialFinding?.id ?? '');
  const task = mode === 'review' ? 'review' : selectedTool;
  const audits = rowsOf(rows, 'audit').filter(
    (audit) => task !== 'report' || hasFinalReport(audit.data),
  );
  const audit = audits.find((row) => row.id === auditId);
  const findings = rowsOf(rows, 'finding').filter(
    (row) => row.data.auditId === audit?.id,
  );
  const finding = findings.find((row) => row.id === findingId);
  const blocked = !online
    ? 'Reconnect to use AI.'
    : !globalThis.isSecureContext
      ? 'AI requires HTTPS or localhost.'
      : null;
  const needsAudit = task !== 'checklist';
  const startingContext = contextFor(rows, task, audit, finding, t, locale);

  return (
    <>
      <PageTitle
        title={t('AI assistant')}
        description={t(
          'Draft checklists, review inspections, and prepare follow-up actions.',
        )}
      />
      {blocked && (
        <div className="notice" role="status">
          <ShieldCheck size={18} />
          {t(blocked)}
        </div>
      )}
      <div className="ai-layout">
        <aside className="stack">
          <section className="panel form-panel stack">
            <label>
              {t('AI mode')}
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as AiMode)}
              >
                <option value="manual">{t('Manual')}</option>
                <option value="assistant">{t('Assistant')}</option>
                <option value="review">{t('Guided review')}</option>
              </select>
            </label>
            {mode === 'manual' && (
              <p className="muted small-copy">
                {t('AI is off. Select a mode to connect your provider.')}
              </p>
            )}
            {mode === 'review' && (
              <p className="muted small-copy">
                {t(
                  'Review one inspection, then open a suggested finding for approval.',
                )}
              </p>
            )}
          </section>
          {mode !== 'manual' &&
            (demo ? (
              <DirectConnection disabled={Boolean(blocked)} />
            ) : (
              <Connection disabled={Boolean(blocked)} />
            ))}
        </aside>
        <div className="stack">
          {mode === 'manual' ? (
            <section className="panel form-panel">
              <ul className="ai-tool-summary">
                {Object.values(tools).map((label) => (
                  <li key={label}>
                    <Sparkles size={17} />
                    {t(label)}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <>
              <section className="panel form-panel stack">
                {mode === 'assistant' && (
                  <label>
                    {t('Choose an AI tool')}
                    <select
                      value={task}
                      onChange={(event) => {
                        setTool(event.target.value as AiTask);
                        setFindingId('');
                      }}
                    >
                      {assistantTasks.map((item) => (
                        <option key={item} value={item}>
                          {t(tools[item])}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {needsAudit && (
                  <label>
                    {t('Inspection')}
                    <select
                      value={audit?.id ?? ''}
                      onChange={(event) => {
                        setAuditId(event.target.value);
                        setFindingId('');
                      }}
                    >
                      <option value="">
                        {t(
                          audits.length
                            ? 'Choose an inspection'
                            : 'No eligible inspections.',
                        )}
                      </option>
                      {audits.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.data.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {task === 'capa' && audit && (
                  <label>
                    {t('Finding')}
                    <select
                      value={finding?.id ?? ''}
                      onChange={(event) => setFindingId(event.target.value)}
                    >
                      <option value="">
                        {t(
                          findings.length
                            ? 'Choose a finding'
                            : 'No findings in this inspection.',
                        )}
                      </option>
                      {findings.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.data.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>
              {config && (!needsAudit || startingContext) && (
                <RequestForm
                  key={`${task}:${audit?.id}:${finding?.id}:${'endpoint' in config ? config.endpoint : config.provider}:${config.model}:${locale}`}
                  task={task}
                  startingContext={startingContext}
                  audit={audit}
                  finding={finding}
                  config={config}
                  disabled={Boolean(blocked)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
