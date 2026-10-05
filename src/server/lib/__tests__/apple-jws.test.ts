import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { APPLE_ROOT_G3, verifyAppleTransaction } from '../apple-jws';

describe('Apple Root CA - G3 certificate input formats', () => {
  it('parses the configured PEM with the expected fingerprint', () => {
    const certificate = new X509Certificate(APPLE_ROOT_G3);

    expect(certificate.fingerprint256).toBe(
      '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
    );
    expect(certificate.subject).toContain('Apple Root CA - G3');
  });

  it('parses the same certificate as DER and through the x5c base64 decode path', () => {
    const root = new X509Certificate(APPLE_ROOT_G3);
    const der = root.raw;

    expect(new X509Certificate(der).fingerprint256).toBe(root.fingerprint256);
    expect(new X509Certificate(Buffer.from(der.toString('base64'), 'base64')).fingerprint256).toBe(
      root.fingerprint256,
    );
  });
});

describe('verifyAppleTransaction', () => {
  it('rejects a transaction that is not signed by Apple', () => {
    expect(() => verifyAppleTransaction('a.b.c')).toThrow();
  });

  it('rejects an empty purchase', () => {
    expect(() => verifyAppleTransaction('')).toThrow(/Invalid Apple transaction/);
  });
});
