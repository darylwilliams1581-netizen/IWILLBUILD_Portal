// native-url.ts — resolves relative paths to absolute URLs on Capacitor native.
// Set VITE_PROD_HOST in .env.production (e.g. VITE_PROD_HOST=your-domain.com).

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

const PROD_HOST: string =
  (import.meta.env.VITE_PROD_HOST as string | undefined) ?? '';

export function resolveNativeUrl(path: string): string {
  if (!isNativePlatform()) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!PROD_HOST) return path;
  const base = `https://${PROD_HOST}`;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
