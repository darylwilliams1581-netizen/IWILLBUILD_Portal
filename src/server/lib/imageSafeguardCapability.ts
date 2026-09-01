/**
 * imageSafeguardCapability.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B1/CP12B2 — Capability boundary for the Image Safeguard scanner.
 *
 * Delegates to scannerAdapter.getAdapterCapability() so there is a single
 * source of truth for whether the scanner is configured.
 *
 * See scannerAdapter.ts for the runtime decision and activation steps.
 */

import { getAdapterCapability } from './imageSafeguard/scannerAdapter.js';

export type ImageSafeguardCapability = {
  /** Whether a real image classifier is configured and ready to use. */
  configured: boolean;
  /** The provider identifier, or null when not configured. */
  provider: string | null;
};

/**
 * Returns the current scanner capability.
 * Delegates to the adapter boundary — never throws.
 */
export function getImageSafeguardCapability(): ImageSafeguardCapability {
  try {
    const cap = getAdapterCapability();
    return {
      configured: cap.configured,
      provider: cap.provider,
    };
  } catch {
    return { configured: false, provider: null };
  }
}
