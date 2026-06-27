import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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

    const {
      title, workActivity, hazards, risks, controls, ppe,
      plantEquipment, trainingCompetency, emergencyControls,
      environmentalControls, signOffRequirements, revisionNumber,
      reviewDate, status,
    } = req.body as Record<string, string>;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const [result] = await db.execute(sql`
      INSERT INTO swms_templates
        (company_id, title, work_activity, hazards, risks, controls, ppe,
         plant_equipment, training_competency, emergency_controls,
         environmental_controls, sign_off_requirements, revision_number,
         review_date, status, created_by_user_id)
      VALUES
        (${profile.companyId}, ${title.trim()}, ${workActivity ?? null}, ${hazards ?? null},
         ${risks ?? null}, ${controls ?? null}, ${ppe ?? null},
         ${plantEquipment ?? null}, ${trainingCompetency ?? null}, ${emergencyControls ?? null},
         ${environmentalControls ?? null}, ${signOffRequirements ?? null},
         ${revisionNumber ?? '1'}, ${reviewDate ?? null},
         ${status ?? 'draft'}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM swms_templates WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ swms: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/swms error:', err);
    res.status(500).json({ error: 'Failed to create SWMS' });
  }
}
