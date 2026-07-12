/**
 * POST /api/owner-console/swms/push
 *
 * Platform-owner only. Inserts or replaces a structured SWMS (with swms_body)
 * into swms_templates for every active company, or a specific company_id.
 *
 * Body (JSON):
 *   {
 *     company_id?: number,   // omit to push to ALL companies
 *     replace?: boolean,     // if true, UPDATE existing record with same title
 *     swms: { ...SwmsBodyData }
 *   }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  try {
    const body = req.body as {
      company_id?: number;
      replace?: boolean;
      swms: Record<string, unknown>;
    };

    const { swms, replace = false } = body;
    if (!swms || typeof swms !== 'object') {
      return res.status(400).json({ error: 'swms body is required' });
    }

    const title = (swms.title as string)?.trim();
    if (!title) return res.status(400).json({ error: 'swms.title is required' });

    const swmsBodyJson = JSON.stringify(swms);
    const buildMode = (swms.buildMode as string) ?? 'advanced';
    const documentType = (swms.documentType as string) ?? 'swms';
    const category = (swms.category as string) ?? null;
    const revisionNumber = (swms.revisionNumber as string) ?? '1';
    const reviewDate = (swms.reviewDate as string) || null;
    const authorName = (swms.authorName as string) ?? null;
    const approvedByName = (swms.approvedByName as string) ?? null;
    const status = (swms.status as string) ?? 'active';

    // Determine target companies
    let companyIds: number[] = [];
    if (body.company_id) {
      companyIds = [body.company_id];
    } else {
      const [rows] = await db.execute(sql.raw(
        `SELECT id FROM companies WHERE status <> 'archived' ORDER BY id`
      )) as unknown as [Array<{ id: number }>, unknown];
      companyIds = (rows ?? []).map((r) => r.id);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const companyId of companyIds) {
      // Check if a record with this title already exists for this company
      const [existing] = await db.execute(sql.raw(
        `SELECT id FROM swms_templates WHERE company_id = ${companyId} AND title = ${JSON.stringify(title)} LIMIT 1`
      )) as unknown as [Array<{ id: number }>, unknown];

      const existingId = existing?.[0]?.id;

      const safeTitle          = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeCategory       = category ? `'${category.replace(/'/g, "\\'")}'` : 'NULL';
      const safeRevision       = revisionNumber.replace(/'/g, "\\'");
      const safeReviewDate     = reviewDate ? `'${reviewDate}'` : 'NULL';
      const safeAuthor         = authorName ? `'${authorName.replace(/'/g, "\\'")}'` : 'NULL';
      const safeApproved       = approvedByName ? `'${approvedByName.replace(/'/g, "\\'")}'` : 'NULL';
      const safeStatus         = status.replace(/'/g, "\\'");
      const safeBuildMode      = buildMode.replace(/'/g, "\\'");
      const safeDocumentType   = documentType.replace(/'/g, "\\'");
      const safeSwmsBody       = swmsBodyJson.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      if (existingId && replace) {
        await db.execute(sql.raw(`
          UPDATE swms_templates SET
            category       = ${safeCategory},
            revision_number = '${safeRevision}',
            review_date    = ${safeReviewDate},
            author_name    = ${safeAuthor},
            approved_by_name = ${safeApproved},
            status         = '${safeStatus}',
            build_mode     = '${safeBuildMode}',
            document_type  = '${safeDocumentType}',
            swms_body      = '${safeSwmsBody}',
            updated_at     = NOW()
          WHERE id = ${existingId}
        `));
        updated++;
      } else if (existingId && !replace) {
        skipped++;
      } else {
        await db.execute(sql.raw(`
          INSERT INTO swms_templates
            (company_id, title, category, revision_number, review_date,
             author_name, approved_by_name, status,
             build_mode, document_type, swms_body,
             created_at, updated_at)
          VALUES (
            ${companyId},
            '${safeTitle}',
            ${safeCategory},
            '${safeRevision}',
            ${safeReviewDate},
            ${safeAuthor},
            ${safeApproved},
            '${safeStatus}',
            '${safeBuildMode}',
            '${safeDocumentType}',
            '${safeSwmsBody}',
            NOW(), NOW()
          )
        `));
        inserted++;
      }
    }

    return res.json({
      ok: true,
      companies: companyIds.length,
      inserted,
      updated,
      skipped,
    });
  } catch (err) {
    console.error('POST /api/owner-console/swms/push error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
