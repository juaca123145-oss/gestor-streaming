const CACHE = 'dorostream-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin
    || url.pathname.startsWith('/api/') || event.request.mode === 'navigate') return;
  if (!url.pathname.startsWith('/assets/') && !['/icon-192.png', '/icon-512.png', '/manifest.webmanifest'].includes(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
