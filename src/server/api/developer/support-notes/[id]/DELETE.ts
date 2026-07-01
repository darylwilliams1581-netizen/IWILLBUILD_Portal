/**
 * DELETE /api/developer/support-notes/:id
 * Platform developer only — delete a support note.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../lib/platform-owner-guard.js';

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

    const noteId = Number(req.params.id);
    if (!noteId) return res.status(400).json({ error: 'Invalid note ID.' });

    await db.execute(sql`DELETE FROM developer_support_notes WHERE id = ${noteId}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('developer/support-notes DELETE error:', err);
    return res.status(500).json({ error: 'Failed to delete note.' });
  }
}
