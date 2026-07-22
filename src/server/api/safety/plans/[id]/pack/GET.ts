/**
 * GET /api/safety/plans/:id/pack
 * Generate a combined Safety Pack PDF: Safety Plan + all assigned SWMS.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql, eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { generateSafetyPackPdf, type SafetyPlanData, type SwmsData } from '../../../../../lib/pdf-generator.js';

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

    // Fetch safety plan
    const [planRows] = await db.execute(
      sql`SELECT sp.*, j.name as job_name, j.job_number, c.name as company_name
          FROM safety_plans sp
          LEFT JOIN jobs j ON j.id = sp.job_id
          LEFT JOIN companies c ON c.id = sp.company_id
          WHERE sp.id = ${id} AND sp.company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!planRows?.[0]) return res.status(404).json({ error: 'Safety plan not found' });
    const plan = planRows[0] as SafetyPlanData;

    // Fetch SWMS assigned to the job linked to this plan
    let swmsList: SwmsData[] = [];
    const jobId = (planRows[0] as Record<string, unknown>).job_id;
    if (jobId) {
      const [swmsRows] = await db.execute(
        sql`SELECT st.*, c.name as company_name FROM swms_templates st
            INNER JOIN job_swms js ON js.swms_template_id = st.id
            LEFT JOIN companies c ON c.id = st.company_id
            WHERE js.job_id = ${jobId} AND st.company_id = ${profile.companyId}`
      ) as unknown as [Array<Record<string, unknown>>, unknown];

      // Fetch signoffs for each SWMS
      for (const row of (swmsRows ?? [])) {
        const [signoffRows] = await db.execute(
          sql`SELECT ss.worker_name, ss.white_card_number, ss.signed_at
              FROM swms_signoffs ss
              INNER JOIN job_swms js ON js.id = ss.job_swms_id
              WHERE js.swms_template_id = ${row.id}
              ORDER BY ss.signed_at DESC`
        ) as unknown as [Array<Record<string, unknown>>, unknown];

        swmsList.push({
          ...(row as SwmsData),
          signoffs: (signoffRows ?? []).map(s => ({
            worker_name: String(s.worker_name ?? ''),
            white_card_number: s.white_card_number ? String(s.white_card_number) : undefined,
            signed_at: String(s.signed_at ?? ''),
          })),
        });
      }
    }

    const bytes = await generateSafetyPackPdf(plan, swmsList);
    const slug = String(plan.title || `safety-pack-${id}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}_pack.pdf"`);
    return res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('GET /api/safety/plans/:id/pack error:', err);
    return res.status(500).json({ error: 'Pack generation failed' });
  }
}
