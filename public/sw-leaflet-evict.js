/**
 * Service Worker: intercept and permanently evict stale leaflet.js disk-cache.
 *
 * The browser disk cache holds leaflet.js?v=05d76b4a from before Leaflet was
 * removed. Because the URL has an immutable hash the browser serves it from
 * disk without a network round-trip. This SW:
 *   1. On activate: deletes ALL cache storage entries containing 'leaflet'
 *   2. On fetch: intercepts any leaflet.js request and returns an inert stub
 *
 * skipWaiting + clients.claim ensures the SW takes control immediately on
 * first registration without waiting for a page reload.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Claim all clients immediately so fetch handler fires on current page
      await self.clients.claim();

      // Delete any cached leaflet entries from ALL cache storage buckets
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(async (name) => {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          await Promise.all(
            keys
              .filter(req => req.url.includes('leaflet'))
              .map(req => cache.delete(req))
          );
        })
      );
    })()
  );
});

const STUB_JS = [
  '/* leaflet evicted by sw-leaflet-evict.js */',
  'export default {};',
  'export const map = () => ({});',
  'export const tileLayer = () => ({ addTo: () => ({}) });',
  'export const marker = () => ({ addTo: () => ({}) });',
  'export const icon = () => ({});',
  'export const latLng = () => ({});',
  'export const latLngBounds = () => ({});',
  'export const DomUtil = { getPosition: () => ({ x: 0, y: 0 }), setPosition: () => {} };',
].join('\n');

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Match any leaflet JS/CSS regardless of query string or path prefix.
  // Covers: /node_modules/.vite/deps/leaflet.js?v=05d76b4a and similar.
  const isLeafletJs = url.includes('leaflet.js') || url.includes('/leaflet/dist/') || url.includes('.vite/deps/leaflet');
  const isLeafletCss = url.includes('leaflet.css');
  if (isLeafletJs || isLeafletCss) {
    event.respondWith(
      new Response(
        isLeafletCss ? '/* leaflet evicted */' : STUB_JS,
        {
          status: 200,
          headers: {
            'Content-Type': isLeafletCss
              ? 'text/css; charset=utf-8'
              : 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      )
    );
  }
});
