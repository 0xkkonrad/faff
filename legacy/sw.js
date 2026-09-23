const destination = new URL('../faff/', self.registration.scope);
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      if (!client.url.startsWith(self.registration.scope)) continue;
      const previous = new URL(client.url);
      await client.navigate(destination.href + previous.search + previous.hash);
    }
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  const url = new URL(event.request.url);
  if (url.href.startsWith(self.registration.scope)) {
    event.respondWith(Response.redirect(destination.href + url.search + url.hash, 302));
  }
});
