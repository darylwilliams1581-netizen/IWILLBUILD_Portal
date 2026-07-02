/**
 * POST /api/files
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload a company file (PDF, Office doc, image, CSV, TXT, ZIP).
 * Uses the central storage service — swap providers in storage-service.ts.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { companyFiles, profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import {
  validateUpload,
  saveFile,
  compressImageIfNeeded,
  checkStorageQuota,
  BUCKET_COMPANY_FILES,
  ALLOWED_IMAGE_MIMES,
  MAX_FILE_SIZE_BYTES,
} from '../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../lib/plan-limits.js';
import type { ResultSetHeader } from 'mysql2';

const FILE_CATEGORIES = ['Job','Fleet','Company','User','Template','Report','Other'] as const;

export default async function handler(req: Request, res: Response) {
  // Parse multipart
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_FILE_SIZE_BYTES, maxFiles: 1 });
  } catch (err) {
    console.error('POST /api/files — multipart parse error:', err);
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

    // ── Centralised validation ────────────────────────────────────────────────
    const validation = validateUpload({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
    if (!validation.ok) {
      return res.status(400).json({ code: validation.code, error: validation.error });
    }

    // ── Plan limit: storage quota ─────────────────────────────────────────────
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) {
      return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });
    }

    // ── Compress images ───────────────────────────────────────────────────────
    const isImage = !!ALLOWED_IMAGE_MIMES[file.mimetype];
    let { buffer, mimeType } = isImage
      ? await compressImageIfNeeded(file.buffer, file.mimetype)
      : { buffer: file.buffer, mimeType: file.mimetype };

    // ── Save via storage service ──────────────────────────────────────────────
    let saved;
    try {
      saved = await saveFile({
        buffer,
        originalName: file.originalname,
        mimeType,
        bucket: BUCKET_COMPANY_FILES,
      });
    } catch (storageErr) {
      console.error('POST /api/files storage error:', storageErr);
      return res.status(503).json({ error: 'File storage is temporarily unavailable. Please try again in a minute.' });
    }

    // ── Parse request body ────────────────────────────────────────────────────
    const { jobId, fleetAssetId, fileCategory, label, notes } = parsed.fields as {
      jobId?: string;
      fleetAssetId?: string;
      fileCategory?: string;
      label?: string;
      notes?: string;
    };

    const cat = FILE_CATEGORIES.includes(fileCategory as typeof FILE_CATEGORIES[number])
      ? (fileCategory as string)
      : 'Other';

    // ── Insert DB record ──────────────────────────────────────────────────────
    const result = await db.insert(companyFiles).values({
      companyId: profile.companyId,
      jobId: jobId ? parseInt(jobId, 10) : null,
      fleetAssetId: fleetAssetId ? parseInt(fleetAssetId, 10) : null,
      uploadedByUserId: session.user.id,
      originalName: file.originalname,
      storedName: saved.storageKey,
      mimeType,
      sizeBytes: saved.sizeBytes,
      fileCategory: cat,
      label: label?.trim() || null,
      notes: notes?.trim() || null,
    });
    const header = result[0] as unknown as ResultSetHeader;

    const record = await db.query.companyFiles.findFirst({ where: eq(companyFiles.id, header.insertId) });
    res.status(201).json({ file: record });

  } catch (err) {
    console.error('POST /api/files error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}
