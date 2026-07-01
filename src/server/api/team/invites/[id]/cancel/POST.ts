/**
 * POST /api/team/invites/:id/cancel
 * Company owner/admin — cancel a pending invite.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { logActivity } from '../../../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company.' });
    if (profile.role !== 'owner' && profile.role !== 'admin' && !profile.permAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const inviteId = Number(req.params.id);
    type InviteRow = { id: number; email: string; status: string };
    const [inviteRows] = await db.execute(
      sql`SELECT id, email, status FROM company_invites WHERE id = ${inviteId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [InviteRow[], unknown];

    const invite = inviteRows?.[0];
    if (!invite) return res.status(404).json({ error: 'Invite not found.' });
    if (invite.status === 'accepted') return res.status(400).json({ error: 'Cannot cancel an accepted invite.' });
    if (invite.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });

    await db.execute(sql`
      UPDATE company_invites SET status = 'cancelled', cancelled_at = NOW() WHERE id = ${inviteId}
    `);

    void logActivity({
      eventType: 'invite_cancelled',
      success: true,
      email: invite.email,
      companyId: profile.companyId,
      performedByUserId: session.user.id,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/team/invites/:id/cancel error:', err);
    return res.status(500).json({ error: 'Failed to cancel invite.' });
  }
}
