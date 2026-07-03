/**
 * GET /api/settings/xero-credentials
 * SHELVED — Xero integration is under development.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.status(503).json({ shelved: true, configured: false, source: 'none', maskedClientId: null, redirectUri: null });
}
