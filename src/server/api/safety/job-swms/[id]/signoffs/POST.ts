/**
 * POST /api/safety/job-swms/:id/signoffs
 * Records a worker sign-on for a job SWMS.
 * Body: { workerName, companyName?, role?, whiteCardNumber?, signatureData? }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
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

    const id = parseInt(req.params.id, 10);

    // Verify the job_swms belongs to this company
    const [jsRows] = await db.execute(sql`
      SELECT id FROM job_swms WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number }>, unknown];
    if (!jsRows?.length) return res.status(404).json({ error: 'SWMS not found' });

    const { workerName, companyName, role, whiteCardNumber, signatureData } = req.body as {
      workerName: string;
      companyName?: string;
      role?: string;
      whiteCardNumber?: string;
      signatureData?: string;
    };

    if (!workerName?.trim()) return res.status(400).json({ error: 'Worker name is required' });

    const [result] = await db.execute(sql`
      INSERT INTO swms_signoffs
        (job_swms_id, company_id, worker_name, company_name, role, white_card_number, signature_data, signed_at)
      VALUES
        (${id}, ${profile.companyId}, ${workerName.trim()},
         ${companyName?.trim() ?? null}, ${role?.trim() ?? null},
         ${whiteCardNumber?.trim() ?? null}, ${signatureData ?? null}, NOW())
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM swms_signoffs WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ signoff: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/job-swms/:id/signoffs error:', err);
    res.status(500).json({ error: 'Failed to record sign-on' });
  }
}
