/**
 * share-tokens.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilities for generating and hashing secure share tokens.
 *
 * Token format: 48 random bytes → base64url (64 chars, URL-safe, no padding)
 * Storage: SHA-256 hash stored in DB; raw token sent to client once.
 */
import { createHash, randomBytes } from 'node:crypto';

/** Generate a cryptographically random URL-safe token (64 chars). */
export function generateShareToken(): string {
  return randomBytes(48).toString('base64url');
}

/** Hash a raw token for DB storage (SHA-256 hex). */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Default share link TTL: 30 days */
export const DEFAULT_SHARE_TTL_DAYS = 30;

/** Build an expires_at Date from now + days. */
export function expiresAt(days = DEFAULT_SHARE_TTL_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
