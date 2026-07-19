/**
 * Service Worker: intercept stale leaflet.js disk-cache hits.
 *
 * The browser has leaflet.js?v=05d76b4a cached on disk from before Leaflet
 * was removed. Because the URL contains an immutable hash the browser serves
 * it directly from disk without a network round-trip, so no server middleware
 * can intercept it. This SW runs before the disk cache and returns an inert
 * stub instead, preventing the stale module from executing.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('leaflet.js') || url.includes('leaflet.css')) {
    event.respondWith(
      new Response(
        url.includes('.css')
          ? '/* leaflet evicted */'
          : '/* leaflet evicted */\nexport default {};\nexport const map = () => ({});\nexport const tileLayer = () => ({ addTo: () => ({}) });\nexport const marker = () => ({ addTo: () => ({}) });\nexport const icon = () => ({});\nexport const latLng = () => ({});\nexport const latLngBounds = () => ({});\n',
        {
          status: 200,
          headers: {
            'Content-Type': url.includes('.css')
              ? 'text/css; charset=utf-8'
              : 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      )
    );
  }
});
