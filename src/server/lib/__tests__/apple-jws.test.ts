import { describe, expect, it } from 'vitest';
import { verifyAppleTransaction } from '../apple-jws';

describe('verifyAppleTransaction', () => {
  it('rejects a transaction that is not signed by Apple', () => {
    expect(() => verifyAppleTransaction('a.b.c')).toThrow();
  });

  it('rejects an empty purchase', () => {
    expect(() => verifyAppleTransaction('')).toThrow(/Invalid Apple transaction/);
  });
});
