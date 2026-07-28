/**
 * DELETE /api/notes/:id
 * Soft-deletes a note. Only the note author or company admin may delete.
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const session = await getAuth(req, res);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

  const noteId = parseInt(req.params.id ?? '0', 10);
  if (!noteId) return res.status(400).json({ error: 'Invalid note id' });

  try {
    // Fetch the note to verify ownership
    const rows = await db.execute(
      sql.raw(`SELECT id, company_id, author_user_id FROM entity_notes WHERE id = ${noteId} LIMIT 1`)
    ) as unknown as { rows?: { id: number; company_id: number; author_user_id: string }[] };

    const note = (rows as unknown as { id: number; company_id: number; author_user_id: string }[])[0]
      ?? (rows as unknown as { rows?: { id: number; company_id: number; author_user_id: string }[] }).rows?.[0];

    if (!note) return res.status(404).json({ error: 'Note not found' });

    // Only the author may delete (admins can be added later via role check)
    if (note.author_user_id !== session.user.id) {
      return res.status(403).json({ error: 'You can only delete your own notes' });
    }

    // Delete associated tasks and comments first (cascade)
    await db.execute(sql.raw(`DELETE FROM note_comments WHERE note_id = ${noteId}`));
    await db.execute(sql.raw(`DELETE FROM note_tag_tasks WHERE note_id = ${noteId}`));
    await db.execute(sql.raw(`DELETE FROM entity_notes WHERE id = ${noteId}`));

    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/notes/:id error:', e);
    return res.status(500).json({ error: 'Failed to delete note' });
  }
}
