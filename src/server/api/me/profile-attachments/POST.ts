/**
 * POST /api/me/profile-attachments
 * Uploads a file attachment for the user's profile (max 5 total, 10 MB each).
 * Stores to /shared-storage/public/assets/profile-attachments/{userId}/
 * Returns the updated attachments list.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import fs from 'fs/promises';
import path from 'path';

const MAX_ATTACHMENTS = 5;
const MAX_SIZE_BYTES  = 10 * 1024 * 1024; // 10 MB

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

    // Read existing attachments
    const [rows] = await db.execute(
      sql`SELECT profile_attachments FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ profile_attachments?: string }>, unknown];
    let attachments: Attachment[] = [];
    try {
      const raw = rows?.[0]?.profile_attachments;
      if (raw) attachments = JSON.parse(raw) as Attachment[];
    } catch { /* ignore */ }

    if (attachments.length >= MAX_ATTACHMENTS) {
      return res.status(400).json({ error: `Maximum ${MAX_ATTACHMENTS} attachments allowed. Remove one before adding another.` });
    }

    // Parse multipart body — express doesn't parse multipart by default; read raw body
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    // Use busboy for multipart parsing
    const { default: Busboy } = await import('busboy');
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE_BYTES, files: 1 } });

    let savedAttachment: Attachment | null = null;
    let fileTooLarge = false;

    await new Promise<void>((resolve, reject) => {
      bb.on('file', async (_field, file, info) => {
        const { filename } = info;
        const safeFilename = filename.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dir = `/shared-storage/public/assets/profile-attachments/${session.user.id}`;
        const filePath = path.join(dir, `${id}-${safeFilename}`);

        const chunks: Buffer[] = [];
        file.on('data', (chunk: Buffer) => chunks.push(chunk));
        file.on('limit', () => { fileTooLarge = true; });
        file.on('end', async () => {
          if (fileTooLarge) { resolve(); return; }
          try {
            await fs.mkdir(dir, { recursive: true });
            const buf = Buffer.concat(chunks);
            await fs.writeFile(filePath, buf);
            savedAttachment = {
              id,
              filename: safeFilename,
              url: `/airo-assets/uploads/profile-attachments/${session.user.id}/${id}-${safeFilename}`,
              size: buf.length,
              uploadedAt: new Date().toISOString(),
            };
          } catch (e) { reject(e); }
          resolve();
        });
      });
      bb.on('error', reject);
      bb.on('finish', resolve);
      req.pipe(bb);
    });

    if (fileTooLarge) {
      return res.status(400).json({ error: `File exceeds the 10 MB limit.` });
    }
    if (!savedAttachment) {
      return res.status(400).json({ error: 'No file received.' });
    }

    attachments.push(savedAttachment);
    await db.execute(sql`
      UPDATE profiles SET profile_attachments = ${JSON.stringify(attachments)}
      WHERE user_id = ${session.user.id}
    `);

    return res.json({ ok: true, attachments });
  } catch (err) {
    console.error('POST /api/me/profile-attachments error:', err);
    return res.status(500).json({ error: 'Failed to upload attachment' });
  }
}
