import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { parseMultipartForm } from '../../../../../../lib/file-upload.js';
import path from 'path';
import fs from 'fs/promises';
import type { ResultSetHeader } from 'mysql2';

async function getJimp() {
  const { Jimp, JimpMime } = await import('jimp');
  return { Jimp, JimpMime };
}

const RECEIPT_MAX = 10 * 1024 * 1024;
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: RECEIPT_MAX, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  const file = parsed.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.heic' || ext === '.heif') return res.status(400).json({ error: 'HEIC/HEIF not supported' });
  if (!ALLOWED_EXTS.includes(ext)) return res.status(400).json({ error: 'Only images and PDFs are allowed' });

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

    const jobId = parseInt(String(req.params.id), 10);
    const costId = parseInt(String(req.params.costId), 10);
    if (isNaN(jobId) || isNaN(costId)) return res.status(400).json({ error: 'Invalid ID' });

    const [costRows] = await db.execute(sql`
      SELECT id FROM job_costs WHERE id = ${costId} AND job_id = ${jobId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!costRows?.length) return res.status(404).json({ error: 'Cost not found' });

    const isPdf = ext === '.pdf';
    const storedName = `receipt_${costId}_${Date.now()}${ext}`;
    const uploadDir = `/shared-storage/public/assets/uploads/receipts`;
    await fs.mkdir(uploadDir, { recursive: true });

    let buffer = file.buffer;

    if (!isPdf) {
      try {
        const { Jimp, JimpMime } = await getJimp();
        const img = await Jimp.read(buffer);
        if (img.width > 1600) img.resize({ w: 1600 });
        buffer = await img.getBuffer(JimpMime.jpeg, { quality: 82 });
      } catch {
        // fall through with original buffer
      }
    }

    await fs.writeFile(`${uploadDir}/${storedName}`, buffer);

    const [fileResult] = await db.execute(sql`
      INSERT INTO job_files (company_id, job_id, folder, original_name, stored_name, mime_type, size_bytes, uploaded_by_user_id)
      VALUES (
        ${profile.companyId}, ${jobId}, 'Receipts',
        ${file.originalname}, ${storedName},
        ${isPdf ? 'application/pdf' : 'image/jpeg'},
        ${buffer.length}, ${session.user.id}
      )
    `) as unknown as [ResultSetHeader, unknown];

    await db.execute(sql`
      UPDATE job_costs SET receipt_file_id = ${fileResult.insertId}, updated_at = NOW()
      WHERE id = ${costId}
    `);

    res.status(201).json({
      ok: true,
      fileId: fileResult.insertId,
      url: `/airo-assets/uploads/receipts/${storedName}`,
      originalName: file.originalname,
    });
  } catch (e) {
    console.error('POST receipt error:', e);
    res.status(500).json({ error: 'Failed to upload receipt' });
  }
}
