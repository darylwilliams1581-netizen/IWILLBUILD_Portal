/**
 * POST /api/plan-manager/drawings/:id/upload
 * Upload a PDF file for a drawing. Stores to /shared-storage/public/assets/drawings/.
 * Uses multipart/form-data with field "file".
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { parseMultipartForm } from '../../../../../lib/file-upload.js';

const UPLOAD_DIR = '/shared-storage/public/assets/drawings';
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB for large drawing sets

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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify drawing belongs to company
    const [drawingRows] = await db.execute(sql`
      SELECT id, title FROM project_drawings
      WHERE id = ${id} AND company_id = ${profile.companyId} AND status != 'deleted'
      LIMIT 1
    `) as unknown as [Array<{ id: number; title: string }>];
    if (!drawingRows?.length) return res.status(404).json({ error: 'Drawing not found' });

    const parsed = await parseMultipartForm(req, { maxFileSize: MAX_PDF_SIZE, fileField: 'file' });
    if (parsed.limitError) return res.status(413).json({ error: parsed.limitError });

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'pdf' && file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const safeName = `drawing-${id}-${crypto.randomBytes(8).toString('hex')}.pdf`;
    const filePath = path.join(UPLOAD_DIR, safeName);
    await fs.writeFile(filePath, file.buffer);

    const publicUrl = `/airo-assets/uploads/drawings/${safeName}`;

    // Detect page count from the PDF buffer
    let pageCount = 1;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
    } catch {
      // If pdf-lib can't parse it, fall back to a quick regex scan of the raw bytes
      try {
        const text = file.buffer.toString('latin1');
        const match = text.match(/\/N\s+(\d+)|\/Count\s+(\d+)/);
        if (match) pageCount = parseInt(match[1] ?? match[2] ?? '1', 10) || 1;
      } catch { /* keep pageCount = 1 */ }
    }

    await db.execute(sql`
      UPDATE project_drawings
      SET source_file_path = ${publicUrl}, source_file_name = ${file.originalname},
          page_count = ${pageCount}, updated_at = NOW()
      WHERE id = ${id}
    `);

    await db.execute(sql`
      INSERT INTO drawing_audit_log (drawing_id, actor_id, action, details_json)
      VALUES (${id}, ${session.user.id}, 'pdf_uploaded',
              ${JSON.stringify({ fileName: file.originalname, url: publicUrl, sizeBytes: file.size })})
    `);

    res.json({ url: publicUrl, fileName: file.originalname, sizeBytes: file.size, pageCount });
  } catch (err) {
    console.error('POST /api/plan-manager/drawings/:id/upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}
