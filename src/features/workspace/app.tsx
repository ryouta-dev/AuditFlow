'use client';

import { LanguageProvider, LanguageSelect, useLanguage } from './language';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Cloud,
  CloudOff,
  FileText,
  Flag,
  Layers3,
  LayoutDashboard,
  Menu,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { rowsOf } from '@/lib/domain';
import { DEMO } from '@/lib/local';
import { localizeError } from '@/lib/i18n';
import { Dashboard } from '@/features/overview/dashboard';
import { TemplateEditor, Templates } from '@/features/templates/templates';
import { AuditDetail, Audits, NewAudit } from '@/features/audits/audits';
import { FindingEditor, Findings } from '@/features/findings/findings';
import { Report, Reports } from '@/features/reports/reports';
import { AiStudio } from '@/features/ai/studio';
import { AiSession } from '@/features/ai/session';
import { WorkspaceProvider, useWorkspace } from './context';
import { Settings, avatar } from './settings';
import { AuthScreen, useSession } from './session';
import { Alert, Brand, Empty, Link, go, usePath } from './ui';

const navigation = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Checklists', href: '/templates', icon: Layers3 },
  { label: 'Inspections', href: '/audits', icon: ClipboardList },
  { label: 'Findings & CAPA', href: '/findings', icon: Flag },
  { label: 'Reports', href: '/reports', icon: FileText },
  { label: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined },
  { label: 'Settings', href: '/settings/profile', icon: Settings2 },
] as const;

function Shell({
  section,
  children,
}: {
  section: string;
  children: ReactNode;
}) {
  const {
    identity,
    rows,
    demo,
    online,
    offlineReady,
    syncing,
    synced,
    syncError,
    conflicts,
    pending,
    t,
  } = useWorkspace();
  const [mobile, setMobile] = useState(false);
  const userMenu = useRef<HTMLDetailsElement>(null);
  const searchDialog = useRef<HTMLDialogElement>(null);
  const [searchQuery, setQuery] = useState('');
  function openSearch() {
    setQuery('');
    if (!searchDialog.current?.open) searchDialog.current?.showModal();
  }
  function closeSearch() {
    searchDialog.current?.close();
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.code === 'KeyK' || event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  const query = searchQuery.trim().toLowerCase();
  const found = [
    ...rowsOf(rows, 'audit').map((row) => ({
      name: row.data.title,
      caption: t('Inspection'),
      href: `/audits/${row.id}`,
      icon: ClipboardList,
      keywords: row.data.entity,
    })),
    ...rowsOf(rows, 'template').map((row) => ({
      name: row.data.name || t('Untitled checklist'),
      caption: t('Checklist'),
      href: `/templates/${row.id}/edit`,
      icon: Layers3,
      keywords: row.data.description,
    })),
    ...rowsOf(rows, 'finding').map((row) => ({
      name: row.data.title,
      caption: t('Finding'),
      href: `/findings/${row.id}`,
      icon: Flag,
      keywords: row.data.details,
    })),
  ]
    .filter((item) =>
      `${item.name} ${item.keywords}`.toLowerCase().includes(query),
    )
    .slice(0, 8);
  const current =
    navigation.find((item) => item.href.split('/')[1] === section) ??
    navigation[0];
  const status = conflicts.length
    ? t('Conflict')
    : !online
      ? t('Offline')
      : syncError
        ? t('Sync error')
        : demo
          ? t('Local workspace')
          : syncing
            ? t('Syncing')
            : pending.length
              ? t('Local saved')
              : synced
                ? t('Synced')
                : t('Connecting');
  const statusClass =
    conflicts.length || syncError
      ? 'problem'
      : online
        ? 'connected'
        : 'disconnected';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('Skip to content')}
      </a>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label={t('Close navigation')}
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Link
            href="/dashboard"
            aria-label={t('AuditFlow home')}
            onClick={() => setMobile(false)}
          >
            <Brand />
          </Link>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobile(false)}
            aria-label={t('Close navigation')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Layers3 size={16} />
          </span>
          <span>
            <strong>
              {demo ? t('Demo workspace') : t('Personal workspace')}
            </strong>
            <small>{demo ? t('Sample data') : t('Private to you')}</small>
          </span>
        </div>
        <div className="nav-label">{t('Workspace')}</div>
        <nav className="nav-links" aria-label={t('Workspace')}>
          {navigation.slice(0, -1).map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={current.label === label ? 'page' : undefined}
              onClick={() => setMobile(false)}
            >
              <Icon size={18} strokeWidth={1.85} />
              <span>{t(label)}</span>
            </Link>
          ))}
        </nav>
        <div className="nav-label preferences">{t('Preferences')}</div>
        <nav className="nav-links" aria-label={t('Preferences')}>
          <Link
            href="/settings/profile"
            aria-current={current.label === 'Settings' ? 'page' : undefined}
            onClick={() => setMobile(false)}
          >
            <Settings2 size={18} strokeWidth={1.85} />
            <span>{t('Settings')}</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <Link
            className="offline-card"
            href="/settings/sync"
            onClick={() => setMobile(false)}
          >
            <span className="offline-icon">
              <CloudDownloadIcon ready={offlineReady} />
            </span>
            <span>
              <strong>{t('Offline & sync')}</strong>
              <small>
                {offlineReady
                  ? t('Available on this device')
                  : t('Manage local data')}
              </small>
            </span>
            <ChevronRight size={15} />
          </Link>
          <Link
            href="/settings/profile"
            className="sidebar-user"
            onClick={() => setMobile(false)}
          >
            <span className="avatar">{avatar(identity.name)}</span>
            <span>
              <strong>{identity.name}</strong>
              <small>{demo ? t('Demo auditor') : identity.email}</small>
            </span>
            <ChevronDown size={15} />
          </Link>
        </div>
      </aside>
      <div className="shell-main">
        <header className="topbar">
          <div className="header-left">
            <button
              className="icon-button menu-toggle"
              aria-label={t('Open navigation')}
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={22} />
            </button>
            <div className="breadcrumbs">
              <span>{t('Workspace')}</span>
              <ChevronRight size={14} />
              <strong>{t(current.label)}</strong>
            </div>
          </div>
          <div className="header-tools">
            <button
              className="global-search"
              onClick={openSearch}
              aria-label={t('Search workspace…')}
            >
              <Search size={17} />
              <span>{t('Search workspace…')}</span>
              <kbd>Ctrl K</kbd>
            </button>
            <Link
              href="/settings/ai"
              className="button secondary ai-entry"
              aria-label={t('AI assistant')}
            >
              <Sparkles size={17} />
              <span>{t('AI assistant')}</span>
            </Link>
            <Link
              href="/settings/sync"
              aria-label={t('Sync status: {status}', { status })}
              className={`sync-pill ${statusClass}`}
            >
              <i />
              <span>{status}</span>
            </Link>
            <details className="user-menu" ref={userMenu}>
              <summary aria-label={t('Account menu')}>
                <span className="avatar small-avatar">
                  {avatar(identity.name)}
                </span>
                <ChevronDown size={14} />
              </summary>
              <div className="user-dropdown">
                <strong>{identity.name}</strong>
                <small>{demo ? t('Demo workspace') : identity.email}</small>
                <Link
                  href="/settings/profile"
                  onClick={() => {
                    if (userMenu.current) userMenu.current.open = false;
                  }}
                >
                  <Settings2 size={16} /> {t('Account settings')}
                </Link>
                <Link
                  href="/settings/sync"
                  onClick={() => {
                    if (userMenu.current) userMenu.current.open = false;
                  }}
                >
                  <CircleHelp size={16} /> {t('Offline & sync')}
                </Link>
                <div className="menu-language">
                  <LanguageSelect />
                </div>
              </div>
            </details>
          </div>
        </header>
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <dialog
        ref={searchDialog}
        className="search-dialog"
        aria-label={t('Search workspace records')}
      >
        <div className="search-dialog-head">
          <Search size={20} />
          <input
            aria-label={t('Search workspace')}
            autoFocus
            placeholder={t('Search inspections, checklists, and findings…')}
            value={searchQuery}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="icon-button"
            aria-label={t('Close search')}
            onClick={closeSearch}
          >
            <X size={19} />
          </button>
        </div>
        <div className="search-results">
          <div className="search-results-label">
            {query ? t('Search results') : t('Workspace records')}
          </div>
          {found.length ? (
            found.map(({ name, caption, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="search-result"
                onClick={closeSearch}
              >
                <span className="record-icon">
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{caption}</small>
                </span>
                <ArrowRight size={16} />
              </Link>
            ))
          ) : (
            <p>
              {query
                ? t('No matching records.')
                : t('Records will appear here as you create them.')}
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}

function CloudDownloadIcon({ ready }: { ready: boolean }) {
  return ready ? <CloudOff size={17} /> : <Cloud size={17} />;
}

function Loading() {
  const { t } = useLanguage();
  return (
    <div className="loading" role="status">
      <span />
      <span>{t('Opening AuditFlow…')}</span>
    </div>
  );
}

function Workspace({
  path,
  signOut,
}: {
  path: string;
  signOut: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const { rows, ready, syncError, demo } = useWorkspace();
  const [section, id, action, question] = path.split('/').filter(Boolean);
  const labels = {
    templates: 'Checklist unavailable',
    audits: 'Inspection unavailable',
    reports: 'Report unavailable',
    findings: 'Finding unavailable',
  } as const;
  const missing = (type: keyof typeof labels) => (
    <section className="panel">
      <Empty
        title={t(labels[type])}
        detail={t(
          'This record may still be syncing or may belong to a different account.',
        )}
        action={
          <Link className="button secondary" href={`/${type}`}>
            {t('Back to list')}
          </Link>
        }
      />
    </section>
  );
  let content: ReactNode;
  if (!ready) content = <Loading />;
  else if (section === 'templates') {
    const template = rowsOf(rows, 'template').find((item) => item.id === id);
    content =
      id === 'new' ? (
        <TemplateEditor key="new" />
      ) : id ? (
        template ? (
          <TemplateEditor key={id} template={template} />
        ) : (
          missing('templates')
        )
      ) : (
        <Templates />
      );
  } else if (section === 'audits' || section === 'reports') {
    const audit = rowsOf(rows, 'audit').find((item) => item.id === id);
    const version = rowsOf(rows, 'snapshot').find(
      (item) => item.id === audit?.data.snapshotId,
    );
    if (section === 'audits')
      content =
        id === 'new' ? (
          <NewAudit />
        ) : id ? (
          audit && version ? (
            <AuditDetail key={id} row={audit} snapshot={version} />
          ) : (
            missing('audits')
          )
        ) : (
          <Audits />
        );
    else
      content = id ? (
        audit && version ? (
          <Report key={id} audit={audit} version={version} />
        ) : (
          missing('reports')
        )
      ) : (
        <Reports />
      );
  } else if (section === 'findings' || section === 'capa') {
    const finding = rowsOf(rows, 'finding').find((item) => item.id === id);
    content =
      id === 'new' ? (
        <FindingEditor key={path} auditId={action} questionId={question} />
      ) : id ? (
        finding ? (
          <FindingEditor key={id} record={finding} />
        ) : (
          missing('findings')
        )
      ) : (
        <Findings key={section} actions={section === 'capa'} />
      );
  } else if (section === 'settings')
    content =
      id === 'ai' ? (
        <AiStudio
          key={path}
          findingTarget={action === 'capa' ? question : undefined}
        />
      ) : (
        <Settings key={id} sync={id === 'sync'} signOut={signOut} />
      );
  else
    content = <Dashboard key={section} analytics={section === 'analytics'} />;

  return (
    <Shell section={section === 'capa' ? 'findings' : (section ?? 'dashboard')}>
      {demo && syncError && (
        <Alert>{localizeError(t, syncError, 'Demo setup failed.')}</Alert>
      )}
      {content}
    </Shell>
  );
}

export function App() {
  const path = usePath();
  const session = useSession();
  useEffect(() => {
    if (session.identity && path === '/') go('/dashboard', true);
  }, [path, session.identity]);
  return (
    <LanguageProvider owner={session.identity?.id}>
      <AppContent path={path} session={session} />
    </LanguageProvider>
  );
}

function AppContent({
  path,
  session,
}: {
  path: string;
  session: ReturnType<typeof useSession>;
}) {
  const authRoute = ['/login', '/register', '/recover'].includes(path);
  if (session.identity === undefined && !authRoute) return <Loading />;
  if (
    !session.identity ||
    (authRoute && (session.recovery || !session.identity.email))
  )
    return (
      <AuthScreen
        key={`${path}:${session.recovery}`}
        path={authRoute ? path : '/login'}
        recovering={session.recovery}
        enterDemo={session.enterDemo}
        endRecovery={session.endRecovery}
      />
    );
  return (
    <WorkspaceProvider key={session.identity.id} identity={session.identity}>
      <AiSession demo={session.identity.id === DEMO}>
        <Workspace path={path} signOut={session.signOut} />
      </AiSession>
    </WorkspaceProvider>
  );
}
