/**
 * GET /api/developer/support-notes
 * Platform developer only — fetch support notes for a user or company.
 * Query: ?userId=xxx OR ?companyId=xxx
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

    const { userId, companyId } = req.query as { userId?: string; companyId?: string };
    if (!userId && !companyId) {
      return res.status(400).json({ error: 'userId or companyId is required.' });
    }

    type NoteRow = {
      id: number;
      user_id: string | null;
      company_id: number | null;
      note: string;
      created_by_email: string;
      created_at: string;
    };

    let rows: NoteRow[];
    if (userId) {
      [rows] = await db.execute(
        sql`SELECT id, user_id, company_id, note, created_by_email, created_at
            FROM developer_support_notes
            WHERE user_id = ${userId}
            ORDER BY created_at DESC LIMIT 100`
      ) as unknown as [NoteRow[], unknown];
    } else {
      [rows] = await db.execute(
        sql`SELECT id, user_id, company_id, note, created_by_email, created_at
            FROM developer_support_notes
            WHERE company_id = ${Number(companyId)}
            ORDER BY created_at DESC LIMIT 100`
      ) as unknown as [NoteRow[], unknown];
    }

    return res.json({ notes: rows ?? [] });
  } catch (err) {
    console.error('developer/support-notes GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch support notes.' });
  }
}
