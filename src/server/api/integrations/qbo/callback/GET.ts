/**
 * GET /api/integrations/qbo/callback
 * SHELVED — QuickBooks Online integration is under development.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.redirect('/settings?tab=accounting&qbo=shelved');
}
