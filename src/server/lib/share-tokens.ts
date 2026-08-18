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
 * Encryption key: SECURE_SHARE_TOKEN_ENCRYPTION_KEY (dedicated secret only).
 *
 * If that secret is absent:
 *   - encryptToken() throws EncryptionKeyMissingError
 *   - decryptToken() returns null (safe — existing recipient links still work
 *     because they are validated by token_hash, not by the encrypted copy)
 *   - Callers (POST /api/secure-share, revoke-and-rotate) must catch
 *     EncryptionKeyMissingError and return a generic configuration error to
 *     the authenticated owner.  They must NOT expose the secret name or any
 *     key material to public recipients.
 *
 * There is NO fallback to BETTER_AUTH_SECRET or any other secret.
 * Using a different key would silently produce ciphertext that cannot be
 * decrypted after the dedicated key is configured, and would couple the
 * share-token encryption domain to the auth domain.
 *
 * ── Key format ───────────────────────────────────────────────────────────────
 * SECURE_SHARE_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters
 * (32 bytes / 256 bits).  If the value is not 64 hex chars, it is derived
 * to 32 bytes via HKDF-SHA256 (domain-separated) so any high-entropy string
 * works as a seed.  A 64-char hex string is used directly as the raw key.
 *
 * ── Key rotation note ────────────────────────────────────────────────────────
 * If SECURE_SHARE_TOKEN_ENCRYPTION_KEY is rotated, existing token_encrypted
 * values will fail to decrypt and decryptToken() will return null.  The modal
 * detects null and shows the "URL not recoverable" message with a prompt to
 * Revoke and Create New.  The share link itself continues to work for
 * recipients (validated by token_hash).  Only the owner's ability to recover
 * the URL from the modal is affected until they rotate the link.
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
// The key is a 32-byte value derived from SECURE_SHARE_TOKEN_ENCRYPTION_KEY.
// A unique random IV is generated per token — never reused.

const HKDF_INFO = Buffer.from('iwillbuild-share-token-v1');
const HKDF_SALT = Buffer.from('share-token-encryption-salt-v1');

/**
 * Thrown by encryptToken() when SECURE_SHARE_TOKEN_ENCRYPTION_KEY is not
 * configured.  Callers must catch this and return a generic configuration
 * error to the authenticated owner — never expose the secret name or any
 * key material to public recipients.
 */
export class EncryptionKeyMissingError extends Error {
  constructor() {
    super('Share token encryption key is not configured');
    this.name = 'EncryptionKeyMissingError';
  }
}

/**
 * Derive the 32-byte AES key from SECURE_SHARE_TOKEN_ENCRYPTION_KEY.
 * Returns null if the secret is absent or empty.
 * Never falls back to any other secret.
 */
function deriveKey(): Buffer | null {
  const raw = getSecret('SECURE_SHARE_TOKEN_ENCRYPTION_KEY');
  if (!raw) return null;

  const dedicated = typeof raw === 'string' ? raw : String(raw);
  if (!dedicated.trim()) return null;

  // If the dedicated key is already 32 bytes of hex (64 chars), use it directly
  if (/^[0-9a-fA-F]{64}$/.test(dedicated)) {
    return Buffer.from(dedicated, 'hex');
  }

  // Otherwise derive 32 bytes via HKDF for consistent length
  const km = hkdfSync('sha256', Buffer.from(dedicated), HKDF_SALT, HKDF_INFO, 32);
  return Buffer.from(km);
}

// Lazy singleton — derived once per process.
// Stored as Buffer (key present) or false (key confirmed absent).
// Never cached as null so that a missing key is not confused with "not yet derived".
let _keyCache: Buffer | false | undefined = undefined;

function getKey(): Buffer | null {
  if (_keyCache === undefined) {
    const k = deriveKey();
    _keyCache = k ?? false;
  }
  return _keyCache === false ? null : _keyCache;
}

/**
 * Encrypt a raw share token for at-rest storage.
 * Returns a base64 string: [12-byte IV][16-byte GCM tag][ciphertext].
 * A unique random IV is generated for every call — never reused.
 *
 * @throws {EncryptionKeyMissingError} if SECURE_SHARE_TOKEN_ENCRYPTION_KEY
 *   is not configured.  Callers must catch this and return a generic
 *   configuration error to the authenticated owner.
 */
export function encryptToken(rawToken: string): string {
  const key = getKey();
  if (!key) throw new EncryptionKeyMissingError();

  const iv = randomBytes(12); // unique per token
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: IV(12) | TAG(16) | CIPHERTEXT
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt a token_encrypted value back to the raw token.
 * Returns null if:
 *   - SECURE_SHARE_TOKEN_ENCRYPTION_KEY is not configured
 *   - Decryption fails (tampered data, wrong key, truncated blob)
 *
 * Returning null is safe — existing recipient links continue to work because
 * they are validated by token_hash, not by the encrypted copy.  The owner
 * modal shows "URL not recoverable" and prompts to Revoke and Create New.
 *
 * The GCM auth tag check is enforced by Node's crypto — any tampering throws
 * and is caught here, returning null safely.
 */
export function decryptToken(encrypted: string): string | null {
  try {
    const key = getKey();
    if (!key) return null; // key not configured — safe fallback

    const buf = Buffer.from(encrypted, 'base64');
    if (buf.length < 29) return null; // 12 IV + 16 tag + at least 1 byte of ciphertext
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct  = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    // Covers: wrong key, tampered ciphertext, bad auth tag, malformed base64
    return null;
  }
}
