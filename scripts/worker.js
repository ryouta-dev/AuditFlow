/* global cacheName, paths */
const cacheable = new Set(paths);
const shell = paths[0];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) =>
        cache.addAll(
          paths.map((path) => new Request(path, { cache: 'reload' })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith('auditflow-shell-') && name !== cacheName,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const route = url.pathname.startsWith(shell)
    ? url.pathname.slice(shell.length)
    : null;
  if (
    request.mode === 'navigate' &&
    route !== null &&
    /^(?:$|(?:login|register|recover|dashboard|templates|audits|findings|capa|reports|analytics|settings)(?:\/|$))/.test(
      route,
    )
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(cacheName).then((cache) => cache.match(shell)),
      ),
    );
  } else if (
    cacheable.has(url.pathname) &&
    url.pathname !== shell &&
    !url.search
  ) {
    event.respondWith(
      caches
        .open(cacheName)
        .then((cache) =>
          cache.match(request).then((response) => response ?? fetch(request)),
        ),
    );
  }
});
