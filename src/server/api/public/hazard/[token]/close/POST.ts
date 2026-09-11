/**
 * POST /api/public/hazard/:token/close
 * Public endpoint — no authentication required.
 *
 * Supported actions:
 *   "comment" — record a comment without changing status
 *   "close"   — record a comment and set status = 'closed'
 *
 * Validation:
 *   - action must be "comment" or "close"
 *   - name is required, trimmed, max 200 chars
 *   - comment is required, trimmed, max 2000 chars
 *   - Malformed or revoked tokens are rejected
 *   - Closing an already-closed hazard is idempotent (no repeated transition)
 *   - IP address is stored as SHA-256 hash (never raw)
 *
 * Rate limiting: 10 requests per token per 15 minutes (in-process map).
 * Does NOT archive or delete the hazard.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { toMySQLDatetime } from '../../../../../lib/datetime.js';
import { completeLinkedTask } from '../../../../../lib/hazardTaskService.js';
import { createHash } from 'node:crypto';

// ── Rate limiter (in-process, keyed by token hash + IP hash) ─────────────────
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 10;

interface RateBucket { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count > RATE_MAX;
}

// Prune stale buckets periodically to avoid unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) {
    if (now > b.resetAt) rateBuckets.delete(k);
  }
}, RATE_WINDOW_MS);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function rawIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '';
}

// Valid status values used by the Hazard Register
const VALID_STATUSES = new Set(['open', 'in_progress', 'closed', 'resolved']);
const VALID_ACTIONS = new Set(['comment', 'close']);

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token || token.length < 64 || !/^[0-9a-f]+$/i.test(token)) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // Rate limit by token hash + IP hash (never log raw values)
    const ip = rawIp(req);
    const ipHash = sha256hex(ip);
    const tokenHash = sha256hex(token);
    const rateKey = `${tokenHash}:${ipHash}`;
    if (isRateLimited(rateKey)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    // Parse and validate body
    const body = req.body as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    if (!VALID_ACTIONS.has(action)) {
      return res.status(400).json({ error: 'action must be "comment" or "close"' });
    }

    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    const rawComment = typeof body.comment === 'string' ? body.comment.trim() : '';

    if (!rawName) return res.status(400).json({ error: 'Your name is required' });
    if (rawName.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or fewer' });
    if (!rawComment) return res.status(400).json({ error: 'A comment is required' });
    if (rawComment.length > 2000) return res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });

    // Resolve token by hash
    const [tokenRows] = await db.execute(sql`
      SELECT hazard_id, company_id, revoked
      FROM hazard_share_tokens
      WHERE token_hash = ${tokenHash} LIMIT 1
    `) as unknown as [Array<{ hazard_id: number; company_id: number; revoked: number }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });

    const { hazard_id, company_id } = tokenRows[0];

    // Fetch current status and task_id
    const [hazardRows] = await db.execute(sql`
      SELECT id, status, task_id FROM risk_register
      WHERE id = ${hazard_id} AND company_id = ${company_id} LIMIT 1
    `) as unknown as [Array<{ id: number; status: string; task_id: number | null }>];

    if (!hazardRows?.length) return res.status(404).json({ error: 'Hazard not found' });

    const previousStatus = VALID_STATUSES.has(hazardRows[0].status) ? hazardRows[0].status : 'open';
    const linkedTaskId = hazardRows[0].task_id ?? null;
    const isClose = action === 'close';

    // Idempotent close: if already closed, record comment but do not create another transition
    const alreadyClosed = previousStatus === 'closed';
    const newStatus = isClose && !alreadyClosed ? 'closed' : previousStatus;
    const actionTaken = isClose ? 'close' : 'comment';
    const now = toMySQLDatetime(new Date());

    // Store hashed IP — never the raw address
    await db.execute(sql`
      INSERT INTO hazard_public_comments
        (hazard_id, company_id, commenter_name, comment, action_taken,
         previous_status, new_status, ip_hash, created_at)
      VALUES
        (${hazard_id}, ${company_id}, ${rawName}, ${rawComment},
         ${actionTaken}, ${previousStatus}, ${newStatus}, ${ipHash}, ${now})
    `);

    // Update hazard status only on a real transition
    if (isClose && !alreadyClosed) {
      await db.execute(sql`
        UPDATE risk_register
        SET status = 'closed', closed_at = ${now}, closed_by = ${rawName}, updated_at = ${now}
        WHERE id = ${hazard_id} AND company_id = ${company_id}
      `);
      // Complete the linked task when present (idempotent)
      if (linkedTaskId) {
        try {
          await completeLinkedTask(linkedTaskId, company_id);
        } catch (syncErr) {
          console.warn('[public close] completeLinkedTask failed (non-fatal):', syncErr);
        }
      }
    }

    return res.status(201).json({ ok: true, new_status: newStatus });
  } catch (err) {
    console.error('POST /api/public/hazard/:token/close error:', err);
    return res.status(500).json({ error: 'Failed to submit' });
  }
}
