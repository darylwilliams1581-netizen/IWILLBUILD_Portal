import type { Request, Response } from 'express';
import { getSubscriptionInfo } from '../../../lib/subscription-gate.js';

export default async function handler(req: Request, res: Response) {
  const info = await getSubscriptionInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  res.json(info);
}
