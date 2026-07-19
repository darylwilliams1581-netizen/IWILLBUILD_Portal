// Service Worker: intercepts the stale cached leaflet.js and returns an empty ES module.
// This fires even when the browser serves from disk cache (no network request needed).
const LEAFLET_PATTERN = /leaflet/i;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
