'use client';

import { useLanguage } from '@/features/workspace/language';

import { useId, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Layers3,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import {
  answerIndex,
  formatDate,
  localDate,
  rowsOf,
  summarize,
  type Row,
} from '@/lib/domain';
import { formatPercent, type Locale } from '@/lib/i18n';
import { useWorkspace } from '@/features/workspace/context';
import { Badge, Empty, Link, PageTitle } from '@/features/workspace/ui';

const states = [
  { key: 'completed', label: 'Completed', color: '#6553ec' },
  { key: 'in_progress', label: 'In progress', color: '#a798fa' },
  { key: 'draft', label: 'Draft', color: '#d9d1ff' },
  { key: 'archived', label: 'Archived', color: '#d9dee9' },
] as const;

export function inspectionData(rows: Row[]) {
  const snapshots = rowsOf(rows, 'snapshot');
  const answers = rowsOf(rows, 'answer');
  return rowsOf(rows, 'audit')
    .sort(
      (a, b) =>
        b.data.date.localeCompare(a.data.date) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .map((row) => {
      const version = snapshots.find(
        (record) => record.id === row.data.snapshotId,
      );
      return {
        row,
        version,
        score: version
          ? summarize(version.data, answerIndex(answers, row.id)).score
          : null,
      };
    });
}
export type Inspection = ReturnType<typeof inspectionData>[number];
const average = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
const applicableScores = (items: Inspection[]) =>
  items.flatMap((item) =>
    item.row.data.status === 'completed' && item.score !== null
      ? [item.score]
      : [],
  );

export function InspectionTable({
  items,
  compact = false,
}: {
  items: Inspection[];
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const { pending, locale } = useWorkspace();
  if (!items.length)
    return (
      <Empty
        title={compact ? t('No inspections yet') : t('No matching inspections')}
        detail={
          compact
            ? t('Start an inspection to see it here.')
            : t('Try changing the search or status filter.')
        }
        action={
          compact && (
            <Link className="button secondary" href="/audits/new">
              <Plus size={16} /> {t('New inspection')}
            </Link>
          )
        }
      />
    );
  return (
    <div className="table-wrap">
      <table className="data-table inspection-table">
        <thead>
          <tr>
            <th scope="col">{t('Inspection')}</th>
            <th scope="col">{t('Status')}</th>
            <th scope="col">{t('Date')}</th>
            <th scope="col">{t('Score')}</th>
            <th scope="col">
              <span className="sr-only">{t('Open record')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ row, version, score }) => (
            <tr key={row.id}>
              <td>
                <Link className="table-record" href={`/audits/${row.id}`}>
                  <span className="record-icon">
                    <ClipboardList size={18} />
                  </span>
                  <span>
                    <strong>{row.data.title}</strong>
                    <small>
                      {row.data.entity}
                      {!compact && version ? ` · ${version.data.name}` : ''}
                    </small>
                  </span>
                </Link>
              </td>
              <td>
                <Badge status={row.data.status}>
                  {row.data.status === 'completed' &&
                  pending.some((op) => op.change.id === row.id)
                    ? t('Completion pending')
                    : undefined}
                </Badge>
              </td>
              <td className="nowrap">{formatDate(row.data.date, locale)}</td>
              <td>
                <span className={score !== null ? 'score-cell' : 'muted'}>
                  {score === null ? '—' : formatPercent(score, locale)}
                </span>
              </td>
              <td>
                <Link
                  className="icon-button row-arrow"
                  href={`/audits/${row.id}`}
                  aria-label={t('Open {name}', { name: row.data.title })}
                >
                  <ArrowRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  caption,
  color,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string | number;
  caption: string;
  color: string;
}) {
  return (
    <div className="metric panel">
      <div className="metric-top">
        <span className={`metric-icon ${color}`}>
          <Icon size={18} />
        </span>
        <span>{label}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-caption">{caption}</div>
    </div>
  );
}

function Trend({
  items,
  months,
  locale,
}: {
  items: Inspection[];
  months: number;
  locale: Locale;
}) {
  const { t } = useLanguage();
  const gradient = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const now = new Date();
  const values = Array.from({ length: months }, (_, i) => {
    const month = new Date(
      now.getFullYear(),
      now.getMonth() - months + i + 1,
      1,
    );
    const monthKey = localDate(month).slice(0, 7);
    const scores = applicableScores(
      items.filter((item) => item.row.data.date.startsWith(monthKey)),
    );
    return {
      label: formatDate(localDate(month), locale, { month: 'short' }),
      long: formatDate(localDate(month), locale, {
        month: 'long',
        year: 'numeric',
      }),
      score: average(scores),
      count: scores.length,
    };
  });
  const height = 166,
    xStart = 45,
    xEnd = 620,
    yStart = 14;
  const xAt = (i: number) => xStart + (i * (xEnd - xStart)) / (months - 1);
  const yAt = (score: number) => yStart + ((100 - score) * height) / 100;
  const segments: { x: number; y: number; i: number }[][] = [];
  values.forEach((value, i) => {
    if (value.score === null) return;
    if (i === 0 || values[i - 1].score === null) segments.push([]);
    segments.at(-1)?.push({ x: xAt(i), y: yAt(value.score), i });
  });
  const active = selected === null ? null : values[selected];
  return (
    <section className="chart-panel panel">
      <div className="panel-heading">
        <div>
          <h2>{t('Compliance trend')}</h2>
          <p>{t('Average score across completed inspections')}</p>
        </div>
        <span className="chart-key">
          <i /> {t('Score')}
        </span>
      </div>
      {segments.length ? (
        <>
          <div className="chart-plot">
            <svg
              viewBox="0 0 640 188"
              role="img"
              aria-label={t(
                'Monthly average compliance scores. Individual months are listed below.',
              )}
            >
              <defs>
                <linearGradient id={gradient} x2="0%" y2="100%">
                  <stop stopColor="#7864f1" stopOpacity="0.19" />
                  <stop offset="1" stopColor="#7864f1" stopOpacity="0.015" />
                </linearGradient>
              </defs>
              {[100, 75, 50, 25, 0].map((value) => (
                <g key={value}>
                  <text x="0" y={yAt(value) + 4}>
                    {value}%
                  </text>
                  <line
                    x1={xStart}
                    x2={xEnd}
                    y1={yAt(value)}
                    y2={yAt(value)}
                    stroke="#e9eaf2"
                    strokeDasharray={value ? '3 4' : undefined}
                  />
                </g>
              ))}
              {segments.map((segment) => {
                const line = segment
                  .map(({ x, y }, i) => `${i ? 'L' : 'M'}${x},${y}`)
                  .join(' ');
                return (
                  <g key={segment[0].i}>
                    <path
                      d={`${line} L${segment.at(-1)?.x},180 L${segment[0].x},180 Z`}
                      fill={`url(#${gradient})`}
                    />
                    <path
                      d={line}
                      fill="none"
                      stroke="#6957ed"
                      strokeWidth="2.6"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    {segment.map((point) => (
                      <circle
                        key={point.i}
                        cx={point.x}
                        cy={point.y}
                        r={selected === point.i ? 5.5 : 3.6}
                        stroke="#6957ed"
                        strokeWidth="2.1"
                        fill="white"
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            <div
              className={`chart-months ${months === 12 ? 'months-dense' : ''}`}
              aria-label={t('Explore monthly scores')}
            >
              {values.map((value, i) => (
                <button
                  key={i}
                  className="chart-month"
                  style={{ left: `${xAt(i) / 6.4}%` }}
                  aria-label={`${value.long}, ${value.score === null ? t('No scored inspections') : formatPercent(value.score, locale)}`}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(selected === i ? null : i)}
                >
                  {value.label}
                </button>
              ))}
            </div>
          </div>
          {active && (
            <div className="chart-selection" role="status">
              {active.long}{' '}
              <strong>
                {active.score === null
                  ? t('N/A')
                  : formatPercent(active.score, locale)}
              </strong>{' '}
              · {t('Scored inspections: {count}', { count: active.count })}
            </div>
          )}
        </>
      ) : (
        <Empty
          title={t('No scored inspections')}
          detail={t('Complete a scored inspection to see monthly results.')}
        />
      )}
    </section>
  );
}

function StatusChart({ items }: { items: Inspection[] }) {
  const { t } = useLanguage();
  const total = items.length;
  const counts = states.map((state) => ({
    ...state,
    count: items.filter((item) => item.row.data.status === state.key).length,
  }));
  const stops = counts.flatMap((state, i) => {
    const before = counts
      .slice(0, i)
      .reduce((sum, item) => sum + item.count, 0);
    return state.count
      ? [
          `${state.color} ${(100 * before) / total}% ${(100 * (before + state.count)) / total}%`,
        ]
      : [];
  });
  return (
    <section className="status-panel panel">
      <div className="panel-heading">
        <div>
          <h2>{t('Inspection status')}</h2>
          <p>{t('Breakdown by current status')}</p>
        </div>
      </div>
      <div className="status-body">
        <div
          className="donut"
          style={{
            background: stops.length
              ? `conic-gradient(${stops.join(',')})`
              : '#eceaf5',
          }}
        >
          <div>
            <strong>{total}</strong>
            <span>{t('Inspections')}</span>
          </div>
        </div>
        <ul className="status-legend">
          {counts
            .filter((state) => state.key !== 'archived' || state.count)
            .map((state) => (
              <li key={state.key}>
                <span>
                  <i style={{ background: state.color }} />
                  {t(state.label)}
                </span>
                <strong>{state.count}</strong>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}

export function Dashboard({ analytics = false }: { analytics?: boolean }) {
  const { rows, identity, locale, t } = useWorkspace();
  const [months, setMonths] = useState(6);
  const [snapshotId, setSnapshotId] = useState('');
  const [status, setStatus] = useState('');
  const now = new Date();
  const today = localDate(now);
  const since = localDate(
    new Date(now.getFullYear(), now.getMonth() - months + 1, 1),
  );
  const all = inspectionData(rows);
  const items = all.filter(
    (item) =>
      item.row.data.date >= since &&
      item.row.data.date <= today &&
      (!snapshotId || item.version?.id === snapshotId) &&
      (!status || item.row.data.status === status),
  );
  const completed = items.filter(
    (item) => item.row.data.status === 'completed',
  ).length;
  const active = items.filter(
    (item) => item.row.data.status === 'in_progress',
  ).length;
  const score = average(applicableScores(items));
  const itemIds = new Set(items.map((item) => item.row.id));
  const relevantFindings = new Set(
    rowsOf(rows, 'finding')
      .filter((row) => itemIds.has(row.data.auditId))
      .map((row) => row.id),
  );
  const actions = rowsOf(rows, 'capa').filter(
    (row) =>
      !['closed', 'verified'].includes(row.data.status) &&
      (!analytics || relevantFindings.has(row.data.findingId)),
  );
  const overdue = actions.filter(
    (row) => row.data.dueDate && row.data.dueDate < today,
  ).length;
  const snapshots = rowsOf(rows, 'snapshot').sort(
    (a, b) =>
      a.data.name.localeCompare(b.data.name) || b.data.number - a.data.number,
  );
  return (
    <>
      <PageTitle
        title={analytics ? t('Analytics') : t('Overview')}
        description={
          analytics
            ? t('Track performance and review results by checklist version.')
            : t(
                'Welcome back, {name}. Here’s what’s happening with your inspections.',
                { name: identity.name.split(/\s+/)[0] },
              )
        }
        action={
          <>
            <span className="select-control date-filter">
              <CalendarDays size={16} />
              <select
                aria-label={t('Dashboard date range')}
                value={months}
                onChange={(event) => setMonths(Number(event.target.value))}
              >
                <option value={6}>{t('Last 6 months')}</option>
                <option value={3}>{t('Last 3 months')}</option>
                <option value={12}>{t('Last 12 months')}</option>
              </select>
              <ChevronDown size={14} />
            </span>
            {!analytics && (
              <Link className="button primary" href="/audits/new">
                <Plus size={18} /> {t('New inspection')}
              </Link>
            )}
          </>
        }
      />
      {!analytics && (
        <section className="dashboard-hero">
          <div className="hero-content">
            <h2>{t('Stay ready for every inspection.')}</h2>
            <p>
              {t(
                'Build a checklist, document your results, and keep follow-up work moving.',
              )}
            </p>
            <Link className="button hero-button" href="/templates">
              <Layers3 size={16} /> {t('Browse checklists')}{' '}
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="hero-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <span className="hero-spark spark-a" />
            <span className="hero-spark spark-b" />
            <span className="hero-spark spark-c" />
            <div className="art-card art-card-back" />
            <div className="art-card art-card-front">
              <div className="art-clip" />
              <div>
                <b />
                <em />
              </div>
              <div>
                <b />
                <em />
              </div>
              <div>
                <b />
                <em />
              </div>
            </div>
            <span className="art-check">
              <ClipboardCheck size={23} />
            </span>
          </div>
        </section>
      )}
      {analytics && (
        <div className="filter-panel panel">
          <label>
            {t('Checklist version')}
            <select
              value={snapshotId}
              onChange={(event) => setSnapshotId(event.target.value)}
            >
              <option value="">{t('All checklist versions')}</option>
              {snapshots.map((snapshot) => (
                <option value={snapshot.id} key={snapshot.id}>
                  {snapshot.data.name} ·{' '}
                  {t('Version {number}', { number: snapshot.data.number })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Inspection status')}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">{t('All statuses')}</option>
              {states.map((state) => (
                <option key={state.key} value={state.key}>
                  {t(state.label)}
                </option>
              ))}
            </select>
          </label>
          {!snapshotId && (
            <p>
              {t(
                'Scores can use different criteria. Select a version to compare like-for-like inspections.',
              )}
            </p>
          )}
        </div>
      )}
      <div className="metrics-grid">
        <Metric
          icon={ClipboardList}
          label={t('Total inspections')}
          value={items.length}
          caption={t('{count} completed in this period', { count: completed })}
          color="purple"
        />
        <Metric
          icon={Clock3}
          label={t('In progress')}
          value={active}
          caption={
            active ? t('Active inspections') : t('No active inspections')
          }
          color="blue"
        />
        <Metric
          icon={ChartNoAxesCombined}
          label={t('Avg. compliance')}
          value={score === null ? t('N/A') : formatPercent(score, locale)}
          caption={t('Across scored completions')}
          color="green"
        />
        <Metric
          icon={TriangleAlert}
          label={t('Open CAPA')}
          value={actions.length}
          caption={
            overdue
              ? t('Overdue actions: {count}', { count: overdue })
              : t('No overdue actions')
          }
          color="amber"
        />
      </div>
      <div className="charts-grid">
        <Trend
          key={`${months}:${snapshotId}:${status}`}
          items={items}
          months={months}
          locale={locale}
        />
        <StatusChart items={items} />
      </div>
      {!analytics ? (
        <section className="panel recent">
          <div className="panel-heading">
            <div>
              <h2>{t('Recent inspections')}</h2>
              <p>{t('Pick up where you left off or review completed work.')}</p>
            </div>
            <Link className="button secondary" href="/audits">
              {t('View all')} <ArrowRight size={16} />
            </Link>
          </div>
          <InspectionTable items={all.slice(0, 5)} compact />
        </section>
      ) : (
        <section className="panel recent">
          <div className="panel-heading">
            <div>
              <h2>{t('Inspections in this period')}</h2>
              <p>
                <Activity size={14} />{' '}
                {t('Matching inspections: {count}', { count: items.length })}
              </p>
            </div>
          </div>
          <InspectionTable items={items} />
        </section>
      )}
    </>
  );
}
