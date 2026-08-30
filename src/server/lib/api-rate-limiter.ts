/**
 * Global API rate limiter
 * ─────────────────────────────────────────────────────────────────────────────
 * Applied to all /api/* routes as a defence-in-depth layer.
 * Per-endpoint limiters (auth, signup, SMS) remain in place for tighter limits.
 *
 * Limits (in-memory, per IP):
 *   General API:  300 requests / 1 minute
 *   Auth routes:  30  requests / 1 minute  (tighter — login brute-force)
 *
 * In-memory store resets on server restart — acceptable for a single-process
 * deployment. Swap to Redis if horizontal scaling is needed.
 */

import type { Request, Response, NextFunction } from 'express';
import { APP_URL } from './app-url.js';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, BucketEntry>();

function getIp(req: Request): string {
  // trust proxy is enabled — x-forwarded-for is the real client IP
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

function makeKey(ip: string, bucket: string): string {
  return `${bucket}:${ip}`;
}

function check(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { allowed: true, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}

// Periodically purge expired entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) store.delete(key);
  }
}, 60_000);

// ── Middleware factories ───────────────────────────────────────────────────────

/** 300 req/min — applied to all /api/* routes */
export function globalApiLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getIp(req);
  const { allowed, retryAfter } = check(makeKey(ip, 'api'), 300, 60_000);
  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
}

/** 30 req/min — applied to /api/auth/* routes (login brute-force protection) */
export function authApiLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getIp(req);
  const { allowed, retryAfter } = check(makeKey(ip, 'auth'), 30, 60_000);
  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many authentication attempts. Please wait before trying again.' });
  }
  next();
}

/**
 * 10 req / 15 min — applied to recovery-email token-link endpoints.
 * Tokens are 48-byte random (96 hex chars) so brute-force is infeasible,
 * but rate-limiting adds defence-in-depth and slows automated scanning.
 * Redirecting endpoints return 429 as a redirect to an error page so
 * browsers display a useful message rather than a raw JSON error.
 */
export function recoveryTokenLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getIp(req);
  const { allowed, retryAfter } = check(makeKey(ip, 'recovery-token'), 10, 15 * 60_000);
  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfter));
    // GET endpoints redirect; POST endpoints return JSON
    if (req.method === 'GET') {
      return res.redirect(`${APP_URL}/settings?recovery_email_result=rate_limited`);
    }
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}
