/**
 * GET /api/safety/swms/:id/export?format=pdf|docx
 * Export a SWMS as PDF or DOCX.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql, eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { generateSwmsPdf, type SwmsData } from '../../../../../lib/pdf-generator.js';
import { generateSwmsDocx } from '../../../../../lib/docx-generator.js';

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
      sql`SELECT st.*, c.name as company_name FROM swms_templates st
          LEFT JOIN companies c ON c.id = st.company_id
          WHERE st.id = ${id} AND st.company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'SWMS not found' });

    // Fetch signoffs
    const [signoffRows] = await db.execute(
      sql`SELECT ss.worker_name, ss.white_card_number, ss.signed_at
          FROM swms_signoffs ss
          INNER JOIN job_swms js ON js.id = ss.job_swms_id
          WHERE js.swms_template_id = ${id}
          ORDER BY ss.signed_at DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const swms: SwmsData = {
      ...(rows[0] as SwmsData),
      signoffs: (signoffRows ?? []).map(s => ({
        worker_name: String(s.worker_name ?? ''),
        white_card_number: s.white_card_number ? String(s.white_card_number) : undefined,
        signed_at: String(s.signed_at ?? ''),
      })),
    };

    const slug = String(swms.title || `swms-${id}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'docx') {
      const buf = await generateSwmsDocx(swms);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.docx"`);
      return res.send(buf);
    }

    const bytes = await generateSwmsPdf(swms);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.pdf"`);
    return res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('GET /api/safety/swms/:id/export error:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
}
