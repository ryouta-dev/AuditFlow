'use client';

import { formatPercent, localizeError } from '@/lib/i18n';

import { useLanguage } from '@/features/workspace/language';
import { useAiSession } from '@/features/ai/session';

import { useState } from 'react';
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
} from 'lucide-react';
import {
  answerIndex,
  formatDate,
  hasFinalReport,
  responseLabel,
  rowsOf,
  scoreFor,
  statusLabel,
  summarize,
  type Row,
} from '@/lib/domain';
import { inspectionData } from '@/features/overview/dashboard';
import { useWorkspace } from '@/features/workspace/context';
import { Alert, Empty, Link, PageTitle } from '@/features/workspace/ui';

const methodologyKey =
  'Compliance is the weighted average of applicable scored answers. N/A, unscored, and unanswered items are excluded. Findings use a separate severity scale. Scores are advisory and do not constitute certification.';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function Reports() {
  const { rows, locale, t } = useWorkspace();
  const [query, setQuery] = useState('');
  const reports = inspectionData(rows).filter(
    ({ row }) =>
      hasFinalReport(row.data) &&
      `${row.data.title} ${row.data.entity}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        title={t('Reports')}
        description={t(
          'Review completed inspections and export their saved results.',
        )}
      />
      <div className="list-filter">
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label={t('Search reports')}
            placeholder={t('Search reports…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {reports.length ? (
        <div className="template-grid">
          {reports.map(({ row, version, score }) => (
            <Link
              href={`/reports/${row.id}`}
              className="template-card panel"
              key={row.id}
            >
              <span className="tile-icon">
                <FileText size={21} />
              </span>
              <h2>{row.data.title}</h2>
              <p>
                {row.data.entity} · {formatDate(row.data.date, locale)}
              </p>
              <div className="template-meta">
                <span>{version?.data.name}</span>
                <span>
                  {score === null ? t('N/A') : formatPercent(score, locale)}
                </span>
              </div>
              <div className="template-foot">
                {t('Open report')} <ArrowRight size={16} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={query ? t('No matching reports') : t('No reports yet')}
            detail={t('Complete an inspection to generate its report.')}
            action={
              <Link className="button secondary" href="/audits">
                {t('View inspections')}
              </Link>
            }
          />
        </section>
      )}
    </>
  );
}

export function Report({
  audit,
  version,
}: {
  audit: Row<'audit'>;
  version: Row<'snapshot'>;
}) {
  const { t } = useLanguage();
  const { rows, locale, pending, demo } = useWorkspace();
  const { draft, setDraft } = useAiSession();
  const conclusion =
    draft?.kind === 'report' && draft.auditId === audit.id
      ? draft.value
      : undefined;
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const answers = answerIndex(rowsOf(rows, 'answer'), audit.id);
  const summary = summarize(version.data, answers);
  const actions = rowsOf(rows, 'capa');
  const findings = rowsOf(rows, 'finding')
    .filter((finding) => finding.data.auditId === audit.id)
    .map((finding) => ({
      finding,
      action: actions.find((action) => action.data.findingId === finding.id),
    }));
  const findingIds = new Set(findings.map((item) => item.finding.id));
  const provisional =
    !demo &&
    pending.some(
      (op) =>
        op.change.id === audit.id ||
        ((op.change.kind === 'answer' || op.change.kind === 'finding') &&
          op.change.data.auditId === audit.id) ||
        (op.change.kind === 'capa' && findingIds.has(op.change.data.findingId)),
    );
  const date = formatDate(audit.data.date, locale);
  const methodology = t(methodologyKey);
  const data = version.data.sections.flatMap((section) =>
    section.questions.map((item) => {
      const answer = answers[item.id]?.data;
      const score = scoreFor(item, answer?.value);
      return {
        id: item.id,
        section: section.title,
        question: item.title,
        response: responseLabel(item, answer?.value, t),
        notes: answer?.notes ?? '',
        weight: item.weight,
        score,
        required: item.required,
      };
    }),
  );

  async function excel() {
    setExporting(true);
    setError('');
    try {
      const { exportInspection } = await import('./workbook');
      const output = await exportInspection({
        audit,
        version,
        date,
        score: summary.score,
        answered: summary.count,
        total: summary.total,
        data,
        findings,
        provisional,
        methodology,
        locale,
        conclusion: conclusion?.trim(),
      });
      downloadBlob(
        output,
        `AuditFlow-${audit.data.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 72)}-${audit.data.date}.xlsx`,
      );
    } catch (failure) {
      setError(localizeError(t, failure, 'Could not generate the workbook.'));
    } finally {
      setExporting(false);
    }
  }

  if (!hasFinalReport(audit.data))
    return (
      <section className="panel">
        <Empty
          title={t('Report unavailable')}
          detail={t(
            'A completed inspection is required to generate its report.',
          )}
          action={
            <Link className="button primary" href={`/audits/${audit.id}`}>
              {t('Open inspection')}
            </Link>
          }
        />
      </section>
    );
  return (
    <>
      <PageTitle
        title={t('Inspection report')}
        description={t(
          'Print to PDF or download the underlying results as an Excel workbook.',
        )}
        back={{ href: '/reports', label: t('Reports') }}
        action={
          <>
            <button
              className="button secondary"
              disabled={exporting}
              onClick={() => void excel()}
            >
              <Download size={17} />{' '}
              {exporting ? t('Generating…') : t('Download Excel')}
            </button>
            <button className="button primary" onClick={() => window.print()}>
              <Printer size={17} /> {t('Print / Save PDF')}
            </button>
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      <article className="panel report-document">
        <header className="report-cover">
          <div className="report-brand">
            <span className="tile-icon">
              <FileText size={20} />
            </span>{' '}
            {t('AuditFlow inspection report')}
          </div>
          <h2>{audit.data.title}</h2>
          <p>
            {audit.data.entity}
            {audit.data.location ? ` · ${audit.data.location}` : ''}
          </p>
          <div className="report-facts">
            <div>
              <span>{t('Inspection date')}</span>
              <strong>{date}</strong>
            </div>
            <div>
              <span>{t('Checklist')}</span>
              <strong>
                {version.data.name} ·{' '}
                {t('Version {number}', { number: version.data.number })}
              </strong>
            </div>
            <div>
              <span>{t('Compliance score')}</span>
              <strong>
                {summary.score === null
                  ? t('N/A')
                  : formatPercent(summary.score, locale)}
              </strong>
            </div>
            <div>
              <span>{t('Responses')}</span>
              <strong>
                {summary.count} / {summary.total}
              </strong>
            </div>
          </div>
          {provisional && (
            <p className="notice">
              {t(
                'This report includes local changes that are awaiting synchronization.',
              )}
            </p>
          )}
        </header>
        <section className="report-section">
          <h3>{t('Scope and methodology')}</h3>
          <p>
            {version.data.description ||
              t('Inspection of {entity} using {checklist}.', {
                entity: audit.data.entity,
                checklist: version.data.name,
              })}
          </p>
          <p>{methodology}</p>
          {summary.incompleteScored > 0 && (
            <p>
              {t('Unanswered scored questions: {count}', {
                count: summary.incompleteScored,
              })}
            </p>
          )}
        </section>
        <section className="report-section">
          <h3>{t('Checklist results')}</h3>
          <div className="table-wrap">
            <table className="data-table print-table">
              <thead>
                <tr>
                  <th scope="col">{t('Question')}</th>
                  <th scope="col">{t('Response')}</th>
                  <th scope="col">{t('Score')}</th>
                  <th scope="col">{t('Notes')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <small>{item.section}</small>
                      <strong>{item.question}</strong>
                    </td>
                    <td>{item.response}</td>
                    <td>
                      {item.score === null
                        ? '—'
                        : formatPercent(item.score * 100, locale)}
                    </td>
                    <td className="preserve">{item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="report-section">
          <h3>{t('Findings and corrective actions')}</h3>
          {findings.length ? (
            findings.map(({ finding, action }) => (
              <div className="report-finding" key={finding.id}>
                <div>
                  <strong>{finding.data.title}</strong>
                  <span>
                    {statusLabel(t, finding.data.severity)} ·{' '}
                    {statusLabel(t, finding.data.status)}
                  </span>
                </div>
                {finding.data.details && <p>{finding.data.details}</p>}
                {action && (
                  <dl>
                    <dt>{t('Action')}</dt>
                    <dd>{action.data.corrective}</dd>
                    <dt>{t('Prevention')}</dt>
                    <dd>{action.data.preventive || '—'}</dd>
                    <dt>{t('Root cause')}</dt>
                    <dd>{action.data.rootCause || '—'}</dd>
                    <dt>{t('Owner')}</dt>
                    <dd>{action.data.assignee || '—'}</dd>
                    <dt>{t('Due date')}</dt>
                    <dd>
                      {action.data.dueDate
                        ? formatDate(action.data.dueDate, locale)
                        : '—'}
                    </dd>
                    <dt>{t('Status')}</dt>
                    <dd>{statusLabel(t, action.data.status)}</dd>
                    <dt>{t('Verification')}</dt>
                    <dd>{action.data.verification || '—'}</dd>
                  </dl>
                )}
              </div>
            ))
          ) : (
            <p>{t('No findings recorded.')}</p>
          )}
        </section>
        {conclusion !== undefined && (
          <section className="report-section ai-report-conclusion">
            <h3>{t('AI-assisted conclusion')}</h3>
            <div className="ai-report-edit stack">
              <p className="muted small-copy">
                {t(
                  'Edit this conclusion before exporting. It is kept in this session and included in PDF and Excel.',
                )}
              </p>
              <textarea
                rows={5}
                maxLength={2000}
                aria-label={t('AI-assisted conclusion')}
                value={conclusion}
                onChange={(event) =>
                  setDraft({
                    kind: 'report',
                    auditId: audit.id,
                    value: event.target.value,
                  })
                }
              />
              <button
                className="button secondary self-start"
                onClick={() => setDraft(null)}
              >
                {t('Remove conclusion')}
              </button>
            </div>
            <p className="ai-report-print preserve">
              {conclusion.trim() || '—'}
            </p>
          </section>
        )}
        <section className="report-section">
          <h3>{t('Auditor summary')}</h3>
          <p className="preserve">
            {audit.data.notes || t('No auditor notes recorded.')}
          </p>
          <div className="signature">
            <span>{t('Auditor signature')}</span>
            <span>{t('Date')}</span>
          </div>
        </section>
      </article>
      <div className="report-footer">
        <FileSpreadsheet size={16} />{' '}
        {t(
          'Excel includes separate worksheets for the inspection summary, responses, and corrective actions.',
        )}
      </div>
    </>
  );
}
