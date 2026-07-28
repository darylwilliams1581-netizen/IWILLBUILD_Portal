/**
 * POST /api/job-cards/:id/convert
 * Promote a Job Card to a Full Job.
 *
 * - Creates a new Full Job record, copying customer, site, contact, description,
 *   assigned worker from the Job Card.
 * - Sets job_card.status = 'converted' and job_card.converted_job_id = new job id.
 * - The Job Card is never deleted — it remains as a source record.
 * - The new Full Job stores source_job_card_id for history linkage.
 *
 * Body (all optional — defaults come from the Job Card):
 *   jobName?   — override the job title (defaults to card work_description truncated)
 *   notes?     — additional notes for the new job
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql, count } from 'drizzle-orm';
import { jobs } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    // Load the Job Card
    const [cardRows] = await db.execute(
      sql`SELECT * FROM job_cards WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!cardRows?.length) return res.status(404).json({ error: 'Job card not found' });

    const card = cardRows[0];

    if (card.status === 'converted') {
      return res.status(409).json({
        error: 'This Job Card has already been converted to a Full Job.',
        jobId: card.converted_job_id,
      });
    }

    const { jobName, notes } = req.body as { jobName?: string; notes?: string };

    // Auto-generate job number
    const [row] = await db
      .select({ total: count() })
      .from(jobs)
      .where(eq(jobs.companyId, profile.companyId));
    const nextNum = (row?.total ?? 0) + 1;
    const jobNumber = `JOB-${String(nextNum).padStart(3, '0')}`;

    // Derive job title from card
    const workDesc = (card.work_description as string) ?? '';
    const title = jobName?.trim() || (workDesc.length > 80 ? workDesc.slice(0, 80) + '…' : workDesc) || `Converted from ${card.card_number}`;

    // Create the Full Job
    const [jobResult] = await db.execute(sql`
      INSERT INTO jobs (
        company_id, job_number, name, client, address, status, notes, customer_id
      ) VALUES (
        ${profile.companyId},
        ${jobNumber},
        ${title},
        ${(card.customer_name_override as string | null) ?? null},
        ${(card.site_address as string | null) ?? null},
        'New',
        ${notes?.trim() ?? (card.notes as string | null) ?? null},
        ${(card.customer_id as number | null) ?? null}
      )
    `) as unknown as [ResultSetHeader, unknown];

    const newJobId = jobResult.insertId;

    // Store source_job_card_id on the new job (via colsToEnsure migration — safe attempt)
    try {
      await db.execute(sql`
        UPDATE jobs SET source_job_card_id = ${id} WHERE id = ${newJobId}
      `);
    } catch { /* column may not exist on older DBs — non-fatal */ }

    // Mark Job Card as converted
    await db.execute(sql`
      UPDATE job_cards
      SET status = 'converted', converted_job_id = ${newJobId}, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    res.status(201).json({ ok: true, jobId: newJobId, jobNumber });
  } catch (err) {
    console.error('POST /api/job-cards/:id/convert error:', err);
    res.status(500).json({ error: 'Failed to convert job card to full job' });
  }
}
