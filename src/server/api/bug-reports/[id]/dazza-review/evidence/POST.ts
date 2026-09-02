/**
 * POST /api/bug-reports/:id/dazza-review/evidence
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner ONLY.
 * Owner-triggered only — never fires automatically.
 *
 * Creates a new versioned Dazza comment (Evidence Update, Recurrence Review,
 * or Post-Fix Verification) based on the current state of the bug report.
 * Never overwrites previous comments.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { getSecret } from '#airo/secrets';
import { randomUUID } from 'node:crypto';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const VERSION_LABELS = [
  'Dazza Initial Review',
  'Dazza Evidence Update',
  'Dazza Recurrence Review',
  'Dazza Post-Fix Verification',
] as const;

async function runEvidenceReview(
  report: Record<string, unknown>,
  previousReviews: Array<Record<string, unknown>>,
  versionLabel: string,
): Promise<{
  whatHappened: string;
  whatFound: string;
  likelyCause: string;
  recommendedFix: string;
  airoPrompt: string;
  confidence: number;
}> {
  const apiKey = getSecret('OPENAI_API_KEY');
  if (!apiKey) {
    return {
      whatHappened: 'OpenAI API key not configured.',
      whatFound: '',
      likelyCause: 'Unknown.',
      recommendedFix: 'Configure OPENAI_API_KEY.',
      airoPrompt: '',
      confidence: 0,
    };
  }

  const description = String(report.description ?? '').slice(0, 2000);
  const diagEvents  = String(report.diagnostic_events ?? '').slice(0, 3000);
  const platform    = String(report.platform ?? 'web');
  const route       = String(report.current_route ?? report.page_url ?? '');
  const resNote     = String(report.resolution_note ?? '').slice(0, 1000);

  const prevSummary = previousReviews.map((r, i) =>
    `[${i + 1}] ${String(r.version_label)} (${String(r.review_status)}): ${String(r.likely_cause ?? '').slice(0, 200)}`
  ).join('\n');

  const systemPrompt = `You are Dazza, the senior AI investigator for the IWIIlBUILD construction management platform.
You are conducting a follow-up review after new evidence has been added to a bug case.
Never overwrite previous findings — only add new insights based on the new evidence.
Return valid JSON only.`;

  const userPrompt = `Follow-up Dazza Review: ${versionLabel}

ORIGINAL DESCRIPTION: ${description}
PLATFORM: ${platform}
ROUTE: ${route}
RESOLUTION NOTE: ${resNote || 'None'}

DIAGNOSTIC EVENTS (current):
${diagEvents || 'None'}

PREVIOUS REVIEWS:
${prevSummary || 'None'}

Based on the new evidence, provide an updated analysis. Return JSON with keys:
{
  "whatHappened": "Updated explanation incorporating new evidence",
  "whatFound": "New evidence found since last review. Use \\n• for bullets.",
  "likelyCause": "Updated cause assessment with confidence percentage",
  "recommendedFix": "Updated fix recommendation. Use \\n• for bullets.",
  "airoPrompt": "Updated Airo builder prompt incorporating new findings",
  "confidence": <integer 0-100>
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}`);

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as {
    whatHappened?: string;
    whatFound?: string;
    likelyCause?: string;
    recommendedFix?: string;
    airoPrompt?: string;
    confidence?: number;
  };

  return {
    whatHappened:   parsed.whatHappened   ?? 'No update.',
    whatFound:      parsed.whatFound      ?? '',
    likelyCause:    parsed.likelyCause    ?? 'Unknown.',
    recommendedFix: parsed.recommendedFix ?? '',
    airoPrompt:     parsed.airoPrompt     ?? '',
    confidence:     typeof parsed.confidence === 'number' ? parsed.confidence : 50,
  };
}

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };
    if (!id) return res.status(400).json({ error: 'Bug report ID required.' });

    // Fetch bug report
    const [reportRows] = await db.execute(sql.raw(`
      SELECT br.id, br.category, br.description, br.page_url, br.platform,
             br.app_version, br.current_route, br.user_agent, br.diagnostic_events,
             br.resolution_note, br.submitted_by_name, br.submitted_by_email
      FROM bug_reports br
      WHERE br.id = '${esc(id)}'
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const report = reportRows?.[0];
    if (!report) return res.status(404).json({ error: 'Bug report not found.' });

    // Fetch all previous reviews (append-only — never overwrite)
    const [prevRows] = await db.execute(sql.raw(`
      SELECT id, version_label, review_status, likely_cause, created_at
      FROM dazza_review_comments
      WHERE bug_report_id = '${esc(id)}'
      ORDER BY created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    // Determine next version label
    const usedLabels = new Set((prevRows ?? []).map(r => String(r.version_label)));
    let nextLabel: string = 'Dazza Evidence Update';
    for (const label of VERSION_LABELS) {
      if (!usedLabels.has(label)) { nextLabel = label; break; }
    }
    // If all labels used, append with timestamp
    if (usedLabels.has(nextLabel)) {
      nextLabel = `Dazza Evidence Update ${new Date().toISOString().slice(0, 10)}`;
    }

    // Create new review row in 'reviewing' state
    const reviewId = randomUUID();
    await db.execute(sql.raw(`
      INSERT INTO dazza_review_comments
        (id, bug_report_id, version_label, review_status, created_at, updated_at)
      VALUES
        ('${esc(reviewId)}', '${esc(id)}', '${esc(nextLabel)}', 'reviewing', NOW(), NOW())
    `));

    // Run AI
    let result: Awaited<ReturnType<typeof runEvidenceReview>> | null = null;
    let failureReason = '';
    try {
      result = await runEvidenceReview(report, prevRows ?? [], nextLabel);
    } catch (err) {
      failureReason = err instanceof Error ? err.message.slice(0, 500) : 'Unknown';
    }

    if (result) {
      await db.execute(sql.raw(`
        UPDATE dazza_review_comments
        SET review_status   = 'complete',
            what_happened   = '${esc(result.whatHappened)}',
            what_found      = '${esc(result.whatFound)}',
            likely_cause    = '${esc(result.likelyCause)}',
            recommended_fix = '${esc(result.recommendedFix)}',
            airo_prompt     = '${esc(result.airoPrompt)}',
            confidence      = ${result.confidence},
            completed_at    = NOW(),
            updated_at      = NOW()
        WHERE id = '${esc(reviewId)}'
      `));
    } else {
      await db.execute(sql.raw(`
        UPDATE dazza_review_comments
        SET review_status  = 'failed',
            failure_reason = '${esc(failureReason)}',
            updated_at     = NOW()
        WHERE id = '${esc(reviewId)}'
      `));
    }

    const [finalRows] = await db.execute(sql.raw(`
      SELECT id, version_label, review_status, what_happened, what_found,
             likely_cause, recommended_fix, airo_prompt, confidence,
             failure_reason, created_at, completed_at
      FROM dazza_review_comments
      WHERE id = '${esc(reviewId)}'
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ ok: true, review: finalRows?.[0] ?? null });
  } catch (err) {
    console.error('[dazza-review/evidence]', err);
    return res.status(500).json({ error: 'Evidence review failed.' });
  }
}
