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
    const {
      linkedPrestartId,
      assessmentDate,
      assessmentTime,
      recordedBy,
      activity,
      hazardsSelected,
      otherHazardText,
      controlMeasures,
      permitRequired,
      permitTypes,
      otherPermitText,
      permitNotes,
      workersInvolved,
      workersBriefed,
      notes,
    } = req.body as Record<string, unknown>;

    const [result] = await db.execute(sql`
      INSERT INTO risky_assessments (
        company_id, job_id, created_by_user_id,
        linked_prestart_id,
        assessment_date, assessment_time,
        recorded_by, activity,
        hazards_selected, other_hazard_text,
        control_measures,
        permit_required, permit_types, other_permit_text, permit_notes,
        workers_involved, workers_briefed,
        notes, status
      ) VALUES (
        ${profile.companyId}, ${jobId}, ${session.user.id},
        ${linkedPrestartId ?? null},
        ${assessmentDate ?? null}, ${assessmentTime ?? null},
        ${recordedBy ?? null}, ${activity ?? null},
        ${JSON.stringify(hazardsSelected ?? [])}, ${otherHazardText ?? null},
        ${controlMeasures ?? null},
        ${permitRequired ? 1 : 0}, ${JSON.stringify(permitTypes ?? [])}, ${otherPermitText ?? null}, ${permitNotes ?? null},
        ${workersInvolved ?? null}, ${workersBriefed ? 1 : 0},
        ${notes ?? null}, 'draft'
      )
    `) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as { insertId: number }).insertId;
    res.status(201).json({ id: insertId });
  } catch (err) {
    console.error('POST risky assessment error:', err);
    res.status(500).json({ error: 'Failed to create risky assessment' });
  }
}
