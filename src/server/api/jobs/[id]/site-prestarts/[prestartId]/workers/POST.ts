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

    // Verify prestart belongs to company and is not closed
    const [rows] = await db.execute(sql`
      SELECT id, status FROM site_prestarts WHERE id = ${prestartId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const prestart = (rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!prestart) return res.status(404).json({ error: 'Not found' });
    if (prestart.status === 'closed') return res.status(400).json({ error: 'Sign-on is closed' });

    const { fullName, companyEmployer, roleTrade, fitForWork, whiteCardNumber, signature } =
      req.body as {
        fullName: string;
        companyEmployer?: string;
        roleTrade?: string;
        fitForWork?: boolean;
        whiteCardNumber?: string;
        signature?: string;
      };

    if (!fullName?.trim()) return res.status(400).json({ error: 'Full name is required' });

    // Duplicate check (same name on same prestart)
    const [dupes] = await db.execute(sql`
      SELECT id FROM site_prestart_workers
      WHERE site_prestart_id = ${prestartId} AND full_name = ${fullName.trim()}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    if ((dupes ?? []).length > 0) {
      return res.status(409).json({ error: `${fullName} has already signed on` });
    }

    const [result] = await db.execute(sql`
      INSERT INTO site_prestart_workers (
        site_prestart_id, company_id, full_name, company_employer,
        role_trade, fit_for_work, white_card_number, signature, signed_by_user_id
      ) VALUES (
        ${prestartId}, ${profile.companyId}, ${fullName.trim()},
        ${companyEmployer ?? ''}, ${roleTrade ?? ''},
        ${fitForWork !== false ? 1 : 0},
        ${whiteCardNumber ?? ''}, ${signature ?? ''},
        ${session.user.id}
      )
    `) as unknown as [{ insertId: number }, unknown];

    const workerId = (result as { insertId: number }).insertId;
    const [newWorker] = await db.execute(sql`
      SELECT * FROM site_prestart_workers WHERE id = ${workerId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ worker: (newWorker ?? [])[0] });
  } catch (err) {
    console.error('POST workers error:', err);
    res.status(500).json({ error: 'Failed to add worker sign-on' });
  }
}
