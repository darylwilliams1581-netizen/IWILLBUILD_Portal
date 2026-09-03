/**
 * POST /api/image-safety/batch-status
 * ─────────────────────────────────────────────────────────────────────────────
 * The server-side Image Safeguard scanner has been decommissioned.
 * The external Cloudflare Worker handles scanning independently.
 *
 * This endpoint now returns a static "clear / no images" response so that
 * any client code that still calls it does not block sharing or email flows.
 * The safeguard acknowledgment gate has been removed from all share/email
 * handlers, so this response is informational only.
 */
import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.json({ worstStatus: 'clear', refCount: 0 });
}
