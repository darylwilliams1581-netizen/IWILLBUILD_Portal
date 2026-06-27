import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileUploadMiddleware, extForMime, isHeic, isBlockedExtension, ALLOWED_MIMES } from '../../../lib/file-upload.js';
import type { ResultSetHeader } from 'mysql2';

const POSTERS_DIR = '/shared-storage/public/assets/safety-posters';

export default async function handler(req: Request, res: Response) {
  let multerError: unknown = null;
  await new Promise<void>((resolve) => {
    fileUploadMiddleware(req, res, (err: unknown) => {
      if (err) multerError = err;
      resolve();
    });
  });

  if (multerError) {
    const msg = multerError instanceof Error ? multerError.message : String(multerError);
    return res.status(400).json({ error: msg });
  }

  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    if (isHeic(file.originalname)) return res.status(400).json({ error: 'HEIC/HEIF not supported.' });
    if (isBlockedExtension(file.originalname)) return res.status(400).json({ error: 'File type not allowed.' });
    if (!ALLOWED_MIMES[file.mimetype]) return res.status(400).json({ error: 'File type not supported.' });

    const { title, posterType, notes } = req.body as Record<string, string>;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const ext = extForMime(file.mimetype);
    const storedName = `${randomUUID()}.${ext}`;
    const filePath = join(POSTERS_DIR, storedName);
    await mkdir(POSTERS_DIR, { recursive: true });
    await writeFile(filePath, file.buffer);

    const [result] = await db.execute(sql`
      INSERT INTO safety_posters
        (company_id, title, poster_type, original_name, stored_name, mime_type,
         size_bytes, notes, uploaded_by_user_id)
      VALUES
        (${profile.companyId}, ${title.trim()}, ${posterType ?? 'general'},
         ${file.originalname}, ${storedName}, ${file.mimetype},
         ${file.size}, ${notes ?? null}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM safety_posters WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ poster: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/posters error:', err);
    res.status(500).json({ error: 'Failed to upload poster' });
  }
}
