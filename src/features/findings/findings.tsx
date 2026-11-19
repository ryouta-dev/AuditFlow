'use client';

import { localizeError } from '@/lib/i18n';

import { useLanguage } from '@/features/workspace/language';
import { useAiSession } from '@/features/ai/session';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Flag, ListChecks, Plus } from 'lucide-react';
import {
  capaStatuses,
  formatDate,
  localDate,
  rowsOf,
  severities,
  statusLabel,
  type Data,
  type Row,
} from '@/lib/domain';
import { useWorkspace } from '@/features/workspace/context';
import { recordId } from '@/lib/local';
import {
  Alert,
  Badge,
  Empty,
  Link,
  PageTitle,
  go,
} from '@/features/workspace/ui';

export function Findings({ actions = false }: { actions?: boolean }) {
  const { rows, locale, t } = useWorkspace();
  const [filter, setFilter] = useState('all');
  const audits = rowsOf(rows, 'audit');
  const findings = rowsOf(rows, 'finding').sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const corrective = rowsOf(rows, 'capa');
  const items = findings
    .map((finding) => ({
      finding,
      audit: audits.find((audit) => audit.id === finding.data.auditId),
      action: corrective.find((item) => item.data.findingId === finding.id),
    }))
    .filter(({ finding, action }) =>
      actions
        ? Boolean(action) &&
          (filter === 'all' || action?.data.status === filter)
        : filter === 'all' || finding.data.status === filter,
    );
  return (
    <>
      <PageTitle
        title={t('Findings & CAPA')}
        description={t(
          'Record observations, assign corrective work, and track verification.',
        )}
        action={
          <Link className="button primary" href="/findings/new">
            <Plus size={18} /> {t('Record finding')}
          </Link>
        }
      />
      <div className="list-filter split">
        <nav className="tabs" aria-label={t('Findings and actions')}>
          <Link href="/findings" aria-current={!actions ? 'page' : undefined}>
            <Flag size={16} /> {t('Findings')}
          </Link>
          <Link href="/capa" aria-current={actions ? 'page' : undefined}>
            <ListChecks size={16} /> {t('Corrective actions')}
          </Link>
        </nav>
        <select
          className="compact-select"
          aria-label={t('Filter by status')}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">{t('All statuses')}</option>
          {(actions ? capaStatuses : ['open', 'closed']).map((status) => (
            <option key={status} value={status}>
              {statusLabel(t, status)}
            </option>
          ))}
        </select>
      </div>
      <section className="panel">
        {items.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('Finding')}</th>
                  <th scope="col">{t('Severity')}</th>
                  <th scope="col">{t('Status')}</th>
                  {actions && <th scope="col">{t('Due date')}</th>}
                  <th scope="col">
                    <span className="sr-only">{t('Open record')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ finding, audit, action }) => {
                  const due = action?.data.dueDate;
                  const late =
                    due &&
                    due < localDate() &&
                    !['verified', 'closed'].includes(action.data.status);
                  return (
                    <tr key={finding.id}>
                      <td>
                        <Link
                          className="table-record"
                          href={`/findings/${finding.id}`}
                        >
                          <span className="record-icon">
                            <Flag size={17} />
                          </span>
                          <span>
                            <strong>{finding.data.title}</strong>
                            <small>
                              {audit?.data.title ?? t('Inspection')}
                            </small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <Badge status={finding.data.severity} />
                      </td>
                      <td>
                        <Badge
                          status={
                            actions
                              ? (action?.data.status ?? 'open')
                              : finding.data.status
                          }
                        />
                      </td>
                      {actions && (
                        <td className={`nowrap ${late ? 'danger-text' : ''}`}>
                          {due ? formatDate(due, locale) : '—'}
                          {late && (
                            <small className="due-label">{t('Overdue')}</small>
                          )}
                        </td>
                      )}
                      <td>
                        <Link
                          className="icon-button row-arrow"
                          href={`/findings/${finding.id}`}
                          aria-label={t('Open {name}', {
                            name: finding.data.title,
                          })}
                        >
                          <ArrowRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              actions
                ? t('No matching corrective actions')
                : t('No matching findings')
            }
            detail={
              actions
                ? t('Open a finding to create or update its corrective action.')
                : t('Record a finding from an inspection or create one here.')
            }
          />
        )}
      </section>
    </>
  );
}

export function FindingEditor({
  record,
  auditId: initialAudit,
  questionId: initialQuestion,
}: {
  record?: Row<'finding'>;
  auditId?: string;
  questionId?: string;
}) {
  const { t } = useLanguage();
  const { rows, repo, locale } = useWorkspace();
  const { draft: aiDraft, setDraft: setAiDraft, setMode } = useAiSession();
  const findingSuggestion =
    !record && aiDraft?.kind === 'finding' && aiDraft.auditId === initialAudit
      ? aiDraft.value
      : undefined;
  const capaSuggestion =
    record && aiDraft?.kind === 'capa' && aiDraft.findingId === record.id
      ? aiDraft.value
      : undefined;
  const [auditId, setAuditId] = useState(
    record?.data.auditId ?? initialAudit ?? '',
  );
  const [questionId, setQuestionId] = useState(
    record?.data.questionId ?? initialQuestion ?? '',
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [addAction, setAddAction] = useState(Boolean(capaSuggestion));
  const audits = rowsOf(rows, 'audit');
  const audit = audits.find((item) => item.id === auditId) ?? audits[0];
  const snapshot = rowsOf(rows, 'snapshot').find(
    (item) => item.id === audit?.data.snapshotId,
  );
  const questions =
    snapshot?.data.sections.flatMap((section) => section.questions) ?? [];
  const question = questions.find((item) => item.id === questionId);
  const action = rowsOf(rows, 'capa').find(
    (item) => item.data.findingId === record?.id,
  );
  const [severity, setSeverity] = useState<Data<'finding'>['severity'] | null>(
    record?.data.severity ?? findingSuggestion?.severity ?? null,
  );

  async function handle(
    event: FormEvent<HTMLFormElement>,
    type: 'finding' | 'action',
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? '').trim();
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (type === 'finding' && audit) {
        const id = record?.id ?? crypto.randomUUID();
        await repo.write({
          id,
          kind: 'finding',
          data: {
            auditId: audit.id,
            questionId: question?.id ?? null,
            title: field('title'),
            details: field('details'),
            severity: field('severity') as Data<'finding'>['severity'],
            status: field('status') === 'closed' ? 'closed' : 'open',
          },
        });
        if (!record) {
          if (findingSuggestion) setAiDraft(null);
          go(`/findings/${id}`, true);
          return;
        }
        setMessage(t('Finding saved locally.'));
      }
      if (type === 'action' && record) {
        const status = field('status') as Data<'capa'>['status'];
        const verification = field('verification');
        if (['verified', 'ineffective'].includes(status) && !verification)
          throw new Error(
            'Add a verification note before recording the outcome.',
          );
        const events = action?.data.events ?? [];
        const data: Data<'capa'> = {
          findingId: record.id,
          rootCause: field('rootCause'),
          corrective: field('corrective'),
          preventive: field('preventive'),
          assignee: field('assignee'),
          dueDate: field('dueDate'),
          status,
          verification,
          events:
            status === action?.data.status
              ? events
              : [...events, { status, at: new Date().toISOString() }],
        };
        await repo.write({
          id: action?.id ?? (await recordId(record.id, 'capa')),
          kind: 'capa',
          data,
        });
        if (capaSuggestion) setAiDraft(null);
        setMessage(t('Corrective action saved locally.'));
      }
    } catch (failure) {
      setError(localizeError(t, failure, 'Could not save the record.'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageTitle
        title={record ? record.data.title : t('Record finding')}
        description={
          record
            ? t('Review the finding and manage corrective work.')
            : t('Document an observation and link it to an inspection.')
        }
        back={{
          href: initialAudit && audit ? `/audits/${audit.id}` : '/findings',
          label: initialAudit && audit ? t('Inspection') : t('Findings & CAPA'),
        }}
      />
      {(findingSuggestion || capaSuggestion) && (
        <div className="notice" role="status">
          {t('Draft from AI. Review it before saving.')}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {message && (
        <div className="notice" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {!audit ? (
        <section className="panel">
          <Empty
            title={t('Start an inspection first')}
            detail={t(
              'Findings are linked to the inspection where they were observed.',
            )}
            action={
              <Link className="button primary" href="/audits/new">
                {t('New inspection')}
              </Link>
            }
          />
        </section>
      ) : (
        <div className="editor-layout">
          <div className="stack editor-main">
            <form
              className="panel form-panel stack"
              onSubmit={(event) => void handle(event, 'finding')}
            >
              <h2>{t('Finding details')}</h2>
              <div className="field-grid">
                <label>
                  {t('Inspection')}
                  <select
                    value={audit.id}
                    disabled={Boolean(record)}
                    onChange={(event) => {
                      setAuditId(event.target.value);
                      setQuestionId('');
                      setSeverity(null);
                    }}
                  >
                    {audits.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.data.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Question')}{' '}
                  <span className="optional">{t('Optional')}</span>
                  <select
                    value={question?.id ?? ''}
                    onChange={(event) => {
                      setQuestionId(event.target.value);
                      setSeverity(null);
                    }}
                  >
                    <option value="">{t('General finding')}</option>
                    {questions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                {t('Finding title')}
                <input
                  name="title"
                  defaultValue={record?.data.title ?? findingSuggestion?.title}
                  maxLength={160}
                  required
                />
              </label>
              <label>
                {t('Finding statement')}
                <textarea
                  name="details"
                  rows={3}
                  defaultValue={
                    record?.data.details ?? findingSuggestion?.details
                  }
                  maxLength={4000}
                />
              </label>
              <div className="field-grid">
                <label>
                  {t('Severity')}
                  <select
                    value={severity ?? question?.severity ?? 'medium'}
                    name="severity"
                    onChange={(event) =>
                      setSeverity(
                        event.target.value as Data<'finding'>['severity'],
                      )
                    }
                  >
                    {severities.map((item) => (
                      <option value={item} key={item}>
                        {statusLabel(t, item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Status')}
                  <select
                    name="status"
                    defaultValue={record?.data.status ?? 'open'}
                  >
                    <option value="open">{t('Open')}</option>
                    <option value="closed">{t('Closed')}</option>
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button className="button primary" disabled={working}>
                  <Check size={17} /> {t('Save finding')}
                </button>
              </div>
            </form>
            {record &&
              (action || addAction ? (
                <form
                  className="panel form-panel stack"
                  onSubmit={(event) => void handle(event, 'action')}
                >
                  <h2>{t('Corrective and preventive action')}</h2>
                  <label>
                    {t('Root cause')}
                    <textarea
                      name="rootCause"
                      rows={2}
                      maxLength={4000}
                      defaultValue={
                        capaSuggestion?.rootCause ?? action?.data.rootCause
                      }
                    />
                  </label>
                  <label>
                    {t('Corrective action')}
                    <textarea
                      name="corrective"
                      rows={2}
                      maxLength={4000}
                      defaultValue={
                        capaSuggestion?.corrective ?? action?.data.corrective
                      }
                      required
                    />
                  </label>
                  <label>
                    {t('Preventive action')}
                    <textarea
                      name="preventive"
                      rows={2}
                      maxLength={4000}
                      defaultValue={
                        capaSuggestion?.preventive ?? action?.data.preventive
                      }
                    />
                  </label>
                  <div className="field-grid">
                    <label>
                      {t('Responsible person')}
                      <input
                        name="assignee"
                        maxLength={160}
                        defaultValue={action?.data.assignee}
                      />
                    </label>
                    <label>
                      {t('Due date')}
                      <input
                        name="dueDate"
                        type="date"
                        defaultValue={action?.data.dueDate}
                      />
                    </label>
                  </div>
                  <label>
                    {t('Action status')}
                    <select
                      name="status"
                      defaultValue={action?.data.status ?? 'open'}
                    >
                      {capaStatuses.map((item) => (
                        <option key={item} value={item}>
                          {statusLabel(t, item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('Verification note')}
                    <textarea
                      name="verification"
                      rows={2}
                      maxLength={4000}
                      defaultValue={action?.data.verification}
                    />
                  </label>
                  <div className="form-actions">
                    <button className="button primary" disabled={working}>
                      <Check size={17} /> {t('Save corrective action')}
                    </button>
                  </div>
                </form>
              ) : (
                <section className="panel form-panel stack">
                  <h2>{t('Corrective actions')}</h2>
                  <p className="muted">
                    {t(
                      'Document how you’ll correct the issue and prevent a recurrence.',
                    )}
                  </p>
                  <button
                    className="button secondary self-start"
                    onClick={() => setAddAction(true)}
                  >
                    <Plus size={17} /> {t('Add corrective action')}
                  </button>
                </section>
              ))}
          </div>
          <aside className="stack editor-aside">
            {record && (
              <Link
                className="button secondary"
                href={`/settings/ai/capa/${record.id}`}
                onClick={() => setMode('assistant')}
              >
                {t('Suggest CAPA')}
              </Link>
            )}
            <section className="panel form-panel stack">
              <h2>{t('Linked inspection')}</h2>
              <Link className="text-link" href={`/audits/${audit.id}`}>
                {audit.data.title}
              </Link>
              <p className="muted small-copy">
                {audit.data.entity} · {formatDate(audit.data.date, locale)}
              </p>
            </section>
            {action && (
              <section className="panel form-panel stack">
                <h2>{t('Action history')}</h2>
                <ul className="event-list">
                  {action.data.events.map((event, i) => (
                    <li key={i}>
                      <span>{statusLabel(t, event.status)}</span>
                      <time>{formatDate(event.at, locale)}</time>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
