/**
 * POST /api/drawings/upload
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload a drawing file (PDF or DWG) and store it via the central storage service.
 * Returns the company_files record so the client can then POST /api/drawings
 * to register it in the drawing register.
 *
 * Accepts: application/pdf, application/acad, .dwg, .dxf
 * Max size: 50 MB (drawings can be large)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { companyFiles, profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import multer from 'multer';
import { saveFile, checkStorageQuota, BUCKET_COMPANY_FILES } from '../../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../../lib/plan-limits.js';
import type { ResultSetHeader } from 'mysql2';

const DRAWING_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// Allowed MIME types for drawings
const ALLOWED_DRAWING_MIMES: Record<string, boolean> = {
  'application/pdf': true,
  // DWG / DXF — browsers may send various MIME types for these
  'application/acad': true,
  'application/x-acad': true,
  'application/autocad_dwg': true,
  'image/vnd.dwg': true,
  'image/x-dwg': true,
  'application/dwg': true,
  'application/dxf': true,
  'application/x-dxf': true,
  'application/octet-stream': true, // fallback — validated by extension below
};

const ALLOWED_DRAWING_EXTS = ['.pdf', '.dwg', '.dxf'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DRAWING_MAX_BYTES, files: 1 },
}).single('file');

export default async function handler(req: Request, res: Response) {
  let multerError: unknown = null;
  await new Promise<void>((resolve) => {
    upload(req, res, (err: unknown) => { if (err) multerError = err; resolve(); });
  });

  if (multerError) {
    const msg = multerError instanceof Error ? multerError.message : String(multerError);
    if (msg.includes('File too large') || msg.includes('LIMIT_FILE_SIZE')) {
      return res.status(400).json({ error: 'Drawing file exceeds the 50 MB limit.' });
    }
    return res.status(400).json({ error: msg });
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

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Validate extension
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
    if (!ALLOWED_DRAWING_EXTS.includes(ext)) {
      return res.status(400).json({ error: `Unsupported file type "${ext}". Allowed: PDF, DWG, DXF.` });
    }

    // Validate MIME (allow octet-stream for DWG/DXF)
    const mimeOk = ALLOWED_DRAWING_MIMES[file.mimetype] ?? false;
    if (!mimeOk) {
      return res.status(400).json({ error: `Unsupported MIME type "${file.mimetype}".` });
    }

    // Storage quota check
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) {
      return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });
    }

    // Save via storage service
    const saved = await saveFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      bucket: BUCKET_COMPANY_FILES,
    });

    const { jobId } = req.body as { jobId?: string };

    // Insert company_files record
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

    res.status(201).json({ file: record, isPdf: ext === '.pdf', isDwg: ext === '.dwg' || ext === '.dxf' });
  } catch (err) {
    console.error('POST /api/drawings/upload error:', err);
    res.status(500).json({ error: 'Failed to upload drawing' });
  }
}
