/**
 * GET /api/integrations/qbo/status
 * SHELVED — QuickBooks Online integration is under development.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.status(503).json({ shelved: true, connected: false, platformReady: false });
}
