/**
 * imageSafeguardCapability.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B1 — Capability boundary for the Image Safeguard scanner.
 *
 * This is a small, intentionally thin boundary.  Its only job is to report
 * whether a classifier is configured and which provider it would use.
 *
 * A future stage can implement a real provider by:
 *   1. Adding a SAFEGUARD_PROVIDER secret.
 *   2. Returning configured:true and the provider name here.
 *   3. Implementing the scan logic in a separate module.
 *
 * This stage does NOT:
 *   - Contact R2, xAI, AWS, Azure or Google.
 *   - Add credentials or environment variables.
 *   - Implement a scan queue, scheduler or provider.
 *   - Mutate any safeguard records.
 */

export type ImageSafeguardCapability = {
  /** Whether a real image classifier is configured and ready to use. */
  configured: boolean;
  /** The provider identifier, or null when not configured. */
  provider: string | null;
};

/**
 * getImageSafeguardCapability
 *
 * Returns the current scanner capability.  Currently always returns
 * configured:false because no classifier has been provisioned.
 *
 * This function is the single place to change when a provider is added.
 * It must never throw — callers rely on a safe fallback.
 */
export function getImageSafeguardCapability(): ImageSafeguardCapability {
  // No classifier is configured in this stage.
  // A future stage will read a SAFEGUARD_PROVIDER secret here.
  return {
    configured: false,
    provider: null,
  };
}
