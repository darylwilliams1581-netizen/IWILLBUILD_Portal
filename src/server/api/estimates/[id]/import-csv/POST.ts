/**
 * POST /api/estimates/:id/import-csv
 * Appends CSV rows to the bottom of an existing estimate.
 * Estimate must not be Approved/locked.
 */
import type { Request, Response } from 'express';
import multer from 'multer';
import { db } from '../../../../db/client.js';
import { estimates, estimateLines, profiles } from '../../../../db/schema.js';
import { eq, and, max } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseEstimateCsv } from '../../../../lib/csv-utils.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.csv') || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel';
    cb(ok ? null : new Error('CSV_ONLY'), ok);
  },
}).single('file');

export default async function handler(req: Request, res: Response) {
  let multerError: unknown = null;
  await new Promise<void>((resolve) => {
    upload(req, res, (err: unknown) => { if (err) multerError = err; resolve(); });
  });

  if (multerError) {
    const msg = multerError instanceof Error ? multerError.message : String(multerError);
    if (msg === 'CSV_ONLY') return res.status(400).json({ error: 'Only .csv files are accepted.' });
    if (msg.includes('File too large')) return res.status(400).json({ error: 'CSV file must be under 2 MB.' });
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

    const estimateId = parseInt(String(req.params.id), 10);
    if (isNaN(estimateId)) return res.status(400).json({ error: 'Invalid estimate ID' });

    const estimate = await db.query.estimates.findFirst({
      where: and(eq(estimates.id, estimateId), eq(estimates.companyId, profile.companyId)),
    });
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    if (estimate.status === 'Approved') {
      return res.status(403).json({ error: 'This estimate is Approved and locked. Unlock it before importing.' });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const raw = file.buffer.toString('utf-8');
    const { valid, errors } = parseEstimateCsv(raw);

    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid rows found in CSV.', errors, imported: 0 });
    }

    // Find current max lineOrder so we append to the bottom
    const [maxRow] = await db
      .select({ m: max(estimateLines.lineOrder) })
      .from(estimateLines)
      .where(eq(estimateLines.estimateId, estimateId));
    const baseOrder = (maxRow?.m ?? -1) + 1;

    await db.insert(estimateLines).values(
      valid.map((r, i) => ({
        estimateId,
        description: r.description,
        quantity: r.quantity,
        unit: r.unit || null,
        rate: r.rate,
        lineOrder: baseOrder + i,
      }))
    );

    // Return updated lines
    const updatedLines = await db
      .select()
      .from(estimateLines)
      .where(eq(estimateLines.estimateId, estimateId))
      .orderBy(estimateLines.lineOrder, estimateLines.id);

    res.json({ imported: valid.length, errors, lines: updatedLines });
  } catch (err) {
    console.error('POST /api/estimates/:id/import-csv error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
}
