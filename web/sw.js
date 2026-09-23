const CACHE = 'faff-shell-v4';
const SCOPE = new URL(self.registration.scope);
const SHELL = [
  './', './index.html', './app.js', './model.js', './storage.js', './migration.js', './view.js', './icons.js',
  './fonts.css', './app.css', './calendar.css', './responsive.css', './logo.svg', './icon.svg',
  './manifest.webmanifest', './fonts/plex-0.woff2', './fonts/plex-1.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
].map(path => new URL(path, SCOPE).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))); }
    catch (error) { await caches.delete(CACHE); throw error; }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('faff-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  const key = new URL(url.pathname, SCOPE.origin).href;
  if (!SHELL.includes(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(key);
    return saved || fetch(event.request);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => {
      const url = new URL(client.url);
      return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
    });
    if (existing) return existing.focus();
    return self.clients.openWindow(SCOPE.href);
  })());
});
