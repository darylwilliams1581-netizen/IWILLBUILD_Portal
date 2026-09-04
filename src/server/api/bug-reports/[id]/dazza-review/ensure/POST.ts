/**
 * POST /api/bug-reports/:id/dazza-review/ensure
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner ONLY.
 *
 * Atomically checks whether a Dazza Initial Review already exists for this
 * bug report. If not, claims it (status = 'queued') and runs the AI review.
 * If one already exists (any state), returns it without calling AI again.
 *
 * States: not_started → queued → reviewing → complete | failed
 *
 * Multiple tabs / refreshes / retries are safe — only one AI call is ever made
 * per bug report for the Initial Review version.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { sendSms, isSmsConfigured } from '../../../../../lib/sms.js';
import { getSecret } from '#airo/secrets';
import { randomUUID } from 'node:crypto';
import { getActiveSnapshotId, getSnapshotMeta } from '../../../../../lib/anatomy-indexer.js';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getOwnerPhone(): string {
  return getSecret('PLATFORM_OWNER_PHONE') ?? '';
}

// ── OpenAI Dazza Review ───────────────────────────────────────────────────────

async function runDazzaReview(report: Record<string, unknown>): Promise<{
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
      whatFound: 'Configure OPENAI_API_KEY to enable Dazza Review.',
      likelyCause: 'Unknown — AI unavailable.',
      recommendedFix: 'Configure OPENAI_API_KEY.',
      airoPrompt: '',
      confidence: 0,
    };
  }

  const category    = String(report.category ?? 'unknown');
  const description = String(report.description ?? '').slice(0, 3000);
  const pageUrl     = String(report.page_url ?? '');
  const platform    = String(report.platform ?? 'web');
  const route       = String(report.current_route ?? '');
  const appVersion  = String(report.app_version ?? '');
  const userAgent   = String(report.user_agent ?? '').slice(0, 300);
  const diagEvents  = String(report.diagnostic_events ?? '').slice(0, 4000);
  const reporter    = String(report.submitted_by_name ?? report.submitted_by_email ?? 'Unknown');
  const company     = String(report.company_name ?? '');

  const systemPrompt = `You are Dazza, the senior AI investigator for the IWIllBUIlD construction management platform.
You conduct thorough internal bug case reviews for the platform owner only. Your reviews are never shown to end users.
The platform is a React 19 / TypeScript / Express / MySQL app with Capacitor iOS/Android native wrappers.
Be specific, technical, and actionable. Return valid JSON only.`;

  const userPrompt = `Conduct a full Dazza Review for this bug case.

REPORTER: ${reporter}${company ? ` (${company})` : ''}
CATEGORY: ${category}
PLATFORM: ${platform}${appVersion ? ` v${appVersion}` : ''}
ROUTE: ${route || pageUrl}
USER AGENT: ${userAgent}

DESCRIPTION:
${description}

DIAGNOSTIC EVENTS (last 60s before report):
${diagEvents || 'None captured'}

Return a JSON object with exactly these keys:
{
  "whatHappened": "Direct explanation of the reported issue in 2-3 sentences",
  "whatFound": "Bullet-point list of verified evidence, relevant route/page, device/build info, errors or failed actions, whether user recovered, similar previous cases. Use \\n• for bullets.",
  "likelyCause": "Most likely cause, alternative possibilities, confidence percentage (0-100), and any missing evidence. Be specific.",
  "recommendedFix": "Specific technical correction with likely files and endpoints, safe workaround, risks, and required regression tests. Use \\n• for bullets.",
  "airoPrompt": "A complete ready-to-paste prompt for the Airo builder to implement the fix. Include file names, function names, and exact changes needed.",
  "confidence": <integer 0-100>
}`;

  try {
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

    if (!response.ok) {
      const text = await response.text();
      console.error('[dazza-review] OpenAI error:', response.status, text);
      throw new Error(`OpenAI ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as {
      whatHappened?: string;
      whatFound?: string;
      likelyCause?: string;
      recommendedFix?: string;
      airoPrompt?: string;
      confidence?: number;
    };

    return {
      whatHappened:    parsed.whatHappened    ?? 'No analysis returned.',
      whatFound:       parsed.whatFound       ?? 'No evidence summary.',
      likelyCause:     parsed.likelyCause     ?? 'Unknown.',
      recommendedFix:  parsed.recommendedFix  ?? 'No fix suggested.',
      airoPrompt:      parsed.airoPrompt      ?? '',
      confidence:      typeof parsed.confidence === 'number' ? parsed.confidence : 50,
    };
  } catch (err) {
    console.error('[dazza-review] AI call failed:', err);
    throw err;
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

    // 2. Fetch bug report
    const [reportRows] = await db.execute(sql.raw(`
      SELECT br.id, br.category, br.description, br.page_url, br.platform,
             br.app_version, br.current_route, br.user_agent, br.diagnostic_events,
             br.submitted_by_name, br.submitted_by_email, br.screenshot_path,
             c.name AS company_name
      FROM bug_reports br
      LEFT JOIN companies c ON c.id = br.company_id
      WHERE br.id = '${esc(id)}'
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const report = reportRows?.[0];
    if (!report) return res.status(404).json({ error: 'Bug report not found.' });

    // 3a. Fetch anatomy snapshot early — needed by both the stuck-reset branch
    //     and the normal new-review branch below.
    let anatomySnapshotId: string | null = null;
    let anatomyCommitSha: string | null = null;
    let anatomySourceType: string | null = null;
    let anatomyMeta: Record<string, unknown> | null = null;
    try {
      anatomySnapshotId = await getActiveSnapshotId();
      anatomyMeta       = anatomySnapshotId ? await getSnapshotMeta(anatomySnapshotId) : null;
      anatomyCommitSha  = (anatomyMeta?.commit_sha  as string | null) ?? null;
      anatomySourceType = (anatomyMeta?.source_type as string | null) ?? null;
    } catch {
      // Anatomy tables not yet migrated — proceed without snapshot citation
    }

    // 3b. Atomic check-and-claim: look for existing Initial Review
    const [existingRows] = await db.execute(sql.raw(`
      SELECT id, version_label, review_status, what_happened, what_found,
             likely_cause, recommended_fix, airo_prompt, confidence,
             failure_reason, created_at, completed_at
      FROM dazza_review_comments
      WHERE bug_report_id = '${esc(id)}'
        AND version_label = 'Dazza Initial Review'
      ORDER BY created_at ASC
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    const existing = existingRows?.[0];

    if (existing) {
      const status = String(existing.review_status ?? '');

      // Already finished — return immediately, no AI call needed
      if (status === 'complete' || status === 'failed') {
        return res.json({ ok: true, review: existing, created: false });
      }

      // Stuck in reviewing/queued: if the row is older than 90 seconds it will
      // never resolve on its own (the previous request that inserted it crashed
      // before writing the result — e.g. the anatomyMeta ReferenceError that
      // caused BUG-2026-BDBCD to spin forever).  Reset it to 'reviewing' and
      // fall through to re-run the AI call.
      const createdAt = existing.created_at
        ? new Date(String(existing.created_at).includes('T')
            ? String(existing.created_at)
            : String(existing.created_at).replace(' ', 'T') + 'Z').getTime()
        : 0;
      const ageMs = Date.now() - createdAt;
      const STUCK_THRESHOLD_MS = 90_000; // 90 s — well beyond the 45 s OpenAI timeout

      if (ageMs < STUCK_THRESHOLD_MS) {
        // Still within the normal processing window — return and let the UI keep polling
        return res.json({ ok: true, review: existing, created: false });
      }

      // Stuck row — reset it so we can re-run the AI call below
      const stuckId = String(existing.id);
      await db.execute(sql.raw(`
        UPDATE dazza_review_comments
        SET review_status = 'reviewing',
            failure_reason = NULL,
            updated_at = NOW()
        WHERE id = '${esc(stuckId)}'
      `));

      // Re-use the existing row id so the UI keeps the same comment card
      // Skip the INSERT below by jumping straight to the AI call with this id
      const reviewId = stuckId;

      // ── AI call (duplicate of the main path below, scoped to the stuck-reset branch) ──
      let reviewResult2: Awaited<ReturnType<typeof runDazzaReview>> | null = null;
      let failureReason2 = '';
      try {
        reviewResult2 = await runDazzaReview(report);
      } catch (err) {
        failureReason2 = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error';
      }

      if (reviewResult2 && anatomySnapshotId) {
        const snapshotCitation = anatomyMeta
          ? `\n\n---\nAnatomy snapshot used: ${String(anatomyMeta.snapshot_name ?? anatomySnapshotId)} | Source: ${anatomySourceType ?? 'unknown'} | SHA: ${anatomyCommitSha?.slice(0, 8) ?? 'n/a'}`
          : `\n\n---\nAnatomy snapshot ID: ${anatomySnapshotId}`;
        reviewResult2.airoPrompt = (reviewResult2.airoPrompt + snapshotCitation).slice(0, 8000);
      }

      if (reviewResult2) {
        await db.execute(sql.raw(`
          UPDATE dazza_review_comments
          SET review_status   = 'complete',
              what_happened   = '${esc(reviewResult2.whatHappened)}',
              what_found      = '${esc(reviewResult2.whatFound)}',
              likely_cause    = '${esc(reviewResult2.likelyCause)}',
              recommended_fix = '${esc(reviewResult2.recommendedFix)}',
              airo_prompt     = '${esc(reviewResult2.airoPrompt)}',
              confidence      = ${reviewResult2.confidence},
              completed_at    = NOW(),
              updated_at      = NOW()
          WHERE id = '${esc(reviewId)}'
        `));
      } else {
        await db.execute(sql.raw(`
          UPDATE dazza_review_comments
          SET review_status  = 'failed',
              failure_reason = '${esc(failureReason2)}',
              updated_at     = NOW()
          WHERE id = '${esc(reviewId)}'
        `));
      }

      const [recoveredRows] = await db.execute(sql.raw(`
        SELECT id, version_label, review_status, what_happened, what_found,
               likely_cause, recommended_fix, airo_prompt, confidence,
               failure_reason, created_at, completed_at
        FROM dazza_review_comments
        WHERE id = '${esc(reviewId)}'
        LIMIT 1
      `)) as unknown as [Array<Record<string, unknown>>, unknown];

      return res.json({ ok: true, review: recoveredRows?.[0] ?? null, created: false });
    }

    // 4. Claim the slot atomically — INSERT with unique constraint
    const reviewId = randomUUID();

    // (anatomy snapshot already fetched above in step 3a)

    try {
      // Try INSERT with anatomy columns first (post-migration)
      try {
        await db.execute(sql.raw(`
          INSERT INTO dazza_review_comments
            (id, bug_report_id, version_label, review_status,
             anatomy_snapshot_id, anatomy_commit_sha, anatomy_source_type,
             created_at, updated_at)
          VALUES
            ('${esc(reviewId)}', '${esc(id)}', 'Dazza Initial Review', 'reviewing',
             ${anatomySnapshotId ? `'${anatomySnapshotId}'` : 'NULL'},
             ${anatomyCommitSha  ? `'${anatomyCommitSha}'`  : 'NULL'},
             ${anatomySourceType ? `'${anatomySourceType}'` : 'NULL'},
             NOW(), NOW())
        `));
      } catch (colErr: unknown) {
        const colMsg = colErr instanceof Error ? colErr.message : String(colErr);
        // If anatomy columns don't exist yet, fall back to INSERT without them
        if (colMsg.includes('Unknown column') || colMsg.includes('anatomy_')) {
          await db.execute(sql.raw(`
            INSERT INTO dazza_review_comments
              (id, bug_report_id, version_label, review_status, created_at, updated_at)
            VALUES
              ('${esc(reviewId)}', '${esc(id)}', 'Dazza Initial Review', 'reviewing', NOW(), NOW())
          `));
        } else {
          throw colErr;
        }
      }
    } catch (insertErr: unknown) {
      // Race condition — another tab already claimed it; fetch and return
      const errMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
      if (errMsg.includes('Duplicate') || errMsg.includes('duplicate') || errMsg.includes('ER_DUP')) {
        const [raceRows] = await db.execute(sql.raw(`
          SELECT id, version_label, review_status, what_happened, what_found,
                 likely_cause, recommended_fix, airo_prompt, confidence,
                 failure_reason, created_at, completed_at
          FROM dazza_review_comments
          WHERE bug_report_id = '${esc(id)}'
            AND version_label = 'Dazza Initial Review'
          LIMIT 1
        `)) as unknown as [Array<Record<string, unknown>>, unknown];
        return res.json({ ok: true, review: raceRows?.[0] ?? null, created: false });
      }
      throw insertErr;
    }

    // 5. Run AI review
    let reviewResult: Awaited<ReturnType<typeof runDazzaReview>> | null = null;
    let failureReason = '';

    try {
      reviewResult = await runDazzaReview(report);
    } catch (err) {
      failureReason = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error';
    }

    // Append anatomy snapshot citation to airoPrompt if available
    if (reviewResult && anatomySnapshotId) {
      const snapshotCitation = anatomyMeta
        ? `\n\n---\nAnatomy snapshot used: ${String(anatomyMeta.snapshot_name ?? anatomySnapshotId)} | Source: ${anatomySourceType ?? 'unknown'} | SHA: ${anatomyCommitSha?.slice(0, 8) ?? 'n/a'}`
        : `\n\n---\nAnatomy snapshot ID: ${anatomySnapshotId}`;
      reviewResult.airoPrompt = (reviewResult.airoPrompt + snapshotCitation).slice(0, 8000);
    }

    // 6. Store result
    if (reviewResult) {
      await db.execute(sql.raw(`
        UPDATE dazza_review_comments
        SET review_status   = 'complete',
            what_happened   = '${esc(reviewResult.whatHappened)}',
            what_found      = '${esc(reviewResult.whatFound)}',
            likely_cause    = '${esc(reviewResult.likelyCause)}',
            recommended_fix = '${esc(reviewResult.recommendedFix)}',
            airo_prompt     = '${esc(reviewResult.airoPrompt)}',
            confidence      = ${reviewResult.confidence},
            completed_at    = NOW(),
            updated_at      = NOW()
        WHERE id = '${esc(reviewId)}'
      `));

      // 7. Notify owner if not actively viewing (best-effort SMS)
      const ownerPhone = getOwnerPhone();
      if (isSmsConfigured() && ownerPhone) {
        const bugRef = `BUG-${String(id).slice(0, 8).toUpperCase()}`;
        const shortCause = reviewResult.likelyCause.slice(0, 100).replace(/\n/g, ' ');
        const smsBody =
          `DAZZA — ${bugRef} reviewed.\n` +
          `Likely: ${shortCause}\n` +
          `Confidence: ${reviewResult.confidence}%\n` +
          `Airo prompt attached to Case.`;
        await sendSms(ownerPhone, smsBody).catch(() => {/* best-effort */});
      }
    } else {
      await db.execute(sql.raw(`
        UPDATE dazza_review_comments
        SET review_status  = 'failed',
            failure_reason = '${esc(failureReason)}',
            updated_at     = NOW()
        WHERE id = '${esc(reviewId)}'
      `));
    }

    // 8. Return the completed/failed review
    const [finalRows] = await db.execute(sql.raw(`
      SELECT id, version_label, review_status, what_happened, what_found,
             likely_cause, recommended_fix, airo_prompt, confidence,
             failure_reason, created_at, completed_at
      FROM dazza_review_comments
      WHERE id = '${esc(reviewId)}'
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ ok: true, review: finalRows?.[0] ?? null, created: true });
  } catch (err) {
    console.error('[dazza-review/ensure]', err);
    return res.status(500).json({ error: 'Review failed.' });
  }
}
