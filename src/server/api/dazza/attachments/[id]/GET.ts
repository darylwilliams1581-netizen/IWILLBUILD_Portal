/**
 * GET /api/dazza/attachments/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolve attachment metadata for the authenticated platform owner.
 *
 * Security:
 *   - Unauthenticated            → 401
 *   - Authenticated non-owner   → 403
 *   - Cross-owner attachment ID → 403
 *   - Not found                  → 404
 *
 * Returns safe metadata only — never the raw file contents or storage URL.
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { resolveAttachment } from '../../../../lib/dazza-attachment-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    if (!ownerInfo.isPlatformOwner) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { id } = req.params;
    if (!id?.trim()) {
      return res.status(400).json({ error: 'id is required' });
    }

    const record = await resolveAttachment(id, ownerInfo.userId);
    if (!record) {
      // Return 403 for cross-owner IDs (don't reveal existence)
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.json({
      id: record.id,
      safeFilename: record.safe_filename,
      mimeType: record.mime_type,
      byteLength: record.byte_length,
      sha256: record.sha256,
      conversationId: record.conversation_id,
      trustClassification: record.trust_classification,
      parserVersion: record.parser_version,
      createdAt: record.created_at,
    });

  } catch (err) {
    console.error('[dazza/attachments/:id] error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
