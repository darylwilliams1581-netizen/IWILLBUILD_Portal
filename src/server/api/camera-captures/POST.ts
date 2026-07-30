/**
 * POST /api/camera-captures
 * Upload one or more photos to the camera captures inbox (no job required).
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import {
  compressImageIfNeeded,
  saveFile,
  ALLOWED_IMAGE_MIMES,
} from '../../storage/storage-service.js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'camera-captures';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

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

    const files = parsed.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // MIME reclassification (same pattern as job photos)
    for (const f of files) {
      const ext = (f.originalname.split('.').pop() ?? '').toLowerCase();
      const noExt = !f.originalname.includes('.') || ext === f.originalname.toLowerCase();
      if (f.mimetype === 'application/octet-stream' || f.mimetype === '' || f.mimetype === 'application/unknown') {
        if (ext === 'heic' || ext === 'heif') f.mimetype = 'image/heic';
        else if (ext === 'jpg' || ext === 'jpeg') f.mimetype = 'image/jpeg';
        else if (ext === 'png') f.mimetype = 'image/png';
        else if (ext === 'webp') f.mimetype = 'image/webp';
        else if (noExt && f.buffer.length > 3) {
          const sig = f.buffer.slice(0, 12);
          if (sig[0] === 0xFF && sig[1] === 0xD8) f.mimetype = 'image/jpeg';
          else if (sig[0] === 0x89 && sig[1] === 0x50) f.mimetype = 'image/png';
          else if (sig[0] === 0x52 && sig[1] === 0x49) f.mimetype = 'image/webp';
          else f.mimetype = 'image/jpeg';
        }
      }
      if (f.mimetype === 'image/jpg') f.mimetype = 'image/jpeg';
      if (f.mimetype === 'image/heif') f.mimetype = 'image/heic';

      if (!ALLOWED_IMAGE_MIMES[f.mimetype]) {
        return res.status(400).json({
          error: `"${f.originalname}" is not a supported image type (${f.mimetype}).`,
        });
      }
    }

    const note = typeof parsed.fields?.note === 'string' ? parsed.fields.note.trim() || null : null;
    const capturedAt = typeof parsed.fields?.capturedAt === 'string'
      ? parsed.fields.capturedAt
      : new Date().toISOString();
    const jobIdRaw = typeof parsed.fields?.jobId === 'string' ? parseInt(parsed.fields.jobId, 10) : null;
    const jobId = jobIdRaw && !isNaN(jobIdRaw) ? jobIdRaw : null;
    const initialStatus = jobId ? 'assigned' : 'captured';

    const saved: Array<{ id: number; storageKey: string; url: string }> = [];

    for (const file of files) {
      let compressed: Buffer = file.buffer;
      let outMime: string = file.mimetype;
      try {
        const result = await compressImageIfNeeded(file.buffer, file.mimetype);
        compressed = result.buffer;
        outMime = result.mimeType;
      } catch {
        // use raw file on compress failure
      }

      const ext = outMime === 'image/png' ? 'png' : 'jpg';
      const storageKey = `${randomUUID()}.${ext}`;

      const result = await saveFile({
        buffer: compressed,
        originalName: file.originalname,
        mimeType: outMime,
        bucket: BUCKET,
        storageKey,
      });

      await db.execute(sql`
        INSERT INTO camera_captures
          (company_id, user_id, storage_key, mime_type, size_bytes, original_name, note, job_id, status, captured_at)
        VALUES
          (${profile.companyId}, ${session.user.id}, ${result.storageKey}, ${outMime},
           ${result.sizeBytes}, ${file.originalname}, ${note}, ${jobId}, ${initialStatus}, ${capturedAt})
      `);

      const [idRow] = await db.execute(sql`SELECT LAST_INSERT_ID() as id`) as unknown as [Array<{ id: number }>, unknown];
      const newId = idRow?.[0]?.id ?? 0;

      saved.push({ id: newId, storageKey: result.storageKey, url: result.publicUrl });
    }

    res.status(201).json({ captures: saved });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/camera-captures error:', msg);
    res.status(500).json({ error: msg });
  }
}
