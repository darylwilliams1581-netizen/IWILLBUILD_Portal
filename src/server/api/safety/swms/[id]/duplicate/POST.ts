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
    const [rows] = await db.execute(
      sql`SELECT * FROM swms_templates WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const orig = rows?.[0];
    if (!orig) return res.status(404).json({ error: 'Not found' });

    const [result] = await db.execute(sql`
      INSERT INTO swms_templates
        (company_id, title, work_activity, hazards, risks, controls, ppe,
         plant_equipment, training_competency, emergency_controls,
         environmental_controls, sign_off_requirements, revision_number,
         review_date, status, created_by_user_id)
      VALUES
        (${profile.companyId}, ${`${orig.title} (Copy)`}, ${orig.work_activity ?? null},
         ${orig.hazards ?? null}, ${orig.risks ?? null}, ${orig.controls ?? null},
         ${orig.ppe ?? null}, ${orig.plant_equipment ?? null}, ${orig.training_competency ?? null},
         ${orig.emergency_controls ?? null}, ${orig.environmental_controls ?? null},
         ${orig.sign_off_requirements ?? null}, ${orig.revision_number ?? '1'},
         ${orig.review_date ?? null}, 'draft', ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [newRows] = await db.execute(
      sql`SELECT * FROM swms_templates WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ swms: newRows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/swms/:id/duplicate error:', err);
    res.status(500).json({ error: 'Failed to duplicate SWMS' });
  }
}
