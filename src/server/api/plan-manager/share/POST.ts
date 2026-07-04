/**
 * POST /api/plan-manager/share
 * Generate a view-only share token for a drawing.
 * Body: { drawingId, revisionId?, expiryDays? }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

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

    const { drawingId, revisionId, expiryDays = 30 } = req.body as {
      drawingId: number;
      revisionId?: number | null;
      expiryDays?: number;
    };

    if (!drawingId) return res.status(400).json({ error: 'drawingId required' });

    // Verify drawing belongs to company
    const [drawingRows] = await db.execute(sql`
      SELECT id FROM project_drawings WHERE id = ${drawingId} AND company_id = ${profile.companyId} AND status = 'active' LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (!drawingRows?.length) return res.status(404).json({ error: 'Drawing not found' });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + expiryDays * 86400000);

    await db.execute(sql`
      INSERT INTO drawing_share_tokens (drawing_id, company_id, revision_id, token_hash, expires_at, scope, created_by)
      VALUES (${drawingId}, ${profile.companyId}, ${revisionId ?? null}, ${tokenHash}, ${expiresAt.toISOString().slice(0, 19).replace('T', ' ')}, 'view', ${session.user.id})
    `);

    await db.execute(sql`
      INSERT INTO drawing_audit_log (drawing_id, actor_id, action, details_json)
      VALUES (${drawingId}, ${session.user.id}, 'share_created', ${JSON.stringify({ expiryDays, revisionId: revisionId ?? null })})
    `);

    const origin = req.headers.origin ?? `https://${req.headers.host}`;
    res.json({
      token,
      url: `${origin}/studio/plan-manager/share/${token}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('POST share error:', err);
    res.status(500).json({ error: 'Failed to create share link' });
  }
}
