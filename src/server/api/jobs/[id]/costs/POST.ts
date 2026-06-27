import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const [jobRows] = await db.execute(
      sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const { purchaseDate, merchant, description, category, amount, gstIncluded, notes } = req.body as {
      purchaseDate?: string;
      merchant?: string;
      description?: string;
      category?: string;
      amount?: string | number;
      gstIncluded?: boolean;
      notes?: string;
    };

    if (!description || !amount) return res.status(400).json({ error: 'description and amount are required' });

    const amtNum = parseFloat(String(amount));
    if (isNaN(amtNum) || amtNum < 0) return res.status(400).json({ error: 'Invalid amount' });

    const gstAmt = gstIncluded ? amtNum / 11 : 0;
    const amtExGst = gstIncluded ? amtNum - gstAmt : amtNum;

    const [result] = await db.execute(sql`
      INSERT INTO job_costs (company_id, job_id, user_id, purchase_date, merchant, description, category, amount, gst_included, gst_amount, amount_ex_gst, notes)
      VALUES (
        ${profile.companyId}, ${jobId}, ${session.user.id},
        ${purchaseDate || null}, ${merchant || null}, ${description},
        ${category || 'Other'}, ${amtNum}, ${gstIncluded ? 1 : 0},
        ${gstAmt}, ${amtExGst}, ${notes || null}
      )
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(sql`
      SELECT jc.*, u.name AS uploaded_by_name
      FROM job_costs jc
      LEFT JOIN user u ON u.id = jc.user_id
      WHERE jc.id = ${result.insertId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ cost: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/jobs/:id/costs error:', err);
    res.status(500).json({ error: 'Failed to create cost' });
  }
}
