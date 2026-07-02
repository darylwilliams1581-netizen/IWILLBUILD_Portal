import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { formTemplateFields, formTemplates, profiles } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseMultipartForm } from '../../../../../../lib/file-upload.js';

// ── Jimp lazy-loaded ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Jimp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _JimpMime: any = null;

async function getJimp() {
  if (_Jimp) return { Jimp: _Jimp, JimpMime: _JimpMime };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg = await import('jimp') as any;
  _Jimp = pkg.Jimp;
  _JimpMime = pkg.JimpMime;
  return { Jimp: _Jimp, JimpMime: _JimpMime };
}

const THUMB_MAX = 10 * 1024 * 1024;
const ALLOWED_THUMB_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: THUMB_MAX, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  const file = parsed.file;
  if (!file) return res.status(400).json({ error: 'No image file provided' });

  if (!ALLOWED_THUMB_MIMES.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are allowed' });
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

    const templateId = parseInt(String(req.params.id), 10);
    const fieldId = parseInt(String(req.params.fieldId), 10);
    if (isNaN(templateId) || isNaN(fieldId)) return res.status(400).json({ error: 'Invalid ID' });

    const template = await db.query.formTemplates.findFirst({
      where: and(eq(formTemplates.id, templateId), eq(formTemplates.companyId, profile.companyId)),
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const field = await db.query.formTemplateFields.findFirst({
      where: and(
        eq(formTemplateFields.id, fieldId),
        eq(formTemplateFields.templateId, templateId),
        eq(formTemplateFields.companyId, profile.companyId),
      ),
    });
    if (!field) return res.status(404).json({ error: 'Field not found' });

    // Resize to max 800px wide, JPEG 85%
    const { Jimp, JimpMime } = await getJimp();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const image = await Jimp.read(file.buffer);
    if (image.width > 800) {
      image.resize({ w: 800 });
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const outputBuffer: Buffer = await image.getBuffer(JimpMime.jpeg);

    const uuid = randomUUID();
    const filename = `${uuid}.jpg`;
    const dir = `/shared-storage/public/assets/form-thumbnails/company-${profile.companyId}`;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), outputBuffer);

    const url = `/airo-assets/uploads/form-thumbnails/company-${profile.companyId}/${filename}`;

    let currentSettings: Record<string, unknown> = {};
    if (field.settingsJson) {
      try { currentSettings = JSON.parse(field.settingsJson) as Record<string, unknown>; } catch { /* ignore */ }
    }
    const newSettings = { ...currentSettings, thumbnailUrl: url };
    await db.update(formTemplateFields)
      .set({ settingsJson: JSON.stringify(newSettings) })
      .where(eq(formTemplateFields.id, fieldId));

    const updated = await db.query.formTemplateFields.findFirst({
      where: eq(formTemplateFields.id, fieldId),
    });

    res.json({ ok: true, url, field: updated });
  } catch (error) {
    console.error('POST /api/forms/:id/fields/:fieldId/thumbnail error:', error);
    res.status(500).json({ error: 'Failed to upload thumbnail' });
  }
}
