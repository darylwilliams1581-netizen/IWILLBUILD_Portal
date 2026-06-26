import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { companyFiles, profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  fileUploadMiddleware,
  extForMime,
  isHeic,
  isBlockedExtension,
  ALLOWED_MIMES,
} from '../../lib/file-upload.js';
import type { ResultSetHeader } from 'mysql2';

const FILES_DIR = '/shared-storage/public/assets/company-files';

const FILE_CATEGORIES = ['Job','Fleet','Company','User','Template','Report','Other'] as const;

export default async function handler(req: Request, res: Response) {
  // Run multer
  let multerError: unknown = null;
  await new Promise<void>((resolve) => {
    fileUploadMiddleware(req, res, (err: unknown) => {
      if (err) multerError = err;
      resolve();
    });
  });

  if (multerError) {
    const msg = multerError instanceof Error ? multerError.message : String(multerError);
    if (msg.startsWith('HEIC_REJECTED:')) {
      return res.status(400).json({ error: 'HEIC/HEIF files are not supported. Convert to JPEG or PNG first.' });
    }
    if (msg.startsWith('BLOCKED_EXT:')) {
      return res.status(400).json({ error: 'Executable and script files are not allowed.' });
    }
    if (msg.startsWith('UNSUPPORTED_TYPE:')) {
      return res.status(400).json({ error: 'File type not supported. Allowed: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX, CSV, TXT, ZIP.' });
    }
    if (msg.includes('File too large')) {
      return res.status(400).json({ error: 'File exceeds the 20 MB limit.' });
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

    // Double-check extension/mime on server side
    if (isHeic(file.originalname)) return res.status(400).json({ error: 'HEIC/HEIF not supported.' });
    if (isBlockedExtension(file.originalname)) return res.status(400).json({ error: 'File type not allowed.' });
    if (!ALLOWED_MIMES[file.mimetype]) return res.status(400).json({ error: 'File type not supported.' });

    const { jobId, fleetAssetId, fileCategory, label, notes } = req.body as {
      jobId?: string;
      fleetAssetId?: string;
      fileCategory?: string;
      label?: string;
      notes?: string;
    };

    const cat = FILE_CATEGORIES.includes(fileCategory as typeof FILE_CATEGORIES[number])
      ? (fileCategory as string)
      : 'Other';

    const ext = extForMime(file.mimetype);
    const storedName = `${randomUUID()}.${ext}`;
    const filePath = join(FILES_DIR, storedName);

    await mkdir(FILES_DIR, { recursive: true });
    await writeFile(filePath, file.buffer);

    const result = await db.insert(companyFiles).values({
      companyId: profile.companyId,
      jobId: jobId ? parseInt(jobId, 10) : null,
      fleetAssetId: fleetAssetId ? parseInt(fleetAssetId, 10) : null,
      uploadedByUserId: session.user.id,
      originalName: file.originalname,
      storedName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      fileCategory: cat,
      label: label?.trim() || null,
      notes: notes?.trim() || null,
    });
    const header = result[0] as unknown as ResultSetHeader;

    const saved = await db.query.companyFiles.findFirst({ where: eq(companyFiles.id, header.insertId) });
    res.status(201).json({ file: saved });
  } catch (err) {
    console.error('POST /api/files error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}
