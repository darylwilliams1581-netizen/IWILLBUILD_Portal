/**
 * POST /api/developer/swms-cleanup
 * One-time cleanup for the developer company's SWMS library:
 *  1. Delete junk rows (blank title "SWMS", old "Use of Power Tools" draft, MLCH-01 test entry)
 *  2. Rename "Review: 12 July 2026" → "Using Power Tools" (was manually renamed in DB)
 * Developer-only (requirePlatformOwner applied at route registration).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(400).json({ error: 'No company' });

    const companyId = profile.companyId;
    const log: string[] = [];

    // 1. Delete blank/junk title rows
    const junkTitles = ['SWMS', 'Use of Power Tools', 'MLCH-01 Medium - Supervisor to monitor work activities and inspect work areas regularly. Reviewed by John Austen during works and updated when conditions change'];
    for (const title of junkTitles) {
      const [result] = await db.execute(
        sql.raw(`DELETE FROM swms_templates WHERE company_id = ${companyId} AND title = '${title.replace(/'/g, "''")}'`)
      ) as unknown as [{ affectedRows: number }, unknown];
      if ((result as any).affectedRows > 0) {
        log.push(`Deleted junk row: "${title}"`);
      }
    }

    // Also delete any row with title = 'SWMS' (blank archived entry)
    const [blankResult] = await db.execute(
      sql.raw(`DELETE FROM swms_templates WHERE company_id = ${companyId} AND TRIM(title) = 'SWMS'`)
    ) as unknown as [{ affectedRows: number }, unknown];
    if ((blankResult as any).affectedRows > 0) {
      log.push(`Deleted blank "SWMS" row`);
    }

    // 2. Rename "Review: 12 July 2026" → "Using Power Tools"
    const [renameResult] = await db.execute(
      sql.raw(`UPDATE swms_templates SET title = 'Using Power Tools' WHERE company_id = ${companyId} AND title = 'Review: 12 July 2026'`)
    ) as unknown as [{ affectedRows: number }, unknown];
    if ((renameResult as any).affectedRows > 0) {
      log.push(`Renamed "Review: 12 July 2026" → "Using Power Tools"`);
    }

    // 3. Report final count
    const [countRows] = await db.execute(
      sql.raw(`SELECT COUNT(*) as total, SUM(status = 'active') as active, SUM(status = 'draft') as draft, SUM(status = 'archived') as archived FROM swms_templates WHERE company_id = ${companyId}`)
    ) as unknown as [Array<{ total: number; active: number; draft: number; archived: number }>, unknown];

    return res.json({ ok: true, log, counts: countRows[0] });
  } catch (err) {
    console.error('POST /api/developer/swms-cleanup error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
