'use client';

import { useState, type FormEvent } from 'react';
import {
  Check,
  CloudDownload,
  Download,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  formatDate,
  responseLabel,
  type Question,
  type Row,
} from '@/lib/domain';
import { demoChanges } from '@/lib/demo';
import { localizeError, type Translate } from '@/lib/i18n';
import { canKeepLocal } from '@/lib/local';
import { supabase } from '@/lib/supabase';
import { downloadBlob } from '@/features/reports/reports';
import { useWorkspace } from './context';
import { LanguageSelect } from './language';
import { Alert, Link, PageTitle } from './ui';

const kindName = {
  template: 'Checklist',
  snapshot: 'Checklist version',
  audit: 'Inspection',
  answer: 'Response',
  finding: 'Finding',
  capa: 'Corrective action',
} as const;
function conflictData(t: Translate, row: Row | null, question?: Question) {
  if (!row) return t('No answer on the server');
  if (row.deleted) return t('Deleted');
  if (row.kind === 'answer') {
    const { value, notes } = row.data;
    return `${question ? responseLabel(question, value, t) : Array.isArray(value) ? value.join(', ') : (value ?? t('Unanswered'))}\n${notes}`.trim();
  }
  return JSON.stringify(row.data, null, 2);
}

export function Settings({
  sync,
  signOut,
}: {
  sync: boolean;
  signOut: () => Promise<void>;
}) {
  const {
    identity,
    demo,
    locale,
    rows,
    pending,
    conflicts,
    repo,
    online,
    offlineReady,
    syncing,
    synced,
    syncError,
    retry,
    t,
  } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await job();
    } catch (failure) {
      setError(
        localizeError(t, failure, 'The operation could not be completed.'),
      );
    } finally {
      setBusy(false);
    }
  }

  function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(
      new FormData(event.currentTarget).get('name') ?? '',
    ).trim();
    if (!name) {
      setError(t('Enter a display name.'));
      return;
    }
    void run(async () => {
      if (!supabase || demo) return;
      const { error } = await supabase.auth.updateUser({
        data: { display_name: name },
      });
      if (error) throw error;
      setMessage(t('Profile updated.'));
    });
  }

  return (
    <>
      <PageTitle
        title={t('Settings')}
        description={t('Manage your profile, language, and offline data.')}
      />
      <nav className="tabs settings-tabs" aria-label={t('Settings')}>
        <Link
          href="/settings/profile"
          aria-current={!sync ? 'page' : undefined}
        >
          {t('Profile')}
        </Link>
        <Link href="/settings/sync" aria-current={sync ? 'page' : undefined}>
          {t('Offline & sync')}
        </Link>
        <Link href="/settings/ai">{t('AI assistant')}</Link>
      </nav>
      {error && <Alert>{error}</Alert>}
      {message && (
        <div className="notice" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {sync ? (
        <div className="settings-content stack">
          <section className="panel form-panel stack">
            <div className="settings-card-heading">
              <span className="tile-icon">
                <CloudDownload size={21} />
              </span>
              <div>
                <h2>{t('Offline access')}</h2>
                <p>
                  {offlineReady
                    ? t('This browser can reopen AuditFlow offline.')
                    : t(
                        'Offline reopening requires a secure production build and a completed app download.',
                      )}
                </p>
              </div>
            </div>
            <div className="settings-rows">
              <div>
                <span>{t('Network')}</span>
                <strong>{online ? t('Online') : t('Offline')}</strong>
              </div>
              <div>
                <span>{t('Cloud status')}</span>
                <strong>
                  {demo
                    ? t('Local demo')
                    : conflicts.length
                      ? t('Conflict')
                      : syncError
                        ? t('Error')
                        : syncing
                          ? t('Syncing')
                          : pending.length
                            ? t('Local saved')
                            : synced
                              ? t('Synced')
                              : t('Waiting for connection')}
                </strong>
              </div>
              <div>
                <span>{t('Pending changes')}</span>
                <strong>{pending.length}</strong>
              </div>
            </div>
            {syncError && (
              <Alert>
                {localizeError(
                  t,
                  syncError,
                  demo ? 'Demo setup failed.' : 'Could not synchronize.',
                )}
              </Alert>
            )}
            {!demo && (
              <div className="inline-actions">
                <button
                  className="button secondary"
                  disabled={!online || syncing}
                  onClick={retry}
                >
                  <RefreshCw size={16} /> {t('Sync now')}
                </button>
                <button
                  className="button secondary"
                  disabled={!pending.length}
                  onClick={() =>
                    downloadBlob(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              generatedAt: new Date().toISOString(),
                              operations: pending,
                              conflicts,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: 'application/json' },
                      ),
                      'auditflow-pending-changes.json',
                    )
                  }
                >
                  <Download size={16} /> {t('Export pending changes')}
                </button>
              </div>
            )}
            <p className="muted small-copy">
              {t(
                'Browser data removal can erase unsynced work. Keep pending exports private.',
              )}
            </p>
          </section>
          {conflicts.map((conflict) => {
            const local = rows.find((row) => row.id === conflict.id);
            if (!local) return null;
            const audit =
              local.kind === 'answer'
                ? rows.find(
                    (row) =>
                      row.kind === 'audit' && row.id === local.data.auditId,
                  )
                : null;
            const snapshot =
              audit?.kind === 'audit'
                ? rows.find(
                    (row) =>
                      row.kind === 'snapshot' &&
                      row.id === audit.data.snapshotId,
                  )
                : null;
            const question =
              snapshot?.kind === 'snapshot' && local.kind === 'answer'
                ? snapshot.data.sections
                    .flatMap((section) => section.questions)
                    .find((question) => question.id === local.data.questionId)
                : undefined;
            return (
              <section key={conflict.id} className="panel form-panel stack">
                <h2>
                  {t('Conflict: {name}', {
                    name: question?.title ?? t(kindName[local.kind]),
                  })}
                </h2>
                <p className="muted">
                  {localizeError(
                    t,
                    conflict.reason,
                    'Review both versions before choosing which changes to keep.',
                  )}
                </p>
                <div className="field-grid conflict-grid">
                  <div>
                    <h3>{t('This device')}</h3>
                    <pre>{conflictData(t, local, question)}</pre>
                  </div>
                  <div>
                    <h3>{t('Server')}</h3>
                    {conflict.remote && (
                      <p className="small-copy muted">
                        {formatDate(conflict.remote.updatedAt, locale)}
                      </p>
                    )}
                    <pre>{conflictData(t, conflict.remote, question)}</pre>
                  </div>
                </div>
                <div className="inline-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await repo.resolve(local.id, 'server');
                        retry();
                      })
                    }
                  >
                    {t('Keep server version')}
                  </button>
                  {canKeepLocal(local, conflict) && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await repo.resolve(local.id, 'local');
                          retry();
                        })
                      }
                    >
                      {t('Keep my version')}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="settings-content stack">
          <section className="panel form-panel stack">
            <div className="settings-card-heading">
              <span className="avatar large">{avatar(identity.name)}</span>
              <div>
                <h2>{identity.name}</h2>
                <p>
                  {demo
                    ? t('Synthetic demonstration workspace')
                    : identity.email}
                </p>
              </div>
            </div>
            {demo ? (
              <p className="muted">
                {t('Your demo changes are kept on this device.')}
              </p>
            ) : (
              <form className="stack" onSubmit={updateProfile}>
                <div className="field-grid">
                  <label>
                    {t('Display name')}
                    <input
                      name="name"
                      defaultValue={identity.name}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    {t('Email address')}
                    <input type="email" readOnly value={identity.email} />
                  </label>
                </div>
                <button
                  className="button primary self-start"
                  disabled={busy || !online}
                >
                  {t('Save profile')}
                </button>
              </form>
            )}
          </section>
          <section className="panel form-panel stack">
            <h2>{t('Language')}</h2>
            <p className="muted">
              {t('Choose the language for the interface and reports.')}
            </p>
            <LanguageSelect />
          </section>
          {!demo && (
            <section className="panel form-panel stack">
              <div className="settings-card-heading">
                <span className="tile-icon">
                  <FlaskConical size={21} />
                </span>
                <div>
                  <h2>{t('Sample inspections')}</h2>
                  <p>
                    {t(
                      'Add a synthetic dataset to your account for a walkthrough.',
                    )}
                  </p>
                </div>
              </div>
              <button
                className="button secondary self-start"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const seeded = await repo.seed(await demoChanges(locale));
                    setMessage(
                      seeded
                        ? t('Sample data added to your workspace.')
                        : t('Sample data is already in this workspace.'),
                    );
                  })
                }
              >
                {t('Add sample data')}
              </button>
            </section>
          )}
          <section className="panel form-panel stack">
            <div className="settings-card-heading">
              <span className="tile-icon">
                <ShieldCheck size={21} />
              </span>
              <div>
                <h2>{demo ? t('Demo session') : t('Account session')}</h2>
                <p>
                  {demo
                    ? t('You can return to the demo on this browser.')
                    : t('Sign out when you finish working on a shared device.')}
                </p>
              </div>
            </div>
            <button
              className="button secondary self-start"
              disabled={busy || (!demo && !online)}
              onClick={() =>
                void run(async () => {
                  if (
                    pending.length &&
                    !window.confirm(
                      t(
                        'Unsynced changes remain on this browser. Sign out now?',
                      ),
                    )
                  )
                    return;
                  await signOut();
                })
              }
            >
              {demo ? t('Exit demo') : t('Sign out')}
            </button>
          </section>
        </div>
      )}
    </>
  );
}

export function avatar(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'A'
  );
}
