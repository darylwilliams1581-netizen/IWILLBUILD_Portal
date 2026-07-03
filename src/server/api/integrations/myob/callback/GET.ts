/**
 * GET /api/integrations/myob/callback
 * SHELVED — MYOB integration is under development.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.redirect('/settings?tab=accounting&myob=shelved');
}
