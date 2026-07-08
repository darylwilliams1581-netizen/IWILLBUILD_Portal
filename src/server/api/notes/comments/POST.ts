/**
 * POST /api/notes/comments
 * Add a comment/reply to a note.
 */
import type { Request, Response } from 'express';
import { getDb } from '@/server/db/config.js';
import { getAuth } from '@/lib/auth/auth.js';
import { db as drizzleDb } from '../../../db/client.js';
import { profiles, user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? '']));
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await drizzleDb.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const authorUser = await drizzleDb.query.user.findFirst({ where: eq(user.id, session.user.id) });
    const authorName = authorUser?.name ?? session.user.email ?? 'Unknown';

    const { noteId, body } = req.body as { noteId: number; body: string };
    if (!noteId || !body?.trim()) return res.status(400).json({ error: 'noteId and body required' });

    const rawDb = getDb();

    // Verify note belongs to same company
    const note = await rawDb.get<{ company_id: number }>(`SELECT company_id FROM entity_notes WHERE id=?`, [noteId]);
    if (!note || note.company_id !== profile.companyId) return res.status(404).json({ error: 'Note not found' });

    const result = await rawDb.run(
      `INSERT INTO note_comments (note_id, company_id, author_user_id, author_name, body) VALUES (?, ?, ?, ?, ?)`,
      [noteId, profile.companyId, session.user.id, authorName, body.trim()],
    );
    const commentId = (result as { lastID?: number }).lastID ?? 0;

    res.status(201).json({
      comment: {
        id: commentId, noteId, authorUserId: session.user.id, authorName,
        body: body.trim(), createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[POST /api/notes/comments]', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
}
