/**
 * GET /api/jobs/:id/ledger
 * Returns all ledger entries for a job, with optional filters.
 * ?status=pending|approved|all  ?event_type=LABOUR|MATERIAL|...
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobs, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const statusFilter = (req.query.status as string) || 'all';
    const eventFilter = (req.query.event_type as string) || 'all';

    let query = sql`
      SELECT * FROM job_cost_ledger
      WHERE company_id = ${profile.companyId} AND job_id = ${jobId}
    `;
    if (statusFilter !== 'all') query = sql`${query} AND status = ${statusFilter}`;
    if (eventFilter !== 'all') query = sql`${query} AND event_type = ${eventFilter}`;
    query = sql`${query} ORDER BY entry_date DESC, id DESC`;

    const [rows] = await db.execute(query) as unknown as [Array<Record<string, unknown>>, unknown];
    const entries = rows ?? [];

    // Compute summary totals
    const totals = {
      subtotal: 0, gst: 0, total: 0,
      byType: {} as Record<string, { subtotal: number; gst: number; total: number; count: number }>,
    };
    for (const e of entries) {
      const sub = parseFloat(String(e.subtotal ?? 0));
      const gst = parseFloat(String(e.gst ?? 0));
      const tot = parseFloat(String(e.total ?? 0));
      totals.subtotal += sub;
      totals.gst += gst;
      totals.total += tot;
      const et = String(e.event_type ?? 'OTHER');
      if (!totals.byType[et]) totals.byType[et] = { subtotal: 0, gst: 0, total: 0, count: 0 };
      totals.byType[et].subtotal += sub;
      totals.byType[et].gst += gst;
      totals.byType[et].total += tot;
      totals.byType[et].count++;
    }

    res.json({ entries, totals });
  } catch (err) {
    console.error('GET /api/jobs/:id/ledger error:', err);
    res.status(500).json({ error: 'Failed to fetch ledger' });
  }
}
