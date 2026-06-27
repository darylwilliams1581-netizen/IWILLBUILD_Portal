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

    const id = parseInt(req.params.id, 10);
    const {
      title, workActivity, hazards, risks, controls, ppe,
      plantEquipment, trainingCompetency, emergencyControls,
      environmentalControls, signOffRequirements, revisionNumber,
      reviewDate, status,
    } = req.body as Record<string, string>;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    await db.execute(sql`
      UPDATE swms_templates SET
        title = ${title.trim()},
        work_activity = ${workActivity ?? null},
        hazards = ${hazards ?? null},
        risks = ${risks ?? null},
        controls = ${controls ?? null},
        ppe = ${ppe ?? null},
        plant_equipment = ${plantEquipment ?? null},
        training_competency = ${trainingCompetency ?? null},
        emergency_controls = ${emergencyControls ?? null},
        environmental_controls = ${environmentalControls ?? null},
        sign_off_requirements = ${signOffRequirements ?? null},
        revision_number = ${revisionNumber ?? '1'},
        review_date = ${reviewDate ?? null},
        status = ${status ?? 'draft'}
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(
      sql`SELECT * FROM swms_templates WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ swms: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/safety/swms/:id error:', err);
    res.status(500).json({ error: 'Failed to update SWMS' });
  }
}
