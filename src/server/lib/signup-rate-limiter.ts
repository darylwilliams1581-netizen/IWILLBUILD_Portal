/**
 * In-memory rate limiter for signup attempts.
 * Keyed by IP address. Resets after the window expires.
 *
 * Limits:
 *   - 5 signup attempts per IP per 15 minutes
 *   - 3 resend-verification attempts per IP per 10 minutes
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function getKey(ip: string, action: string): string {
  return `${action}:${ip}`;
}

function check(ip: string, action: string, maxAttempts: number, windowMs: number): boolean {
  const key = getKey(ip, action);
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (existing.count >= maxAttempts) {
    return false; // blocked
  }

  existing.count++;
  return true;
}

/** Returns true if the signup attempt is allowed, false if rate-limited */
export function checkSignupRate(ip: string): boolean {
  return check(ip, 'signup', 5, 15 * 60 * 1000);
}

/** Returns true if the resend attempt is allowed, false if rate-limited */
export function checkResendRate(ip: string): boolean {
  return check(ip, 'resend', 3, 10 * 60 * 1000);
}

// Prune stale buckets every 30 minutes to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 30 * 60 * 1000);
