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
    const costId = parseInt(String(req.params.costId), 10);
    if (isNaN(jobId) || isNaN(costId)) return res.status(400).json({ error: 'Invalid ID' });

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

    await db.execute(sql`
      UPDATE job_costs SET
        purchase_date = ${purchaseDate || null},
        merchant = ${merchant || null},
        description = ${description},
        category = ${category || 'Other'},
        amount = ${amtNum},
        gst_included = ${gstIncluded ? 1 : 0},
        gst_amount = ${gstAmt},
        amount_ex_gst = ${amtExGst},
        notes = ${notes || null},
        updated_at = NOW()
      WHERE id = ${costId} AND job_id = ${jobId} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(sql`
      SELECT jc.*, u.name AS uploaded_by_name
      FROM job_costs jc
      LEFT JOIN user u ON u.id = jc.user_id
      WHERE jc.id = ${costId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ cost: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/jobs/:id/costs/:costId error:', err);
    res.status(500).json({ error: 'Failed to update cost' });
  }
}
