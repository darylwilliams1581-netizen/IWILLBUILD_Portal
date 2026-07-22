import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const [jobRows] = await db.execute(
      sql`SELECT id, name, job_number FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const [costs] = await db.execute(sql`
      SELECT jc.*, u.name AS uploaded_by_name
      FROM job_costs jc
      LEFT JOIN user u ON u.id = jc.user_id
      WHERE jc.job_id = ${jobId} AND jc.company_id = ${profile.companyId}
      ORDER BY jc.purchase_date DESC, jc.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const rows = costs ?? [];
    const header = 'purchase_date,merchant,description,category,amount,gst_included,gst_amount,amount_ex_gst,notes,uploaded_by\n';
    const csv = rows.map((r) => [
      r.purchase_date ?? '',
      `"${String(r.merchant ?? '').replace(/"/g, '""')}"`,
      `"${String(r.description ?? '').replace(/"/g, '""')}"`,
      r.category ?? '',
      r.amount ?? 0,
      r.gst_included ? 'Yes' : 'No',
      r.gst_amount ?? 0,
      r.amount_ex_gst ?? 0,
      `"${String(r.notes ?? '').replace(/"/g, '""')}"`,
      `"${String(r.uploaded_by_name ?? '').replace(/"/g, '""')}"`,
    ].join(',')).join('\n');

    const job = jobRows[0];
    const filename = `costs_${String(job.job_number || job.name || jobId).replace(/[^a-z0-9]/gi, '_')}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(header + csv);
  } catch (err) {
    console.error('GET /api/jobs/:id/costs/export error:', err);
    res.status(500).json({ error: 'Failed to export costs' });
  }
}
