/**
 * GET /api/push/vapid-key
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the VAPID public key so the browser can subscribe to push.
 * Public endpoint — no auth required (the key is not sensitive).
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';

export default function handler(_req: Request, res: Response) {
  const publicKey = getSecret('VAPID_PUBLIC_KEY');
  if (!publicKey) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  return res.json({ publicKey });
}
