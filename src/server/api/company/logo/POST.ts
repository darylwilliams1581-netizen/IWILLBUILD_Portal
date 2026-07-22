/**
 * POST /api/company/logo
 * Accepts multipart/form-data with field "logo" (image file).
 * Saves to /shared-storage/public/assets/logos/<companyId>.<ext>
 * Updates companies.logo_url and returns { logoUrl }.
 */
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../lib/file-upload.js';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/jpg':     'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
};

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: 5 * 1024 * 1024, maxFiles: 1 });
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(404).json({ error: 'No company found' });

    const file = parsed.file;
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
