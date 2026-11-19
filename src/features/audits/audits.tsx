'use client';

import { formatPercent, localizeError } from '@/lib/i18n';

import { useLanguage } from '@/features/workspace/language';

import { useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Flag,
  Layers3,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  answerIndex,
  formatDate,
  hasFinalReport,
  inspectionStatuses,
  localDate,
  rowsOf,
  scoreFor,
  statusLabel,
  summarize,
  type Data,
  type Question,
  type Row,
} from '@/lib/domain';
import { useWorkspace } from '@/features/workspace/context';
import {
  Alert,
  Badge,
  Empty,
  Link,
  PageTitle,
  Pagination,
  go,
} from '@/features/workspace/ui';
import { inspectionData, InspectionTable } from '@/features/overview/dashboard';

export function Audits() {
  const { rows, t } = useWorkspace();
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const items = inspectionData(rows).filter(
    ({ row, version }) =>
      (status === 'all' || row.data.status === status) &&
      `${row.data.title} ${row.data.entity} ${version?.data.name ?? ''}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const size = 10;
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(items.length / size) - 1),
  );
  return (
    <>
      <PageTitle
        title={t('Inspections')}
        description={t('Start, resume, and review your inspections.')}
        action={
          <Link className="button primary" href="/audits/new">
            <Plus size={18} /> {t('New inspection')}
          </Link>
        }
      />
      <div className="list-filter">
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label={t('Search inspections')}
            placeholder={t('Search inspections…')}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <span className="select-control">
          <select
            value={status}
            aria-label={t('Inspection status')}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">{t('All statuses')}</option>
            {inspectionStatuses.map((status) => (
              <option value={status} key={status}>
                {statusLabel(t, status)}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </span>
      </div>
      <section className="panel">
        {!items.length && status === 'all' && !filter ? (
          <Empty
            title={t('No inspections yet')}
            detail={t(
              'Choose a published checklist to start your first inspection.',
            )}
            action={
              <Link className="button secondary" href="/audits/new">
                <Plus size={17} /> {t('New inspection')}
              </Link>
            }
          />
        ) : (
          <InspectionTable
            items={items.slice(current * size, (current + 1) * size)}
          />
        )}
        <Pagination
          page={current}
          total={items.length}
          size={size}
          setPage={setPage}
        />
      </section>
    </>
  );
}

export function NewAudit() {
  const { t } = useLanguage();
  const { rows, repo } = useWorkspace();
  const [templateId, setTemplateId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const templates = rowsOf(rows, 'template')
    .filter((item) => item.data.status === 'published')
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
  const selected =
    templates.find((item) => item.id === templateId) ?? templates[0];
  const versions = rowsOf(rows, 'snapshot')
    .filter((item) => item.data.templateId === selected?.id)
    .sort((a, b) => b.data.number - a.data.number);
  const version = versions.find((item) => item.id === versionId) ?? versions[0];

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!version || working) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const id = crypto.randomUUID();
    setWorking(true);
    setError('');
    try {
      await repo.write({
        kind: 'audit',
        id,
        data: {
          snapshotId: version.id,
          title: value('title'),
          entity: value('entity'),
          location: value('location'),
          date: value('date'),
          notes: value('notes'),
          status: 'in_progress',
          events: [{ status: 'in_progress', at: new Date().toISOString() }],
        },
      });
      go(`/audits/${id}`, true);
    } catch (failure) {
      setError(localizeError(t, failure, 'Could not start the inspection.'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageTitle
        title={t('New inspection')}
        description={t(
          'Choose a checklist version and record what you’ll inspect.',
        )}
        back={{ href: '/audits', label: t('Inspections') }}
      />
      {error && <Alert>{error}</Alert>}
      {!templates.length ? (
        <section className="panel">
          <Empty
            title={t('Publish a checklist first')}
            detail={t(
              'A published checklist gives the inspection a fixed set of questions and scoring rules.',
            )}
            action={
              <Link className="button primary" href="/templates/new">
                <Plus size={17} /> {t('New checklist')}
              </Link>
            }
          />
        </section>
      ) : (
        <div className="editor-layout">
          <form className="panel form-panel stack" onSubmit={create}>
            <h2>{t('Inspection details')}</h2>
            <div className="field-grid">
              <label>
                {t('Checklist')}
                <select
                  value={selected?.id ?? ''}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    setVersionId('');
                  }}
                >
                  {templates.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.data.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Version')}
                <select
                  required
                  value={version?.id ?? ''}
                  onChange={(event) => setVersionId(event.target.value)}
                >
                  {versions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {t('Version {number}', { number: item.data.number })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t('Inspection title')}
              <input
                name="title"
                maxLength={160}
                placeholder={t('e.g. Warehouse safety inspection')}
                required
              />
            </label>
            <label>
              {t('Inspected entity')}
              <input
                name="entity"
                maxLength={160}
                placeholder={t('e.g. North Warehouse')}
                required
              />
            </label>
            <div className="field-grid">
              <label>
                {t('Inspection date')}
                <input
                  type="date"
                  name="date"
                  defaultValue={localDate()}
                  required
                />
              </label>
              <label>
                {t('Location')}{' '}
                <span className="optional">{t('Optional')}</span>
                <input
                  name="location"
                  maxLength={160}
                  placeholder={t('Site or address')}
                />
              </label>
            </div>
            <label>
              {t('Auditor notes')}{' '}
              <span className="optional">{t('Optional')}</span>
              <textarea name="notes" rows={3} maxLength={4000} />
            </label>
            <div className="form-actions">
              <Link className="button secondary" href="/audits">
                {t('Cancel')}
              </Link>
              <button className="button primary" disabled={!version || working}>
                <ClipboardCheck size={17} /> {t('Start inspection')}
              </button>
            </div>
          </form>
          <aside className="panel form-panel version-preview">
            <span className="tile-icon">
              <Layers3 size={22} />
            </span>
            <h2>{version?.data.name ?? t('Checklist version')}</h2>
            <p className="muted">
              {version?.data.description ||
                t(
                  'The inspection will keep these questions and scoring rules.',
                )}
            </p>
            {version && (
              <ul>
                {version.data.sections.map((section) => (
                  <li key={section.id}>
                    <span>{section.title}</span>
                    <strong>{section.questions.length}</strong>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

type Patch = Partial<Pick<Data<'answer'>, 'value' | 'notes'>>;

function QuestionResponse({
  item,
  answer,
  readOnly,
  save,
  auditId,
  index,
}: {
  item: Question;
  answer?: Row<'answer'>;
  readOnly: boolean;
  save: (patch: Patch) => Promise<void>;
  auditId: string;
  index: number;
}) {
  const { locale, t } = useLanguage();
  const [previous, setPrevious] = useState(answer);
  const [optimistic, setOptimistic] = useState<Patch>({});
  const revisions = useRef({ value: 0, notes: 0 });
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  if (previous !== answer) {
    setPrevious(answer);
    const next = { ...optimistic };
    if (same(next.value, answer?.data.value)) delete next.value;
    if (next.notes === answer?.data.notes) delete next.notes;
    if (Object.keys(next).length !== Object.keys(optimistic).length)
      setOptimistic(next);
  }
  const value =
    optimistic.value !== undefined
      ? optimistic.value
      : (answer?.data.value ?? null);
  const notes = optimistic.notes ?? answer?.data.notes ?? '';
  const score = scoreFor(item, value);
  function edit(patch: Patch, field: 'value' | 'notes') {
    const version = ++revisions.current[field];
    setOptimistic((current) => ({ ...current, ...patch }));
    void save(patch).catch(() => {
      if (revisions.current[field] !== version) return;
      setOptimistic((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    });
  }
  const editValue = (value: Data<'answer'>['value']) =>
    edit({ value }, 'value');
  return (
    <article id={`question-${item.id}`} className="inspection-question">
      <div className="inspection-question-head">
        <span className="question-number">{index}</span>
        <div>
          <h3 id={`label-${item.id}`}>
            {item.title}
            {item.required && (
              <span className="required-mark" aria-label={t('Required')}>
                {' '}
                *
              </span>
            )}
          </h3>
          {item.description && <p>{item.description}</p>}
        </div>
        {score !== null && (
          <span className="question-score">
            {formatPercent(Math.round(score * 100), locale)}
          </span>
        )}
      </div>
      <div className="response-fields">
        <fieldset
          className="response-group"
          disabled={readOnly}
          aria-labelledby={`label-${item.id}`}
        >
          <legend className="sr-only">{item.title}</legend>
          {item.type === 'boolean' && (
            <div className="segmented-response">
              {[
                ['yes', t('Yes')],
                ['no', t('No')],
                ['na', t('N/A')],
              ].map(([option, label]) => (
                <button
                  key={option}
                  type="button"
                  className={`choice choice-${option}`}
                  aria-pressed={value === option}
                  onClick={() => editValue(value === option ? null : option)}
                >
                  {value === option && <Check size={15} />} {label}
                </button>
              ))}
            </div>
          )}
          {item.type === 'rating' && (
            <div className="segmented-response">
              {item.options.map((option) => (
                <button
                  type="button"
                  className="choice"
                  key={option.id}
                  aria-pressed={value === option.id}
                  onClick={() =>
                    editValue(value === option.id ? null : option.id)
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {item.type === 'text' && (
            <textarea
              aria-label={t('Answer for {name}', { name: item.title })}
              rows={2}
              maxLength={4000}
              placeholder={t('Enter your response')}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => editValue(event.target.value)}
            />
          )}
          {item.type === 'number' && (
            <input
              aria-label={t('Answer for {name}', { name: item.title })}
              type="number"
              step="any"
              value={typeof value === 'number' ? value : ''}
              onChange={(event) =>
                editValue(
                  Number.isFinite(event.target.valueAsNumber)
                    ? event.target.valueAsNumber
                    : null,
                )
              }
            />
          )}
          {item.type === 'date' && (
            <input
              aria-label={t('Answer for {name}', { name: item.title })}
              type="date"
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => editValue(event.target.value || null)}
            />
          )}
          {item.type === 'select' && (
            <select
              aria-label={t('Answer for {name}', { name: item.title })}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => editValue(event.target.value || null)}
            >
              <option value="">{t('Select an option')}</option>
              {item.options.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          {item.type === 'multiselect' && (
            <div className="multi-options">
              {item.options.map((option) => {
                const selected = Array.isArray(value) ? value : [];
                return (
                  <label className="check" key={option.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(option.id)}
                      onChange={(event) =>
                        editValue(
                          event.target.checked
                            ? [...selected, option.id]
                            : selected.filter((id) => id !== option.id),
                        )
                      }
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <label className="answer-note">
          {t('Response notes')}
          <textarea
            aria-label={t('Notes for {name}', { name: item.title })}
            rows={2}
            maxLength={4000}
            placeholder={t('Add an observation…')}
            value={notes}
            readOnly={readOnly}
            onChange={(event) => edit({ notes: event.target.value }, 'notes')}
          />
        </label>
        <Link
          className="text-link finding-link"
          href={`/findings/new/${auditId}/${item.id}`}
        >
          <Flag size={14} /> {t('Record finding')}
        </Link>
      </div>
    </article>
  );
}

export function AuditDetail({
  row,
  snapshot,
}: {
  row: Row<'audit'>;
  snapshot: Row<'snapshot'>;
}) {
  const { t } = useLanguage();
  const { rows, repo, online, pending, demo, locale } = useWorkspace();
  const [saving, setSaving] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const chain = useRef(Promise.resolve());
  const answers = answerIndex(rowsOf(rows, 'answer'), row.id);
  const summary = summarize(snapshot.data, answers);
  const readOnly =
    row.data.status === 'completed' || row.data.status === 'archived';
  const completionPending =
    row.data.status === 'completed' &&
    pending.some((op) => op.change.id === row.id);
  const auditPending = pending.some(
    (op) =>
      op.change.id === row.id ||
      (op.change.kind === 'answer' && op.change.data.auditId === row.id),
  );

  function save(questionId: string, patch: Patch) {
    setError('');
    setSaving((value) => value + 1);
    const operation = chain.current.then(() =>
      repo.answer(row.id, questionId, patch),
    );
    chain.current = operation.catch(() => undefined);
    return operation
      .catch((failure) => {
        setError(localizeError(t, failure, 'Could not save this response.'));
        throw failure;
      })
      .finally(() => setSaving((value) => value - 1));
  }

  async function moveTo(status: 'completed' | 'in_progress' | 'archived') {
    setError('');
    setWorking(true);
    try {
      await chain.current;
      if (
        status === 'in_progress' &&
        row.data.status === 'completed' &&
        !window.confirm(
          t(
            'Reopen this inspection for corrections? The status change will be recorded.',
          ),
        )
      )
        return;
      if (
        status === 'archived' &&
        !window.confirm(
          t('Archive this inspection? It will remain available to review.'),
        )
      )
        return;
      setReview(
        !(await repo.setInspectionStatus(row.id, row.data.status, status)),
      );
    } catch (failure) {
      setError(localizeError(t, failure, 'Could not update the inspection.'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageTitle
        title={row.data.title}
        description={`${row.data.entity}${row.data.location ? ` · ${row.data.location}` : ''} · ${formatDate(row.data.date, locale)}`}
        back={{ href: '/audits', label: t('Inspections') }}
        action={
          <>
            <Badge status={row.data.status}>
              {completionPending ? t('Completion pending') : undefined}
            </Badge>
            {readOnly ? (
              <>
                {row.data.status === 'completed' && (
                  <button
                    className="button secondary"
                    disabled={working}
                    onClick={() => void moveTo('in_progress')}
                  >
                    <RotateCcw size={16} /> {t('Reopen')}
                  </button>
                )}
                {hasFinalReport(row.data) && (
                  <Link className="button primary" href={`/reports/${row.id}`}>
                    <FileText size={17} /> {t('View report')}
                  </Link>
                )}
              </>
            ) : (
              <button
                className="button primary"
                disabled={working || saving > 0}
                onClick={() => void moveTo('completed')}
              >
                <Check size={18} /> {t('Complete inspection')}
              </button>
            )}
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      {review && summary.missing.length > 0 && (
        <Alert>
          <strong>
            {t('Answer the required questions before completing.')}
          </strong>
          <ul className="missing-list">
            {summary.missing.map((item) => (
              <li key={item.id}>
                <a className="text-link" href={`#question-${item.id}`}>
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {completionPending && (
        <div className="notice" role="status">
          {t(
            'Completion is saved on this device and awaits server confirmation.',
          )}
        </div>
      )}
      <div className="editor-layout inspection-layout">
        <div className="stack editor-main">
          {snapshot.data.sections.map((section, i) => (
            <section
              className="panel audit-section"
              key={section.id}
              id={`section-${section.id}`}
            >
              <div className="panel-heading">
                <div>
                  <h2>{section.title}</h2>
                  <p>
                    {t('Questions: {count}', {
                      count: section.questions.length,
                    })}
                  </p>
                </div>
                <span className="section-index">
                  {i + 1} / {snapshot.data.sections.length}
                </span>
              </div>
              {section.questions.map((question, j) => (
                <QuestionResponse
                  key={question.id}
                  item={question}
                  answer={answers[question.id]}
                  auditId={row.id}
                  readOnly={readOnly || working}
                  save={(patch) => save(question.id, patch)}
                  index={j + 1}
                />
              ))}
            </section>
          ))}
          {!readOnly && (
            <div className="form-actions">
              <button
                className="button primary"
                disabled={working || saving > 0}
                onClick={() => {
                  void moveTo('completed');
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }}
              >
                <Check size={18} /> {t('Review and complete')}
              </button>
            </div>
          )}
        </div>
        <aside className="stack editor-aside inspection-aside">
          <section className="panel form-panel stack">
            <div className="section-heading">
              <h2>{t('Progress')}</h2>
              <span className="progress-count">
                {summary.count}/{summary.total}
              </span>
            </div>
            <progress
              value={summary.count}
              max={summary.total || 1}
              aria-label={t('Inspection progress')}
            />
            <p className="small-copy muted">
              {t('{answered} of {required} required answered', {
                answered: summary.requiredAnswered,
                required: summary.required,
              })}
            </p>
            <nav className="section-nav" aria-label={t('Inspection sections')}>
              {snapshot.data.sections.map((section) => (
                <a key={section.id} href={`#section-${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
            <div className="compliance-summary">
              <span>{t('Compliance score')}</span>
              <strong>
                {summary.score === null
                  ? t('N/A')
                  : formatPercent(summary.score, locale)}
              </strong>
            </div>
            {summary.incompleteScored > 0 && (
              <p className="small-copy muted">
                {t('Unanswered scored questions excluded: {count}', {
                  count: summary.incompleteScored,
                })}
              </p>
            )}
            <div className="local-save" role="status">
              <i />
              {saving
                ? t('Saving locally…')
                : demo || !online || auditPending
                  ? t('Saved on this device')
                  : t('All responses saved')}
            </div>
          </section>
          <section className="panel form-panel stack">
            <h2>{t('Inspection details')}</h2>
            <p className="small-copy muted">
              {snapshot.data.name} ·{' '}
              {t('Version {number}', { number: snapshot.data.number })}
            </p>
            {row.data.notes && (
              <p className="small-copy preserve">{row.data.notes}</p>
            )}
            <Link className="button secondary" href={`/findings/new/${row.id}`}>
              <Flag size={16} /> {t('Record finding')}
            </Link>
            {row.data.status !== 'archived' && (
              <button
                className="button secondary"
                disabled={working || saving > 0}
                onClick={() => void moveTo('archived')}
              >
                <Archive size={16} /> {t('Archive inspection')}
              </button>
            )}
            <details className="history">
              <summary>{t('Status history')}</summary>
              <ul>
                {row.data.events.map((event, i) => (
                  <li key={i}>
                    <strong>{statusLabel(t, event.status)}</strong>
                    <span>{formatDate(event.at, locale)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}
