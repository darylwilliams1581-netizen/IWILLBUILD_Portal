/**
 * PUT /api/owner-console/swms/masters/:id
 * Updates a platform master SWMS template.
 * Platform owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const body = req.body as {
      title?: string;
      category?: string;
      build_mode?: string;
      document_type?: string;
      status?: string;
      revision_number?: string;
      author_name?: string;
      approved_by_name?: string;
      swms_body?: Record<string, unknown>;
    };

    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const setClauses: string[] = ['updated_at = NOW()'];

    if (body.title !== undefined)            setClauses.push(`title = '${safe(body.title)}'`);
    if (body.category !== undefined)         setClauses.push(`category = ${body.category ? `'${safe(body.category)}'` : 'NULL'}`);
    if (body.build_mode !== undefined)       setClauses.push(`build_mode = '${safe(body.build_mode)}'`);
    if (body.document_type !== undefined)    setClauses.push(`document_type = '${safe(body.document_type)}'`);
    if (body.status !== undefined)           setClauses.push(`status = '${safe(body.status)}'`);
    if (body.revision_number !== undefined)  setClauses.push(`revision_number = '${safe(body.revision_number)}'`);
    if (body.author_name !== undefined)      setClauses.push(`author_name = ${body.author_name ? `'${safe(body.author_name)}'` : 'NULL'}`);
    if (body.approved_by_name !== undefined) setClauses.push(`approved_by_name = ${body.approved_by_name ? `'${safe(body.approved_by_name)}'` : 'NULL'}`);
    if (body.swms_body !== undefined)        setClauses.push(`swms_body = '${safe(JSON.stringify(body.swms_body))}'`);

    await db.execute(sql.raw(
      `UPDATE swms_templates SET ${setClauses.join(', ')} WHERE id = ${id} AND is_platform_master = 1`
    ));

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM swms_templates WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ master: rows?.[0] ?? { id } });
  } catch (err) {
    console.error('PUT /api/owner-console/swms/masters/:id error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
