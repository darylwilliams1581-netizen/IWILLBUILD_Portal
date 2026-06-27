import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import type { ResultSetHeader } from 'mysql2';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();
    if (ext === '.heic' || ext === '.heif') return cb(new Error('HEIC/HEIF not supported'));
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    if (!allowed.includes(ext)) return cb(new Error('Only images and PDFs are allowed'));
    cb(null, true);
  },
}).single('receipt');

export default async function handler(req: Request, res: Response) {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

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

      const jobId = parseInt(String(req.params.id), 10);
      const costId = parseInt(String(req.params.costId), 10);
      if (isNaN(jobId) || isNaN(costId)) return res.status(400).json({ error: 'Invalid ID' });

      // Verify cost belongs to this company/job
      const [costRows] = await db.execute(sql`
        SELECT id FROM job_costs WHERE id = ${costId} AND job_id = ${jobId} AND company_id = ${profile.companyId}
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      if (!costRows?.length) return res.status(404).json({ error: 'Cost not found' });

      const file = req.file;
      const ext = path.extname(file.originalname).toLowerCase();
      const isPdf = ext === '.pdf';
      const storedName = `receipt_${costId}_${Date.now()}${ext}`;
      const uploadDir = `/shared-storage/public/assets/uploads/receipts`;
      await fs.mkdir(uploadDir, { recursive: true });

      let buffer = file.buffer;

      // Compress images (not PDFs)
      if (!isPdf) {
        try {
          const { getJimp, JimpMime } = await import('@/lib/jimp-helper.js' as string);
          const jimp = await getJimp();
          const img = await jimp.read(buffer);
          if (img.width > 1600) img.resize({ w: 1600 });
          buffer = await img.getBuffer(JimpMime.jpeg, { quality: 82 });
        } catch {
          // fall through with original buffer
        }
      }

      await fs.writeFile(`${uploadDir}/${storedName}`, buffer);

      // Insert into job_files so it appears in Files tab
      const [fileResult] = await db.execute(sql`
        INSERT INTO job_files (company_id, job_id, folder, original_name, stored_name, mime_type, size_bytes, uploaded_by_user_id)
        VALUES (
          ${profile.companyId}, ${jobId}, 'Receipts',
          ${file.originalname}, ${storedName},
          ${isPdf ? 'application/pdf' : 'image/jpeg'},
          ${buffer.length}, ${session.user.id}
        )
      `) as unknown as [ResultSetHeader, unknown];

      // Link receipt to cost record
      await db.execute(sql`
        UPDATE job_costs SET receipt_file_id = ${fileResult.insertId}, updated_at = NOW()
        WHERE id = ${costId}
      `);

      res.status(201).json({
        ok: true,
        fileId: fileResult.insertId,
        url: `/airo-assets/uploads/receipts/${storedName}`,
        originalName: file.originalname,
      });
    } catch (e) {
      console.error('POST receipt error:', e);
      res.status(500).json({ error: 'Failed to upload receipt' });
    }
  });
}
