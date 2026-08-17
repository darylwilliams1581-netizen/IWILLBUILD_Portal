/**
 * share-tokens.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilities for generating, hashing, and encrypting secure share tokens.
 *
 * Token format: 48 random bytes → base64url (64 chars, URL-safe, no padding)
 * Storage:
 *   token_hash      — SHA-256 hex; used for fast lookup and validation
 *   token_encrypted — AES-256-GCM ciphertext; used to reconstruct the share
 *                     URL for the authenticated owner without storing plaintext
 *
 * Encryption key: derived from BETTER_AUTH_SECRET via HKDF-SHA256 so the
 * share-token key is domain-separated from the auth secret.
 * The raw token is NEVER stored in plaintext.
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';
import { getSecret } from '#airo/secrets';

// ── Token generation ──────────────────────────────────────────────────────────

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

// ── AES-256-GCM encryption for token recovery ─────────────────────────────────
//
// Format stored in token_encrypted (base64):
//   [12 bytes IV][16 bytes auth tag][N bytes ciphertext]
//
// The key is derived once per process from BETTER_AUTH_SECRET via HKDF so
// the share-token encryption key is domain-separated from the auth secret.

const HKDF_INFO = Buffer.from('iwillbuild-share-token-v1');
const HKDF_SALT = Buffer.from('share-token-encryption-salt-v1');

function deriveKey(): Buffer {
  const secretRaw = getSecret('BETTER_AUTH_SECRET') ?? 'fallback-dev-secret-not-for-production';
  const secret = typeof secretRaw === 'string' ? secretRaw : String(secretRaw);
  const keyMaterial = hkdfSync('sha256', Buffer.from(secret), HKDF_SALT, HKDF_INFO, 32);
  return Buffer.from(keyMaterial);
}

// Lazy singleton — derived once per process
let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = deriveKey();
  return _key;
}

/**
 * Encrypt a raw share token for at-rest storage.
 * Returns a base64 string: [12-byte IV][16-byte GCM tag][ciphertext].
 */
export function encryptToken(rawToken: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: IV(12) | TAG(16) | CIPHERTEXT
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt a token_encrypted value back to the raw token.
 * Returns null if decryption fails (tampered, wrong key, etc.).
 */
export function decryptToken(encrypted: string): string | null {
  try {
    const buf = Buffer.from(encrypted, 'base64');
    if (buf.length < 29) return null; // 12 IV + 16 tag + at least 1 byte
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct  = buf.subarray(28);
    const key = getKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}
