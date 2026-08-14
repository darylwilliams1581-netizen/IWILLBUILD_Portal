/**
 * POST /api/dazza/chat/stream
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical Dazza chat entrypoint — platform-owner-only, flag-aware.
 *
 * Routing:
 *   DAZZA_V3_ENABLED=true  → Dazza V3 (dazza-v3-brain.ts / streamDazzaV3)
 *   DAZZA_V3_ENABLED=false → V2 rollback (drayl/stream.ts / streamDazzaResponse)
 *
 * Security:
 *   - Unauthenticated            → 401
 *   - Authenticated non-owner   → 403
 *   - Platform owner             → allowed
 *
 * The flag is NEVER read in browser code. The server decides which engine runs.
 * V3 failures are surfaced as visible SSE errors — no silent fallback to V2.
 *
 * SSE event format:
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"tool_call","name":"...","status":"running"}
 *   data: {"type":"tool_result","name":"...","status":"done"}
 *   data: {"type":"done","engine":"v3","conversationId":"...","model":"...","toolsUsed":[]}
 *   data: {"type":"error","message":"..."}
 *
 * Body: { message: string, conversationId?: string }
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { isDazzaV3Enabled, streamDazzaV3 } from '../../../../lib/dazza-v3-brain.js';
import { loadDazzaContext } from '../../../../lib/drayl/context.js';
import { streamDazzaResponse } from '../../../../lib/drayl/stream.js';
import { getSecret } from '#airo/secrets';

function sseWrite(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth: platform owner only ────────────────────────────────────────────
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    if (!ownerInfo.isPlatformOwner) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Dazza chat is restricted to the IWILLBUILD platform owner.',
      });
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const { message, conversationId } = req.body as {
      message?: string;
      conversationId?: string;
    };
    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // ── Set SSE headers ──────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // ── Route to engine ──────────────────────────────────────────────────────
    const v3Enabled = isDazzaV3Enabled();
    console.log(`[dazza/stream] engine selected: ${v3Enabled ? 'v3' : 'v2-rollback'} | user=${ownerInfo.userId.slice(0, 8)}`);

    if (v3Enabled) {
      // ── V3 path ─────────────────────────────────────────────────────────
      await streamDazzaV3({
        ownerContext: {
          userId:          ownerInfo.userId,
          email:           ownerInfo.email,
          isPlatformOwner: ownerInfo.isPlatformOwner,
        },
        conversationId: conversationId ?? null,
        userMessage:    message.trim(),
        mode:           'chat',
        onToken:      (token)        => sseWrite(res, { type: 'token', content: token }),
        onToolCall:   (name, status) => sseWrite(res, { type: status === 'running' ? 'tool_call' : 'tool_result', name, status }),
        onDone:       (meta)         => sseWrite(res, { type: 'done', engine: 'v3', ...meta }),
        onError:      (msg)          => {
          // Ownership rejection — surface as a visible error (not a silent new conversation)
          const isForbidden = msg.startsWith('FORBIDDEN:');
          sseWrite(res, { type: 'error', message: msg, forbidden: isForbidden });
        },
      });

    } else {
      // ── V2 rollback (platform owner only) — V3 flag is off ──────────────
      const openAiKey = getSecret('OPENAI_API_KEY') ?? undefined;
      if (!openAiKey) {
        sseWrite(res, { type: 'error', message: 'OpenAI API key not configured. Set OPENAI_API_KEY.' });
        res.end();
        return;
      }

      // Build a minimal user object for the V2 context loader
      const v2User = {
        id:          ownerInfo.userId,
        companyId:   0,          // platform owner has no single company
        name:        'Daryl',
        email:       ownerInfo.email,
        role:        'owner' as const,
        permissions: {
          canViewJobs:       true,
          canViewFleet:      true,
          canViewForms:      true,
          canViewEstimating: true,
          canViewFiles:      true,
          canViewSafety:     true,
          seeDollars:        true,
          isAdmin:           true,
          isOwner:           true,
        },
      };

      const context = await loadDazzaContext(v2User);

      await streamDazzaResponse({
        apiKey:     openAiKey,
        model:      'gpt-4o',
        userMessage: message.trim(),
        context,
        companyId:  0,
        seeDollars: true,
        res,
      });

      // Append engine tag to the done event — V2 stream writes its own done event,
      // so we just note the rollback in a trailing system-info event.
      sseWrite(res, { type: 'system-info', engine: 'v2-rollback' });
    }

    res.end();

  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dazza/chat/stream] error:', msg);
    if (!res.headersSent) {
      return res.status(500).json({ error: msg });
    }
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      res.end();
    } catch { /* already closed */ }
  }
}
