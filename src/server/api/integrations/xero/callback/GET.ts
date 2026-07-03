/**
 * GET /api/integrations/xero/callback
 * SHELVED — Xero integration is under development.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  res.redirect('/settings?tab=accounting&xero=shelved');
}
