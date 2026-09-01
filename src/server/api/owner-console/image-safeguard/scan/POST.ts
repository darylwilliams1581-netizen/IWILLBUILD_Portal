/**
 * POST /api/owner-console/image-safeguard/scan
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B1 — Initiates an Image Safeguard scan run.
 *
 * Current behaviour (no classifier configured):
 *  - Verifies platform-owner authorization.
 *  - Checks server-side scanner capability.
 *  - Returns HTTP 503 scanner_not_configured when no classifier is set up.
 *  - Does NOT contact R2 or any external service.
 *  - Does NOT mutate any safeguard records.
 *  - Does NOT fabricate a successful run.
 *  - Does NOT accept provider selection or credentials from the browser.
 *
 * SECURITY:
 *  - Platform-owner access only (requirePlatformOwner middleware in entry.ts).
 *  - No provider selection accepted from request body.
 *  - No credentials accepted from request body.
 *  - Sanitized errors only — no internal paths or DB details.
 */

import type { Request, Response } from 'express';
import { getImageSafeguardCapability } from '../../../../lib/imageSafeguardCapability.js';

export default async function handler(_req: Request, res: Response) {
  // requirePlatformOwner middleware applied in entry.ts — access already verified.
  try {
    const capability = getImageSafeguardCapability();

    if (!capability.configured) {
      return res.status(503).json({
        error: 'scanner_not_configured',
        message: 'Image scanning is not configured.',
      });
    }

    // Future stage: invoke the configured provider here.
    // This path is unreachable until a provider is configured.
    return res.status(503).json({
      error: 'scanner_not_configured',
      message: 'Image scanning is not configured.',
    });
  } catch {
    return res.status(500).json({ error: 'Failed to initiate scan.' });
  }
}
