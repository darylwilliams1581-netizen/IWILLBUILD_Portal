import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../db/schema.js';
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

    const jobSwmsId = parseInt(req.params.swmsId, 10);
    const { workerName, whiteCardNumber, signatureData } = req.body as {
      workerName: string;
      whiteCardNumber?: string;
      signatureData?: string;
    };

    if (!workerName?.trim()) return res.status(400).json({ error: 'Worker name is required' });

    const [result] = await db.execute(sql`
      INSERT INTO swms_signoffs
        (job_swms_id, company_id, worker_name, white_card_number, signature_data, signed_at)
      VALUES
        (${jobSwmsId}, ${profile.companyId}, ${workerName.trim()},
         ${whiteCardNumber ?? null}, ${signatureData ?? null}, NOW())
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM swms_signoffs WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ signoff: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/jobs/:id/swms/:swmsId/signoff error:', err);
    res.status(500).json({ error: 'Failed to record sign-off' });
  }
}
