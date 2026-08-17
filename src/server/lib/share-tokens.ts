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
 * Encryption key: SECURE_SHARE_TOKEN_ENCRYPTION_KEY (dedicated secret).
 * If that secret is absent the module falls back to deriving a key from
 * BETTER_AUTH_SECRET via HKDF-SHA256 so the share-token key is always
 * domain-separated from the auth secret.
 *
 * ── Key rotation note ────────────────────────────────────────────────────────
 * If SECURE_SHARE_TOKEN_ENCRYPTION_KEY (or the fallback BETTER_AUTH_SECRET)
 * is rotated, existing token_encrypted values will fail to decrypt and
 * decryptToken() will return null.  The modal detects null and shows the
 * "URL not recoverable" message with a prompt to Revoke and Create New.
 * The share link itself continues to work for recipients (it is validated by
 * token_hash, not by the encrypted copy).  Only the owner's ability to
 * recover the URL from the modal is affected until they rotate the link.
 * ─────────────────────────────────────────────────────────────────────────────
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
// The key is a 32-byte value derived from the dedicated secret.
// A unique random IV is generated per token — never reused.

const HKDF_INFO = Buffer.from('iwillbuild-share-token-v1');
const HKDF_SALT = Buffer.from('share-token-encryption-salt-v1');

function deriveKey(): Buffer {
  // Prefer the dedicated secret; fall back to BETTER_AUTH_SECRET via HKDF
  const dedicatedRaw = getSecret('SECURE_SHARE_TOKEN_ENCRYPTION_KEY');
  if (dedicatedRaw) {
    const dedicated = typeof dedicatedRaw === 'string' ? dedicatedRaw : String(dedicatedRaw);
    // If the dedicated key is already 32 bytes of hex (64 chars), use it directly
    if (/^[0-9a-fA-F]{64}$/.test(dedicated)) {
      return Buffer.from(dedicated, 'hex');
    }
    // Otherwise derive 32 bytes from it via HKDF for consistent length
    const km = hkdfSync('sha256', Buffer.from(dedicated), HKDF_SALT, HKDF_INFO, 32);
    return Buffer.from(km);
  }

  // Fallback: derive from BETTER_AUTH_SECRET (domain-separated)
  const fallbackRaw = getSecret('BETTER_AUTH_SECRET') ?? 'fallback-dev-secret-not-for-production';
  const fallback = typeof fallbackRaw === 'string' ? fallbackRaw : String(fallbackRaw);
  const km = hkdfSync('sha256', Buffer.from(fallback), HKDF_SALT, HKDF_INFO, 32);
  return Buffer.from(km);
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
 * A unique random IV is generated for every call — never reused.
 */
export function encryptToken(rawToken: string): string {
  const key = getKey();
  const iv = randomBytes(12); // unique per token
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: IV(12) | TAG(16) | CIPHERTEXT
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt a token_encrypted value back to the raw token.
 * Returns null if decryption fails (tampered data, wrong key, truncated blob).
 * The GCM auth tag check is enforced by Node's crypto — any tampering throws
 * and is caught here, returning null safely.
 */
export function decryptToken(encrypted: string): string | null {
  try {
    const buf = Buffer.from(encrypted, 'base64');
    if (buf.length < 29) return null; // 12 IV + 16 tag + at least 1 byte of ciphertext
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct  = buf.subarray(28);
    const key = getKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    // Covers: wrong key, tampered ciphertext, bad auth tag, malformed base64
    return null;
  }
}
