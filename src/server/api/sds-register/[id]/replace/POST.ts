/**
 * POST /api/sds-register/:id/replace
 * ─────────────────────────────────────────────────────────────────────────────
 * Replace the PDF for an existing SDS entry.
 * The previous entry is soft-archived (replaced_by_id set) — not silently overwritten.
 * A new row is inserted for the replacement file, preserving history.
 * Admin/owner only. Company-scoped.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import {
  checkStorageQuota,
  BUCKET_COMPANY_FILES,
  MAX_FILE_SIZE_BYTES,
} from '../../../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../../../lib/plan-limits.js';
import { uploadMedia } from '../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../lib/uploadService.js';
import type { ResultSetHeader } from 'mysql2';
import { randomUUID } from 'node:crypto';

const PDF_MIME = 'application/pdf';

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_FILE_SIZE_BYTES, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) {
    return res.status(400).json({ error: `File exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.` });
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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required to replace SDS documents' });

    const entryId = parseInt(req.params['id'] as string, 10);
    if (isNaN(entryId)) return res.status(400).json({ error: 'Invalid ID' });

    // Fetch the existing entry
    const [existingRows] = await db.execute(sql.raw(`
      SELECT * FROM sds_register WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>];
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'SDS entry not found' });

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (file.mimetype !== PDF_MIME) {
      return res.status(400).json({ error: 'Only PDF files are accepted for the SDS register' });
    }

    // Storage quota
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });

    const { title, notes } = parsed.fields as { title?: string; notes?: string; };
    const existingTitle = existing['title'] as string;
    const displayTitle = (title?.trim() || existingTitle).slice(0, 255);
    const storageKey = `sds/${randomUUID()}.pdf`;

    let newId = 0;

    await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: BUCKET_COMPANY_FILES,
      storageKey,
      destinationType: 'company_file',
      destinationId: null,
      label: displayTitle,
      clientId: null,
      imageOnly: false,
      insertCompatibilityRow: async (ctx: CompatibilityContext) => {
        const productName = existing['product_name'] as string | null;
        const manufacturer = existing['manufacturer'] as string | null;
        const existingNotes = existing['notes'] as string | null;
        const dbResult = await db.execute(sql.raw(`
          INSERT INTO sds_register
            (company_id, title, product_name, manufacturer, original_name, stored_name,
             mime_type, size_bytes, notes, uploaded_by_user_id)
          VALUES
            (${ctx.companyId},
             ${JSON.stringify(displayTitle)},
             ${productName ? JSON.stringify(productName) : 'NULL'},
             ${manufacturer ? JSON.stringify(manufacturer) : 'NULL'},
             ${JSON.stringify(ctx.originalName)},
             ${JSON.stringify(ctx.storageKey)},
             ${JSON.stringify(ctx.mimeType)},
             ${ctx.sizeBytes},
             ${notes?.trim() ? JSON.stringify(notes.trim()) : (existingNotes ? JSON.stringify(existingNotes) : 'NULL')},
             ${JSON.stringify(ctx.userId)})
        `));
        const header = (dbResult as unknown as [ResultSetHeader])[0];
        newId = header.insertId;
        return newId;
      },
    });

    // Mark the old entry as replaced — preserves history, never silently overwrites
    await db.execute(sql.raw(`
      UPDATE sds_register
      SET replaced_by_id = ${newId},
          replaced_at = NOW(),
          replaced_by_user_id = ${JSON.stringify(session.user.id)},
          archived_at = NOW()
      WHERE id = ${entryId} AND company_id = ${profile.companyId}
    `));

    const [rows] = await db.execute(sql.raw(`
      SELECT s.*, u.name AS uploaderName
      FROM sds_register s
      LEFT JOIN user u ON u.id = s.uploaded_by_user_id
      WHERE s.id = ${newId}
    `)) as unknown as [Array<Record<string, unknown>>];

    return res.status(201).json({ entry: rows[0] ?? null, replacedId: entryId });
  } catch (err) {
    console.error('POST /api/sds-register/:id/replace error:', err);
    return res.status(500).json({ error: 'Failed to replace SDS document' });
  }
}
