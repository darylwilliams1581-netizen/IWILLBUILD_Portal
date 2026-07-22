/**
 * DELETE /api/me/profile-attachments/:attachmentId
 * Removes a profile attachment by ID.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import fs from 'fs/promises';
import path from 'path';

interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

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
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const attachmentId = req.params.attachmentId;

    const [rows] = await db.execute(
      sql`SELECT profile_attachments FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ profile_attachments?: string }>, unknown];
    let attachments: Attachment[] = [];
    try {
      const raw = rows?.[0]?.profile_attachments;
      if (raw) attachments = JSON.parse(raw) as Attachment[];
    } catch { /* ignore */ }

    const target = attachments.find((a) => a.id === attachmentId);
    if (!target) return res.status(404).json({ error: 'Attachment not found' });

    // Delete file from disk
    try {
      const dir = `/shared-storage/public/assets/profile-attachments/${session.user.id}`;
      const filePath = path.join(dir, `${target.id}-${target.filename}`);
      await fs.unlink(filePath);
    } catch { /* ignore if already gone */ }

    const updated = attachments.filter((a) => a.id !== attachmentId);
    await db.execute(sql`
      UPDATE profiles SET profile_attachments = ${JSON.stringify(updated)}
      WHERE user_id = ${session.user.id}
    `);

    return res.json({ ok: true, attachments: updated });
  } catch (err) {
    console.error('DELETE /api/me/profile-attachments error:', err);
    return res.status(500).json({ error: 'Failed to delete attachment' });
  }
}
