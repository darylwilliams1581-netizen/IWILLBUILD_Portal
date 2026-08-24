/**
 * DELETE /api/jobs/:id/progress/lines/:lineId
 * Delete a progress activity. Triple-scoped: line + job + company.
 *
 * Guard: if the activity is referenced by any PO line, returns 409 CONFLICT
 * with code PO_REFERENCE so the UI can show a clear message.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobProgressLines, jobs, profiles } from '../../../../../../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';

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
    const lineId = parseInt(String(req.params.lineId), 10);
    if (isNaN(jobId) || isNaN(lineId)) return res.status(400).json({ error: 'Invalid ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // PO reference guard — check job_purchase_order_lines.progress_line_id
    const [poRefRows] = await db.execute(sql`
      SELECT COUNT(*) AS n
      FROM job_purchase_order_lines pol
      INNER JOIN job_purchase_orders po ON po.id = pol.purchase_order_id
      WHERE pol.progress_line_id = ${lineId}
        AND po.company_id = ${profile.companyId}
        AND po.job_id = ${jobId}
    `);
    const poRefCount = Number((poRefRows as unknown as Array<{ n: number }>)[0]?.n ?? 0);
    if (poRefCount > 0) {
      return res.status(409).json({
        error: 'This activity is referenced by a Purchase Order and cannot be deleted. Edit the PO to remove the reference first.',
        code: 'PO_REFERENCE',
      });
    }

    await db.delete(jobProgressLines).where(
      and(
        eq(jobProgressLines.id, lineId),
        eq(jobProgressLines.jobId, jobId),
        eq(jobProgressLines.companyId, profile.companyId),
      ),
    );

    const activities = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id));

    return res.json({ activities });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/progress/lines/:lineId error:', err);
    return res.status(500).json({ error: 'Failed to delete activity' });
  }
}
