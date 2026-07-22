/**
 * POST /api/dazza/chat-v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza AI chat — Drayl Engine v2.
 *
 * Uses the new modular Drayl engine (src/server/lib/drayl/) which provides:
 *   - Pure local tools (maths, GST, construction calcs) — no DB, no OpenAI
 *   - Context local tools (fast portal facts from DB)
 *   - Annette health-check runner (pure logic, no AI prompt needed)
 *   - OpenAI explanation layer (optional, only when needed)
 *
 * Security guarantees (same as chat/POST.ts):
 *   - Context is ALWAYS re-fetched server-side from the session.
 *   - permDazzaAi checked before any processing.
 *   - companyId comes from session profile only.
 *   - seeDollars enforced in buildDazzaContext().
 *   - Every request is audit-logged.
 *
 * Response format: JSON (non-streaming)
 * {
 *   reply: string,
 *   mode: 'refusal' | 'context' | 'annette' | 'ai',
 *   findings: AnnetteFinding[],
 *   sources: ModuleName[],
 *   warnings: string[],
 *   usedOpenAI: boolean,
 * }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';
import { derivePermissions } from '../../../lib/dazza-context.js';
import { wall10_auditLog, wall11_getSubscriptionStatus } from '../../../lib/dazza-walls.js';
import { handleDazzaChat } from '../../../lib/drayl/drayl.js';
import type { DazzaChatInput } from '../../../lib/drayl/types.js';

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
    const { message, gstRate } = req.body as {
      message?: string;
      gstRate?: number;
    };

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // ── Audit log ────────────────────────────────────────────────────────────
    void wall10_auditLog({
      companyId: profile.companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      eventType: 'dazza_chat',
      modulesAccessed: [],
      dollarsIncluded: permissions.seeDollars,
      supportMode: false,
      questionSummary: message.trim().slice(0, 120),
    });

    // ── Build input for Drayl engine ─────────────────────────────────────────
    const input: DazzaChatInput = {
      message: message.trim(),
      user: {
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
      },
      openAiApiKey: getSecret('OPENAI_API_KEY') ?? undefined,
      openAiModel:  'gpt-4o',
      gstRate:      typeof gstRate === 'number' ? gstRate : 0.1,
    };

    // ── Run Drayl engine ─────────────────────────────────────────────────────
    const result = await handleDazzaChat(input);

    return res.json(result);

  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dazza/chat-v2] error:', msg);
    return res.status(500).json({ error: msg });
  }
}
