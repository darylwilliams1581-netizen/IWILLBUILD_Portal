/**
 * POST /api/dazza/builder/chat/stream
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza Builder Assistant — owner-only SSE streaming chat.
 *
 * SSE events:
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"tool_call","name":"...","status":"running"|"done"}
 *   data: {"type":"status","phase":"...","label":"..."}
 *   data: {"type":"proposed_change","change":{...}}
 *   data: {"type":"done","model":"...","toolsUsed":[],"conversationId":"..."}
 *   data: {"type":"error","message":"..."}
 *
 * Body: {
 *   message: string,
 *   conversationId?: string,
 *   builderContext: BuilderContext,
 * }
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { streamBuilderAssistant } from '../../../../../lib/dazza-builder-brain.js';
import type { BuilderContext } from '../../../../../lib/dazza-builder-brain.js';

function sseWrite(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req: Request, res: Response) {
  try {
    // Owner-only auth
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { message, conversationId, builderContext } = req.body as {
      message?: string;
      conversationId?: string;
      builderContext?: BuilderContext;
    };

    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
    if (!builderContext) return res.status(400).json({ error: 'builderContext is required' });

    // Validate builderContext shape
    if (!['document', 'form'].includes(builderContext.builderType)) {
      return res.status(400).json({ error: 'builderContext.builderType must be "document" or "form"' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    await streamBuilderAssistant({
      ownerContext: {
        userId: ownerInfo.userId,
        email: ownerInfo.email,
        isPlatformOwner: ownerInfo.isPlatformOwner,
      },
      conversationId: conversationId ?? null,
      userMessage: message.trim(),
      builderContext,
      onToken: (token) => sseWrite(res, { type: 'token', content: token }),
      onToolCall: (name, status) => sseWrite(res, { type: 'tool_call', name, status }),
      onStatus: (phase, label) => sseWrite(res, { type: 'status', phase, label }),
      onProposedChange: (change) => sseWrite(res, { type: 'proposed_change', change }),
      onDone: (meta) => {
        sseWrite(res, { type: 'done', ...meta });
        res.end();
      },
      onError: (message, cid) => {
        sseWrite(res, { type: 'error', message, conversationId: cid });
        res.end();
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      res.end();
    }
  }
}
