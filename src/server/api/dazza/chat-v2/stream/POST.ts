/**
 * POST /api/dazza/chat-v2/stream
 * ─────────────────────────────────────────────────────────────────────────────
 * Streaming Dazza AI chat — SSE response with tool-use.
 *
 * Same security guarantees as chat-v2/POST.ts:
 *   - Session auth required
 *   - permDazzaAi checked
 *   - companyId from session only
 *   - seeDollars enforced
 *   - Audit logged
 *
 * SSE event stream format:
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"tool_call","name":"lookup_jobs","status":"running"}
 *   data: {"type":"tool_result","name":"lookup_jobs","status":"done"}
 *   data: {"type":"done","mode":"ai","usedOpenAI":true,"model":"gpt-4o"}
 *   data: {"type":"error","message":"..."}
 *
 * Falls back to non-streaming JSON if no AI key is configured.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';
import { derivePermissions } from '../../../../lib/dazza-context.js';
import { wall10_auditLog, wall11_getSubscriptionStatus } from '../../../../lib/dazza-walls.js';
import { loadDazzaContext } from '../../../../lib/drayl/context.js';
import { streamDazzaResponse, streamClaudeResponse } from '../../../../lib/drayl/stream.js';
import { handleDazzaChat } from '../../../../lib/drayl/drayl.js';
import type { DazzaChatInput } from '../../../../lib/drayl/types.js';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const permissions = derivePermissions(profile);
    if (!permissions.canDazzaAi) {
      return res.status(403).json({ error: 'Dazza AI not enabled for your account' });
    }

    // ── Subscription wall ────────────────────────────────────────────────────
    const subscriptionStatus = await wall11_getSubscriptionStatus(profile.companyId);
    const isViewOnly = !permissions.isOwner && (
      subscriptionStatus === 'trial_expired' ||
      subscriptionStatus === 'cancelled' ||
      subscriptionStatus === 'suspended'
    );
    if (isViewOnly) {
      return res.status(403).json({
        error: `Your account is in view-only mode (${subscriptionStatus ?? 'unknown'}). Dazza AI requires an active subscription.`,
      });
    }

    // ── Parse request ────────────────────────────────────────────────────────
    const { message, gstRate } = req.body as { message?: string; gstRate?: number };
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

    const trimmedMessage = message.trim();

    // ── Audit log ────────────────────────────────────────────────────────────
    void wall10_auditLog({
      companyId: profile.companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      eventType: 'dazza_chat_stream',
      modulesAccessed: [],
      dollarsIncluded: permissions.seeDollars,
      supportMode: false,
      questionSummary: trimmedMessage.slice(0, 120),
    });

    // ── Build user object ────────────────────────────────────────────────────
    const user: DazzaChatInput['user'] = {
      id:          session.user.id,
      companyId:   profile.companyId,
      name:        session.user.name ?? session.user.email ?? 'Unknown',
      email:       session.user.email ?? '',
      role:        profile.role ?? 'worker',
      permissions: {
        canViewJobs:       permissions.canJobs,
        canViewFleet:      permissions.canFleet,
        canViewForms:      permissions.canForms,
        canViewEstimating: permissions.canEstimating,
        canViewFiles:      permissions.canFiles,
        canViewSafety:     permissions.canForms,
        seeDollars:        permissions.seeDollars,
        isAdmin:           permissions.isAdmin,
        isOwner:           permissions.isOwner,
      },
    };

    const openAiKey = getSecret('OPENAI_API_KEY') ?? undefined;
    const anthropicKey = getSecret('ANTHROPIC_API_KEY') ?? undefined;
    const preferredProvider = (req.body as { provider?: string }).provider ?? 'openai';

    // ── No AI key — fall back to non-streaming Drayl engine ──────────────────
    if (!openAiKey && !anthropicKey) {
      const context = await loadDazzaContext(user);
      const input: DazzaChatInput = {
        message: trimmedMessage,
        user,
        context,
        gstRate: typeof gstRate === 'number' ? gstRate : 0.1,
      };
      const result = await handleDazzaChat(input);
      // Return as a single SSE stream so the client can use the same code path
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ type: 'token', content: result.reply })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', mode: result.mode, usedOpenAI: false })}\n\n`);
      res.end();
      return;
    }

    // ── Load context ─────────────────────────────────────────────────────────
    const context = await loadDazzaContext(user);

    // ── Set SSE headers ──────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

    // ── Stream ───────────────────────────────────────────────────────────────
    try {
      if (preferredProvider === 'anthropic' && anthropicKey) {
        await streamClaudeResponse({
          anthropicApiKey: anthropicKey,
          model: 'claude-3-5-sonnet-20241022',
          userMessage: trimmedMessage,
          context,
          res,
        });
      } else if (openAiKey) {
        await streamDazzaResponse({
          apiKey: openAiKey,
          model: 'gpt-4o',
          userMessage: trimmedMessage,
          context,
          companyId: profile.companyId,
          seeDollars: permissions.seeDollars,
          res,
        });
      } else if (anthropicKey) {
        // OpenAI preferred but not available — fall back to Claude
        await streamClaudeResponse({
          anthropicApiKey: anthropicKey,
          model: 'claude-3-5-sonnet-20241022',
          userMessage: trimmedMessage,
          context,
          res,
        });
      }
    } catch (streamErr) {
      const msg = String((streamErr as Error)?.message ?? streamErr);
      res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
    }

    res.end();

  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dazza/chat-v2/stream] error:', msg);
    if (!res.headersSent) {
      return res.status(500).json({ error: msg });
    }
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
    res.end();
  }
}
