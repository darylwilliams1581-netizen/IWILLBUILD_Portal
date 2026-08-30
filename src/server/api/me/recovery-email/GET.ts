/**
 * GET /api/me/recovery-email
 * Returns the masked current + pending recovery email state.
 * Never exposes plain addresses or tokens.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getPublicState } from '../../../lib/recovery-email-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const state = await getPublicState(session.user.id);
    return res.json(state);
  } catch (err) {
    console.error('[recovery-email/GET]', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to load recovery email state.' });
  }
}
