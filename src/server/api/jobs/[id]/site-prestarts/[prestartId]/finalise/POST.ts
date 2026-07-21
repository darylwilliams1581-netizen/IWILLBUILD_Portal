import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../db/schema.js';
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

    const prestartId = parseInt(req.params.prestartId, 10);

    const [rows] = await db.execute(sql`
      SELECT * FROM site_prestarts WHERE id = ${prestartId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const prestart = (rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!prestart) return res.status(404).json({ error: 'Not found' });
    if (prestart.status === 'finalised') return res.status(400).json({ error: 'Already finalised' });

    // Validate: must have at least one SWMS or no_swms_required
    const swmsIds = prestart.relevant_swms_ids
      ? (typeof prestart.relevant_swms_ids === 'string'
          ? JSON.parse(prestart.relevant_swms_ids)
          : prestart.relevant_swms_ids) as unknown[]
      : [];
    if (swmsIds.length === 0 && !prestart.no_swms_required) {
      return res.status(400).json({
        error: 'At least one SWMS must be selected, or mark "No SWMS required today" with a reason.',
      });
    }

    const { supervisorSignature, supervisorSignoffName } = req.body as {
      supervisorSignature?: string;
      supervisorSignoffName?: string;
    };

    await db.execute(sql`
      UPDATE site_prestarts SET
        status = 'finalised',
        submitted_at = NOW(),
        supervisor_signature = ${supervisorSignature ?? prestart.supervisor_signature ?? ''},
        supervisor_signoff_name = ${supervisorSignoffName ?? prestart.supervisor_signoff_name ?? ''}
      WHERE id = ${prestartId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST finalise error:', err);
    res.status(500).json({ error: 'Failed to finalise' });
  }
}
