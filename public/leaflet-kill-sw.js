/* leaflet-kill-sw.js — v3
 * Intercepts any browser-disk-cached leaflet.js request and returns an empty
 * ES module stub so the stale immutable-cached file can never execute.
 * Self-unregisters after one successful cache-clear so it doesn't linger.
 */
const KILL_VERSION = 'v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    clients.claim().then(() => {
      // Self-unregister — job done after clearing caches
      return self.registration.unregister();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('leaflet.js')) {
    event.respondWith(
      new Response('// leaflet stub — killed by SW ' + KILL_VERSION, {
        headers: { 'Content-Type': 'application/javascript' },
      })
    );
  }
});
