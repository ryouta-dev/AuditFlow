'use client';

import { useLanguage } from './language';

import {
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  TriangleAlert,
} from 'lucide-react';
import { statusLabel } from '@/lib/domain';
import { browserPath, routeHref } from '@/lib/hosting';

const routeEvent = 'auditflow:navigate';
function routeSubscribe(fn: () => void) {
  window.addEventListener('popstate', fn);
  window.addEventListener(routeEvent, fn);
  return () => {
    window.removeEventListener('popstate', fn);
    window.removeEventListener(routeEvent, fn);
  };
}
export function usePath() {
  return useSyncExternalStore(routeSubscribe, browserPath, () => '/');
}
export function go(path: string, replace = false) {
  const url = routeHref(path);
  if (location.pathname + location.search === url && !location.hash) return;
  const method = replace ? 'replaceState' : 'pushState';
  history[method](null, '', url);
  window.dispatchEvent(new Event(routeEvent));
  window.scrollTo(0, 0);
}
export function Link({
  href,
  onClick,
  ...props
}: ComponentProps<'a'> & { href: string }) {
  return (
    <a
      href={routeHref(href)}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          event.ctrlKey ||
          props.target ||
          !href.startsWith('/')
        )
          return;
        event.preventDefault();
        go(href);
      }}
    />
  );
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <ClipboardCheck size={20} strokeWidth={2.2} />
      </span>
      <span>
        Audit<span className="brand-flow">Flow</span>
      </span>
    </span>
  );
}

export function PageTitle({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="page-title">
      {back && (
        <Link className="back" href={back.href}>
          <ArrowLeft size={16} /> {back.label}
        </Link>
      )}
      <div className="heading-row">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {action && <div className="heading-actions">{action}</div>}
      </div>
    </div>
  );
}

export function Badge({
  status,
  children,
}: {
  status: string;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {children ?? statusLabel(t, status)}
    </span>
  );
}

export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <ClipboardCheck size={23} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="alert" role="alert">
      <TriangleAlert size={17} /> <div>{children}</div>
    </div>
  );
}

export function Pagination({
  page,
  total,
  size,
  setPage,
}: {
  page: number;
  total: number;
  size: number;
  setPage: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (total <= size) return null;
  return (
    <div className="pagination">
      <span>
        {t('{start}–{end} of {total}', {
          start: page * size + 1,
          end: Math.min((page + 1) * size, total),
          total,
        })}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label={t('Previous page')}
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={t('Next page')}
          disabled={(page + 1) * size >= total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
