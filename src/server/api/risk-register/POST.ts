/**
 * POST /api/risk-register
 * Creates a new risk register entry for the authenticated user's company.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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

    const {
      job_id,
      title,
      description,
      category,
      hazard_source,
      who_is_at_risk,
      existing_controls,
      likelihood,
      consequence,
      risk_level,
      additional_controls,
      responsible_person,
      due_date,
      identified_date,
      status = 'open',
      review_date,
      notes,
    } = req.body as Record<string, unknown>;

    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!likelihood) return res.status(400).json({ error: 'likelihood is required' });
    if (!consequence) return res.status(400).json({ error: 'consequence is required' });

    const [result] = await db.execute(sql.raw(`
      INSERT INTO risk_register (
        company_id, job_id, title, description, category,
        hazard_source, who_is_at_risk, existing_controls,
        likelihood, consequence, risk_level,
        additional_controls, responsible_person,
        due_date, identified_date, status, review_date, notes,
        created_by, created_at, updated_at
      ) VALUES (
        ${profile.companyId},
        ${job_id ? parseInt(String(job_id), 10) : 'NULL'},
        '${String(title).replace(/'/g, "''")}',
        ${description ? `'${String(description).replace(/'/g, "''")}'` : 'NULL'},
        ${category ? `'${String(category).replace(/'/g, "''")}'` : 'NULL'},
        ${hazard_source ? `'${String(hazard_source).replace(/'/g, "''")}'` : 'NULL'},
        ${who_is_at_risk ? `'${String(who_is_at_risk).replace(/'/g, "''")}'` : 'NULL'},
        ${existing_controls ? `'${String(existing_controls).replace(/'/g, "''")}'` : 'NULL'},
        '${String(likelihood).replace(/'/g, "''")}',
        '${String(consequence).replace(/'/g, "''")}',
        ${risk_level ? `'${String(risk_level).replace(/'/g, "''")}'` : `'medium'`},
        ${additional_controls ? `'${String(additional_controls).replace(/'/g, "''")}'` : 'NULL'},
        ${responsible_person ? `'${String(responsible_person).replace(/'/g, "''")}'` : 'NULL'},
        ${due_date ? `'${String(due_date)}'` : 'NULL'},
        ${identified_date ? `'${String(identified_date)}'` : 'CURDATE()'},
        '${String(status).replace(/'/g, "''")}',
        ${review_date ? `'${String(review_date)}'` : 'NULL'},
        ${notes ? `'${String(notes).replace(/'/g, "''")}'` : 'NULL'},
        '${session.user.id}',
        NOW(), NOW()
      )
    `)) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as { insertId?: number })?.insertId;
    if (!insertId) return res.status(500).json({ error: 'Insert failed' });

    const [rows] = await db.execute(sql.raw(
      `SELECT r.*, j.job_number, j.name AS job_name FROM risk_register r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.id = ${insertId}`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json(rows?.[0] ?? { id: insertId });
  } catch (err) {
    console.error('POST /api/risk-register error:', err);
    res.status(500).json({ error: 'Failed to create risk entry' });
  }
}
