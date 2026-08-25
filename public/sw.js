/**
 * IWILLBUILD Service Worker — v7
 * App Shell Cache + Push Notifications + Background Sync
 */

const CACHE_NAME = 'iwillbuild-shell-v7';

const NEVER_CACHE_PATTERNS = [
  /^\/api\//,
  /^\/auth\//,
  /^\/external\//,
  /^\/share\//,
  /^\/airo-assets\//,
  /^\/assets\/uploads\//,
  /\.(pdf|docx?|xlsx?|csv|zip|dwg|dxf)$/i,
];

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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/manifest.json',
        '/icon-192.svg',
        '/icon-512.svg',
        '/favicon.ico',
      ]).catch(() => {})
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
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // ── Skip entirely when running inside a Capacitor native shell ───────────
  // Capacitor WebViews use capacitor://localhost as their origin. The SW
  // should never intercept or cache those requests — doing so can cause a
  // white screen on cold launch by serving a stale shell or failing the
  // navigate fetch against an origin the SW can't reach.
  if (
    request.url.startsWith('capacitor://') ||
    self.location.origin === 'capacitor://localhost'
  ) return;

  if (shouldNeverCache(request.url)) return;

  if (isCacheable(request.url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          fetch(request).then((r) => {
            if (r && r.ok) cache.put(request, r.clone());
          }).catch(() => {});
          return cached;
        }
        const r = await fetch(request);
        if (r && r.ok) cache.put(request, r.clone());
        return r;
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
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
        )
      )
    );
    return;
  }
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-queue-flush') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'OFFLINE_QUEUE_FLUSH' });
        }
      })
    );
  }
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'IWILLBUILD', body: event.data ? event.data.text() : '' };
  }

  const title = data.title ?? 'IWILLBUILD';
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/icon-192.svg',
    badge: data.badge ?? '/icon-192.svg',
    tag: data.tag ?? 'iwillbuild-notification',
    data: { url: data.url ?? '/' },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const clientUrl = new URL(client.url);
        const target = new URL(targetUrl, self.location.origin);
        if (clientUrl.pathname === target.pathname && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
