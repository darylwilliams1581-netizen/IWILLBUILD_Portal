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

    // Verify the assessment belongs to this company and is still draft
    const [rows] = await db.execute(sql`
      SELECT id, status FROM risky_assessments WHERE id = ${riskyId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<{ id: number; status: string }>, unknown];
    const record = (rows ?? [])[0];
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (record.status === 'finalised') return res.status(400).json({ error: 'Assessment is finalised' });

    const { signerName, signatureData } = req.body as { signerName?: string; signatureData?: string };
    if (!signerName?.trim()) return res.status(400).json({ error: 'Signer name is required' });
    if (!signatureData?.trim()) return res.status(400).json({ error: 'Signature is required' });

    const [result] = await db.execute(sql`
      INSERT INTO risky_assessment_signatures (risky_assessment_id, signer_name, signature_data, signed_at)
      VALUES (${riskyId}, ${signerName.trim()}, ${signatureData}, NOW())
    `) as unknown as [{ insertId: number }, unknown];

    res.status(201).json({ id: (result as { insertId: number }).insertId });
  } catch (err) {
    console.error('POST risky signature error:', err);
    res.status(500).json({ error: 'Failed to save signature' });
  }
}
