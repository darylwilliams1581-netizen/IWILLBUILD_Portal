/**
 * POST /api/incidents/:incidentId/attachments
 * Upload photos and/or PDFs attached to an incident report.
 * Accepts multipart/form-data with field name "files" (up to 20 files).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { saveFile, ALLOWED_MIMES } from '../../../../storage/storage-service.js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'incident-attachments';
const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB per file

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_FILE_BYTES, maxFiles: 20 });
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const incidentId = parseInt(req.params.incidentId, 10);
    if (isNaN(incidentId)) return res.status(400).json({ error: 'Invalid incident ID' });

    // Verify incident belongs to this company
    const [incident] = await db.execute(sql.raw(
      `SELECT id FROM incidents WHERE id = ${incidentId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as Array<{ id: number }>;
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const files = parsed.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // MIME reclassification for common types
    for (const f of files) {
      const ext = (f.originalname.split('.').pop() ?? '').toLowerCase();
      if (f.mimetype === 'application/octet-stream' || f.mimetype === '') {
        if (ext === 'heic' || ext === 'heif') f.mimetype = 'image/heic';
        else if (ext === 'jpg' || ext === 'jpeg') f.mimetype = 'image/jpeg';
        else if (ext === 'png') f.mimetype = 'image/png';
        else if (ext === 'webp') f.mimetype = 'image/webp';
        else if (ext === 'pdf') f.mimetype = 'application/pdf';
        else {
          const sig = f.buffer.slice(0, 5);
          if (sig[0] === 0xFF && sig[1] === 0xD8) f.mimetype = 'image/jpeg';
          else if (sig[0] === 0x89 && sig[1] === 0x50) f.mimetype = 'image/png';
          else if (sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46) f.mimetype = 'application/pdf';
        }
      }
    }

    const results = [];
    for (const file of files) {
      if (!ALLOWED_MIMES[file.mimetype]) {
        results.push({ error: `${file.originalname}: unsupported type` });
        continue;
      }

      const isImage = file.mimetype.startsWith('image/');
      const isPdf = file.mimetype === 'application/pdf';
      const fileType = isImage ? 'image' : isPdf ? 'pdf' : 'document';

      const storageKey = `${BUCKET}/${profile.companyId}/${incidentId}/${randomUUID()}`;
      const saved = await saveFile({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        bucket: BUCKET,
        storageKey,
      });

      await db.execute(sql.raw(`
        INSERT INTO incident_attachments
          (incident_id, company_id, file_type, original_name, storage_key, storage_provider, mime_type, size_bytes, public_url, uploaded_by)
        VALUES
          (${incidentId}, ${profile.companyId}, '${fileType}', ${JSON.stringify(file.originalname)}, ${JSON.stringify(saved.storageKey)}, ${JSON.stringify(saved.provider)}, ${JSON.stringify(file.mimetype)}, ${saved.sizeBytes}, ${JSON.stringify(saved.publicUrl)}, ${JSON.stringify(session.user.name ?? session.user.email ?? '')})
      `));

      const [row] = await db.execute(sql.raw(
        `SELECT id FROM incident_attachments WHERE storage_key = ${JSON.stringify(saved.storageKey)} LIMIT 1`
      )) as unknown as Array<{ id: number }>;

      results.push({
        id: row?.id,
        fileType,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: saved.sizeBytes,
        publicUrl: saved.publicUrl,
      });
    }

    return res.status(201).json({ attachments: results });
  } catch (e) {
    console.error('[incident-attachments POST]', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
