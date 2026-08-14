/**
 * POST /api/dazza/v3/chat/stream
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza V3 — Owner-only streaming chat with full conversation continuity.
 *
 * SSE event format:
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"tool_call","name":"v3_list_companies","status":"running"}
 *   data: {"type":"tool_result","name":"v3_list_companies","status":"done"}
 *   data: {"type":"done","model":"gpt-4o","toolsUsed":[],"conversationId":"..."}
 *   data: {"type":"error","message":"..."}
 *
 * Body: { message: string, conversationId?: string, mode?: 'chat' | 'investigation' }
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { isDazzaV3Enabled, streamDazzaV3 } from '../../../../../lib/dazza-v3-brain.js';

function sseWrite(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req: Request, res: Response) {
  try {
    // Feature flag
    if (!isDazzaV3Enabled()) {
      return res.status(404).json({ error: 'Dazza V3 not enabled. Set DAZZA_V3_ENABLED=true.' });
    }

    // Owner-only auth
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { message, conversationId, mode } = req.body as {
      message?: string;
      conversationId?: string;
      mode?: 'chat' | 'investigation';
    };

    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    await streamDazzaV3({
      ownerContext: {
        userId: ownerInfo.userId,
        email: ownerInfo.email,
        isPlatformOwner: ownerInfo.isPlatformOwner,
      },
      conversationId: conversationId ?? null,
      userMessage: message.trim(),
      mode: mode ?? 'chat',
      onToken: (token) => sseWrite(res, { type: 'token', content: token }),
      onToolCall: (name, status) => sseWrite(res, { type: 'tool_call', name, status }),
      onDone: (meta) => sseWrite(res, { type: 'done', ...meta }),
      onError: (msg) => sseWrite(res, { type: 'error', message: msg }),
    });

    res.end();
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dazza/v3/chat/stream]', msg);
    if (!res.headersSent) return res.status(500).json({ error: msg });
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
    res.end();
  }
}
