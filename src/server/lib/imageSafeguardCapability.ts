/**
 * imageSafeguardCapability.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The in-app image scanner has been removed.
 * Scanning is handled by a separate Cloudflare service on the same R2 store.
 * This module always reports the scanner as not configured so that no
 * in-app scan path can be activated.
 */

export type ImageSafeguardCapability = {
  configured: boolean;
  provider: string | null;
};

export function getImageSafeguardCapability(): ImageSafeguardCapability {
  return { configured: false, provider: null };
}
