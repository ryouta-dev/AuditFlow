'use client';

import { localizeError } from '@/lib/i18n';

import { useLanguage } from '@/features/workspace/language';
import { useAiSession } from '@/features/ai/session';

import { useState } from 'react';
import {
  Archive,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  FileCheck2,
  Layers3,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  blankQuestion,
  formatDate,
  optionsFor,
  rowsOf,
  severities,
  statusLabel,
  typeLabel,
  types,
  validateBlueprint,
  type Change,
  type Data,
  type Question,
  type Row,
  type Section,
} from '@/lib/domain';
import { useWorkspace } from '@/features/workspace/context';
import {
  Alert,
  Badge,
  Empty,
  Link,
  PageTitle,
  go,
} from '@/features/workspace/ui';

const newSection = (): Section => ({
  id: crypto.randomUUID(),
  title: '',
  questions: [blankQuestion()],
});
const newDraft = (sectionTitle: string): Data<'template'> => ({
  name: '',
  description: '',
  status: 'draft',
  sections: [{ ...newSection(), title: sectionTitle }],
  assessment: 'conformity',
});

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function Templates() {
  const { rows, locale, t, ready } = useWorkspace();
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('active');
  const templates = rowsOf(rows, 'template')
    .filter(
      (item) =>
        (status === 'all' ||
          (status === 'active'
            ? item.data.status !== 'archived'
            : item.data.status === status)) &&
        `${item.data.name} ${item.data.description}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const snapshots = rowsOf(rows, 'snapshot');
  return (
    <>
      <PageTitle
        title={t('Checklists')}
        description={t(
          'Create a checklist by hand or with AI, then reuse it for inspections.',
        )}
        action={
          <>
            <Link className="button secondary" href="/templates/new/ai">
              {t('Generate with AI')}
            </Link>
            <Link className="button primary" href="/templates/new">
              <Plus size={18} /> {t('New checklist')}
            </Link>
          </>
        }
      />
      <div className="list-filter">
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label={t('Search checklists')}
            placeholder={t('Search checklists…')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <span className="select-control">
          <select
            aria-label={t('Checklist status')}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="active">{t('Active checklists')}</option>
            <option value="all">{t('All statuses')}</option>
            <option value="draft">{t('Drafts')}</option>
            <option value="published">{t('Published')}</option>
            <option value="archived">{t('Archived')}</option>
          </select>
          <ChevronDown size={14} />
        </span>
      </div>
      {templates.length ? (
        <div className="template-grid">
          {templates.map((item) => {
            const versions = snapshots.filter(
              (snapshot) => snapshot.data.templateId === item.id,
            );
            const questions = item.data.sections.reduce(
              (total, section) => total + section.questions.length,
              0,
            );
            return (
              <article key={item.id} className="template-card panel">
                <div className="template-top">
                  <span className="tile-icon">
                    <Layers3 size={22} />
                  </span>
                  <Badge status={item.data.status} />
                </div>
                <h2 id={`checklist-${item.id}`}>
                  <Link href={`/templates/${item.id}/edit`}>
                    {item.data.name || t('Untitled checklist')}
                  </Link>
                </h2>
                {item.data.description && <p>{item.data.description}</p>}
                <div className="template-meta">
                  <span>
                    {t('Sections: {count}', {
                      count: item.data.sections.length,
                    })}
                  </span>
                  <span>{t('Questions: {count}', { count: questions })}</span>
                  {versions.length > 0 && (
                    <span>
                      {t('Version {number}', {
                        number: Math.max(
                          ...versions.map((version) => version.data.number),
                        ),
                      })}
                    </span>
                  )}
                </div>
                <div className="template-foot">
                  {item.data.status === 'published' && versions.length > 0 ? (
                    <Link
                      className="text-link"
                      href={`/audits/new/${item.id}`}
                      aria-describedby={`checklist-${item.id}`}
                    >
                      {t('Start inspection')} <ArrowRight size={15} />
                    </Link>
                  ) : (
                    t('Updated {date}', {
                      date: formatDate(item.updatedAt, locale),
                    })
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title={
              !ready
                ? t('Loading checklists…')
                : filter || status !== 'active'
                  ? t('No matching checklists')
                  : t('Create your first checklist')
            }
            detail={t(
              'Add at least one criterion and save the checklist to use it in an inspection.',
            )}
            action={
              <Link className="button secondary" href="/templates/new">
                <Plus size={16} /> {t('New checklist')}
              </Link>
            }
          />
        </div>
      )}
    </>
  );
}

function OrderButtons({
  index,
  size,
  moveTo,
  label,
}: {
  index: number;
  size: number;
  moveTo: (next: number) => void;
  label: string;
}) {
  const { t } = useLanguage();
  return (
    <>
      <button
        type="button"
        className="icon-button"
        disabled={!index}
        aria-label={t('Move {label} up', { label })}
        onClick={() => moveTo(index - 1)}
      >
        <ArrowUp size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={index === size - 1}
        aria-label={t('Move {label} down', { label })}
        onClick={() => moveTo(index + 1)}
      >
        <ArrowDown size={16} />
      </button>
    </>
  );
}

function QuestionEditor({
  question,
  number,
  update,
  actions,
  open,
  conformity,
}: {
  question: Question;
  number: number;
  update: (item: Question) => void;
  actions: React.ReactNode;
  open: boolean;
  conformity: boolean;
}) {
  const { t } = useLanguage();
  const options = question.options;
  const patch = (values: Partial<Question>) =>
    update({ ...question, ...values });
  if (conformity) {
    return (
      <article className="checklist-item-edit">
        <div className="checklist-item-main">
          <span className="question-number">{number}</span>
          <label>
            {t('What to check')}
            <input
              value={question.title}
              maxLength={160}
              placeholder={t('e.g. The emergency exit is unobstructed')}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>
          <div className="edit-item-actions">{actions}</div>
        </div>
        <details className="checklist-item-details">
          <summary>{t('Verification and source')}</summary>
          <div className="stack">
            <label>
              {t('How to verify')}
              <textarea
                rows={2}
                maxLength={4000}
                value={question.description}
                placeholder={t(
                  'e.g. Walk the route and check that the door opens freely',
                )}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
            <label>
              {t('Requirement reference')}
              <input
                maxLength={400}
                value={question.source ?? ''}
                placeholder={t('e.g. Site procedure, section 4.2')}
                onChange={(event) => patch({ source: event.target.value })}
              />
            </label>
          </div>
        </details>
      </article>
    );
  }
  return (
    <details className="question-editor" open={open}>
      <summary>
        <span className="question-number">{number}</span>
        <span>
          <strong>{question.title || t('Untitled question')}</strong>
          <small>
            {t(typeLabel[question.type])}{' '}
            {question.required && <>· {t('Required')}</>}
          </small>
        </span>
        <ChevronDown className="disclosure" size={18} />
      </summary>
      <div className="question-fields stack">
        <label>
          {t('Question title')}
          <input
            placeholder={t('e.g. Are emergency exits clear?')}
            value={question.title}
            maxLength={160}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>
        <label>
          {t('Instructions')} <span className="optional">{t('Optional')}</span>
          <textarea
            rows={2}
            value={question.description}
            maxLength={4000}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
        <div className="field-grid three">
          <label>
            {t('Response type')}
            <select
              value={question.type}
              onChange={(event) => {
                const type = event.target.value as Question['type'];
                patch({ type, options: optionsFor(type) });
              }}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {t(typeLabel[type])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Question weight')}
            <input
              type="number"
              min="0.001"
              max="1000"
              step="any"
              value={question.weight || ''}
              onChange={(event) =>
                patch({ weight: Number(event.target.value) })
              }
            />
          </label>
          <label>
            {t('Finding severity')}
            <select
              value={question.severity}
              onChange={(event) =>
                patch({ severity: event.target.value as Question['severity'] })
              }
            >
              {severities.map((severity) => (
                <option key={severity} value={severity}>
                  {statusLabel(t, severity)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(event) => patch({ required: event.target.checked })}
          />{' '}
          {t('Required to complete inspection')}
        </label>
        {options.length > 0 && (
          <div className="option-editor">
            <h4>{t('Options and scoring')}</h4>
            <p>
              {t('Score each option from 0 to 1, or leave all scores blank.')}
            </p>
            {options.map((item, i) => (
              <div key={item.id} className="option-row">
                <label>
                  <span className="sr-only">
                    {t('Option {number}', { number: i + 1 })}
                  </span>
                  <input
                    maxLength={160}
                    placeholder={t('Option {number}', { number: i + 1 })}
                    value={item.label}
                    readOnly={question.type === 'rating'}
                    onChange={(event) =>
                      patch({
                        options: options.map((value, index) =>
                          index === i
                            ? { ...value, label: event.target.value }
                            : value,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  <span className="sr-only">
                    {t('Score for option {number}', { number: i + 1 })}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="any"
                    value={item.score ?? ''}
                    placeholder={t('Score')}
                    onChange={(event) =>
                      patch({
                        options: options.map((value, index) =>
                          index === i
                            ? {
                                ...value,
                                score:
                                  event.target.value === ''
                                    ? null
                                    : event.target.valueAsNumber,
                              }
                            : value,
                        ),
                      })
                    }
                  />
                </label>
                {question.type !== 'rating' && (
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label={t('Remove option {number}', { number: i + 1 })}
                    disabled={options.length <= 2}
                    onClick={() =>
                      patch({
                        options: options.filter((_, index) => index !== i),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {question.type !== 'rating' && (
              <button
                type="button"
                className="button secondary small"
                disabled={options.length >= 30}
                onClick={() =>
                  patch({
                    options: [
                      ...options,
                      { id: crypto.randomUUID(), label: '', score: null },
                    ],
                  })
                }
              >
                <Plus size={15} /> {t('Add option')}
              </button>
            )}
          </div>
        )}
        <div className="edit-item-actions">{actions}</div>
      </div>
    </details>
  );
}

export function TemplateEditor({ template }: { template?: Row<'template'> }) {
  const { t } = useLanguage();
  const { rows, repo, locale } = useWorkspace();
  const { draft: preparedDraft, setDraft: setPreparedDraft } = useAiSession();
  const suggestion =
    !template && preparedDraft?.kind === 'template'
      ? preparedDraft.value
      : undefined;
  const [draft, setDraft] = useState(
    () => template?.data ?? suggestion ?? newDraft(t('Checklist items')),
  );
  const conformity = draft.assessment === 'conformity';
  const [id] = useState(() => template?.id ?? crypto.randomUUID());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newQuestion, setNewQuestion] = useState<string>();
  const versions = rowsOf(rows, 'snapshot')
    .filter((item) => item.data.templateId === id)
    .sort((a, b) => b.data.number - a.data.number);
  const archived = draft.status === 'archived';
  const updateSection = (index: number, update: Section) =>
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((item, i) =>
        i === index ? update : item,
      ),
    }));

  async function save(
    action: 'save' | 'publish' | 'archive' | 'restore' | 'duplicate' | 'delete',
  ) {
    setError('');
    setMessage('');
    if (working) return;
    if (
      !draft.name.trim() &&
      ['save', 'publish', 'duplicate'].includes(action)
    ) {
      setError(t('Give the checklist a name.'));
      return;
    }
    if (
      action === 'delete' &&
      !window.confirm(t('Delete this unpublished checklist?'))
    )
      return;
    setWorking(true);
    try {
      const changes: Change[] = [];
      if (action === 'publish') {
        const issue = validateBlueprint(draft, t);
        if (issue) {
          setError(issue);
          return;
        }
        if (!template)
          changes.push({
            id,
            kind: 'template',
            data: { ...draft, status: 'draft' },
          });
        const { name, description, sections, assessment } = draft;
        const blueprint = {
          name,
          description,
          sections,
          ...(assessment ? { assessment } : {}),
        };
        if (
          assessment === 'conformity' &&
          draft.status === 'published' &&
          versions[0] &&
          JSON.stringify(blueprint) ===
            JSON.stringify({
              name: versions[0].data.name,
              description: versions[0].data.description,
              sections: versions[0].data.sections,
              ...(versions[0].data.assessment
                ? { assessment: versions[0].data.assessment }
                : {}),
            })
        ) {
          if (JSON.stringify(draft) !== JSON.stringify(template?.data))
            await repo.write({ id, kind: 'template', data: draft });
          setMessage(t('Changes saved locally.'));
          return;
        }
        const number = (versions[0]?.data.number ?? 0) + 1;
        changes.push({
          id: crypto.randomUUID(),
          kind: 'snapshot',
          data: { ...blueprint, templateId: id, number },
        });
        changes.push({
          id,
          kind: 'template',
          data: { ...draft, status: 'published' },
        });
        await repo.write(...changes);
        setDraft((current) => ({ ...current, status: 'published' }));
        setMessage(
          t('Version {number} is available for inspections.', { number }),
        );
      } else if (action === 'duplicate') {
        const duplicate = crypto.randomUUID();
        await repo.write({
          id: duplicate,
          kind: 'template',
          data: {
            ...draft,
            name: t('{name} (copy)', { name: draft.name }).slice(0, 160),
            status: 'draft',
          },
        });
        go(`/templates/${duplicate}/edit`);
        return;
      } else if (action === 'delete' && template) {
        await repo.write({
          id,
          kind: 'template',
          data: template.data,
          deleted: true,
        });
        go('/templates');
        return;
      } else {
        const status =
          action === 'archive'
            ? 'archived'
            : action === 'restore'
              ? versions.length
                ? 'published'
                : 'draft'
              : draft.status;
        await repo.write({ id, kind: 'template', data: { ...draft, status } });
        setDraft((current) => ({ ...current, status }));
        setMessage(
          action === 'archive'
            ? t('Checklist archived.')
            : action === 'restore'
              ? t('Checklist restored.')
              : t('Changes saved locally.'),
        );
      }
      if (!template) {
        if (suggestion) setPreparedDraft(null);
        go(`/templates/${id}/edit`, true);
      }
    } catch (failure) {
      setError(localizeError(t, failure, 'Could not save the checklist.'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageTitle
        title={template ? t('Edit checklist') : t('New checklist')}
        description={t(
          conformity
            ? 'Write one observable condition per item.'
            : 'Configure the sections and questions inspectors will use in the field.',
        )}
        back={{ href: '/templates', label: t('Checklists') }}
        action={
          <>
            {template && <Badge status={draft.status} />}
            {!archived && (
              <>
                {!conformity && (
                  <button
                    className="button secondary"
                    disabled={working}
                    onClick={() => void save('save')}
                  >
                    {template ? t('Save changes') : t('Save draft')}
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={working}
                  onClick={() => void save('publish')}
                >
                  <FileCheck2 size={18} />{' '}
                  {draft.assessment === 'conformity'
                    ? t('Save checklist')
                    : versions.length
                      ? t('Publish new version')
                      : t('Publish checklist')}
                </button>
              </>
            )}
          </>
        }
      />
      {suggestion && (
        <div className="notice" role="status">
          {t('Draft from AI. Review it before saving.')}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <div className={template ? 'editor-layout' : 'checklist-editor-new'}>
        <div className="stack editor-main">
          <fieldset className="panel form-panel stack" disabled={archived}>
            <legend className="sr-only">{t('Checklist details')}</legend>
            <h2>{t('Checklist details')}</h2>
            <label>
              {t('Checklist name')}
              <input
                value={draft.name}
                placeholder={t('e.g. Workplace safety')}
                maxLength={160}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label>
              {t(
                draft.assessment === 'conformity'
                  ? 'Scope of the checklist'
                  : 'Description',
              )}{' '}
              <span className="optional">{t('Optional')}</span>
              <textarea
                rows={3}
                value={draft.description}
                placeholder={t('What should this checklist cover?')}
                maxLength={4000}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </label>
          </fieldset>
          {draft.sections.map((section, i) => (
            <fieldset
              className="panel form-panel stack section-panel"
              key={section.id}
              disabled={archived}
            >
              <legend className="sr-only">
                {t('Section {number}', { number: i + 1 })}
              </legend>
              <div className="section-heading">
                <h2>{t('Section {number}', { number: i + 1 })}</h2>
                <div className="edit-item-actions">
                  <OrderButtons
                    index={i}
                    size={draft.sections.length}
                    label={t('Section {number}', { number: i + 1 })}
                    moveTo={(next) =>
                      setDraft({
                        ...draft,
                        sections: move(draft.sections, i, next),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label={t('Remove section {number}', { number: i + 1 })}
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            'Remove this section and its questions from your working checklist?',
                          ),
                        )
                      )
                        setDraft({
                          ...draft,
                          sections: draft.sections.filter(
                            (item) => item.id !== section.id,
                          ),
                        });
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <label>
                {t('Section name')}
                <input
                  value={section.title}
                  placeholder={t('e.g. Fire safety')}
                  maxLength={160}
                  onChange={(event) =>
                    updateSection(i, { ...section, title: event.target.value })
                  }
                />
              </label>
              {section.questions.map((question, j) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  open={question.id === newQuestion || j === 0}
                  number={j + 1}
                  conformity={draft.assessment === 'conformity'}
                  update={(item) =>
                    updateSection(i, {
                      ...section,
                      questions: section.questions.map((previous, index) =>
                        index === j ? item : previous,
                      ),
                    })
                  }
                  actions={
                    <>
                      <OrderButtons
                        index={j}
                        size={section.questions.length}
                        label={t('Question {number}', { number: j + 1 })}
                        moveTo={(next) =>
                          updateSection(i, {
                            ...section,
                            questions: move(section.questions, j, next),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="icon-button danger-icon"
                        aria-label={t('Remove question {number}', {
                          number: j + 1,
                        })}
                        onClick={() =>
                          updateSection(i, {
                            ...section,
                            questions: section.questions.filter(
                              (item) => item.id !== question.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  }
                />
              ))}
              <button
                type="button"
                className="button secondary self-start"
                disabled={section.questions.length >= 80}
                onClick={() => {
                  const question = blankQuestion();
                  setNewQuestion(question.id);
                  updateSection(i, {
                    ...section,
                    questions: [...section.questions, question],
                  });
                }}
              >
                <Plus size={17} />{' '}
                {t(
                  draft.assessment === 'conformity'
                    ? 'Add check'
                    : 'Add question',
                )}
              </button>
            </fieldset>
          ))}
          {!archived && (
            <button
              className="button add-section"
              disabled={draft.sections.length >= 20}
              onClick={() =>
                setDraft({
                  ...draft,
                  sections: [...draft.sections, newSection()],
                })
              }
            >
              <Plus size={17} /> {t('Add section')}
            </button>
          )}
          {conformity && !archived && (
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={working}
                onClick={() => void save('save')}
              >
                {t('Save draft')}
              </button>
            </div>
          )}
        </div>
        {template && (
          <aside className="stack editor-aside">
            {!archived && versions.length > 0 && (
              <Link className="button primary" href={`/audits/new/${id}`}>
                {t('Start inspection')}
              </Link>
            )}
            <section className="panel form-panel stack">
              <h2>{t('Published versions')}</h2>
              <p className="muted small-copy">
                {t(
                  'Inspections keep the version they started with. Publish changes to use them in a new inspection.',
                )}
              </p>
              {versions.length ? (
                versions.map((version) => (
                  <details key={version.id} className="version-details">
                    <summary>
                      <strong>
                        {t('Version {number}', { number: version.data.number })}
                      </strong>
                      <small>{formatDate(version.updatedAt, locale)}</small>
                    </summary>
                    {version.data.sections.map((section) => (
                      <div key={section.id}>
                        <strong>{section.title}</strong>
                        <ul>
                          {section.questions.map((question) => (
                            <li key={question.id}>{question.title}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </details>
                ))
              ) : (
                <p className="muted small-copy">
                  {t('No versions published yet.')}
                </p>
              )}
            </section>
            {template && (
              <section className="panel form-panel stack">
                <h2>{t('Manage checklist')}</h2>
                <button
                  className="button secondary"
                  disabled={working}
                  onClick={() => void save('duplicate')}
                >
                  <Copy size={16} /> {t('Duplicate checklist')}
                </button>
                <button
                  className="button secondary"
                  disabled={working}
                  onClick={() => void save(archived ? 'restore' : 'archive')}
                >
                  <Archive size={16} />{' '}
                  {archived ? t('Restore checklist') : t('Archive checklist')}
                </button>
                {!versions.length && (
                  <button
                    className="button secondary danger-text"
                    disabled={working}
                    onClick={() => void save('delete')}
                  >
                    <Trash2 size={16} /> {t('Delete draft')}
                  </button>
                )}
              </section>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
