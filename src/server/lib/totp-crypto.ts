/**
 * totp-crypto.ts
 *
 * AES-256-GCM encryption/decryption for TOTP secrets at rest.
 *
 * Format (versioned, base64url-encoded):
 *   v1:<base64url(iv + authTag + ciphertext)>
 *
 * Key derivation:
 *   TOTP_ENCRYPTION_KEY secret → SHA-256 → 32-byte AES key
 *   (SHA-256 lets us accept any-length key material from the secret store)
 *
 * Migration strategy:
 *   - decryptTotpSecret() accepts both plaintext (legacy, no 'v1:' prefix) and
 *     encrypted values. Plaintext is returned as-is so existing rows keep
 *     working until they are re-encrypted on next write.
 *   - encryptTotpSecret() always writes v1: format.
 *   - isTotpSecretEncrypted() lets callers check whether a stored value needs
 *     re-encryption.
 *
 * NEVER log the key, plaintext secret, or any intermediate crypto material.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getSecret } from '#airo/secrets';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES   = 12; // 96-bit IV — recommended for GCM
const TAG_BYTES  = 16; // 128-bit auth tag
const VERSION    = 'v1';

// ── Key derivation ─────────────────────────────────────────────────────────────

function deriveKey(): Buffer {
  const raw = getSecret('TOTP_ENCRYPTION_KEY');
  if (!raw) {
    throw new Error('[totp-crypto] TOTP_ENCRYPTION_KEY is not configured');
  }
  // SHA-256 of the raw key material → 32 bytes for AES-256
  return createHash('sha256').update(raw).digest();
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext TOTP secret.
 * Returns a versioned, base64url-encoded string safe for DB storage.
 */
export function encryptTotpSecret(plaintext: string): string {
  const key = deriveKey();
  const iv  = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Layout: iv (12) | tag (16) | ciphertext (variable)
  const payload = Buffer.concat([iv, tag, encrypted]);
  return `${VERSION}:${payload.toString('base64url')}`;
}

// ── Decrypt ───────────────────────────────────────────────────────────────────

/**
 * Decrypt a stored TOTP secret.
 *
 * - If the value starts with 'v1:' it is decrypted with AES-256-GCM.
 * - Otherwise it is treated as a legacy plaintext secret and returned as-is.
 *   This allows a zero-downtime migration: old rows keep working; new writes
 *   are always encrypted.
 *
 * Throws if decryption fails (wrong key, tampered ciphertext).
 */
export function decryptTotpSecret(stored: string): string {
  if (!stored.startsWith(`${VERSION}:`)) {
    // Legacy plaintext — return as-is (migration path)
    return stored;
  }

  const key     = deriveKey();
  const payload = Buffer.from(stored.slice(VERSION.length + 1), 'base64url');

  if (payload.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('[totp-crypto] Stored secret is too short to be valid');
  }

  const iv         = payload.subarray(0, IV_BYTES);
  const tag        = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the stored value is already encrypted (v1: prefix). */
export function isTotpSecretEncrypted(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`);
}

/** Returns true if TOTP_ENCRYPTION_KEY is configured. */
export function isTotpEncryptionConfigured(): boolean {
  return !!getSecret('TOTP_ENCRYPTION_KEY');
}
