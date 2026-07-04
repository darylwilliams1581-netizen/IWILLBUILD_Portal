/**
 * GET /api/plan-manager/share/validate?token=
 * Public endpoint — validates a share token and returns drawing metadata.
 * No auth required.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.query as { token?: string };
    if (!token || token.length < 32) return res.status(400).json({ error: 'Invalid token' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [tokenRows] = await db.execute(sql`
      SELECT dst.id, dst.drawing_id, dst.revision_id, dst.expires_at, dst.revoked, dst.scope,
             pd.title, pd.source_file_path, pd.source_file_name, pd.page_count, pd.company_id,
             dr.revision_no, dr.name AS revision_name, dr.locked
      FROM drawing_share_tokens dst
      JOIN project_drawings pd ON pd.id = dst.drawing_id
      LEFT JOIN drawing_revisions dr ON dr.id = COALESCE(dst.revision_id, pd.current_revision_id)
      WHERE dst.token_hash = ${tokenHash} LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    const t = tokenRows[0];
    if (t.revoked) return res.status(410).json({ error: 'This link has been revoked' });
    if (t.expires_at && new Date(String(t.expires_at)) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    // Resolve revision ID
    const revisionId = (t.revision_id as number | null) ?? null;
    const drawingId  = t.drawing_id as number;

    // Get annotations for all pages (view-only)
    const [annotations] = await db.execute(sql`
      SELECT id, page_no, type, geometry_json, style_json, label
      FROM drawing_annotations
      WHERE drawing_id = ${drawingId}
        AND revision_id = COALESCE(${revisionId}, (SELECT current_revision_id FROM project_drawings WHERE id = ${drawingId}))
      ORDER BY page_no ASC, created_at ASC
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({
      drawing: {
        id: t.drawing_id,
        title: t.title,
        source_file_path: t.source_file_path,
        source_file_name: t.source_file_name,
        page_count: t.page_count,
        revision_no: t.revision_no,
        revision_name: t.revision_name,
        locked: t.locked,
      },
      annotations: annotations ?? [],
      scope: t.scope,
      expiresAt: t.expires_at,
    });
  } catch (err) {
    console.error('GET share/validate error:', err);
    res.status(500).json({ error: 'Failed to validate share link' });
  }
}
