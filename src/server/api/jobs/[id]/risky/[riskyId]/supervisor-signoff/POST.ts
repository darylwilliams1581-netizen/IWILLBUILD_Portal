import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../db/schema.js';
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

    const riskyId = parseInt(req.params.riskyId, 10);

    const [rows] = await db.execute(sql`
      SELECT id, status, permit_required FROM risky_assessments
      WHERE id = ${riskyId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<{ id: number; status: string; permit_required: number }>, unknown];
    const record = (rows ?? [])[0];
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (record.status === 'finalised') return res.status(400).json({ error: 'Assessment is finalised' });
    if (!record.permit_required) return res.status(400).json({ error: 'No permit required for this assessment' });

    const { supervisorName, signatureData } = req.body as { supervisorName?: string; signatureData?: string };
    if (!supervisorName?.trim()) return res.status(400).json({ error: 'Supervisor name is required' });
    if (!signatureData?.trim()) return res.status(400).json({ error: 'Signature is required' });

    await db.execute(sql`
      UPDATE risky_assessments SET
        permit_supervisor_name      = ${supervisorName.trim()},
        permit_supervisor_signature = ${signatureData},
        permit_supervisor_signed_at = NOW(),
        updated_at                  = NOW()
      WHERE id = ${riskyId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST supervisor sign-off error:', err);
    res.status(500).json({ error: 'Failed to save supervisor sign-off' });
  }
}
