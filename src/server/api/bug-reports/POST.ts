/**
 * POST /api/bug-reports
 * Multipart: fields { category, description, page_url, user_agent,
 *                     platform, app_version, current_route,
 *                     diagnostic_events, device_context }
 *            file   { screenshot? } — optional image, max 10 MB
 *
 * Any authenticated user can submit.
 * Identity (user_id, company_id, name, email) is resolved from the session —
 * never trusted from the client.
 * Server sets created_at — client-supplied timestamps are ignored.
 */
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import { saveFile } from '../../storage/storage-service.js';

const BUCKET_BUG_SCREENSHOTS = 'bug-reports';

// ── Magic-byte validation ─────────────────────────────────────────────────────
const IMAGE_SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF
  { mime: 'image/heic', bytes: [] }, // HEIC/HEIF — no reliable magic bytes; accept by MIME
  { mime: 'image/heif', bytes: [] },
];

function validateImageMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  const mime = declaredMime.toLowerCase();
  // HEIC/HEIF — trust MIME (iOS omits magic bytes reliably)
  if (mime === 'image/heic' || mime === 'image/heif') return true;
  const sig = IMAGE_SIGNATURES.find(s => s.mime === mime);
  if (!sig || sig.bytes.length === 0) return false;
  const offset = sig.offset ?? 0;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buffer[offset + i] !== sig.bytes[i]) return false;
  }
  // Extra WebP check: bytes 8-11 must be "WEBP"
  if (mime === 'image/webp') {
    const webp = [0x57, 0x45, 0x42, 0x50];
    for (let i = 0; i < 4; i++) {
      if (buffer[8 + i] !== webp[i]) return false;
    }
  }
  return true;
}

// ── Rate limiting (simple in-memory, per user) ────────────────────────────────
const RATE_WINDOW_MS = 60_000;
const RATE_MAX       = 5;
const _ratemap = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = _ratemap.get(userId);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    _ratemap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_MAX) return true;
  return false;
}

// ── Safe string escape ────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // 1. Auth — identity from session only
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    // 2. Rate limit per user
    if (isRateLimited(auth.session.user.id)) {
      return res.status(429).json({ error: 'Too many reports. Please wait a minute.' });
    }

    // 3. Parse multipart
    const { fields, files, limitError } = await parseMultipartForm(req, {
      maxFileSize: 10 * 1024 * 1024,
    });

    if (limitError) {
      return res.status(400).json({ error: limitError });
    }

    // 4. Extract and sanitise text fields
    const category    = (fields.category    ?? '').toString().trim().slice(0, 100);
    const description = (fields.description ?? '').toString().trim().slice(0, 5000);
    const pageUrl     = (fields.page_url    ?? '').toString().trim().slice(0, 500);
    const userAgent   = (fields.user_agent  ?? req.headers['user-agent'] ?? '').toString().slice(0, 500);
    const platform    = (fields.platform    ?? 'web').toString().trim().slice(0, 50);
    const appVersion  = (fields.app_version ?? '').toString().trim().slice(0, 50);
    const currentRoute = (fields.current_route ?? '').toString().trim().slice(0, 300);

    if (!description) {
      return res.status(400).json({ error: 'Description is required.' });
    }

    // 5. Parse diagnostic events — validate JSON, enforce size cap
    let diagnosticEvents: unknown[] = [];
    try {
      const raw = (fields.diagnostic_events ?? '').toString();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          diagnosticEvents = parsed.slice(0, 100);
        }
      }
    } catch { /* ignore malformed */ }

    // 6. Screenshot upload with magic-byte validation
    let screenshotPath: string | null = null;
    const screenshot = files.find(f =>
      f.fieldname === 'screenshot' || f.fieldname === 'file'
    ) ?? null;

    if (screenshot) {
      const allowedMimes = new Set([
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      ]);
      const mime = screenshot.mimetype.toLowerCase();

      if (!allowedMimes.has(mime)) {
        return res.status(400).json({ error: 'Screenshot must be a JPEG, PNG, WebP, or HEIC image.' });
      }
      if (!validateImageMagicBytes(screenshot.buffer, mime)) {
        return res.status(400).json({ error: 'Screenshot file signature does not match declared type.' });
      }

      const ext = mime === 'image/jpeg' ? 'jpg'
                : mime === 'image/png'  ? 'png'
                : mime === 'image/webp' ? 'webp'
                : 'heic';
      const key = `${randomBytes(16).toString('hex')}.${ext}`;

      try {
        const result = await saveFile({
          buffer: screenshot.buffer,
          mimeType: mime,
          storageKey: key,
          bucket: BUCKET_BUG_SCREENSHOTS,
          originalName: screenshot.originalname || `screenshot.${ext}`,
        });
        screenshotPath = result.storageKey;
      } catch (uploadErr) {
        console.warn('[bug-reports] screenshot upload failed, continuing without it:', uploadErr);
      }
    }

    // 7. Insert — identity from session, timestamp from server
    const id = randomBytes(16).toString('hex');
    const diagJson = JSON.stringify(diagnosticEvents).slice(0, 65536); // 64 KB cap

    await db.execute(sql.raw(`
      INSERT INTO bug_reports
        (id, submitted_by_user_id, submitted_by_name, submitted_by_email,
         company_id, category, description, page_url, user_agent,
         screenshot_path, screenshot_bucket, status,
         platform, app_version, current_route, diagnostic_events,
         created_at, updated_at)
      VALUES (
        '${esc(id)}',
        '${esc(auth.session.user.id)}',
        '${esc(auth.profile?.name ?? '')}',
        '${esc(auth.session.user.email ?? '')}',
        ${auth.profile?.companyId ? `${Number(auth.profile.companyId)}` : 'NULL'},
        '${esc(category)}',
        '${esc(description)}',
        '${esc(pageUrl)}',
        '${esc(userAgent)}',
        ${screenshotPath ? `'${esc(screenshotPath)}'` : 'NULL'},
        ${screenshotPath ? `'${esc(BUCKET_BUG_SCREENSHOTS)}'` : 'NULL'},
        'open',
        '${esc(platform)}',
        '${esc(appVersion)}',
        '${esc(currentRoute)}',
        '${esc(diagJson)}',
        NOW(),
        NOW()
      )
    `));

    // 8. Fire-and-forget: auto-trigger Dazza AI analysis + SMS alert
    void triggerAutoAnalysis(id, {
      category,
      description,
      page_url: pageUrl,
      platform,
      app_version: appVersion,
      current_route: currentRoute,
    });

    return res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('[bug-reports/POST]', err);
    return res.status(500).json({ error: 'Failed to submit bug report.' });
  }
}

// ── Auto-analysis (fire-and-forget) ──────────────────────────────────────────
// Runs after the 201 response is sent. Errors are logged but never surface
// to the user — the bug report is already saved.

async function triggerAutoAnalysis(
  id: string,
  report: Record<string, string>,
): Promise<void> {
  try {
    const { getSecret } = await import('#airo/secrets');
    const { sendSms, isSmsConfigured } = await import('../../lib/sms.js');
    const { createHash, createHmac } = await import('node:crypto');

    const apiKey = getSecret('OPENAI_API_KEY');
    if (!apiKey) return;

    const systemPrompt = `You are Dazza, the IWIllBUILD platform AI. Analyse this bug report and return JSON with keys: "analysis", "suggestedFix", "suggestedPrompt". Be specific and technical.`;
    const userPrompt = `Category: ${report.category}\nDescription: ${report.description?.slice(0, 1500)}\nRoute: ${report.current_route || report.page_url}\nPlatform: ${report.platform}\nVersion: ${report.app_version}`;

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
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) return;

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { analysis?: string; suggestedFix?: string; suggestedPrompt?: string };

    const analysis = (parsed.analysis ?? '').slice(0, 4000);
    const suggestedFix = (parsed.suggestedFix ?? '').slice(0, 4000);
    const suggestedPrompt = (parsed.suggestedPrompt ?? '').slice(0, 4000);

    function esc2(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    // Generate SMS auth token
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.execute(sql.raw(`
      UPDATE bug_reports
      SET ai_analysis = '${esc2(analysis)}',
          ai_suggested_fix = '${esc2(suggestedFix)}',
          ai_suggested_prompt = '${esc2(suggestedPrompt)}',
          ai_analysed_at = NOW(),
          sms_auth_token = '${esc2(codeHash)}',
          sms_auth_expires_at = '${expiresAt.toISOString().slice(0, 19).replace('T', ' ')}',
          sms_auth_used = 0,
          updated_at = NOW()
      WHERE id = '${esc2(id)}'
    `));

    // Send SMS to platform owner
    const ownerPhone = getSecret('PLATFORM_OWNER_PHONE') ?? process.env.PLATFORM_OWNER_PHONE ?? '';
    if (isSmsConfigured() && ownerPhone) {
      const smsBody =
        `🐛 New IWIllBUILD Bug\n` +
        `${report.category?.replace(/_/g, ' ') ?? 'Unknown'}: ${report.description?.slice(0, 80) ?? ''}...\n\n` +
        `Dazza: ${suggestedFix.slice(0, 100)}\n\n` +
        `Auth code: ${code} (15 min)`;
      await sendSms(ownerPhone, smsBody);
    }

    console.info(`[bug-reports] Auto-analysis complete for ${id}`);
  } catch (err) {
    console.warn('[bug-reports] Auto-analysis failed (non-fatal):', err);
  }
}
