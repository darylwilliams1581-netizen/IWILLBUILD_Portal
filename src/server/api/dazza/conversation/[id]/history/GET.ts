/**
 * GET /api/dazza/conversation/:id/history
 * Platform-owner only.
 * Returns the ordered message history for a V3 conversation.
 * Enforces ownership — only the owner who created the conversation may read it.
 * Never returns system messages or tool call internals.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const ownerInfo = await getPlatformOwnerInfo(req);
  if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
  if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'forbidden' });

  const { id: conversationId } = req.params as { id: string };
  if (!conversationId?.trim()) {
    return res.status(400).json({ error: 'conversationId required' });
  }

  const safeId = conversationId.replace(/'/g, "''");

  // Verify ownership — the conversation must belong to this platform owner
  const [ownerRows] = await db.execute(sql.raw(`
    SELECT DISTINCT owner_user_id FROM dazza_v3_conversations
    WHERE conversation_id = '${safeId}'
    LIMIT 1
  `)) as unknown as [Array<{ owner_user_id: string }>, unknown];

  if (!ownerRows?.length) {
    // No conversation found — return empty (not 404, to avoid leaking existence)
    return res.json({ messages: [], conversationId });
  }

  if (ownerRows[0].owner_user_id !== ownerInfo.userId) {
    // Ownership mismatch — return 403 without leaking details
    return res.status(403).json({ error: 'forbidden' });
  }

  // Load user + assistant messages in order (exclude system/tool messages)
  const [rows] = await db.execute(sql.raw(`
    SELECT role, content, turn_index
    FROM dazza_v3_conversations
    WHERE conversation_id = '${safeId}'
      AND role IN ('user', 'assistant')
    ORDER BY turn_index ASC
    LIMIT 200
  `)) as unknown as [Array<{ role: string; content: string; turn_index: number }>, unknown];

  const messages = (rows ?? []).map(r => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  return res.json({ messages, conversationId });
}
