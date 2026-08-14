/**
 * POST /api/bug-reports/:id/analyse
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only.
 * 1. Fetches the bug report from DB.
 * 2. Sends it to OpenAI (Dazza AI) for diagnosis.
 * 3. Stores ai_analysis, ai_suggested_fix, ai_suggested_prompt on the row.
 * 4. Generates a single-use SMS auth token and sends it to the platform owner's
 *    registered phone number via Twilio.
 * 5. Returns the AI analysis + a flag indicating whether SMS was sent.
 *
 * The SMS contains a 6-digit code. The owner enters it in the UI to unlock
 * the "Publish Fix" button (POST /api/bug-reports/:id/publish-fix).
 */
import type { Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { sendSms, isSmsConfigured } from '../../../../lib/sms.js';
import { getSecret } from '#airo/secrets';

// ── Safe string escape ────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── Platform owner phone (stored in DB or env fallback) ───────────────────────
const PLATFORM_OWNER_PHONE = process.env.PLATFORM_OWNER_PHONE ?? '';

// ── Generate 6-digit code ─────────────────────────────────────────────────────
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// ── OpenAI analysis ───────────────────────────────────────────────────────────
async function analyseBugWithDazza(report: Record<string, unknown>): Promise<{
  analysis: string;
  suggestedFix: string;
  suggestedPrompt: string;
}> {
  const apiKey = getSecret('OPENAI_API_KEY');
  if (!apiKey) {
    return {
      analysis: 'OpenAI API key not configured.',
      suggestedFix: 'Configure OPENAI_API_KEY to enable AI analysis.',
      suggestedPrompt: '',
    };
  }

  const category = String(report.category ?? 'unknown');
  const description = String(report.description ?? '').slice(0, 2000);
  const pageUrl = String(report.page_url ?? '');
  const platform = String(report.platform ?? 'web');
  const currentRoute = String(report.current_route ?? '');
  const appVersion = String(report.app_version ?? '');

  const systemPrompt = `You are Dazza, the IWILLBUILD platform AI. You analyse bug reports submitted by users of the IWILLBUILD construction management platform and provide:
1. A clear diagnosis of what is likely causing the issue
2. A specific suggested fix (code change, config, or UX fix)
3. A concise Airo builder prompt that a developer could paste directly to implement the fix

Be specific, technical, and actionable. The platform is a React/TypeScript/Express app with MySQL.`;

  const userPrompt = `Bug Report Analysis Request:

Category: ${category}
Description: ${description}
Page/Route: ${currentRoute || pageUrl}
Platform: ${platform}
App Version: ${appVersion}

Please provide:
1. DIAGNOSIS: What is likely causing this issue?
2. SUGGESTED FIX: Specific technical fix (file, function, change needed)
3. AIRO PROMPT: A ready-to-paste prompt for the Airo builder to implement the fix

Format your response as JSON with keys: "analysis", "suggestedFix", "suggestedPrompt"`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[bug-analyse] OpenAI error:', response.status, text);
      return {
        analysis: `OpenAI returned ${response.status}. Manual review required.`,
        suggestedFix: 'Check OpenAI API key and quota.',
        suggestedPrompt: '',
      };
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as {
      analysis?: string;
      suggestedFix?: string;
      suggestedPrompt?: string;
    };

    return {
      analysis: parsed.analysis ?? 'No analysis returned.',
      suggestedFix: parsed.suggestedFix ?? 'No fix suggested.',
      suggestedPrompt: parsed.suggestedPrompt ?? '',
    };
  } catch (err) {
    console.error('[bug-analyse] OpenAI call failed:', err);
    return {
      analysis: 'AI analysis failed — network or timeout error.',
      suggestedFix: 'Retry analysis or review manually.',
      suggestedPrompt: '',
    };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // 1. Platform owner only
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };
    if (!id) return res.status(400).json({ error: 'Bug report ID required.' });

    // 2. Fetch the bug report
    const [rows] = await db.execute(sql.raw(`
      SELECT id, category, description, page_url, platform, app_version,
             current_route, submitted_by_name, submitted_by_email,
             ai_analysis, ai_suggested_fix, ai_suggested_prompt, ai_analysed_at
      FROM bug_reports
      WHERE id = '${esc(id)}'
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const report = rows?.[0];
    if (!report) return res.status(404).json({ error: 'Bug report not found.' });

    // 3. Run Dazza AI analysis
    const { analysis, suggestedFix, suggestedPrompt } = await analyseBugWithDazza(report);

    // 4. Store AI results
    await db.execute(sql.raw(`
      UPDATE bug_reports
      SET ai_analysis = '${esc(analysis)}',
          ai_suggested_fix = '${esc(suggestedFix)}',
          ai_suggested_prompt = '${esc(suggestedPrompt)}',
          ai_analysed_at = NOW(),
          updated_at = NOW()
      WHERE id = '${esc(id)}'
    `));

    // 5. Generate SMS auth token and send to platform owner
    let smsSent = false;
    let smsCode = '';

    if (isSmsConfigured() && PLATFORM_OWNER_PHONE) {
      smsCode = generateCode();
      const codeHash = hashCode(smsCode);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min TTL

      await db.execute(sql.raw(`
        UPDATE bug_reports
        SET sms_auth_token = '${esc(codeHash)}',
            sms_auth_expires_at = '${expiresAt.toISOString().slice(0, 19).replace('T', ' ')}',
            sms_auth_used = 0,
            updated_at = NOW()
        WHERE id = '${esc(id)}'
      `));

      const smsBody =
        `🐛 IWILLBUILD Bug Alert\n` +
        `Category: ${String(report.category ?? '').replace(/_/g, ' ')}\n` +
        `Issue: ${String(report.description ?? '').slice(0, 100)}...\n\n` +
        `Dazza Fix: ${suggestedFix.slice(0, 120)}\n\n` +
        `Auth code to publish fix: ${smsCode}\n` +
        `(Expires in 15 min)`;

      smsSent = await sendSms(PLATFORM_OWNER_PHONE, smsBody);
    }

    return res.json({
      ok: true,
      analysis,
      suggestedFix,
      suggestedPrompt,
      smsSent,
      smsConfigured: isSmsConfigured() && !!PLATFORM_OWNER_PHONE,
    });
  } catch (err) {
    console.error('[bug-reports/analyse]', err);
    return res.status(500).json({ error: 'Analysis failed.' });
  }
}
