/**
 * DELETE /api/documents/:id/share
 * ─────────────────────────────────────────────────────────────────────────────
 * Revoke all active share links for a document.
 * Query: ?mode=view|download|complete|sign (optional — revokes all if omitted)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getDocument, revokeShare, logEvent } from '../../../../lib/document-engine.js';
import type { ShareMode } from '../../../../lib/document-engine.js';

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

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const document = await getDocument(profile.companyId, id);
    if (!document) return res.status(404).json({ error: 'Document not found' });

    const mode = req.query.mode as ShareMode | undefined;

    await revokeShare(id, profile.companyId, mode);
    await logEvent(id, profile.companyId, 'share_revoked', {
      eventNote: mode ? `Share link revoked (mode: ${mode})` : 'All share links revoked',
      userId: session.user.id,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/documents/:id/share error:', err);
    res.status(500).json({ error: 'Failed to revoke share link' });
  }
}
