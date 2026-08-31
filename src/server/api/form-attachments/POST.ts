/**
 * POST /api/form-attachments
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload a file attachment for a form field submission.
 *
 * Body (multipart/form-data):
 *   file          — the file
 *   submissionId  — form submission ID (optional, can be set later)
 *   fieldKey      — form field key
 *   jobId         — associated job ID (optional)
 *   assetId       — associated asset ID (optional)
 *
 * Returns:
 *   { mediaAssetId, linkId, url, originalName, mimeType, sizeBytes }
 *
 * Uses media_asset_links with:
 *   destination_type = 'form_attachment'
 *   destination_id   = submissionId (or null)
 *   field_key        = fieldKey
 *
 * Form field values should store mediaAssetId or the stable url, not
 * temporary camera-capture URLs.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import { uploadMedia, normaliseMime } from '../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../storage/r2Config.js';

const BUCKET       = 'form-attachments';
const MAX_BYTES    = 30 * 1024 * 1024; // 30 MB
const MAX_FILES    = 5;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_BYTES, maxFiles: MAX_FILES });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });
  if (!parsed.files.length) return res.status(400).json({ error: 'No file uploaded' });

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

    const { submissionId, fieldKey, jobId } = parsed.fields as {
      submissionId?: string; fieldKey?: string; jobId?: string;
    };
    const destId = submissionId ? parseInt(submissionId, 10) : null;
    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;

    const results = [];

    for (let i = 0; i < parsed.files.length; i++) {
      const file = parsed.files[i];
      normaliseMime(file);

      const ext = file.originalname.includes('.') ? (file.originalname.split('.').pop() ?? 'bin') : 'bin';
      const storageKey = buildObjectKey({
        logicalNamespace: 'form-attachments',
        companyId: profile.companyId,
        category: 'form-attachments',
        uuid: randomUUID(),
        originalName: file.originalname,
      });

      const result = await uploadMedia({
        file,
        companyId: profile.companyId,
        userId: session.user.id,
        bucket: BUCKET,
        storageKey,
        destinationType: 'form_attachment',
        destinationId: destId,
        fieldKey: fieldKey ?? undefined,
        clientId: i === 0 ? clientId : null,
        imageOnly: false,
      });

      results.push({
        mediaAssetId: result.mediaAssetId,
        linkId: result.linkId,
        url: result.url,
        originalName: result.originalName,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        fieldKey: fieldKey ?? null,
        jobId: jobId ? parseInt(jobId, 10) : null,
      });
    }

    return res.status(201).json({ attachments: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status ?? 500;
    console.error('POST /api/form-attachments error:', err);
    return res.status(status).json({ error: msg || 'Failed to upload' });
  }
}
