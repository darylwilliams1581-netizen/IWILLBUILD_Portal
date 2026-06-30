/**
 * POST /api/documents/:id/share
 * ─────────────────────────────────────────────────────────────────────────────
 * Create a new share token for a document.
 * Body: { shareMode: 'view'|'download'|'complete'|'sign', expiryDays?: number, maxUses?: number }
 * Returns the raw token (shown once — never stored in DB).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getDocument, createShare, logEvent } from '../../../../lib/document-engine.js';
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

    const {
      shareMode = 'view',
      expiryDays = 30,
      maxUses = null,
    } = req.body as { shareMode?: ShareMode; expiryDays?: number; maxUses?: number | null };

    const validModes: ShareMode[] = ['view', 'download', 'complete', 'sign'];
    if (!validModes.includes(shareMode)) {
      return res.status(400).json({ error: 'Invalid shareMode' });
    }

    const { rawToken, expiresAt } = await createShare({
      documentId: id,
      companyId: profile.companyId,
      shareMode,
      expiryDays,
      maxUses,
      createdByUserId: session.user.id,
    });

    await logEvent(id, profile.companyId, 'share_created', {
      eventNote: `Share link created (mode: ${shareMode})`,
      userId: session.user.id,
      ipAddress: req.ip ?? null,
    });

    return res.status(201).json({
      token: rawToken,
      shareMode,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error('POST /api/documents/:id/share error:', err);
    res.status(500).json({ error: 'Failed to create share link' });
  }
}
