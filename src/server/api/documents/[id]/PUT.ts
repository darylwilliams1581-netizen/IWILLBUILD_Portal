/**
 * PUT /api/documents/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Update a document's title, status, or lock state.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getDocument, updateDocument, logEvent } from '../../../lib/document-engine.js';

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

    const { title, status, isLocked } = req.body as {
      title?: string;
      status?: string;
      isLocked?: boolean;
    };

    await updateDocument(profile.companyId, id, {
      title,
      status,
      isLocked,
      lockedAt: isLocked === true ? new Date() : isLocked === false ? null : undefined,
      completedAt: status === 'completed' || status === 'submitted' ? new Date() : undefined,
      updatedByUserId: session.user.id,
    });

    if (status && status !== document.status) {
      await logEvent(id, profile.companyId, 'status_changed', {
        eventNote: `Status changed from ${document.status} to ${status}`,
        userId: session.user.id,
      });
    }
    if (isLocked === true && !document.isLocked) {
      await logEvent(id, profile.companyId, 'locked', { userId: session.user.id });
    }
    if (isLocked === false && document.isLocked) {
      await logEvent(id, profile.companyId, 'unlocked', { userId: session.user.id });
    }

    const updated = await getDocument(profile.companyId, id);
    return res.json({ document: updated });
  } catch (err) {
    console.error('PUT /api/documents/:id error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
}
