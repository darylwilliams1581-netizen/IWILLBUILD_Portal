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
 *   data: {"type":"status","phase":"thinking","label":"Dazza is thinking…"}
 *   data: {"type":"heartbeat","elapsedMs":10000}
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
import {
  resolveAndExtractEvidence,
  linkAttachmentToMessage,
  DAZZA_ATTACHMENT_MAX_PER_QUESTION,
} from '../../../../lib/dazza-attachment-service.js';
import { setSseHeaders, openSseSession } from '../../../../lib/sse-session.js';

export default async function handler(req: Request, res: Response) {
  // ── Auth: platform owner only ──────────────────────────────────────────────
  // These checks must happen before SSE headers are opened so that 401/403
  // can be returned as plain JSON responses.
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

  // ── Parse body ─────────────────────────────────────────────────────────────
  const {
    message,
    conversationId,
    attachmentIds,
    mode: rawMode,
    builderCaseId,
    attachmentAction: rawAttachmentAction,
  } = req.body as {
    message?: string;
    conversationId?: string;
    attachmentIds?: string[];
    mode?: string;
    builderCaseId?: string;
    attachmentAction?: string;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  // Validate mode — only accepted values are forwarded
  const VALID_MODES = ['chat', 'investigation', 'bug_analysis', 'build_repair'] as const;
  type DazzaMode = typeof VALID_MODES[number];
  const mode: DazzaMode = (VALID_MODES as readonly string[]).includes(rawMode ?? '')
    ? (rawMode as DazzaMode)
    : 'chat';

  // Validate attachmentAction — only accepted values are forwarded
  const VALID_ATTACHMENT_ACTIONS = ['read_only', 'analyse', 'repair_case'] as const;
  type AttachmentAction = typeof VALID_ATTACHMENT_ACTIONS[number];
  const attachmentAction: AttachmentAction = (
    VALID_ATTACHMENT_ACTIONS as readonly string[]
  ).includes(rawAttachmentAction ?? '')
    ? (rawAttachmentAction as AttachmentAction)
    : 'read_only';

  // Validate attachmentIds
  const safeAttachmentIds: string[] = [];
  if (Array.isArray(attachmentIds)) {
    for (const id of attachmentIds.slice(0, DAZZA_ATTACHMENT_MAX_PER_QUESTION)) {
      if (typeof id === 'string' && id.trim().length > 0) {
        safeAttachmentIds.push(id.trim());
      }
    }
  }

  // ── Open SSE connection ────────────────────────────────────────────────────
  setSseHeaders(res);
  const session = openSseSession(res);

  try {
    // ── Initial status event — sent immediately so the client knows the
    //    connection is open before any attachment resolution or AI work begins.
    session.write({ type: 'status', phase: 'connecting', label: 'Connecting to Dazza…' });

    // ── Resolve attachments server-side (re-authorise every ID) ───────────────
    let untrustedEvidence = null;
    if (safeAttachmentIds.length > 0) {
      session.write({ type: 'attachment_status', status: 'reading', count: safeAttachmentIds.length });
      try {
        const { evidence, errors } = await resolveAndExtractEvidence(
          safeAttachmentIds,
          ownerInfo.userId,
        );
        untrustedEvidence = evidence;
        if (errors.length > 0) {
          console.warn('[dazza/stream] attachment resolution errors:', errors);
        }
        if (evidence.excerpts.length > 0) {
          session.write({ type: 'attachment_status', status: 'ready', count: evidence.excerpts.length });
        }
      } catch (attachErr) {
        console.error('[dazza/stream] attachment resolution failed:', attachErr);
        // Non-fatal — proceed without attachments rather than blocking the chat
        session.write({ type: 'attachment_status', status: 'failed' });
      }
    }

    // ── Route to engine ────────────────────────────────────────────────────────
    const v3Enabled = isDazzaV3Enabled();
    console.log(
      `[dazza/stream] engine selected: ${v3Enabled ? 'v3' : 'v2-rollback'} | user=${ownerInfo.userId.slice(0, 8)}`,
    );

    if (v3Enabled) {
      // ── V3 path ──────────────────────────────────────────────────────────────
      // conversationId is resolved inside streamDazzaV3 — capture it so we
      // can include it in error events (enables conversation restoration after
      // a failed request).
      let resolvedConversationId: string | null = conversationId ?? null;

      await streamDazzaV3({
        ownerContext: {
          userId:          ownerInfo.userId,
          email:           ownerInfo.email,
          isPlatformOwner: ownerInfo.isPlatformOwner,
        },
        conversationId:    conversationId ?? null,
        userMessage:       message.trim(),
        mode:
          mode === 'build_repair'   ? 'build_repair'   :
          mode === 'investigation'  ? 'investigation'  :
          mode === 'bug_analysis'   ? 'bug_analysis'   :
          'chat',
        builderCaseId:     builderCaseId?.trim() ?? undefined,
        attachmentAction:  safeAttachmentIds.length > 0 ? attachmentAction : undefined,
        untrustedEvidence: untrustedEvidence ?? undefined,

        onToken:    (token)        => session.write({ type: 'token', content: token }),
        onToolCall: (name, status) => session.write({
          type: status === 'running' ? 'tool_call' : 'tool_result',
          name,
          status,
        }),
        onDone: (meta) => {
          resolvedConversationId = meta.conversationId;
          // Link attachments to the message now that we have the conversation ID
          if (safeAttachmentIds.length > 0 && meta.conversationId) {
            const msgId = `msg_${Date.now()}`;
            for (const aid of safeAttachmentIds) {
              void linkAttachmentToMessage(aid, meta.conversationId, msgId);
            }
          }
          session.done({ type: 'done', engine: 'v3', ...meta });
        },
        onError: (msg, errConvId) => {
          const isForbidden = msg.startsWith('FORBIDDEN:');
          const convId = errConvId ?? resolvedConversationId;
          session.error(msg, {
            forbidden: isForbidden || undefined,
            ...(convId ? { conversationId: convId } : {}),
          });
        },
        // Safe operational status — never includes prompts, reasoning or secrets
        onStatus:    (phase, label) => session.write({ type: 'status', phase, label }),
        // Heartbeat every 10 s so the client can detect stalled requests
        onHeartbeat: (elapsedMs)   => session.write({ type: 'heartbeat', elapsedMs }),
      });

    } else {
      // ── V3 is disabled — surface a visible configuration fault ─────────────
      // Do NOT silently fall back to V2 for the owner route.
      // The owner must know V3 is unavailable so the secret can be fixed.
      session.error(
        'Dazza V3 unavailable — secret/configuration fault. Set DAZZA_V3_ENABLED=true in Airo Secrets to activate V3.',
        { configFault: true },
      );
    }

  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dazza/chat/stream] error:', msg);
    session.error(msg, conversationId ? { conversationId } : undefined);
  } finally {
    session.close();
  }
}
