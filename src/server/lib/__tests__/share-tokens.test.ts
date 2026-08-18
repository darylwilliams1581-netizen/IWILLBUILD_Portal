/**
 * Unit tests for share-tokens.ts
 *
 * These tests run entirely in-process with no DB or network access.
 * They cover:
 *   - generateShareToken: format and uniqueness
 *   - hashToken: determinism and length
 *   - encryptToken / decryptToken: round-trip, tamper detection, missing key
 *   - EncryptionKeyMissingError: thrown when key absent, not thrown when present
 *   - decryptToken: returns null (not throws) when key absent
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock #airo/secrets before importing share-tokens ─────────────────────────
// We need to control what getSecret returns per test.
const mockGetSecret = vi.fn<(name: string) => string | null>();
vi.mock('#airo/secrets', () => ({
  getSecret: (name: string) => mockGetSecret(name),
}));

// Import AFTER mock is set up.
// We re-import the module in each test group to reset the singleton key cache.
// vitest's module isolation (isolate: true in vitest.config.ts) handles this.
import {
  generateShareToken,
  hashToken,
} from '../share-tokens.js';

// A valid 64-char hex key (32 bytes)
const VALID_KEY_HEX = 'a'.repeat(64);
// A non-hex high-entropy string (triggers HKDF path)
const VALID_KEY_PASSPHRASE = 'super-secret-passphrase-for-testing-only-not-production';

describe('generateShareToken', () => {
  it('produces a 64-char base64url string', () => {
    const t = generateShareToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('produces unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateShareToken()));
    expect(tokens.size).toBe(20);
  });
});

describe('hashToken', () => {
  it('produces a 64-char hex string', () => {
    const h = hashToken('some-token');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('differs for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('def'));
  });
});

describe('encryptToken / decryptToken — key present (hex)', () => {
  beforeEach(() => {
    mockGetSecret.mockImplementation((name) =>
      name === 'SECURE_SHARE_TOKEN_ENCRYPTION_KEY' ? VALID_KEY_HEX : null
    );
    // Reset the module-level singleton so the new mock is picked up
    vi.resetModules();
  });

  it('round-trips a token', async () => {
    // Re-import after resetModules to get a fresh singleton
    const { encryptToken: enc, decryptToken: dec } = await import('../share-tokens.js');
    const raw = generateShareToken();
    const ciphertext = enc(raw);
    expect(dec(ciphertext)).toBe(raw);
  });

  it('produces different ciphertext for the same plaintext (unique IV)', async () => {
    const { encryptToken: enc } = await import('../share-tokens.js');
    const raw = generateShareToken();
    const c1 = enc(raw);
    const c2 = enc(raw);
    expect(c1).not.toBe(c2);
  });

  it('returns null for tampered ciphertext', async () => {
    const { encryptToken: enc, decryptToken: dec } = await import('../share-tokens.js');
    const raw = generateShareToken();
    const ciphertext = enc(raw);
    // Flip a byte in the ciphertext portion (after IV+tag = 28 bytes)
    const buf = Buffer.from(ciphertext, 'base64');
    buf[30] ^= 0xff;
    expect(dec(buf.toString('base64'))).toBeNull();
  });

  it('returns null for truncated ciphertext', async () => {
    const { decryptToken: dec } = await import('../share-tokens.js');
    expect(dec('dG9vc2hvcnQ=')).toBeNull(); // "tooshort" in base64 — < 29 bytes
  });
});

describe('encryptToken / decryptToken — key present (passphrase, HKDF path)', () => {
  beforeEach(() => {
    mockGetSecret.mockImplementation((name) =>
      name === 'SECURE_SHARE_TOKEN_ENCRYPTION_KEY' ? VALID_KEY_PASSPHRASE : null
    );
    vi.resetModules();
  });

  it('round-trips a token via HKDF-derived key', async () => {
    const { encryptToken: enc, decryptToken: dec } = await import('../share-tokens.js');
    const raw = generateShareToken();
    expect(dec(enc(raw))).toBe(raw);
  });
});

describe('encryptToken — key absent', () => {
  beforeEach(() => {
    mockGetSecret.mockReturnValue(null);
    vi.resetModules();
  });

  it('throws EncryptionKeyMissingError', async () => {
    const { encryptToken: enc, EncryptionKeyMissingError: Err } = await import('../share-tokens.js');
    expect(() => enc('any-token')).toThrow(Err);
  });

  it('thrown error has name EncryptionKeyMissingError', async () => {
    const { encryptToken: enc } = await import('../share-tokens.js');
    try {
      enc('any-token');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).name).toBe('EncryptionKeyMissingError');
    }
  });
});

describe('decryptToken — key absent', () => {
  beforeEach(() => {
    mockGetSecret.mockReturnValue(null);
    vi.resetModules();
  });

  it('returns null (does not throw)', async () => {
    const { decryptToken: dec } = await import('../share-tokens.js');
    // Any base64 string — key is absent so decryption is skipped
    expect(dec(Buffer.alloc(40).toString('base64'))).toBeNull();
  });
});

describe('decryptToken — wrong key', () => {
  it('returns null when decrypted with a different key', async () => {
    // Encrypt with key A
    mockGetSecret.mockImplementation((name) =>
      name === 'SECURE_SHARE_TOKEN_ENCRYPTION_KEY' ? VALID_KEY_HEX : null
    );
    vi.resetModules();
    const { encryptToken: encA } = await import('../share-tokens.js');
    const raw = generateShareToken();
    const ciphertext = encA(raw);

    // Decrypt with key B
    const KEY_B = 'b'.repeat(64);
    mockGetSecret.mockImplementation((name) =>
      name === 'SECURE_SHARE_TOKEN_ENCRYPTION_KEY' ? KEY_B : null
    );
    vi.resetModules();
    const { decryptToken: decB } = await import('../share-tokens.js');
    expect(decB(ciphertext)).toBeNull();
  });
});
