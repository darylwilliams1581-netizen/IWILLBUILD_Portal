/**
 * GET /api/integrations/xero/status
 * SHELVED — Xero integration is under development.
 * Returns a consistent "coming soon" shape so the UI renders cleanly.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.status(503).json({ shelved: true, connected: false, platformReady: false });
}
