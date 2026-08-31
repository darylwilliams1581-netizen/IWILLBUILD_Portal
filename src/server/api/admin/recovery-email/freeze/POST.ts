/**
 * POST /api/admin/recovery-email/freeze
 *
 * Operator-only: freeze an account and open a recovery case.
 * Operators may NOT directly overwrite the recovery address — only freeze + case.
 *
 * Body: { userId: string; reason: string }
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { adminFreezeAccount, auditLog } from '../../../../lib/recovery-email-service.js';
import { getIp } from '../../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }

    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const adminUser = session.user as { isAdmin?: boolean };
    if (!adminUser.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId?.trim()) return res.status(400).json({ error: 'userId is required.' });
    if (!reason?.trim()) return res.status(400).json({ error: 'reason is required.' });

    await adminFreezeAccount({
      userId:      userId.trim(),
      reason:      reason.trim(),
      performedBy: session.user.id,
      ipAddress:   getIp(req),
    });

    // Open a recovery case audit event
    await auditLog({
      userId:      userId.trim(),
      event:       'admin_case_opened',
      performedBy: session.user.id,
      ipAddress:   getIp(req),
      metadata:    { reason: reason.trim() },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin/recovery-email/freeze]', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to freeze account.' });
  }
}
