import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { companyFiles, profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../lib/file-upload.js';
import { saveFile, checkStorageQuota, BUCKET_COMPANY_FILES } from '../../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../../lib/plan-limits.js';
import type { ResultSetHeader } from 'mysql2';

const DRAWING_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_DRAWING_MIMES: Record<string, boolean> = {
  'application/pdf': true,
};

const ALLOWED_DRAWING_EXTS = ['.pdf'];

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: DRAWING_MAX_BYTES, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: 'Drawing file exceeds the 50 MB limit.' });

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

    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
    if (!ALLOWED_DRAWING_EXTS.includes(ext)) {
      return res.status(400).json({ error: `Unsupported file type "${ext}". Allowed: PDF, DWG, DXF.` });
    }

    const mimeOk = ALLOWED_DRAWING_MIMES[file.mimetype] ?? false;
    if (!mimeOk) {
      return res.status(400).json({ error: `Unsupported MIME type "${file.mimetype}".` });
    }

    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) {
      return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });
    }

    const saved = await saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      bucket: BUCKET_COMPANY_FILES,
    });

    const { jobId } = parsed.fields as { jobId?: string };

    const result = await db.insert(companyFiles).values({
      companyId: profile.companyId,
      jobId: jobId ? parseInt(jobId, 10) : null,
      uploadedByUserId: session.user.id,
      originalName: file.originalname,
      storedName: saved.storageKey,
      mimeType: file.mimetype,
      sizeBytes: saved.sizeBytes,
      fileCategory: 'Job',
      label: `Drawing: ${file.originalname}`,
      notes: null,
    });

    const header = result[0] as unknown as ResultSetHeader;
    const record = await db.query.companyFiles.findFirst({ where: eq(companyFiles.id, header.insertId) });

    res.status(201).json({ file: record, isPdf: true, isDwg: false });
  } catch (err) {
    console.error('POST /api/drawings/upload error:', err);
    res.status(500).json({ error: 'Failed to upload drawing' });
  }
}
