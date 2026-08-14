/**
 * Dev-server shim for #airo/secrets.
 * In production the Rollup external() function prevents this file from being
 * bundled; the platform injects the real implementation at runtime.
 * In the Vite dev server (ssrLoadModule / module-runner) this shim is loaded
 * instead, reading values from process.env so every secret works locally.
 */
export function getSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Return empty string rather than throwing — callers guard for falsy values.
    return '';
  }
  return value;
}
