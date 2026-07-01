/**
 * POST /api/company/logo
 * Accepts multipart/form-data with field "logo" (image file).
 * Saves to /shared-storage/public/assets/logos/<companyId>.<ext>
 * Updates companies.logo_url and returns { logoUrl }.
 */
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/jpg':     'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('logo');

export default async function handler(req: Request, res: Response) {
  // Run multer first
  let multerError: unknown = null;
  await new Promise<void>((resolve) => {
    upload(req, res, (err: unknown) => { if (err) multerError = err; resolve(); });
  });
  if (multerError) {
    const msg = multerError instanceof Error ? multerError.message : 'Upload error';
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(404).json({ error: 'No company found' });

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = ALLOWED_TYPES[file.mimetype];
    if (!ext) return res.status(400).json({ error: 'Unsupported file type. Use PNG, JPG, WebP or SVG.' });

    const dir = '/shared-storage/public/assets/logos';
    await fs.mkdir(dir, { recursive: true });

    const filename = `company-${profile.companyId}.${ext}`;
    const filepath = path.join(dir, filename);
    await fs.writeFile(filepath, file.buffer);

    const logoUrl = `/airo-assets/uploads/logos/${filename}`;

    // logo_url is a late-added column — use raw SQL
    await db.execute(
      sql.raw(`UPDATE \`companies\` SET \`logo_url\` = '${logoUrl.replace(/'/g, "''")}' WHERE \`id\` = ${profile.companyId}`)
    );

    return res.json({ logoUrl });
  } catch (error) {
    console.error('POST /api/company/logo error:', error);
    return res.status(500).json({ error: 'Failed to upload logo' });
  }
}
