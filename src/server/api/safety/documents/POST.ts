import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseMultipartForm, extForMime, isHeic, isBlockedExtension, ALLOWED_MIMES, MAX_FILE_SIZE } from '../../../lib/file-upload.js';
import type { ResultSetHeader } from 'mysql2';

const SAFETY_DIR = '/shared-storage/public/assets/safety-docs';

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_FILE_SIZE, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

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

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    if (isHeic(file.originalname)) return res.status(400).json({ error: 'HEIC/HEIF not supported.' });
    if (isBlockedExtension(file.originalname)) return res.status(400).json({ error: 'File type not allowed.' });
    if (!ALLOWED_MIMES[file.mimetype]) return res.status(400).json({ error: 'File type not supported.' });

    const { title, docType, reviewDate, notes } = parsed.fields as Record<string, string>;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const ext = extForMime(file.mimetype);
    const storedName = `${randomUUID()}.${ext}`;
    const filePath = join(SAFETY_DIR, storedName);
    await mkdir(SAFETY_DIR, { recursive: true });
    await writeFile(filePath, file.buffer);

    const [result] = await db.execute(sql`
      INSERT INTO safety_documents
        (company_id, title, doc_type, original_name, stored_name, mime_type,
         size_bytes, review_date, notes, uploaded_by_user_id)
      VALUES
        (${profile.companyId}, ${title.trim()}, ${docType ?? 'policy'},
         ${file.originalname}, ${storedName}, ${file.mimetype},
         ${file.size}, ${reviewDate ?? null}, ${notes ?? null}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM safety_documents WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ document: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/documents error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
}
