/**
 * POST /api/integrations/myob/disconnect
 * SHELVED — MYOB integration is under development.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.status(503).json({ shelved: true, error: 'MYOB integration is coming soon.' });
}
