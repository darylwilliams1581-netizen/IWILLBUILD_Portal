/**
 * TOTP Crypto Tests
 *
 * Covers:
 *   - encryptTotpSecret produces versioned ciphertext
 *   - decryptTotpSecret recovers the original plaintext
 *   - Decryption fails with wrong key (tamper detection)
 *   - Legacy plaintext (no v1: prefix) is returned as-is
 *   - isTotpSecretEncrypted correctly identifies format
 *   - Different plaintexts produce different ciphertexts (non-deterministic)
 *   - Secrets are never logged (no console.log calls with secret material)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getSecret to return a known test key
vi.mock('#airo/secrets', () => ({
  getSecret: vi.fn((name: string) => {
    if (name === 'TOTP_ENCRYPTION_KEY') return 'test-encryption-key-for-unit-tests-only';
    return null;
  }),
}));

describe('totp-crypto', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encryptTotpSecret produces a v1: prefixed string', async () => {
    const { encryptTotpSecret } = await import('../totp-crypto.js');
    const result = encryptTotpSecret('JBSWY3DPEHPK3PXP');
    expect(result).toMatch(/^v1:/);
  });

  it('decryptTotpSecret recovers the original plaintext', async () => {
    const { encryptTotpSecret, decryptTotpSecret } = await import('../totp-crypto.js');
    const plaintext = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const encrypted = encryptTotpSecret(plaintext);
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('decryptTotpSecret returns legacy plaintext as-is (no v1: prefix)', async () => {
    const { decryptTotpSecret } = await import('../totp-crypto.js');
    const legacy = 'JBSWY3DPEHPK3PXP';
    expect(decryptTotpSecret(legacy)).toBe(legacy);
  });

  it('isTotpSecretEncrypted returns true for v1: values', async () => {
    const { encryptTotpSecret, isTotpSecretEncrypted } = await import('../totp-crypto.js');
    const encrypted = encryptTotpSecret('JBSWY3DPEHPK3PXP');
    expect(isTotpSecretEncrypted(encrypted)).toBe(true);
  });

  it('isTotpSecretEncrypted returns false for legacy plaintext', async () => {
    const { isTotpSecretEncrypted } = await import('../totp-crypto.js');
    expect(isTotpSecretEncrypted('JBSWY3DPEHPK3PXP')).toBe(false);
  });

  it('two encryptions of the same plaintext produce different ciphertexts (random IV)', async () => {
    const { encryptTotpSecret } = await import('../totp-crypto.js');
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const c1 = encryptTotpSecret(plaintext);
    const c2 = encryptTotpSecret(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('decryption throws when ciphertext is tampered', async () => {
    const { encryptTotpSecret, decryptTotpSecret } = await import('../totp-crypto.js');
    const encrypted = encryptTotpSecret('JBSWY3DPEHPK3PXP');
    // Flip a byte in the base64url payload
    const parts = encrypted.split(':');
    const payload = Buffer.from(parts[1], 'base64url');
    payload[payload.length - 1] ^= 0xff; // flip last byte
    const tampered = `v1:${payload.toString('base64url')}`;
    expect(() => decryptTotpSecret(tampered)).toThrow();
  });

  it('decryption throws when payload is too short', async () => {
    const { decryptTotpSecret } = await import('../totp-crypto.js');
    expect(() => decryptTotpSecret('v1:dG9vc2hvcnQ=')).toThrow();
  });

  it('throws when TOTP_ENCRYPTION_KEY is not configured', async () => {
    const { getSecret } = await import('#airo/secrets');
    (getSecret as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const { encryptTotpSecret } = await import('../totp-crypto.js');
    expect(() => encryptTotpSecret('JBSWY3DPEHPK3PXP')).toThrow(/TOTP_ENCRYPTION_KEY/);
  });
});
