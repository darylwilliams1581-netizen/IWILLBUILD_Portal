/**
 * GET /api/team/invites/validate?token=...
 * Public, token-protected preview for a company invitation.
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { companies, user } from '../../../../db/schema.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'This invitation link is invalid.' });

    type InviteRow = { id: number; company_id: number; email: string; name: string | null; role: string; status: string; expires_at: Date | string };
    const [rows] = await db.execute(sql`
      SELECT id, company_id, email, name, role, status, expires_at
      FROM company_invites WHERE token = ${token} LIMIT 1
    `) as unknown as [InviteRow[], unknown];
    const invite = rows?.[0];
    if (!invite) return res.status(404).json({ error: 'This invitation link is invalid.' });
    if (invite.status !== 'pending') return res.status(410).json({ error: 'This invitation is no longer active.' });
    if (new Date(invite.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: 'This invitation has expired. Ask the company owner to resend it.' });

    const company = await db.query.companies.findFirst({ where: eq(companies.id, invite.company_id), columns: { name: true } });
    const existingUser = await db.query.user.findFirst({ where: eq(user.email, invite.email), columns: { id: true } });
    return res.json({
      invite: {
        email: invite.email,
        name: invite.name,
        role: invite.role,
        companyName: company?.name ?? 'IWILLBUILD',
        expiresAt: invite.expires_at,
        existingAccount: Boolean(existingUser),
      },
    });
  } catch (error) {
    console.error('[team/invites/validate]', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Could not validate this invitation.' });
  }
}
