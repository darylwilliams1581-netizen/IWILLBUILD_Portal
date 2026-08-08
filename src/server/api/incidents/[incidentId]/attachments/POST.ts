/**
 * POST /api/incidents/:incidentId/attachments
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload photos and/or PDFs attached to an incident report.
 * Uses canonical uploadService for media_assets + media_asset_links tracking.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { uploadMedia, normaliseMime } from '../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'incident-attachments';
const MAX_FILE_BYTES = 30 * 1024 * 1024;

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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const incidentId = parseInt(req.params.incidentId, 10);
    if (isNaN(incidentId)) return res.status(400).json({ error: 'Invalid incident ID' });

    // Verify incident belongs to this company
    const incidentResult = await db.execute(
      sql`SELECT id FROM incidents WHERE id = ${incidentId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!incidentResult[0]?.length) return res.status(404).json({ error: 'Incident not found' });

    const files = parsed.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      normaliseMime(file);

      const isImage = file.mimetype.startsWith('image/');
      const isPdf   = file.mimetype === 'application/pdf';
      const fileType = isImage ? 'image' : isPdf ? 'pdf' : 'document';
      const storageKey = `${BUCKET}/${profile.companyId}/${incidentId}/${randomUUID()}`;

      try {
        const result = await uploadMedia({
          file,
          companyId: profile.companyId,
          userId: session.user.id,
          bucket: BUCKET,
          storageKey,
          destinationType: 'incident_attachment',
          destinationId: incidentId,
          clientId: i === 0 ? clientId : null,
          imageOnly: false,
          insertCompatibilityRow: async (ctx: CompatibilityContext) => {
            await db.execute(sql.raw(`
              INSERT INTO incident_attachments
                (incident_id, company_id, file_type, original_name, storage_key, storage_provider, mime_type, size_bytes, public_url, uploaded_by)
              VALUES
                (${incidentId}, ${ctx.companyId}, '${fileType}', ${JSON.stringify(ctx.originalName)}, ${JSON.stringify(ctx.storageKey)}, 'r2', ${JSON.stringify(ctx.mimeType)}, ${ctx.sizeBytes}, ${JSON.stringify(ctx.publicUrl)}, ${JSON.stringify(session.user.name ?? session.user.email ?? '')})
            `));
            const [row] = await db.execute(
              sql`SELECT id FROM incident_attachments WHERE storage_key = ${ctx.storageKey} LIMIT 1`
            ) as unknown as [Array<{ id: number }>, unknown];
            return row?.[0]?.id ?? null;
          },
        });

        results.push({
          id: result.destinationId,
          fileType,
          originalName: result.originalName,
          mimeType: result.mimeType,
          sizeBytes: result.sizeBytes,
          publicUrl: result.url,
        });
      } catch (fileErr) {
        const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
        console.warn(`[incident-attachments POST] file "${file.originalname}" failed: ${msg}`);
        results.push({ error: `${file.originalname}: ${msg}` });
      }
    }

    return res.status(201).json({ attachments: results });
  } catch (e) {
    console.error('[incident-attachments POST]', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
