/**
 * POST /api/jobs/:id/ledger/:entryId/correct
 * Creates an opposite-entry correction for a locked/approved ledger entry.
 * Standard accounting practice: the original entry is never modified.
 * A new ADJUSTMENT entry is posted with the negative amount (or a custom
 * correction amount supplied by the caller), referencing original_entry_id.
 *
 * Body (all optional — defaults to full reversal):
 *   correctionAmount?: number   — override the reversal amount (must be negative)
 *   description?: string        — custom description (defaults to "Correction for …")
 *   entryDate?: string          — ISO date for the correction (defaults to today)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { profiles } from '../../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import type { ResultSetHeader } from 'mysql2';

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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required to post corrections' });

    const jobId = parseInt(String(req.params.id), 10);
    const entryId = parseInt(String(req.params.entryId), 10);
    if (isNaN(jobId) || isNaN(entryId)) return res.status(400).json({ error: 'Invalid IDs' });

    // Load the original entry
    const [origRows] = await db.execute(sql`
      SELECT * FROM job_cost_ledger
      WHERE id = ${entryId} AND company_id = ${profile.companyId} AND job_id = ${jobId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const orig = origRows?.[0];
    if (!orig) return res.status(404).json({ error: 'Original entry not found' });

    // Only allow corrections on approved/locked entries (pending entries can just be deleted)
    if (!orig.locked && orig.status !== 'approved') {
      return res.status(400).json({
        error: 'Only approved or locked entries need corrections. Pending entries can be deleted directly.',
      });
    }

    // Check this entry hasn't already been fully corrected
    const [existingCorrections] = await db.execute(sql`
      SELECT COALESCE(SUM(total), 0) as corrected_total
      FROM job_cost_ledger
      WHERE original_entry_id = ${entryId} AND company_id = ${profile.companyId} AND is_correction = 1
    `) as unknown as [Array<{ corrected_total: string }>, unknown];
    const alreadyCorrected = parseFloat(String(existingCorrections?.[0]?.corrected_total ?? '0'));
    const origTotal = parseFloat(String(orig.total ?? '0'));

    // If corrections already sum to the negative of the original, it's fully reversed
    if (Math.abs(alreadyCorrected + origTotal) < 0.01) {
      return res.status(400).json({
        error: 'This entry has already been fully corrected. Net effect is zero.',
      });
    }

    const body = req.body as Record<string, unknown>;

    // Determine correction amount — default is full reversal (negative of original)
    let correctionTotal: number;
    if (body.correctionAmount !== undefined) {
      correctionTotal = parseFloat(String(body.correctionAmount));
      if (isNaN(correctionTotal) || correctionTotal >= 0) {
        return res.status(400).json({ error: 'correctionAmount must be a negative number' });
      }
    } else {
      // Full reversal
      correctionTotal = -origTotal;
    }

    // Back-calculate qty/rate for the correction (keep same rate, negate qty)
    const origRate = parseFloat(String(orig.rate ?? '0'));
    const correctionQty = origRate !== 0 ? correctionTotal / (origRate * 1.1) : correctionTotal;
    const correctionSubtotal = Math.round(correctionTotal / 1.1 * 100) / 100;
    const correctionGst = Math.round((correctionTotal - correctionSubtotal) * 100) / 100;

    const today = new Date().toISOString().slice(0, 10);
    const entryDate = body.entryDate ? String(body.entryDate) : today;
    const description = body.description
      ? String(body.description)
      : `Correction for: ${String(orig.description ?? '').substring(0, 200)}`;

    const lockedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await db.execute(sql`
      INSERT INTO job_cost_ledger
        (company_id, job_id, job_number, job_title, entry_date, event_type,
         source_module, source_id, description, qty, unit, rate,
         subtotal, gst, total, gst_inclusive, account_code, tax_code,
         contact_name, contact_type, reference,
         status, approved_by, approved_at,
         locked, locked_at,
         original_entry_id, is_correction,
         created_by_user_id, created_by_name)
      VALUES
        (${profile.companyId}, ${jobId},
         ${orig.job_number ?? null}, ${orig.job_title ?? null},
         ${entryDate}, 'ADJUSTMENT',
         'correction', ${String(entryId)},
         ${description},
         ${Math.round(correctionQty * 1000) / 1000},
         ${orig.unit ?? null},
         ${origRate},
         ${correctionSubtotal}, ${correctionGst}, ${correctionTotal},
         ${orig.gst_inclusive ?? 0},
         ${orig.account_code ?? null}, ${orig.tax_code ?? 'GST'},
         ${orig.contact_name ?? null}, ${orig.contact_type ?? null}, ${orig.reference ?? null},
         'approved',
         ${session.user.name ?? session.user.email ?? 'System'},
         ${lockedAt},
         1, ${lockedAt},
         ${entryId}, 1,
         ${session.user.id}, ${session.user.name ?? null})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM job_cost_ledger WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({
      ok: true,
      correction: rows?.[0] ?? null,
      message: `Correction entry posted. Net effect: $${(origTotal + correctionTotal).toFixed(2)}`,
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/ledger/:entryId/correct error:', err);
    res.status(500).json({ error: 'Failed to post correction entry' });
  }
}
