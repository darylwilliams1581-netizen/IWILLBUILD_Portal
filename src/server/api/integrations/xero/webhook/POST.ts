/**
 * POST /api/integrations/xero/webhook
 * SHELVED — Xero integration is under development.
 */
import type { Request, Response } from 'express';

export default async function handler(_req: Request, res: Response) {
  // Xero requires a 200 response to webhook pings even when shelved
  res.status(200).json({ shelved: true });
}
