/**
 * POST /api/owner-console/swms/masters/publish-all
 * Publishes ALL platform master templates to all active companies.
 * Body: { replace?: boolean }
 * Platform owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  try {
    const body = req.body as { replace?: boolean };
    const replace = body.replace === true;

    const [masterRows] = await db.execute(sql.raw(
      `SELECT * FROM swms_templates WHERE is_platform_master = 1 ORDER BY id`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const masters = masterRows ?? [];
    if (masters.length === 0) {
      return res.json({ ok: true, masters: 0, companies: 0, inserted: 0, updated: 0, skipped: 0 });
    }

    const [companyRows] = await db.execute(sql.raw(
      `SELECT id FROM companies WHERE status != 'archived' ORDER BY id`
    )) as unknown as [Array<{ id: number }>, unknown];
    const companyIds = (companyRows ?? []).map((r) => r.id);

    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    let totalInserted = 0;
    let totalUpdated  = 0;
    let totalSkipped  = 0;

    for (const master of masters) {
      const masterId     = master.id as number;
      const title        = String(master.title ?? '');
      const category     = master.category       ? `'${safe(String(master.category))}'`       : 'NULL';
      const buildMode    = master.build_mode      ? `'${safe(String(master.build_mode))}'`      : "'quick'";
      const documentType = master.document_type   ? `'${safe(String(master.document_type))}'`   : "'swms'";
      const status       = master.status          ? `'${safe(String(master.status))}'`          : "'draft'";
      const revision     = master.revision_number ? `'${safe(String(master.revision_number))}'` : "'1'";
      const author       = master.author_name     ? `'${safe(String(master.author_name))}'`     : 'NULL';
      const approved     = master.approved_by_name ? `'${safe(String(master.approved_by_name))}'` : 'NULL';
      const swmsBody     = master.swms_body       ? `'${safe(String(master.swms_body))}'`       : 'NULL';

      for (const companyId of companyIds) {
        const [existing] = await db.execute(sql.raw(
          `SELECT id FROM swms_templates WHERE company_id = ${companyId} AND title = ${JSON.stringify(title)} AND is_platform_master = 0 LIMIT 1`
        )) as unknown as [Array<{ id: number }>, unknown];

        const existingId = existing?.[0]?.id;

        if (existingId && replace) {
          await db.execute(sql.raw(`
            UPDATE swms_templates SET
              category = ${category}, build_mode = ${buildMode},
              document_type = ${documentType}, status = ${status},
              revision_number = ${revision}, author_name = ${author},
              approved_by_name = ${approved}, swms_body = ${swmsBody},
              source_master_id = ${masterId}, updated_at = NOW()
            WHERE id = ${existingId}
          `));
          totalUpdated++;
        } else if (existingId) {
          totalSkipped++;
        } else {
          await db.execute(sql.raw(`
            INSERT INTO swms_templates
              (company_id, is_platform_master, source_master_id, title, category,
               build_mode, document_type, status, revision_number,
               author_name, approved_by_name, swms_body, created_at, updated_at)
            VALUES (
              ${companyId}, 0, ${masterId}, '${safe(title)}', ${category},
              ${buildMode}, ${documentType}, ${status}, ${revision},
              ${author}, ${approved}, ${swmsBody}, NOW(), NOW()
            )
          `));
          totalInserted++;
        }
      }
    }

    return res.json({
      ok: true,
      masters: masters.length,
      companies: companyIds.length,
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: totalSkipped,
    });
  } catch (err) {
    console.error('POST /api/owner-console/swms/masters/publish-all error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
