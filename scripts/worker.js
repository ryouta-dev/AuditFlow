/* global cacheName, paths */
const cacheable = new Set(paths);

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
  if (
    request.mode === 'navigate' &&
    /^\/(?:$|(?:login|register|recover|dashboard|templates|audits|findings|capa|reports|analytics|settings)(?:\/|$))/.test(
      url.pathname,
    )
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(cacheName).then((cache) => cache.match('/')),
      ),
    );
  } else if (
    cacheable.has(url.pathname) &&
    url.pathname !== '/' &&
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
