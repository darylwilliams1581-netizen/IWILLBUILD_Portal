/**
 * Sign-in 2FA architecture tests
 *
 * Verifies that the official BetterAuth twoFactor plugin is correctly wired:
 *   - auth.ts registers the twoFactor() plugin
 *   - auth-client.tsx registers twoFactorClient with onTwoFactorRedirect
 *   - auth-middleware.ts does NOT contain the old custom intercept
 *   - entry.ts does NOT call checkPending2fa (plugin handles pre-auth challenge)
 *   - The custom TOTP endpoints return 410 Gone
 *   - SMS 2FA endpoints are untouched
 *
 * These are structural / source-level tests — they verify the code is present
 * and correct without needing a live DB or BetterAuth instance.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const AUTH_SERVER = readFileSync('src/lib/auth/auth.ts', 'utf8');
const AUTH_CLIENT = readFileSync('src/lib/auth/auth-client.tsx', 'utf8');
const AUTH_MIDDLEWARE = readFileSync('src/server/auth-middleware.ts', 'utf8');
const ENTRY = readFileSync('src/server/entry.ts', 'utf8');
const LIB_MIDDLEWARE = readFileSync('src/server/lib/auth-middleware.ts', 'utf8');

// ── Server: official plugin registered ────────────────────────────────────────

describe('auth.ts: official twoFactor plugin', () => {
  it('imports twoFactor from better-auth/plugins', () => {
    expect(AUTH_SERVER).toContain("from 'better-auth/plugins'");
    expect(AUTH_SERVER).toContain('twoFactor');
  });

  it('passes twoFactor table to drizzle adapter schema', () => {
    expect(AUTH_SERVER).toContain('twoFactor: twoFactorTable');
  });

  it('registers twoFactor() in the plugins array', () => {
    expect(AUTH_SERVER).toContain('plugins:');
    expect(AUTH_SERVER).toContain("twoFactor({");
  });

  it('sets issuer to IWILLBUILD', () => {
    expect(AUTH_SERVER).toContain("issuer: 'IWILLBUILD'");
  });

  it('does NOT manually create sessions or insert session rows', () => {
    expect(AUTH_SERVER).not.toContain('INSERT INTO session');
    expect(AUTH_SERVER).not.toContain('createSession(');
  });
});

// ── Client: twoFactorClient plugin registered ─────────────────────────────────

describe('auth-client.tsx: twoFactorClient plugin', () => {
  it('imports twoFactorClient from better-auth/client/plugins', () => {
    expect(AUTH_CLIENT).toContain("from 'better-auth/client/plugins'");
    expect(AUTH_CLIENT).toContain('twoFactorClient');
  });

  it('registers twoFactorClient in createAuthClient plugins', () => {
    expect(AUTH_CLIENT).toContain('plugins:');
    expect(AUTH_CLIENT).toContain('twoFactorClient(');
  });

  it('provides onTwoFactorRedirect callback', () => {
    expect(AUTH_CLIENT).toContain('onTwoFactorRedirect');
  });

  it('uses module-level variable (not window global) for redirect handoff', () => {
    // The handoff must use the typed module-level _pendingTwoFactorRedirect variable,
    // not a window global. consumeTwoFactorRedirect() must be exported for login.tsx.
    expect(AUTH_CLIENT).toContain('_pendingTwoFactorRedirect');
    expect(AUTH_CLIENT).toContain('consumeTwoFactorRedirect');
    // Must NOT use window.__iwb_2fa_redirect__ (replaced by module-level variable)
    expect(AUTH_CLIENT).not.toContain('window.__iwb_2fa_redirect__');
  });
});

// ── auth-middleware.ts: custom intercept removed ──────────────────────────────

describe('auth-middleware.ts: custom TOTP intercept removed', () => {
  it('does NOT import createChallenge from pending-2fa', () => {
    expect(AUTH_MIDDLEWARE).not.toContain('createChallenge');
  });

  it('does NOT import setChallengeCookie from pending-2fa', () => {
    expect(AUTH_MIDDLEWARE).not.toContain('setChallengeCookie');
  });

  it('does NOT return 403 TWO_FACTOR_REQUIRED', () => {
    expect(AUTH_MIDDLEWARE).not.toContain('TWO_FACTOR_REQUIRED');
  });

  it('does NOT query two_factor_enabled in the sign-in path', () => {
    // The plugin handles this internally — the middleware must not duplicate it
    expect(AUTH_MIDDLEWARE).not.toContain('two_factor_enabled');
  });

  it('does NOT manually create sessions or sign cookies', () => {
    expect(AUTH_MIDDLEWARE).not.toContain('INSERT INTO session');
    // Must not manually set the session cookie (only BetterAuth/plugin may do this)
    expect(AUTH_MIDDLEWARE).not.toContain("res.cookie('better-auth.session_token'");
  });
});

// ── entry.ts: checkPending2fa removed ────────────────────────────────────────

describe('entry.ts: checkPending2fa guard removed', () => {
  it('does NOT import checkPending2fa', () => {
    // The import line must not include checkPending2fa
    const importLine = ENTRY.split('\n').find(l => l.includes('auth-middleware') && l.includes('import'));
    expect(importLine).toBeDefined();
    expect(importLine).not.toContain('checkPending2fa');
  });

  it('does NOT call checkPending2fa', () => {
    expect(ENTRY).not.toContain('await checkPending2fa(');
  });

  it('does NOT have if (blocked) return pattern from old guard', () => {
    // The old guard set `const blocked = await checkPending2fa(...)` then `if (blocked) return`
    expect(ENTRY).not.toContain('const blocked = await checkPending2fa');
  });
});

// ── lib/auth-middleware.ts: checkPending2fa still exists (SMS uses it) ────────

describe('lib/auth-middleware.ts: checkPending2fa preserved for SMS', () => {
  it('still exports checkPending2fa (SMS 2FA still uses pending_2fa_challenges)', () => {
    expect(LIB_MIDDLEWARE).toContain('checkPending2fa');
    expect(LIB_MIDDLEWARE).toContain('PENDING_2FA_ALLOWED');
  });
});

// ── Custom TOTP endpoints: 410 Gone ──────────────────────────────────────────

describe('retired custom TOTP endpoints return 410', () => {
  it('setup/GET.ts returns 410', () => {
    const src = readFileSync('src/server/api/me/2fa/setup/GET.ts', 'utf8');
    expect(src).toContain('410');
    expect(src).toContain('ENDPOINT_RETIRED');
  });

  it('enable/POST.ts returns 410', () => {
    const src = readFileSync('src/server/api/me/2fa/enable/POST.ts', 'utf8');
    expect(src).toContain('410');
    expect(src).toContain('ENDPOINT_RETIRED');
  });

  it('disable/POST.ts returns 410', () => {
    const src = readFileSync('src/server/api/me/2fa/disable/POST.ts', 'utf8');
    expect(src).toContain('410');
    expect(src).toContain('ENDPOINT_RETIRED');
  });

  it('verify/POST.ts returns 410', () => {
    const src = readFileSync('src/server/api/me/2fa/verify/POST.ts', 'utf8');
    expect(src).toContain('410');
    expect(src).toContain('ENDPOINT_RETIRED');
  });
});

// ── SMS endpoints: untouched ──────────────────────────────────────────────────

describe('SMS 2FA endpoints: untouched', () => {
  it('sms/verify/POST.ts does NOT return 410', () => {
    const src = readFileSync('src/server/api/me/2fa/sms/verify/POST.ts', 'utf8');
    expect(src).not.toContain('ENDPOINT_RETIRED');
    expect(src).toContain('export default');
  });

  it('sms/send/POST.ts does NOT return 410', () => {
    const src = readFileSync('src/server/api/me/2fa/sms/send/POST.ts', 'utf8');
    expect(src).not.toContain('ENDPOINT_RETIRED');
    expect(src).toContain('export default');
  });
});

// ── login.tsx: uses SDK signIn.email() ───────────────────────────────────────

describe('login.tsx: uses official SDK for sign-in and TOTP verify', () => {
  const LOGIN = readFileSync('src/pages/login.tsx', 'utf8');

  it('imports signIn and authClient from auth-client', () => {
    expect(LOGIN).toContain('authClient');
    expect(LOGIN).toContain('signIn');
  });

  it('calls signIn.email() not raw fetch for sign-in', () => {
    expect(LOGIN).toContain('signIn.email(');
    // Must NOT use raw fetch for the sign-in endpoint
    expect(LOGIN).not.toContain("fetch('/api/auth/sign-in/email'");
  });

  it('calls consumeTwoFactorRedirect() after signIn (not window global)', () => {
    // Must use the typed module-level consumer, not a window global read
    expect(LOGIN).toContain('consumeTwoFactorRedirect()');
    // Must NOT read window.__iwb_2fa_redirect__ directly
    expect(LOGIN).not.toContain('window.__iwb_2fa_redirect__');
    expect(LOGIN).not.toContain('__iwb_2fa_redirect__');
  });

  it('calls authClient.twoFactor.verifyTotp for TOTP verification', () => {
    expect(LOGIN).toContain('authClient.twoFactor.verifyTotp');
  });

  it('does NOT call the retired /api/me/2fa/verify endpoint', () => {
    expect(LOGIN).not.toContain("'/api/me/2fa/verify'");
  });

  it('still calls /api/me/2fa/sms/verify for SMS (unchanged)', () => {
    expect(LOGIN).toContain('/api/me/2fa/sms/verify');
  });
});

// ── SecurityTab.tsx: uses official plugin for TOTP enrolment ─────────────────

describe('SecurityTab.tsx: uses official plugin for TOTP enrolment', () => {
  const SECURITY_TAB = readFileSync('src/components/settings/SecurityTab.tsx', 'utf8');

  it('imports authClient from auth-client', () => {
    expect(SECURITY_TAB).toContain('authClient');
  });

  it('calls authClient.twoFactor.enable for setup', () => {
    expect(SECURITY_TAB).toContain('authClient.twoFactor.enable(');
  });

  it('calls authClient.twoFactor.verifyTotp for enrolment verification', () => {
    expect(SECURITY_TAB).toContain('authClient.twoFactor.verifyTotp(');
  });

  it('calls authClient.twoFactor.disable for disabling', () => {
    expect(SECURITY_TAB).toContain('authClient.twoFactor.disable(');
  });

  it('does NOT call the retired /api/me/2fa/setup endpoint', () => {
    expect(SECURITY_TAB).not.toContain("'/api/me/2fa/setup'");
  });

  it('does NOT call the retired /api/me/2fa/enable endpoint', () => {
    expect(SECURITY_TAB).not.toContain("'/api/me/2fa/enable'");
  });

  it('does NOT call the retired /api/me/2fa/disable endpoint', () => {
    expect(SECURITY_TAB).not.toContain("'/api/me/2fa/disable'");
  });

  // ── Enable-password dialog ────────────────────────────────────────────────

  it('has a dedicated enablePw state separate from disablePw', () => {
    // Both states must exist and be named differently — they must never be shared
    expect(SECURITY_TAB).toContain('enablePw');
    expect(SECURITY_TAB).toContain('disablePw');
    // Both must appear as useState variable declarations (not just string literals)
    expect(SECURITY_TAB).toMatch(/\[enablePw,\s*setEnablePw\]/);
    expect(SECURITY_TAB).toMatch(/\[disablePw,\s*setDisablePw\]/);
  });

  it('passes enablePw (not disablePw) to twoFactor.enable()', () => {
    // The enable call must use enablePw, not disablePw
    expect(SECURITY_TAB).toContain('enable({ password: enablePw');
    expect(SECURITY_TAB).not.toContain('enable({ password: disablePw');
  });

  it('has a totp-confirm phase for the password dialog', () => {
    expect(SECURITY_TAB).toContain("'totp-confirm'");
    expect(SECURITY_TAB).toContain('totp-confirm');
  });

  it('shows inline error inside the dialog (enableError state)', () => {
    expect(SECURITY_TAB).toContain('enableError');
    expect(SECURITY_TAB).toContain('setEnableError(');
  });

  it('keeps dialog open on wrong password (does not navigate away)', () => {
    // On error, setEnableError is called — setPhase('disabled') must NOT be called
    // inside the error branch of confirmAndEnable
    const confirmFn = SECURITY_TAB.slice(
      SECURITY_TAB.indexOf('async function confirmAndEnable'),
      SECURITY_TAB.indexOf('async function verifyTotpEnable'),
    );
    // The error branch sets enableError and returns — it must not call setPhase
    expect(confirmFn).toContain('setEnableError(');
    // After setEnableError there should be a return before any setPhase call
    const errorBranch = confirmFn.slice(
      confirmFn.indexOf('setEnableError('),
      confirmFn.indexOf('setPhase('),
    );
    expect(errorBranch).toContain('return;');
  });

  it('clears enablePw after successful enable (before showing QR screen)', () => {
    // enablePw must be cleared before transitioning to totp-setup
    const confirmFn = SECURITY_TAB.slice(
      SECURITY_TAB.indexOf('async function confirmAndEnable'),
      SECURITY_TAB.indexOf('async function verifyTotpEnable'),
    );
    const setupTransition = confirmFn.indexOf("setPhase('totp-setup')");
    const clearPw = confirmFn.lastIndexOf("setEnablePw('')", setupTransition);
    expect(clearPw).toBeGreaterThan(-1);
    expect(clearPw).toBeLessThan(setupTransition);
  });

  it('displays backup codes after enable (in totp-setup phase)', () => {
    expect(SECURITY_TAB).toContain('backupCodes');
    expect(SECURITY_TAB).toContain('backupCodes.length > 0');
    // Backup codes must be shown in the totp-setup section
    const setupSection = SECURITY_TAB.slice(
      SECURITY_TAB.indexOf("phase === 'totp-setup'"),
      SECURITY_TAB.indexOf("phase === 'totp-enabled'"),
    );
    expect(setupSection).toContain('backupCodes');
  });
});

// ── login.tsx: backup-code path ───────────────────────────────────────────────

describe('login.tsx: backup-code path uses verifyBackupCode (not verifyTotp)', () => {
  const LOGIN = readFileSync('src/pages/login.tsx', 'utf8');

  it('calls authClient.twoFactor.verifyBackupCode for backup codes', () => {
    // Confirmed method name from BetterAuth 1.6.25 source:
    // POST /two-factor/verify-backup-code → authClient.twoFactor.verifyBackupCode({ code })
    expect(LOGIN).toContain('authClient.twoFactor.verifyBackupCode(');
  });

  it('does NOT send backup codes to verifyTotp', () => {
    // The backup-code branch is guarded by `if (useBackupCode)` and returns early.
    // Extract only the backup-code branch by finding the `if (useBackupCode)` guard
    // and slicing up to the TOTP/SMS section that follows it.
    const backupStart = LOGIN.indexOf('if (useBackupCode)');
    expect(backupStart).toBeGreaterThan(-1);
    // The TOTP/SMS section starts with a comment containing "TOTP / SMS path"
    const totpSmsStart = LOGIN.indexOf('TOTP / SMS path', backupStart);
    expect(totpSmsStart).toBeGreaterThan(backupStart);
    const backupBranch = LOGIN.slice(backupStart, totpSmsStart);
    // The backup branch must call verifyBackupCode
    expect(backupBranch).toContain('verifyBackupCode(');
    // The backup branch must NOT CALL verifyTotp (comments mentioning it are fine)
    // Check for the actual function call pattern, not just the string
    expect(backupBranch).not.toContain('verifyTotp(');
  });

  it('has useBackupCode state to toggle between TOTP and backup-code input', () => {
    expect(LOGIN).toContain('useBackupCode');
    expect(LOGIN).toContain('setUseBackupCode');
  });

  it('has backupCodeInput state for the backup code text field', () => {
    expect(LOGIN).toContain('backupCodeInput');
    expect(LOGIN).toContain('setBackupCodeInput');
  });

  it('shows "Use a backup code instead" toggle only for TOTP (not SMS)', () => {
    // The toggle must be conditional on tfa2Method !== 'sms'
    expect(LOGIN).toContain("tfa2Method !== 'sms'");
    expect(LOGIN).toContain('Use a backup code instead');
  });

  it('resets backup code state when going back to login', () => {
    // The "Back to login" button must clear backupCodeInput and useBackupCode
    const backButton = LOGIN.slice(
      LOGIN.indexOf('Back to login') - 300,
      LOGIN.indexOf('Back to login') + 50,
    );
    expect(backButton).toContain('setBackupCodeInput');
    expect(backButton).toContain('setUseBackupCode');
  });
});

// ── Schema: twoFactor table defined ──────────────────────────────────────────

describe('schema.ts: twoFactor table defined', () => {
  const SCHEMA = readFileSync('src/server/db/schema.ts', 'utf8');

  it('exports twoFactor table', () => {
    expect(SCHEMA).toContain("export const twoFactor = mysqlTable('twoFactor'");
  });

  it('twoFactor table has required plugin fields', () => {
    expect(SCHEMA).toContain('secret');
    expect(SCHEMA).toContain('backupCodes');
    expect(SCHEMA).toContain('userId');
    expect(SCHEMA).toContain('verified');
    expect(SCHEMA).toContain('failedVerificationCount');
    expect(SCHEMA).toContain('lockedUntil');
  });

  it('user table has twoFactorEnabled field', () => {
    expect(SCHEMA).toContain('twoFactorEnabled');
  });
});
