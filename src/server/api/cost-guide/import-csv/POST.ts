/**
 * POST /api/cost-guide/import-csv
 * Body: multipart/form-data  — field "file" (.csv, max 2 MB)
 *       + optional field "duplicateMode": "skip" | "update" | "add"  (default "skip")
 *
 * Returns: { imported, skipped, errors }
 */
import type { Request, Response } from 'express';
import { parseMultipartForm } from '../../../lib/file-upload.js';
import { db } from '../../../db/client.js';
import { costGuideItems, profiles } from '../../../db/schema.js';
import { eq, count, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { parseCostGuideCsv } from '../../../lib/csv-utils.js';
import { LIMITS } from '../../../lib/limits.js';
import type { ResultSetHeader } from 'mysql2';

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

  // CSV-only validation
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

    const duplicateMode = (parsed.fields?.duplicateMode as string) || 'skip'; // skip | update | add

    // Parse CSV
    const raw = file.buffer.toString('utf-8');
    const { valid, errors } = parseCostGuideCsv(raw);

    if (valid.length === 0) {
      return res.status(400).json({
        error: 'No valid rows found in CSV.',
        errors,
        imported: 0,
        skipped: 0,
      });
    }

    // Check 200-item limit
    const [countRow] = await db.select({ c: count() }).from(costGuideItems).where(eq(costGuideItems.companyId, profile.companyId));
    const currentCount = countRow?.c ?? 0;
    const available = LIMITS.COST_GUIDE_ITEMS - currentCount;
    if (available <= 0) {
      return res.status(400).json({ code: 'limit_reached', error: `Cost Guide limit reached (${LIMITS.COST_GUIDE_ITEMS} items). Delete unused items before importing.` });
    }

    // Fetch existing items for duplicate detection
    const existing = await db.select().from(costGuideItems).where(eq(costGuideItems.companyId, profile.companyId));
    const existingMap = new Map(existing.map((e) => [`${e.description.toLowerCase()}|${(e.unit ?? '').toLowerCase()}`, e]));

    let imported = 0;
    let skipped = 0;
    const rowsToInsert: typeof valid = [];

    for (const row of valid) {
      if (imported + rowsToInsert.length >= available) {
        skipped++;
        continue;
      }
      const key = `${row.description.toLowerCase()}|${row.unit.toLowerCase()}`;
      const dup = existingMap.get(key);

      if (dup) {
        if (duplicateMode === 'skip') {
          skipped++;
          continue;
        } else if (duplicateMode === 'update') {
          await db.update(costGuideItems)
            .set({ rate: row.rate, unit: row.unit || null })
            .where(and(eq(costGuideItems.id, dup.id), eq(costGuideItems.companyId, profile.companyId)));
          imported++;
          continue;
        }
        // 'add' falls through to insert
      }
      rowsToInsert.push(row);
    }

    // Bulk insert
    if (rowsToInsert.length > 0) {
      const sortBase = currentCount + imported;
      await db.insert(costGuideItems).values(
        rowsToInsert.map((r, i) => ({
          companyId: profile.companyId!,
          description: r.description,
          unit: r.unit || null,
          rate: r.rate,
          sortOrder: sortBase + i,
        }))
      );
      imported += rowsToInsert.length;
    }

    res.json({ imported, skipped, errors });
  } catch (err) {
    console.error('POST /api/cost-guide/import-csv error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
}
