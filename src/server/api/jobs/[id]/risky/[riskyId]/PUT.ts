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

    const riskyId = parseInt(req.params.riskyId, 10);

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

    await db.execute(sql`
      UPDATE risky_assessments SET
        linked_prestart_id  = ${linkedPrestartId ?? null},
        assessment_date     = ${assessmentDate ?? null},
        assessment_time     = ${assessmentTime ?? null},
        recorded_by         = ${recordedBy ?? null},
        activity            = ${activity ?? null},
        hazards_selected    = ${JSON.stringify(hazardsSelected ?? [])},
        other_hazard_text   = ${otherHazardText ?? null},
        control_measures    = ${controlMeasures ?? null},
        permit_required     = ${permitRequired ? 1 : 0},
        permit_types        = ${JSON.stringify(permitTypes ?? [])},
        other_permit_text   = ${otherPermitText ?? null},
        permit_notes        = ${permitNotes ?? null},
        workers_involved    = ${workersInvolved ?? null},
        workers_briefed     = ${workersBriefed ? 1 : 0},
        notes               = ${notes ?? null},
        updated_at          = NOW()
      WHERE id = ${riskyId} AND company_id = ${profile.companyId} AND status = 'draft'
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT risky assessment error:', err);
    res.status(500).json({ error: 'Failed to update risky assessment' });
  }
}
