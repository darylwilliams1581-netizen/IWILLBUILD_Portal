/**
 * POST /api/owner-console/swms/masters/:id/publish
 *
 * Copies a platform master SWMS into every active company's library.
 * If a company already has a template with the same title:
 *   - replace=false (default): skip
 *   - replace=true: update swms_body + metadata
 *
 * Body: { replace?: boolean, company_id?: number }
 *   company_id: push to a single company only (omit for all)
 *
 * Platform owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const masterId = parseInt(req.params.id, 10);
  if (!masterId) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Load the master
    const [masterRows] = await db.execute(sql.raw(
      `SELECT * FROM swms_templates WHERE id = ${masterId} AND is_platform_master = 1 LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const master = masterRows?.[0];
    if (!master) return res.status(404).json({ error: 'Master template not found' });

    const body = req.body as { replace?: boolean; company_id?: number };
    const replace = body.replace === true;

    // Determine target companies
    let companyIds: number[] = [];
    if (body.company_id) {
      companyIds = [body.company_id];
    } else {
      const [rows] = await db.execute(sql.raw(
        `SELECT id FROM companies ORDER BY id`
      )) as unknown as [Array<{ id: number }>, unknown];
      companyIds = (rows ?? []).map((r) => r.id);
    }

    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const title          = String(master.title ?? '');
    const category       = master.category       ? `'${safe(String(master.category))}'`       : 'NULL';
    const buildMode      = master.build_mode      ? `'${safe(String(master.build_mode))}'`      : "'quick'";
    const documentType   = master.document_type   ? `'${safe(String(master.document_type))}'`   : "'swms'";
    const status         = master.status          ? `'${safe(String(master.status))}'`          : "'draft'";
    const revisionNumber = master.revision_number ? `'${safe(String(master.revision_number))}'` : "'1'";
    const authorName     = master.author_name     ? `'${safe(String(master.author_name))}'`     : 'NULL';
    const approvedBy     = master.approved_by_name ? `'${safe(String(master.approved_by_name))}'` : 'NULL';
    const swmsBody       = master.swms_body       ? `'${safe(String(master.swms_body))}'`       : 'NULL';

    let inserted = 0;
    let updated  = 0;
    let skipped  = 0;

    for (const companyId of companyIds) {
      const [existing] = await db.execute(sql.raw(
        `SELECT id FROM swms_templates WHERE company_id = ${companyId} AND title = ${JSON.stringify(title)} AND is_platform_master = 0 LIMIT 1`
      )) as unknown as [Array<{ id: number }>, unknown];

      const existingId = existing?.[0]?.id;

      if (existingId && replace) {
        await db.execute(sql.raw(`
          UPDATE swms_templates SET
            category          = ${category},
            build_mode        = ${buildMode},
            document_type     = ${documentType},
            status            = ${status},
            revision_number   = ${revisionNumber},
            author_name       = ${authorName},
            approved_by_name  = ${approvedBy},
            swms_body         = ${swmsBody},
            source_master_id  = ${masterId},
            updated_at        = NOW()
          WHERE id = ${existingId}
        `));
        updated++;
      } else if (existingId) {
        skipped++;
      } else {
        await db.execute(sql.raw(`
          INSERT INTO swms_templates
            (company_id, is_platform_master, source_master_id, title, category,
             build_mode, document_type, status, revision_number,
             author_name, approved_by_name, swms_body, created_at, updated_at)
          VALUES (
            ${companyId}, 0, ${masterId}, '${safe(title)}', ${category},
            ${buildMode}, ${documentType}, ${status}, ${revisionNumber},
            ${authorName}, ${approvedBy}, ${swmsBody}, NOW(), NOW()
          )
        `));
        inserted++;
      }
    }

    return res.json({
      ok: true,
      masterId,
      title,
      companies: companyIds.length,
      inserted,
      updated,
      skipped,
    });
  } catch (err) {
    console.error(`POST /api/owner-console/swms/masters/${req.params.id}/publish error:`, err);
    return res.status(500).json({ error: String(err) });
  }
}
