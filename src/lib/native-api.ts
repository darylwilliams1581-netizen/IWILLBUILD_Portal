// native-api.ts — Build 21 Native API Gate
// WHY: When server.url is absent, WKWebView loads bundled assets from the native
// scheme. Root-relative fetch calls resolve to the native origin, not the server.
// WHAT: nativeApiOrigin, patchFetchForNative (fetch+XHR), resolveDownloadUrl

const PROD_HOST = "iwillbuild.com";
const PROD_ORIGIN = `https://${PROD_HOST}`;

function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!(cap?.isNativePlatform?.());
}

export function nativeApiOrigin(): string {
  return isNativePlatform() ? PROD_ORIGIN : "";
}

function shouldRewrite(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  if (url.startsWith("capacitor") || url.startsWith("ionic")) return false;
  return url.startsWith("/api/") || url.startsWith("/auth/");
}

function rewriteUrl(url: string): string {
  return shouldRewrite(url) ? `${PROD_ORIGIN}${url}` : url;
}

function patchWindowFetch(): void {
  const orig = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof input === "string") { input = rewriteUrl(input); }
    else if (input instanceof URL) { const r = rewriteUrl(input.toString()); if (r !== input.toString()) input = new URL(r); }
    else if (input instanceof Request) { const r = rewriteUrl(input.url); if (r !== input.url) input = new Request(r, input); }
    return orig(input, init);
  };
}

function patchXHR(): void {
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL, async = true, username?: string | null, password?: string | null): void {
    const urlStr = url instanceof URL ? url.toString() : url;
    return origOpen.call(this, method, rewriteUrl(urlStr), async, username ?? null, password ?? null);
  };
}

/** Call once in main.tsx BEFORE installSessionFetchInterceptor. No-op on web. */
export function patchFetchForNative(): void {
  if (!isNativePlatform()) return;
  patchWindowFetch();
  patchXHR();
}

/** Rewrite /api/... to absolute URL on native. No-op on web. */
export function resolveDownloadUrl(url: string): string {
  if (!isNativePlatform()) return url;
  return rewriteUrl(url);
}
