/**
 * POST /api/electrical-tests/:id/photos
 * Upload a photo for a test record (joint/asset photo or instrument display photo).
 * Stores via uploadMedia → R2/local. Retains original timestamp and uploader identity.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm, extForMime } from '../../../../lib/file-upload.js';
import {
  checkStorageQuota, BUCKET_COMPANY_FILES, MAX_FILE_SIZE_BYTES,
  ALLOWED_IMAGE_MIMES, compressImageIfNeeded,
} from '../../../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../../../lib/plan-limits.js';
import { uploadMedia } from '../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../lib/uploadService.js';
import type { ResultSetHeader } from 'mysql2';
import { createPendingSafeguardRecord } from '../../../../lib/imageSafeguardService.js';
import { buildObjectKey } from '../../../../storage/r2Config.js';
import { randomUUID } from 'node:crypto';

const VALID_PHOTO_TYPES = ['joint_asset', 'instrument_display', 'additional'] as const;

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

    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    // Verify record belongs to company
    const [rows] = await db.execute(sql.raw(
      `SELECT id FROM electrical_test_records WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>];
    if (!rows?.length) return res.status(404).json({ error: 'Record not found' });

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    if (!ALLOWED_IMAGE_MIMES[file.mimetype]) {
      return res.status(400).json({ error: 'Only image files are accepted for test photos' });
    }

    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });

    // Compress
    try {
      const compressed = await compressImageIfNeeded(file.buffer, file.mimetype);
      file.buffer = compressed.buffer;
      file.mimetype = compressed.mimeType;
      file.size = compressed.buffer.length;
    } catch { /* non-fatal */ }

    const { photoType, caption } = parsed.fields as { photoType?: string; caption?: string };
    const pt = VALID_PHOTO_TYPES.includes(photoType as typeof VALID_PHOTO_TYPES[number])
      ? (photoType as string) : 'additional';

    const ext = extForMime(file.mimetype);
    const storageKey = buildObjectKey({
      logicalNamespace: 'company-files',
      companyId: profile.companyId,
      category: 'electrical-tests',
      uuid: randomUUID(),
      originalName: file.originalname || `photo.${ext}`,
    });
    const uploaderName = profile.firstName && profile.lastName
      ? `${profile.firstName} ${profile.lastName}` : session.user.email ?? '';

    let insertedId = 0;

    await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: BUCKET_COMPANY_FILES,
      storageKey,
      destinationType: 'company_file',
      destinationId: id,
      label: caption?.trim() || pt,
      clientId: null,
      imageOnly: true,
      insertCompatibilityRow: async (ctx: CompatibilityContext) => {
        const [dbResult] = await db.execute(sql.raw(`
          INSERT INTO electrical_test_photos
            (test_record_id, company_id, photo_type, caption, storage_key, original_name,
             mime_type, size_bytes, uploaded_by_user_id, uploaded_by_name, uploaded_at, created_at)
          VALUES (
            ${id}, ${profile.companyId},
            ${JSON.stringify(pt)},
            ${caption?.trim() ? JSON.stringify(caption.trim()) : 'NULL'},
            ${JSON.stringify(ctx.storageKey)},
            ${JSON.stringify(ctx.originalName)},
            ${JSON.stringify(ctx.mimeType)},
            ${ctx.sizeBytes},
            ${JSON.stringify(ctx.userId)},
            ${JSON.stringify(uploaderName)},
            NOW(), NOW()
          )
        `)) as unknown as [ResultSetHeader];
        insertedId = (dbResult as unknown as ResultSetHeader).insertId;
        return insertedId;
      },
    });

    // Audit
    await db.execute(sql.raw(`
      INSERT INTO electrical_test_audit
        (test_record_id, company_id, event_type, event_note, user_id, user_name, created_at)
      VALUES (${id}, ${profile.companyId}, 'photo_added', ${JSON.stringify(`${pt} photo uploaded`)}, ${JSON.stringify(session.user.id)}, ${JSON.stringify(uploaderName)}, NOW())
    `));

    // CP12A: Create pending Image Safeguard record (non-blocking, best-effort)
    void createPendingSafeguardRecord({
      companyId: profile.companyId,
      userId: session.user.id,
      storageRef: `electrical_test_photo:${insertedId ?? result.storageKey}`,
      surface: 'electrical_test_photo',
    }).catch(() => { /* safeguard record failure must not affect upload */ });

    return res.status(201).json({ id: insertedId, photoType: pt });
  } catch (err) {
    console.error('POST /api/electrical-tests/:id/photos error:', err);
    return res.status(500).json({ error: 'Failed to upload photo' });
  }
}
