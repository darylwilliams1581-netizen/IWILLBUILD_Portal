/**
 * GET /api/support-mode/status
 * Returns current support context for the authenticated session.
 * Returns { active: false } if not in support mode.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { supportSessionStore } from '../../../support-session-store.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const ctx = supportSessionStore.get(session.session.token);
    if (!ctx) return res.json({ active: false });

    res.json({ active: true, companyId: ctx.companyId, companyName: ctx.companyName, enteredAt: ctx.enteredAt });
  } catch (error) {
    console.error('GET /api/support-mode/status error:', error);
    res.status(500).json({ error: 'Failed to get support mode status' });
  }
}
