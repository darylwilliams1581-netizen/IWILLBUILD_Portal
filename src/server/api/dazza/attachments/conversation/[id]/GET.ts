/**
 * GET /api/dazza/attachments/conversation/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * List attachment metadata for a conversation (for UI restore on refresh).
 * Returns safe metadata only — never raw file contents.
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { loadConversationAttachments } from '../../../../../lib/dazza-attachment-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'forbidden' });

    const { id } = req.params;
    if (!id?.trim()) return res.status(400).json({ error: 'id is required' });

    const attachments = await loadConversationAttachments(id, ownerInfo.userId);

    return res.json({ attachments });
  } catch (err) {
    console.error('[dazza/attachments/conversation/:id] error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
