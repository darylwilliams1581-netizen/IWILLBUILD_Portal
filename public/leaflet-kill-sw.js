// Service Worker: intercepts the stale cached leaflet.js and returns an empty ES module.
// Fires even when the browser serves from disk cache (no network request needed).
const SW_VERSION = 'leaflet-kill-v5';
const LEAFLET_PATTERN = /leaflet/i;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) =>
          caches.open(key).then((cache) =>
            cache.keys().then((reqs) =>
              Promise.all(
                reqs
                  .filter((r) => LEAFLET_PATTERN.test(r.url))
                  .map((r) => cache.delete(r))
              )
            )
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // Nuke ALL caches so no stale Vite dep bundle (leaflet.js?v=...) survives
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) =>
          Promise.all(clients.map((c) => c.navigate(c.url)))
        )
      )
  );
});

self.addEventListener('fetch', (e) => {
  if (LEAFLET_PATTERN.test(e.request.url)) {
    e.respondWith(
      new Response('export default {};\n', {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        },
      })
    );
  }
});
