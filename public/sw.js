/**
 * IWILLBUILD Service Worker — App Shell Cache Only
 * ─────────────────────────────────────────────────────────────────────────────
 * Strategy: Network-first for everything. Cache only static app shell assets
 * (JS bundles, CSS, fonts, icons). NEVER cache API responses, auth routes,
 * user data, job data, photos, forms, or file uploads.
 *
 * This keeps the app online-first while enabling fast shell loads and
 * "Add to Home Screen" PWA install on Android/iOS.
 */

const CACHE_NAME = 'iwillbuild-shell-v1';

/**
 * Patterns that must NEVER be cached — API, auth, billing, uploads, data.
 * Any URL matching these goes straight to the network, no cache read/write.
 */
const NEVER_CACHE_PATTERNS = [
  /^\/api\//,
  /^\/auth\//,
  /^\/external\//,
  /^\/share\//,
  /^\/airo-assets\//,
  /^\/assets\/uploads\//,
  /\.(pdf|docx?|xlsx?|csv|zip|dwg|dxf)$/i,
];

/**
 * Static shell assets that are safe to cache.
 * These are the Vite-built bundles — they have content-hash filenames
 * so stale-while-revalidate is safe.
 */
const CACHE_PATTERNS = [
  /^\/assets\/.*\.(js|css|woff2?|ttf|otf)$/,
  /^\/icon-\d+\.svg$/,
  /^\/favicon\.ico$/,
  /^\/manifest\.json$/,
];

function shouldNeverCache(url) {
  const path = new URL(url).pathname;
  return NEVER_CACHE_PATTERNS.some((p) => p.test(path));
}

function isCacheable(url) {
  const path = new URL(url).pathname;
  return CACHE_PATTERNS.some((p) => p.test(path));
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/manifest.json',
        '/icon-192.svg',
        '/icon-512.svg',
        '/favicon.ico',
      ]).catch(() => {
        // Non-fatal — shell will still work
      })
    )
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) requests (chrome-extension://, etc.)
  if (!request.url.startsWith('http')) return;

  // NEVER cache API, auth, uploads, or sensitive data — pass straight through
  if (shouldNeverCache(request.url)) return;

  // For cacheable static assets: cache-first with network fallback
  if (isCacheable(request.url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          // Refresh in background (stale-while-revalidate)
          fetch(request).then((fresh) => {
            if (fresh && fresh.ok) cache.put(request, fresh.clone());
          }).catch(() => {});
          return cached;
        }
        // Not cached — fetch and store
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // For the HTML shell (navigation requests) — network-first, no caching
  // This ensures the user always gets the latest app shell from the server.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        // Offline fallback: return a minimal offline notice
        return new Response(
          `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IWILLBUILD — Offline</title>
  <style>
    body { font-family: Arial, sans-serif; background: #111827; color: #f9fafb;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; text-align: center; padding: 24px; }
    h1 { color: #ff6b00; font-size: 2rem; margin-bottom: 8px; }
    p  { color: #9ca3af; font-size: 1rem; }
    button { margin-top: 24px; background: #ff6b00; color: #fff; border: none;
             padding: 12px 28px; border-radius: 8px; font-size: 1rem;
             cursor: pointer; font-weight: bold; }
  </style>
</head>
<body>
  <div>
    <h1>You're offline</h1>
    <p>IWILLBUILD needs an internet connection.<br>Check your connection and try again.</p>
    <button onclick="location.reload()">Try Again</button>
  </div>
</body>
</html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }

  // All other requests — network only, no caching
});
