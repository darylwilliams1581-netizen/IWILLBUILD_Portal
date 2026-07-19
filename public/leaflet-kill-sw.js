// Service Worker v7: intercepts leaflet.js and force-navigates all clients on
// activate to clear the browser's ES module registry (the only way to evict a
// module that was already evaluated in a prior page load).
const SW_VERSION = 'leaflet-kill-v7';
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
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) =>
          Promise.all(
            clients.map((c) => {
              // Add _lkill param to force a fresh navigation that clears the
              // ES module registry — location.reload() does NOT clear it in Chrome.
              try {
                const url = new URL(c.url);
                url.searchParams.set('_lkill', '9');
                return c.navigate(url.toString());
              } catch (_) {
                return c.navigate(c.url);
              }
            })
          )
        )
      )
  );
});

self.addEventListener('fetch', (e) => {
  if (LEAFLET_PATTERN.test(e.request.url)) {
    e.respondWith(
      new Response('export default {};\nexport const map=()=>({addLayer:()=>{},remove:()=>{}});\n', {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        },
      })
    );
  }
});
