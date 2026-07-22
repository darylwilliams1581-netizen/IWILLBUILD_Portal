import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const jobId = parseInt(req.params.id, 10);

    const [rows] = await db.execute(sql`
      SELECT r.*, 
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id', s.id,
          'signer_name', s.signer_name,
          'signature_data', s.signature_data,
          'signed_at', s.signed_at
        )) FROM risky_assessment_signatures s WHERE s.risky_assessment_id = r.id)
        AS signatures
      FROM risky_assessments r
      WHERE r.job_id = ${jobId} AND r.company_id = ${profile.companyId}
      ORDER BY r.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json(rows ?? []);
  } catch (err) {
    console.error('GET risky assessments error:', err);
    res.status(500).json({ error: 'Failed to fetch risky assessments' });
  }
}
