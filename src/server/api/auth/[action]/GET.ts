import type { Request, Response } from 'express';
import { authHandler } from '@/server/auth-middleware';

export default async function handler(req: Request, res: Response) {
  try {
    await authHandler(req, res);
  } catch (err) {
    console.error('[auth] Unhandled error in GET handler:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Auth error' });
  }
}
