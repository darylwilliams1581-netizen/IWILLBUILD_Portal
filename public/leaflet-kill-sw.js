// Service worker: intercepts the stale cached leaflet.js and returns a safe stub.
// This is the only reliable way to override a disk-cached immutable resource.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('leaflet.js')) {
    e.respondWith(
      new Response(
        'export default {}; export const map=()=>{}; export const tileLayer=()=>{}; export const marker=()=>{}; export const icon=()=>{}; export const latLng=()=>({lat:0,lng:0}); export const divIcon=()=>{}; export const control={layers:()=>{},zoom:()=>{},scale:()=>{},attribution:()=>{}}; export const CRS={EPSG3857:{},EPSG4326:{},Simple:{}};',
        { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' } }
      )
    );
  }
});
