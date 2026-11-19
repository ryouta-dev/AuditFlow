export const pagesPath = process.env.NEXT_PUBLIC_AUDITFLOW_BASE_PATH ?? '';

export function routeHref(path: string) {
  if (!pagesPath || !path.startsWith('/') || path.startsWith('//')) return path;
  return `${pagesPath}/?${new URLSearchParams({ page: path })}`;
}

export function browserPath() {
  if (!pagesPath) return location.pathname;
  const page = new URLSearchParams(location.search).get('page');
  return page?.startsWith('/') && !page.startsWith('//') ? page : '/';
}
