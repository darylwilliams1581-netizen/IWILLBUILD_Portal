import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

function computeTotal(
  lines: { quantity: string; rate: string }[],
  markupPercent: string,
  gstMode: string,
): number {
  const subtotal = lines.reduce((sum, l) => {
    return sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
  }, 0);
  const markup = (parseFloat(markupPercent) || 0) / 100;
  const afterMarkup = subtotal * (1 + markup);
  const gst = gstMode === 'Add 10% GST' ? afterMarkup * 0.1 : 0;
  return afterMarkup + gst;
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = req.query.jobId ? parseInt(String(req.query.jobId), 10) : null;
    if (!jobId || isNaN(jobId)) return res.status(400).json({ error: 'jobId required' });

    // Use raw SQL so we get ALL columns including locked/locked_invoice_id
    // which were added via ALTER TABLE and are not in the Drizzle schema.
    // LEFT JOIN invoices so we can tell the UI whether the linked invoice still exists.
    const [rows] = await db.execute(
      sql`SELECT e.*,
             CASE WHEN e.locked_invoice_id IS NOT NULL AND i.id IS NOT NULL THEN 1 ELSE 0 END AS invoice_exists
          FROM estimates e
          LEFT JOIN invoices i ON i.id = e.locked_invoice_id AND i.company_id = e.company_id
          WHERE e.job_id = ${jobId} AND e.company_id = ${profile.companyId}
          ORDER BY e.created_at DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.json({ estimates: [] });

    // Fetch all lines for these estimates in one query
    const estimateIds = rows.map((r) => r.id as number);
    const [allLines] = await db.execute(
      sql`SELECT estimate_id, quantity, rate FROM estimate_lines
          WHERE estimate_id IN (${sql.raw(estimateIds.join(','))})`
    ) as unknown as [Array<{ estimate_id: number; quantity: string; rate: string }>, unknown];

    // Group lines by estimateId
    const linesByEstimate = new Map<number, { quantity: string; rate: string }[]>();
    for (const l of (allLines ?? [])) {
      const arr = linesByEstimate.get(l.estimate_id) ?? [];
      arr.push({ quantity: l.quantity, rate: l.rate });
      linesByEstimate.set(l.estimate_id, arr);
    }

    const result = rows.map((est) => ({
      // Normalise snake_case → camelCase for the fields the UI expects
      id:              est.id,
      jobId:           est.job_id,
      companyId:       est.company_id,
      title:           est.title,
      status:          est.status,
      markupPercent:   est.markup_percent,
      gstMode:         est.gst_mode,
      notes:           est.notes,
      createdAt:       est.created_at,
      updatedAt:       est.updated_at,
      // Lock fields — present after ALTER TABLE migration
      locked:          est.locked,
      locked_at:       est.locked_at,
      locked_invoice_id: est.locked_invoice_id,
      invoice_exists:  est.invoice_exists === 1 || est.invoice_exists === true,
      // Computed total
      total: computeTotal(
        linesByEstimate.get(est.id as number) ?? [],
        String(est.markup_percent ?? '0'),
        String(est.gst_mode ?? 'No GST'),
      ),
    }));

    res.json({ estimates: result });
  } catch (error) {
    console.error('GET /api/estimates error:', error);
    res.status(500).json({ error: 'Failed to fetch estimates' });
  }
}
