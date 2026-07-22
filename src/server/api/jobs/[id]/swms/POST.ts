import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const jobId = parseInt(req.params.id, 10);
    const { swmsTemplateId } = req.body as { swmsTemplateId: string };
    if (!swmsTemplateId) return res.status(400).json({ error: 'swmsTemplateId required' });

    const [result] = await db.execute(sql`
      INSERT INTO job_swms (company_id, job_id, swms_template_id, assigned_by_user_id)
      VALUES (${profile.companyId}, ${jobId}, ${parseInt(swmsTemplateId, 10)}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(sql`
      SELECT js.*, st.title as swms_title, st.work_activity, st.status as template_status
      FROM job_swms js
      JOIN swms_templates st ON st.id = js.swms_template_id
      WHERE js.id = ${result.insertId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ jobSwms: { ...(rows?.[0] ?? {}), signoffs: [] } });
  } catch (err) {
    console.error('POST /api/jobs/:id/swms error:', err);
    res.status(500).json({ error: 'Failed to assign SWMS' });
  }
}
