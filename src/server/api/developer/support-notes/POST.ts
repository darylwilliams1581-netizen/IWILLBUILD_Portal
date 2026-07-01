/**
 * POST /api/developer/support-notes
 * Platform developer only — add a private support note on a user or company.
 * Body: { userId?, companyId?, note }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../lib/platform-owner-guard.js';

async function getDevSession(req: Request) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  return auth.api.getSession({ headers });
}

async function isPlatformDev(userId: string, email: string): Promise<boolean> {
  if (PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) return true;
  try {
    const [rows] = await db.execute(
      sql`SELECT platform_role FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ platform_role: string | null }>, unknown];
    return rows?.[0]?.platform_role === 'developer';
  } catch { return false; }
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const { userId, companyId, note } = req.body as {
      userId?: string;
      companyId?: number;
      note?: string;
    };

    if (!note?.trim()) return res.status(400).json({ error: 'Note text is required.' });
    if (!userId && !companyId) return res.status(400).json({ error: 'userId or companyId is required.' });

    await db.execute(sql`
      INSERT INTO developer_support_notes
        (user_id, company_id, note, created_by_user_id, created_by_email, created_at)
      VALUES (
        ${userId ?? null},
        ${companyId ?? null},
        ${note.trim().slice(0, 2000)},
        ${session.user.id},
        ${session.user.email ?? ''},
        NOW()
      )
    `);

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('developer/support-notes POST error:', err);
    return res.status(500).json({ error: 'Failed to save support note.' });
  }
}
