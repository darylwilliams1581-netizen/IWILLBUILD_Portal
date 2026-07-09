/**
 * POST /api/asset-manager/tenders/:id/attachments
 * Upload a file attachment to a tender cycle.
 * Accepts multipart/form-data with field name "file".
 * Stores the file in /shared-storage/public/assets/tender-attachments/
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import {
  parseMultipartForm,
  isBlockedExtension,
  ALLOWED_MIMES,
  MAX_FILE_SIZE,
  formatBytes,
} from '../../../../../lib/file-upload.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOAD_DIR = '/shared-storage/public/assets/tender-attachments';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;

  const tenderId = parseInt(String(req.params.id), 10);
  if (isNaN(tenderId)) return res.status(400).json({ error: 'Invalid tender id' });

  // Verify tender belongs to this company
  const [rows] = await db.execute(sql`
    SELECT id FROM am_tender_cycles WHERE id = ${tenderId} AND company_id = ${profile.companyId}
  `) as unknown as [unknown[], unknown];
  if (!(rows as unknown[]).length) return res.status(404).json({ error: 'Tender not found' });

  // Parse multipart
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_FILE_SIZE, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: String(err) });
  }

  if (parsed.limitError) return res.status(413).json({ error: parsed.limitError });
  if (!parsed.file) return res.status(400).json({ error: 'No file provided' });

  const { originalname, mimetype, buffer } = parsed.file;

  // Validate
  if (isBlockedExtension(originalname)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }
  if (!ALLOWED_MIMES[mimetype]) {
    return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
  }

  // Build stored filename
  const ext = extname(originalname).toLowerCase() || `.${ALLOWED_MIMES[mimetype] ?? 'bin'}`;
  const storedName = `${randomUUID()}${ext}`;
  const filePath = join(UPLOAD_DIR, storedName);

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(filePath, buffer);
  } catch (err) {
    console.error('tender attachment write error:', err);
    return res.status(500).json({ error: 'Failed to save file' });
  }

  // Insert DB record
  await db.execute(sql`
    INSERT INTO tender_attachments
      (tender_id, company_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
    VALUES
      (${tenderId}, ${profile.companyId}, ${originalname}, ${storedName}, ${mimetype}, ${buffer.length}, ${session.user.id})
  `);

  const [newRows] = await db.execute(sql`
    SELECT * FROM tender_attachments
    WHERE tender_id = ${tenderId} AND stored_name = ${storedName}
    ORDER BY id DESC LIMIT 1
  `) as unknown as [unknown[], unknown];

  return res.status(201).json({
    attachment: (newRows as Record<string, unknown>[])[0],
    url: `/airo-assets/uploads/tender-attachments/${storedName}`,
    sizeLabel: formatBytes(buffer.length),
  });
}
