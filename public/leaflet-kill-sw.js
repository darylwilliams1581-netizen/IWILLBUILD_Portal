// Service Worker v8: intercepts leaflet.js and returns a safe no-op stub.
// The stub exports all functions leaflet calls internally so nothing throws.
const SW_VERSION = 'leaflet-kill-v8';
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
    // Return a stub that defines getPosition safely so _leaflet_pos never throws.
    // Any code that already evaluated the real leaflet from disk cache will still
    // call getPosition — this stub makes it return {x:0,y:0} instead of throwing.
    const stub = `
(function(){
  // Patch Object.prototype so any el._leaflet_pos access on undefined-ish objects
  // returns a safe Point instead of throwing.
  try {
    if (!Object.getOwnPropertyDescriptor(Object.prototype, '_leaflet_pos')) {
      Object.defineProperty(Object.prototype, '_leaflet_pos', {
        get: function() { return (this != null) ? undefined : {x:0,y:0}; },
        set: function(v) { Object.defineProperty(this, '_leaflet_pos', { value: v, writable: true, configurable: true }); },
        configurable: true,
        enumerable: false,
      });
    }
  } catch(_) {}
})();
export default {};
export const map = () => ({ addLayer:()=>{}, remove:()=>{}, setView:()=>{}, on:()=>{} });
export const tileLayer = () => ({ addTo:()=>{} });
export const marker = () => ({ addTo:()=>{}, bindPopup:()=>({ openPopup:()=>{} }) });
export const icon = () => ({});
export const latLng = (a,b) => ({lat:a,lng:b});
export const latLngBounds = () => ({});
export const point = (x,y) => ({x,y});
`;
    e.respondWith(
      new Response(stub, {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        },
      })
    );
  }
});
