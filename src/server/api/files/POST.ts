/**
 * POST /api/files
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload a company file (PDF, Office doc, image, CSV, TXT, ZIP).
 * Uses canonical uploadService for media_assets + media_asset_links tracking.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { companyFiles, profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import {
  validateUpload,
  compressImageIfNeeded,
  checkStorageQuota,
  BUCKET_COMPANY_FILES,
  ALLOWED_IMAGE_MIMES,
  MAX_FILE_SIZE_BYTES,
} from '../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../lib/plan-limits.js';
import { uploadMedia } from '../../lib/uploadService.js';
import type { CompatibilityContext } from '../../lib/uploadService.js';
import type { ResultSetHeader } from 'mysql2';
import { randomUUID } from 'node:crypto';
import { extForMime } from '../../lib/file-upload.js';
import { buildObjectKey } from '../../storage/r2Config.js';

const FILE_CATEGORIES = ['Job','Fleet','Company','User','Template','Report','Other'] as const;

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

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Centralised validation
    const validation = validateUpload({ originalname: file.originalname, mimetype: file.mimetype, size: file.size });
    if (!validation.ok) return res.status(400).json({ code: validation.code, error: validation.error });

    // Plan limit: storage quota
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });

    // Compress images
    const isImage = !!ALLOWED_IMAGE_MIMES[file.mimetype];
    if (isImage) {
      try {
        const compressed = await compressImageIfNeeded(file.buffer, file.mimetype);
        file.buffer = compressed.buffer;
        file.mimetype = compressed.mimeType;
        file.size = compressed.buffer.length;
      } catch { /* non-fatal — use original */ }
    }

    const { jobId, fleetAssetId, fileCategory, label, notes } = parsed.fields as {
      jobId?: string; fleetAssetId?: string; fileCategory?: string; label?: string; notes?: string;
    };
    const cat = FILE_CATEGORIES.includes(fileCategory as typeof FILE_CATEGORIES[number])
      ? (fileCategory as string) : 'Other';
    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;
    const ext = extForMime(file.mimetype);
    const uuid = randomUUID();
    const storageKey = buildObjectKey({
      logicalNamespace: 'company-files',
      companyId: profile.companyId,
      category: 'company-files',
      uuid,
      originalName: file.originalname || `${uuid}.${ext}`,
    });

    let insertedId = 0;

    const result = await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: BUCKET_COMPANY_FILES,
      storageKey,
      destinationType: 'company_file',
      destinationId: jobId ? parseInt(jobId, 10) : null,
      label: label?.trim() || undefined,
      clientId,
      imageOnly: false,
      insertCompatibilityRow: async (ctx: CompatibilityContext) => {
        const dbResult = await db.insert(companyFiles).values({
          companyId: ctx.companyId,
          jobId: jobId ? parseInt(jobId, 10) : null,
          fleetAssetId: fleetAssetId ? parseInt(fleetAssetId, 10) : null,
          uploadedByUserId: ctx.userId,
          originalName: ctx.originalName,
          storedName: ctx.storageKey,
          mimeType: ctx.mimeType,
          sizeBytes: ctx.sizeBytes,
          fileCategory: cat,
          label: label?.trim() || null,
          notes: notes?.trim() || null,
        });
        const header = dbResult[0] as unknown as ResultSetHeader;
        insertedId = header.insertId;
        return insertedId;
      },
    });

    const record = await db.query.companyFiles.findFirst({ where: eq(companyFiles.id, result.destinationId ?? insertedId) });
    return res.status(201).json({ file: record });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status ?? 500;
    console.error('POST /api/files error:', err);
    return res.status(status).json({ error: msg || 'Failed to upload file' });
  }
}
