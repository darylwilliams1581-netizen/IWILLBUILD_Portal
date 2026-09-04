/**
 * POST /api/sds-register
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload a new SDS/MSDS PDF.
 * Admin/office users only. PDF files only. Max size from storage-service.
 * Uses the existing uploadService + company-files bucket.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import {
  checkStorageQuota,
  BUCKET_COMPANY_FILES,
  MAX_FILE_SIZE_BYTES,
} from '../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../lib/plan-limits.js';
import { uploadMedia } from '../../lib/uploadService.js';
import type { CompatibilityContext } from '../../lib/uploadService.js';
import type { ResultSetHeader } from 'mysql2';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../storage/r2Config.js';

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

    // Permission: admin/owner only
    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required to upload SDS documents' });

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // PDF only
    if (file.mimetype !== PDF_MIME) {
      return res.status(400).json({ error: 'Only PDF files are accepted for the SDS register' });
    }

    // Storage quota
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });

    const { title, productName, manufacturer, notes } = parsed.fields as {
      title?: string; productName?: string; manufacturer?: string; notes?: string;
    };

    const displayTitle = (title?.trim() || file.originalname.replace(/\.pdf$/i, '')).slice(0, 255);
    const storageKey = buildObjectKey({
      logicalNamespace: 'company-files',
      companyId: profile.companyId,
      category: 'sds-register',
      uuid: randomUUID(),
      originalName: file.originalname || 'sds.pdf',
    });

    let insertedId = 0;

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
        const dbResult = await db.execute(sql.raw(`
          INSERT INTO sds_register
            (company_id, title, product_name, manufacturer, original_name, stored_name,
             mime_type, size_bytes, notes, uploaded_by_user_id)
          VALUES
            (${ctx.companyId},
             ${JSON.stringify(displayTitle)},
             ${productName?.trim() ? JSON.stringify(productName.trim()) : 'NULL'},
             ${manufacturer?.trim() ? JSON.stringify(manufacturer.trim()) : 'NULL'},
             ${JSON.stringify(ctx.originalName)},
             ${JSON.stringify(ctx.storageKey)},
             ${JSON.stringify(ctx.mimeType)},
             ${ctx.sizeBytes},
             ${notes?.trim() ? JSON.stringify(notes.trim()) : 'NULL'},
             ${JSON.stringify(ctx.userId)})
        `));
        const header = (dbResult as unknown as [ResultSetHeader])[0];
        insertedId = header.insertId;
        return insertedId;
      },
    });

    const [rows] = await db.execute(sql.raw(`
      SELECT s.*, u.name AS uploaderName
      FROM sds_register s
      LEFT JOIN user u ON u.id = s.uploaded_by_user_id
      WHERE s.id = ${insertedId}
    `)) as unknown as [Array<Record<string, unknown>>];

    return res.status(201).json({ entry: rows[0] ?? null });
  } catch (err) {
    console.error('POST /api/sds-register error:', err);
    return res.status(500).json({ error: 'Failed to upload SDS document' });
  }
}
