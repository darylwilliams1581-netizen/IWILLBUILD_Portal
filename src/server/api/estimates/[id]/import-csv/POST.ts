import type { Request, Response } from 'express';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { db } from '../../../../db/client.js';
import { estimates, estimateLines, profiles } from '../../../../db/schema.js';
import { eq, and, max, count } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseEstimateCsv } from '../../../../lib/csv-utils.js';
import { LIMITS } from '../../../../lib/limits.js';

const CSV_MAX = 2 * 1024 * 1024;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: CSV_MAX, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: 'CSV file must be under 2 MB.' });

  const file = parsed.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  const isCsv = file.originalname.toLowerCase().endsWith('.csv')
    || file.mimetype === 'text/csv'
    || file.mimetype === 'application/vnd.ms-excel';
  if (!isCsv) return res.status(400).json({ error: 'Only .csv files are accepted.' });

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

    const raw = file.buffer.toString('utf-8');
    const { valid, errors } = parseEstimateCsv(raw);

    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid rows found in CSV.', errors, imported: 0 });
    }

    // ── Enforce 300-line limit ────────────────────────────────────────────────
    const [countRow] = await db
      .select({ c: count() })
      .from(estimateLines)
      .where(eq(estimateLines.estimateId, estimateId));
    const currentLineCount = countRow?.c ?? 0;
    const available = LIMITS.ESTIMATE_LINES - currentLineCount;
    if (available <= 0) {
      return res.status(400).json({
        code: 'limit_reached',
        error: `This estimate already has ${currentLineCount} lines (limit: ${LIMITS.ESTIMATE_LINES}). Delete some lines before importing.`,
      });
    }
    const rowsToImport = valid.slice(0, available);
    const truncated = valid.length > available;

    // Find current max lineOrder so we append to the bottom
    const [maxRow] = await db
      .select({ m: max(estimateLines.lineOrder) })
      .from(estimateLines)
      .where(eq(estimateLines.estimateId, estimateId));
    const baseOrder = (maxRow?.m ?? -1) + 1;

    await db.insert(estimateLines).values(
      rowsToImport.map((r, i) => ({
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

    res.json({
      imported: rowsToImport.length,
      skipped: truncated ? valid.length - available : 0,
      truncated,
      limitMessage: truncated ? `Only ${available} of ${valid.length} rows imported — estimate line limit (${LIMITS.ESTIMATE_LINES}) reached.` : undefined,
      errors,
      lines: updatedLines,
    });
  } catch (err) {
    console.error('POST /api/estimates/:id/import-csv error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
}
