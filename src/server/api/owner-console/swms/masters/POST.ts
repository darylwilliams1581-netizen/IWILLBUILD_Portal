/**
 * POST /api/owner-console/swms/masters
 * Creates a new platform master SWMS template.
 * Body: { title, category?, build_mode?, document_type?, status?, swms_body? }
 * Platform owner only.
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
      title: string;
      category?: string;
      build_mode?: string;
      document_type?: string;
      status?: string;
      revision_number?: string;
      author_name?: string;
      approved_by_name?: string;
      swms_body?: Record<string, unknown>;
    };

    const title = body.title?.trim();
    if (!title) return res.status(400).json({ error: 'title is required' });

    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const category       = body.category       ? `'${safe(body.category)}'`       : 'NULL';
    const buildMode      = body.build_mode      ? `'${safe(body.build_mode)}'`      : "'quick'";
    const documentType   = body.document_type   ? `'${safe(body.document_type)}'`   : "'swms'";
    const status         = body.status          ? `'${safe(body.status)}'`          : "'draft'";
    const revisionNumber = body.revision_number ? `'${safe(body.revision_number)}'` : "'1'";
    const authorName     = body.author_name     ? `'${safe(body.author_name)}'`     : 'NULL';
    const approvedBy     = body.approved_by_name ? `'${safe(body.approved_by_name)}'` : 'NULL';
    const swmsBodyJson   = body.swms_body ? `'${safe(JSON.stringify(body.swms_body))}'` : 'NULL';

    const [result] = await db.execute(sql.raw(`
      INSERT INTO swms_templates
        (company_id, is_platform_master, title, category, build_mode, document_type,
         status, revision_number, author_name, approved_by_name, swms_body,
         created_at, updated_at)
      VALUES
        (NULL, 1, '${safe(title)}', ${category}, ${buildMode}, ${documentType},
         ${status}, ${revisionNumber}, ${authorName}, ${approvedBy}, ${swmsBodyJson},
         NOW(), NOW())
    `)) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as { insertId: number }).insertId;

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM swms_templates WHERE id = ${insertId} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.status(201).json({ master: rows?.[0] ?? { id: insertId } });
  } catch (err) {
    console.error('POST /api/owner-console/swms/masters error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
