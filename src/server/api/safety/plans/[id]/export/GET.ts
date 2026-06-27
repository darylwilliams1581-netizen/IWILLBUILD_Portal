/**
 * GET /api/safety/plans/:id/export?format=pdf|docx
 * Export a Safety Plan as PDF or DOCX.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql, eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { generateSafetyPlanPdf, type SafetyPlanData } from '../../../../../lib/pdf-generator.js';
import { generateSafetyPlanDocx } from '../../../../../lib/docx-generator.js';

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
    const format = (req.query.format as string) || 'pdf';

    const [rows] = await db.execute(
      sql`SELECT sp.*, j.name as job_name, j.job_number, c.name as company_name
          FROM safety_plans sp
          LEFT JOIN jobs j ON j.id = sp.job_id
          LEFT JOIN companies c ON c.id = sp.company_id
          WHERE sp.id = ${id} AND sp.company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Safety plan not found' });

    const plan = rows[0] as SafetyPlanData;
    const slug = String(plan.title || `safety-plan-${id}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'docx') {
      const buf = await generateSafetyPlanDocx(plan);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.docx"`);
      return res.send(buf);
    }

    const bytes = await generateSafetyPlanPdf(plan);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.pdf"`);
    return res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('GET /api/safety/plans/:id/export error:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
}
