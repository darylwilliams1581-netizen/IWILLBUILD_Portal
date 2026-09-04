// native-url.ts — resolves relative paths to absolute URLs on Capacitor native.
// PROD_HOST is hardcoded — VITE_PROD_HOST is never set in this project.

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

// Hardcoded — do not use import.meta.env.VITE_PROD_HOST (never set).
const PROD_HOST: string = 'iwillbuild.com';

export function resolveNativeUrl(path: string): string {
  if (!isNativePlatform()) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!PROD_HOST) return path;
  const base = `https://${PROD_HOST}`;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
