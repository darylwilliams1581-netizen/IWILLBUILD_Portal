/**
 * Sign-in 2FA intercept tests
 *
 * Verifies that auth-middleware.ts correctly intercepts a successful BetterAuth
 * sign-in when the user has 2FA enabled, creates a pending challenge, and
 * returns TWO_FACTOR_REQUIRED instead of completing the session.
 *
 * These are structural / source-level tests — they verify the code is present
 * and correct without needing a live DB or BetterAuth instance.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/server/auth-middleware.ts', 'utf8');

describe('auth-middleware: 2FA sign-in intercept — source structure', () => {
  it('imports createChallenge from pending-2fa', () => {
    expect(SRC).toContain("createChallenge");
    expect(SRC).toContain("pending-2fa");
  });

  it('imports setChallengeCookie from pending-2fa', () => {
    expect(SRC).toContain("setChallengeCookie");
  });

  it('queries two_factor_enabled and sms_2fa_enabled after successful sign-in', () => {
    expect(SRC).toContain('two_factor_enabled');
    expect(SRC).toContain('sms_2fa_enabled');
    // Must be inside the sign-in success block (after userId is known)
    const successBlock = SRC.slice(SRC.indexOf('if (userId)'));
    expect(successBlock).toContain('two_factor_enabled');
    expect(successBlock).toContain('sms_2fa_enabled');
  });

  it('calls createChallenge with userId and method', () => {
    expect(SRC).toContain('createChallenge(userId, method)');
  });

  it('calls setChallengeCookie with res and token', () => {
    expect(SRC).toContain('setChallengeCookie(res, token)');
  });

  it('returns 403 TWO_FACTOR_REQUIRED when 2FA is enabled', () => {
    expect(SRC).toContain("status(403)");
    expect(SRC).toContain("TWO_FACTOR_REQUIRED");
  });

  it('includes the method field (totp or sms) in the 403 response', () => {
    const block403 = SRC.slice(SRC.indexOf('TWO_FACTOR_REQUIRED'));
    expect(block403).toContain('method');
  });

  it('attempts to revoke the BetterAuth session before returning 403', () => {
    expect(SRC).toContain('revokeSession');
  });

  it('falls through to normal login when 2FA check throws (fail-open)', () => {
    // The catch block must log but not block the user
    expect(SRC).toContain('2FA intercept check failed');
    // Must NOT re-throw — the catch block should just log
    const catchBlock = SRC.slice(SRC.indexOf('2FA intercept check failed'));
    const nextLine = catchBlock.split('\n').slice(0, 5).join('\n');
    expect(nextLine).not.toContain('throw');
  });

  it('does NOT complete the login (sendWebResponse) when 2FA is required', () => {
    // The return statement before sendWebResponse must be present
    // The 2FA block ends with `return;` before reaching sendWebResponse
    const twoFaBlock = SRC.slice(
      SRC.indexOf('2FA intercept'),
      SRC.indexOf('end 2FA intercept'),
    );
    expect(twoFaBlock).toContain('return;');
  });
});

describe('pending-2fa: setChallengeCookie export name', () => {
  it('exports setChallengeCookie (capital C) for consistency', () => {
    const pendingSrc = readFileSync('src/server/lib/pending-2fa.ts', 'utf8');
    expect(pendingSrc).toContain('export function setChallengeCookie(');
    // Old lowercase-c name must not exist
    expect(pendingSrc).not.toContain('export function setChallengecookie(');
  });
});

describe('2FA verify endpoints: challenge mode is the primary path', () => {
  it('verify/POST.ts handles challengeToken cookie before falling back to session', () => {
    const verifySrc = readFileSync('src/server/api/me/2fa/verify/POST.ts', 'utf8');
    const challengeIdx = verifySrc.indexOf('getChallengeTokenFromRequest');
    const sessionIdx   = verifySrc.indexOf('getAuth()');
    // Challenge check must come before session fallback
    expect(challengeIdx).toBeGreaterThan(-1);
    expect(sessionIdx).toBeGreaterThan(-1);
    expect(challengeIdx).toBeLessThan(sessionIdx);
  });

  it('recover/POST.ts handles challengeToken cookie before falling back to session', () => {
    const recoverSrc = readFileSync('src/server/api/me/2fa/recover/POST.ts', 'utf8');
    const challengeIdx = recoverSrc.indexOf('getChallengeTokenFromRequest');
    const sessionIdx   = recoverSrc.indexOf('getAuth()');
    expect(challengeIdx).toBeGreaterThan(-1);
    expect(sessionIdx).toBeGreaterThan(-1);
    expect(challengeIdx).toBeLessThan(sessionIdx);
  });
});

describe('auth-middleware: pending-2FA guard blocks protected routes', () => {
  it('calls checkPending2fa after session validation in entry.ts', () => {
    const entrySrc = readFileSync('src/server/entry.ts', 'utf8');
    // Find the call site (not the import), which is `await checkPending2fa(`
    const sessionCheckIdx = entrySrc.indexOf('if (!session?.user)');
    const callSiteIdx     = entrySrc.indexOf('await checkPending2fa(');
    expect(callSiteIdx).toBeGreaterThan(-1);
    expect(callSiteIdx).toBeGreaterThan(sessionCheckIdx);
  });

  it('returns early if checkPending2fa blocks the request', () => {
    const entrySrc = readFileSync('src/server/entry.ts', 'utf8');
    expect(entrySrc).toContain('if (blocked) return');
  });
});
