/**
 * POST /api/dazza/annette
 * ─────────────────────────────────────────────────────────────────────────────
 * Annette Protocol v1 — structured health-check report.
 *
 * 1. Authenticates + verifies permDazzaAi
 * 2. Builds deep analysis context (annette-context.ts)
 * 3. Sends to OpenAI with the Annette system prompt
 * 4. Streams the report back as SSE (text/event-stream)
 *
 * Security: same guarantees as /api/dazza/chat — company-scoped, session-only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';
import {
  derivePermissions,
  resolveEffectiveCompany,
} from '../../../lib/dazza-context.js';
import {
  buildAnnetteContext,
  buildAnnetteSystemPrompt,
} from '../../../lib/annette-context.js';
import {
  wall9_annetteScope,
  wall6_scrubSecrets,
  wall7_injectDisclaimer,
  wall10_auditLog,
  wall11_getSubscriptionStatus,
} from '../../../lib/dazza-walls.js';

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
    if (!permissions.canDazzaAi) return res.status(403).json({ error: 'Dazza AI not enabled for your account' });

    // ── Wall 11: Subscription wall ───────────────────────────────────────────
    const subscriptionStatus = await wall11_getSubscriptionStatus(profile.companyId);
    const isViewOnly = !permissions.isOwner && (
      subscriptionStatus === 'trial_expired' ||
      subscriptionStatus === 'cancelled' ||
      subscriptionStatus === 'suspended'
    );
    if (isViewOnly) {
      return res.status(403).json({
        error: `Your account is in view-only mode (${subscriptionStatus ?? 'unknown'}). Annette health checks require an active subscription.`,
      });
    }

    // ── Wall 9: Annette scope — check for mutation requests in body ──────────
    const { supportCompanyId: reqSupportId, question: reqQuestion } = req.body as {
      supportCompanyId?: number;
      question?: string;
    };
    if (reqQuestion) {
      const w9 = wall9_annetteScope(reqQuestion);
      if (w9.blocked) {
        return res.status(400).json({ error: w9.message });
      }
    }

    // ── Wall 10: Audit Annette run ────────────────────────────────────────────
    void wall10_auditLog({
      companyId: profile.companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      eventType: 'annette_run',
      modulesAccessed: [],
      dollarsIncluded: permissions.seeDollars,
      supportMode: false,
      questionSummary: 'Annette Protocol health check',
    });

    // ── Support Mode ────────────────────────────────────────────────────────
    const { supportCompanyId } = req.body as { supportCompanyId?: number };
    const { effectiveCompanyId } = await resolveEffectiveCompany(
      permissions.isOwner,
      profile.companyId,
      supportCompanyId,
    );

    // Fetch company name for the report
    const [companyRows] = await db.execute(
      sql`SELECT name FROM companies WHERE id = ${effectiveCompanyId} LIMIT 1`
    ) as unknown as [Array<{ name: string }>, unknown];
    const effectiveCompanyName = companyRows?.[0]?.name ?? 'Your Company';

    // ── Open SSE stream immediately — errors after this point go inline ─────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // ── Build analysis data ─────────────────────────────────────────────────
    let annetteData;
    try {
      annetteData = await buildAnnetteContext(effectiveCompanyId, permissions, effectiveCompanyName);
    } catch (ctxErr) {
      const msg = String((ctxErr as Error)?.message ?? ctxErr);
      console.error('[annette] context build failed:', msg);
      res.write(`data: ${JSON.stringify({ text: `⚠️ Failed to load portal data: ${msg.slice(0, 200)}` })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, error: true, warnings: [], moduleCounts: {} })}\n\n`);
      res.end();
      return;
    }

    const systemPrompt = buildAnnetteSystemPrompt(annetteData);

    // ── OpenAI key check ────────────────────────────────────────────────────
    const apiKey = getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ text: '⚠️ OpenAI API key not configured. Portal data was loaded — ask your owner to add the key in Settings.' })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, error: true, warnings: annetteData.warnings, moduleCounts: annetteData.moduleCounts })}\n\n`);
      res.end();
      return;
    }

    const sendEvent = (data: string) => {
      // Wall 6: scrub secrets from every streamed chunk
      const safe = wall6_scrubSecrets(data);
      res.write(`data: ${JSON.stringify({ text: safe })}\n\n`);
    };

    const sendDone = (meta?: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`);
      res.end();
    };

    // Fire OpenAI — gpt-4o preferred, gpt-4o-mini fallback
    let openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        stream: true,
        max_tokens: 3000,
        temperature: 0.25,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              'Run the Annette Protocol health check now. ' +
              'Sort findings Critical/Urgent first, then Needs Attention, then Info. ' +
              'Produce the full report in the exact format specified.',
          },
        ],
      }),
    });

    // Fallback to gpt-4o-mini if gpt-4o not available on this key
    if (!openaiRes.ok && openaiRes.status === 404) {
      console.warn('[annette] gpt-4o not available, falling back to gpt-4o-mini');
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          stream: true,
          max_tokens: 2500,
          temperature: 0.25,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content:
                'Run the Annette Protocol health check now. ' +
                'Sort findings Critical/Urgent first, then Needs Attention, then Info. ' +
                'Produce the full report in the exact format specified.',
            },
          ],
        }),
      });
    }

    if (!openaiRes.ok || !openaiRes.body) {
      const errText = await openaiRes.text();
      sendEvent(`\n\n⚠️ OpenAI error: ${errText.slice(0, 200)}`);
      sendDone({ error: true });
      return;
    }

    // Stream SSE chunks
    const reader = openaiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: string } }> };
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) sendEvent(chunk);
        } catch { /* skip malformed */ }
      }
    }

    sendDone({
      warnings: annetteData.warnings,
      moduleCounts: annetteData.moduleCounts,
    });

  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.error('[annette] error:', msg);
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    } else {
      res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ Error: ${msg}` })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, error: true })}\n\n`);
      res.end();
    }
  }
}
