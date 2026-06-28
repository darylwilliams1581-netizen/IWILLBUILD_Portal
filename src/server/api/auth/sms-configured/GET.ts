/**
 * GET /api/auth/sms-configured
 * Returns { configured: boolean } — tells the frontend whether SMS is available.
 * Public endpoint — no auth required.
 */
import type { Request, Response } from 'express';
import { isSmsConfigured } from '../../../lib/sms.js';

export default function handler(_req: Request, res: Response) {
  res.json({ configured: isSmsConfigured() });
}
