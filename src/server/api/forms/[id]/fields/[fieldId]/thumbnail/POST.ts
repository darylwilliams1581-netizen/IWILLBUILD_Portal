import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { formTemplateFields, formTemplates, profiles } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

// ── Jimp lazy-loaded ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _CustomJimp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _JimpMime: any = null;

async function getJimp() {
  if (_CustomJimp) return { CustomJimp: _CustomJimp, JimpMime: _JimpMime };
  const [core, jimpPkg, resizePkg] = await Promise.all([
    import('@jimp/core'),
    import('jimp'),
    import('@jimp/plugin-resize'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createJimp = (core as any).createJimp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { defaultPlugins, defaultFormats, JimpMime } = jimpPkg as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resizeMethods = (resizePkg as any).methods;
  _JimpMime = JimpMime;
  _CustomJimp = createJimp({ plugins: [...defaultPlugins, resizeMethods], formats: defaultFormats });
  return { CustomJimp: _CustomJimp, JimpMime: _JimpMime };
}

// ── multer: memory storage, 10 MB, images only ───────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  },
});

function runMiddleware(req: Request, res: Response, fn: Function): Promise<void> {
  return new Promise((resolve, reject) => {
    fn(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export default async function handler(req: Request, res: Response) {
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

    // Verify template ownership
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

    // Parse multipart
    await runMiddleware(req, res, upload.single('image'));

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'No image file provided' });

    // Resize to max 800px wide, JPEG 85%
    const { CustomJimp, JimpMime } = await getJimp();
    const image = await CustomJimp.read(file.buffer);
    if (image.width > 800) {
      image.resize({ w: 800 });
    }
    const outputBuffer: Buffer = await image.getBuffer(JimpMime.JPEG, { quality: 85 });

    // Save to persistent storage
    const uuid = randomUUID();
    const filename = `${uuid}.jpg`;
    const dir = `/shared-storage/public/assets/form-thumbnails/company-${profile.companyId}`;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), outputBuffer);

    const url = `/airo-assets/uploads/form-thumbnails/company-${profile.companyId}/${filename}`;

    // Persist URL into settingsJson
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
