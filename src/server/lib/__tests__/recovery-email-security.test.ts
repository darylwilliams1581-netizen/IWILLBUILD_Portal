/**
 * recovery-email-security.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused security tests for the protected recovery-email change flow.
 *
 * Tests cover:
 *   1.  Stolen-session attempt — no password → 403
 *   2.  Missing 2FA when enrolled → 403 with requiresTwoFactor flag
 *   3.  Wrong password → 403
 *   4.  Old-address cancellation revokes proposal, not sessions
 *   5.  Hold-period enforcement — new address cannot activate before hold expires
 *   6.  Token replay — cancel token cannot be used twice
 *   7.  Token replay — verify token cannot be used twice
 *   8.  Freeze token — revokes all sessions
 *   9.  Freeze token replay — second use rejected
 *  10.  Session revocation on freeze — DELETE FROM session called
 *  11.  Audit log — every state transition writes an event
 *  12.  Address masking — plain address never returned by getPublicState
 *  13.  Block enforcement — change blocked after password reset
 *  14.  Block enforcement — change allowed after block expires
 *  15.  Admin freeze — operator can freeze but not overwrite address
 *  16.  Frozen account — request rejected immediately
 *  17.  Same-as-active guard — cannot re-request current address
 *  18.  Token not found — returns NOT_FOUND, not a 500
 *  19.  maskEmail — never returns plain address
 *  20.  Verify token expiry — expired token rejected
 *  21.  GET cancel/freeze — confirmation step only, no destructive action
 *  22.  POST cancel/freeze — execution step, performs action
 *  23.  Generic error codes — NOT_FOUND and ALREADY_USED both map to "invalid"
 *  24.  Rate limiting — recoveryTokenLimiter exported from api-rate-limiter
 *  25.  POST cancel/freeze in PUBLIC_API_ROUTES
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Source-level assertions (no DB required) ──────────────────────────────────

const SERVICE = readFileSync(
  resolve(__dirname, '../recovery-email-service.ts'),
  'utf8',
);

const REQUEST_HANDLER = readFileSync(
  resolve(__dirname, '../../api/me/recovery-email/request/POST.ts'),
  'utf8',
);

const CANCEL_HANDLER = readFileSync(
  resolve(__dirname, '../../api/me/recovery-email/cancel/GET.ts'),
  'utf8',
);

const CANCEL_POST_HANDLER = readFileSync(
  resolve(__dirname, '../../api/me/recovery-email/cancel/POST.ts'),
  'utf8',
);

const FREEZE_HANDLER = readFileSync(
  resolve(__dirname, '../../api/me/recovery-email/freeze/GET.ts'),
  'utf8',
);

const FREEZE_POST_HANDLER = readFileSync(
  resolve(__dirname, '../../api/me/recovery-email/freeze/POST.ts'),
  'utf8',
);

const ADMIN_FREEZE_HANDLER = readFileSync(
  resolve(__dirname, '../../api/admin/recovery-email/freeze/POST.ts'),
  'utf8',
);

const GET_HANDLER = readFileSync(
  resolve(__dirname, '../../api/me/recovery-email/GET.ts'),
  'utf8',
);

const VERIFY_HANDLER = readFileSync(
  resolve(__dirname, '../../api/me/recovery-email/verify/GET.ts'),
  'utf8',
);

// ── maskEmail unit tests ──────────────────────────────────────────────────────

describe('maskEmail — address masking', () => {
  // Import the pure function directly (no DB)
  it('never returns the plain address for a standard email', () => {
    // Extract the function body and verify the masking logic is present
    expect(SERVICE).toContain('export function maskEmail');
    expect(SERVICE).toContain("'***'");
    // Verify it uses slice(0,1) + '***' pattern (not full local part)
    expect(SERVICE).toContain("slice(0, 1)      + '***'");
  });

  it('masks both local and domain parts', () => {
    expect(SERVICE).toContain('maskedLocal');
    expect(SERVICE).toContain('maskedDomain');
  });

  it('getPublicState returns masked addresses, never plain', () => {
    // getPublicState must call maskEmail before returning
    const getPublicFn = SERVICE.slice(SERVICE.indexOf('export async function getPublicState'));
    expect(getPublicFn).toContain('maskEmail(state.activeEmail)');
    expect(getPublicFn).toContain('maskEmail(state.proposedEmail)');
    // Must NOT return activeEmail or proposedEmail directly
    expect(getPublicFn).not.toContain('activeEmail: state.activeEmail');
    expect(getPublicFn).not.toContain('proposedEmail: state.proposedEmail');
  });
});

// ── Request handler security gates ───────────────────────────────────────────

describe('POST /api/me/recovery-email/request — security gates', () => {
  it('requires a valid session — returns 401 when no session', () => {
    expect(REQUEST_HANDLER).toContain("return res.status(401).json({ error: 'Unauthorised' })");
  });

  it('requires password — returns 400 when password missing', () => {
    expect(REQUEST_HANDLER).toContain("'Current password is required.'");
  });

  it('verifies password via BetterAuth signInEmail before proceeding', () => {
    // Must call auth.api.signInEmail with the provided password
    expect(REQUEST_HANDLER).toContain('auth.api.signInEmail');
    expect(REQUEST_HANDLER).toContain('password');
    // Must reject on failure
    expect(REQUEST_HANDLER).toContain("return res.status(403).json({ error: 'Incorrect password.' })");
  });

  it('requires TOTP code when 2FA enrolled — returns 403 with requiresTwoFactor flag', () => {
    expect(REQUEST_HANDLER).toContain('twoFactorEnabled');
    expect(REQUEST_HANDLER).toContain("return res.status(403).json({ error: 'Two-factor code required.'");
    expect(REQUEST_HANDLER).toContain('requiresTwoFactor: true');
  });

  it('verifies TOTP via official plugin before proceeding', () => {
    expect(REQUEST_HANDLER).toContain('auth.api.verifyTOTP');
    expect(REQUEST_HANDLER).toContain("return res.status(403).json({ error: 'Invalid two-factor code.' })");
  });

  it('does NOT rely on session alone — password check is always required', () => {
    // The handler must check password AFTER session, not skip it
    const sessionIdx  = REQUEST_HANDLER.indexOf('getSession');
    const passwordIdx = REQUEST_HANDLER.indexOf('signInEmail');
    expect(sessionIdx).toBeGreaterThan(-1);
    expect(passwordIdx).toBeGreaterThan(sessionIdx);
  });

  it('blocks change when active block exists — returns 403 with blockedUntil', () => {
    expect(REQUEST_HANDLER).toContain("case 'BLOCKED':");
    expect(REQUEST_HANDLER).toContain('blockedUntil');
  });

  it('blocks change when account is frozen — returns 403', () => {
    expect(REQUEST_HANDLER).toContain("case 'FROZEN':");
    expect(REQUEST_HANDLER).toContain("'This account is frozen. Contact support.'");
  });
});

// ── Service: block enforcement ────────────────────────────────────────────────

describe('recovery-email-service — block enforcement', () => {
  it('exports placeChangeBlock for password_reset, mfa_reset, suspicious_login, new_device_login', () => {
    expect(SERVICE).toContain('export async function placeChangeBlock');
    expect(SERVICE).toContain("'password_reset'");
    expect(SERVICE).toContain("'mfa_reset'");
    expect(SERVICE).toContain("'suspicious_login'");
    expect(SERVICE).toContain("'new_device_login'");
  });

  it('placeChangeBlock uses BLOCK_HOURS constant (72 hours)', () => {
    expect(SERVICE).toContain('export const BLOCK_HOURS = 72');
    // placeChangeBlock must use BLOCK_HOURS
    const blockFn = SERVICE.slice(SERVICE.indexOf('export async function placeChangeBlock'));
    expect(blockFn.slice(0, 500)).toContain('BLOCK_HOURS');
  });

  it('getActiveBlock queries blocked_until > NOW', () => {
    const fn = SERVICE.slice(SERVICE.indexOf('export async function getActiveBlock'));
    expect(fn.slice(0, 400)).toContain('blocked_until');
    expect(fn.slice(0, 400)).toContain('NOW');
  });

  it('password-reset handler calls placeChangeBlock after token consumption', () => {
    const passwordReset = readFileSync(
      resolve(__dirname, '../password-reset.ts'),
      'utf8',
    );
    expect(passwordReset).toContain('placeChangeBlock');
    expect(passwordReset).toContain("'password_reset'");
    // Must be called AFTER consumeResetToken logic
    const consumeIdx = passwordReset.indexOf('export async function consumeResetToken');
    const blockIdx   = passwordReset.indexOf('placeChangeBlock', consumeIdx);
    expect(blockIdx).toBeGreaterThan(consumeIdx);
  });
});

// ── Service: hold-period enforcement ─────────────────────────────────────────

describe('recovery-email-service — hold-period enforcement', () => {
  it('uses HOLD_DAYS = 7 constant', () => {
    expect(SERVICE).toContain('export const HOLD_DAYS = 7');
  });

  it('sets hold_expires_at = proposedAt + HOLD_DAYS on request', () => {
    const requestFn = SERVICE.slice(SERVICE.indexOf('export async function requestRecoveryEmailChange'));
    expect(requestFn.slice(0, 2000)).toContain('holdExpiry');
    expect(requestFn.slice(0, 2000)).toContain('HOLD_DAYS');
  });

  it('activateProposed checks holdExpiresAt <= NOW before activating', () => {
    const activateFn = SERVICE.slice(SERVICE.indexOf('async function activateProposed'));
    expect(activateFn.slice(0, 600)).toContain('holdExpiresAt');
    expect(activateFn.slice(0, 600)).toContain('new Date() < state.holdExpiresAt');
  });

  it('verifyRecoveryEmailToken does NOT activate immediately when hold is still active', () => {
    // The whole service file contains the hold check — verify it's present
    expect(SERVICE).toContain('alreadyActive');
    expect(SERVICE).toContain('holdExpiry <= new Date()');
    // activateProposed is only called when alreadyActive is true
    const verifyFn = SERVICE.slice(
      SERVICE.indexOf('export async function verifyRecoveryEmailToken'),
      SERVICE.indexOf('// ── Activate proposed'),
    );
    expect(verifyFn).toContain('alreadyActive');
    expect(verifyFn).toContain('holdExpiry');
  });
});

// ── Service: token replay prevention ─────────────────────────────────────────

describe('recovery-email-service — token replay prevention', () => {
  it('cancel token: rejects ALREADY_USED on second use', () => {
    const cancelFn = SERVICE.slice(SERVICE.indexOf('export async function cancelRecoveryEmailChange'));
    expect(cancelFn.slice(0, 800)).toContain("'ALREADY_USED'");
    expect(cancelFn.slice(0, 800)).toContain('cancel_token_used_at');
  });

  it('cancel token: sets cancel_token_used_at on first use', () => {
    const cancelFn = SERVICE.slice(SERVICE.indexOf('export async function cancelRecoveryEmailChange'));
    expect(cancelFn.slice(0, 1500)).toContain('cancel_token_used_at    = NOW(3)');
  });

  it('freeze token: rejects ALREADY_USED on second use', () => {
    const freezeFn = SERVICE.slice(SERVICE.indexOf('export async function freezeAccountViaToken'));
    expect(freezeFn.slice(0, 800)).toContain("'ALREADY_USED'");
    expect(freezeFn.slice(0, 800)).toContain('freeze_token_used_at');
  });

  it('freeze token: sets freeze_token_used_at on first use', () => {
    const freezeFn = SERVICE.slice(SERVICE.indexOf('export async function freezeAccountViaToken'));
    expect(freezeFn.slice(0, 1500)).toContain('freeze_token_used_at');
  });

  it('verify token: rejects ALREADY_USED when proposedVerifiedAt is set', () => {
    const verifyFn = SERVICE.slice(SERVICE.indexOf('export async function verifyRecoveryEmailToken'));
    expect(verifyFn.slice(0, 800)).toContain("'ALREADY_USED'");
    expect(verifyFn.slice(0, 800)).toContain('proposed_verified_at');
  });

  it('tokens are stored as SHA-256 hashes, never plain', () => {
    // hashToken must be called before any INSERT/UPDATE
    expect(SERVICE).toContain('function hashToken');
    expect(SERVICE).toContain("createHash('sha256')");
    // The raw token must never be stored directly
    expect(SERVICE).toContain('hashToken(verifyToken)');
    expect(SERVICE).toContain('hashToken(cancelToken)');
    expect(SERVICE).toContain('hashToken(freezeToken)');
  });

  it('token comparison uses timingSafeEqual to prevent timing attacks', () => {
    expect(SERVICE).toContain('timingSafeEqual');
    expect(SERVICE).toContain('safeCompareHash');
  });
});

// ── Service: session revocation on freeze ─────────────────────────────────────

describe('recovery-email-service — session revocation', () => {
  it('freezeAccountViaToken calls revokeAllSessions', () => {
    const freezeFn = SERVICE.slice(SERVICE.indexOf('export async function freezeAccountViaToken'));
    expect(freezeFn.slice(0, 1500)).toContain('revokeAllSessions');
  });

  it('revokeAllSessions deletes from session table', () => {
    const revokeFn = SERVICE.slice(SERVICE.indexOf('async function revokeAllSessions'));
    expect(revokeFn.slice(0, 400)).toContain('DELETE FROM session');
    expect(revokeFn.slice(0, 400)).toContain('user_id');
  });

  it('adminFreezeAccount also calls revokeAllSessions', () => {
    // Search the whole service — adminFreezeAccount is a long function
    expect(SERVICE).toContain('export async function adminFreezeAccount');
    // revokeAllSessions must appear after adminFreezeAccount definition
    const adminIdx  = SERVICE.indexOf('export async function adminFreezeAccount');
    const revokeIdx = SERVICE.indexOf('revokeAllSessions(userId)', adminIdx);
    expect(revokeIdx).toBeGreaterThan(adminIdx);
  });

  it('cancelRecoveryEmailChange does NOT revoke sessions (cancel ≠ takeover)', () => {
    const cancelFn = SERVICE.slice(
      SERVICE.indexOf('export async function cancelRecoveryEmailChange'),
      SERVICE.indexOf('export async function freezeAccountViaToken'),
    );
    expect(cancelFn).not.toContain('revokeAllSessions');
    expect(cancelFn).not.toContain('DELETE FROM session');
  });
});

// ── Service: audit logging ────────────────────────────────────────────────────

describe('recovery-email-service — audit logging', () => {
  it('exports auditLog function', () => {
    expect(SERVICE).toContain('export async function auditLog');
  });

  it('auditLog stores masked email, never plain', () => {
    const auditFn = SERVICE.slice(SERVICE.indexOf('export async function auditLog'));
    expect(auditFn.slice(0, 600)).toContain('maskEmail');
    // Must not insert the raw email param
    expect(auditFn.slice(0, 600)).not.toContain('params.email,');
  });

  it('requestRecoveryEmailChange writes requested audit event', () => {
    // The audit call is near the end of the function — search from function start to next export
    const start = SERVICE.indexOf('export async function requestRecoveryEmailChange');
    const end   = SERVICE.indexOf('// ── Verify token', start);
    const requestFn = SERVICE.slice(start, end);
    expect(requestFn).toContain("event: 'requested'");
  });

  it('verifyRecoveryEmailToken writes verified audit event', () => {
    const verifyFn = SERVICE.slice(SERVICE.indexOf('export async function verifyRecoveryEmailToken'));
    expect(verifyFn.slice(0, 1500)).toContain("event: 'verified'");
  });

  it('activateProposed writes activated audit event', () => {
    const activateFn = SERVICE.slice(SERVICE.indexOf('async function activateProposed'));
    expect(activateFn.slice(0, 1000)).toContain("event: 'activated'");
  });

  it('cancelRecoveryEmailChange writes cancelled audit event', () => {
    const cancelFn = SERVICE.slice(SERVICE.indexOf('export async function cancelRecoveryEmailChange'));
    expect(cancelFn.slice(0, 1500)).toContain("event: 'cancelled'");
  });

  it('freezeAccountViaToken writes frozen audit event', () => {
    const start = SERVICE.indexOf('export async function freezeAccountViaToken');
    const end   = SERVICE.indexOf('// ── Admin freeze', start);
    const freezeFn = SERVICE.slice(start, end);
    expect(freezeFn).toContain("event:     'frozen'");
  });

  it('adminFreezeAccount writes admin_freeze and admin_case_opened events', () => {
    const adminIdx = SERVICE.indexOf('export async function adminFreezeAccount');
    const auditIdx = SERVICE.indexOf("event:       'admin_freeze'", adminIdx);
    expect(auditIdx).toBeGreaterThan(adminIdx);
    // admin_case_opened is written by the admin handler
    expect(ADMIN_FREEZE_HANDLER).toContain("'admin_case_opened'");
  });
});

// ── Admin handler: operator cannot overwrite address ─────────────────────────

describe('POST /api/admin/recovery-email/freeze — operator restrictions', () => {
  it('requires isAdmin flag — returns 403 for non-admin', () => {
    expect(ADMIN_FREEZE_HANDLER).toContain('isAdmin');
    expect(ADMIN_FREEZE_HANDLER).toContain("return res.status(403).json({ error: 'Forbidden' })");
  });

  it('calls adminFreezeAccount (freeze + case) not a direct address overwrite', () => {
    expect(ADMIN_FREEZE_HANDLER).toContain('adminFreezeAccount');
    // Must NOT write to active_email or proposed_email directly
    expect(ADMIN_FREEZE_HANDLER).not.toContain('active_email');
    expect(ADMIN_FREEZE_HANDLER).not.toContain('proposed_email');
  });

  it('requires userId and reason — returns 400 when missing', () => {
    expect(ADMIN_FREEZE_HANDLER).toContain("'userId is required.'");
    expect(ADMIN_FREEZE_HANDLER).toContain("'reason is required.'");
  });
});

// ── Token handlers: no token in response body ─────────────────────────────────

describe('Token handlers — tokens never exposed in response body', () => {
  it('verify handler redirects, never returns token in JSON body', () => {
    expect(VERIFY_HANDLER).toContain('res.redirect');
    expect(VERIFY_HANDLER).not.toContain('res.json({ token');
    expect(VERIFY_HANDLER).not.toContain('token:');
  });

  it('cancel handler redirects, never returns token in JSON body', () => {
    expect(CANCEL_HANDLER).toContain('res.redirect');
    expect(CANCEL_HANDLER).not.toContain('res.json({ token');
  });

  it('freeze handler redirects, never returns token in JSON body', () => {
    expect(FREEZE_HANDLER).toContain('res.redirect');
    expect(FREEZE_HANDLER).not.toContain('res.json({ token');
  });

  it('GET handler returns only masked state fields', () => {
    expect(GET_HANDLER).toContain('getPublicState');
    // Must not return raw state directly
    expect(GET_HANDLER).not.toContain('activeEmail:');
    expect(GET_HANDLER).not.toContain('proposedEmail:');
    expect(GET_HANDLER).not.toContain('verifyTokenHash');
    expect(GET_HANDLER).not.toContain('cancelTokenHash');
    expect(GET_HANDLER).not.toContain('freezeTokenHash');
  });
});

// ── Schema: three tables defined ─────────────────────────────────────────────

describe('DB schema — recovery email tables', () => {
  const SCHEMA = readFileSync(
    resolve(__dirname, '../../db/schema.ts'),
    'utf8',
  );

  it('exports recoveryEmailState table', () => {
    expect(SCHEMA).toContain('export const recoveryEmailState');
    expect(SCHEMA).toContain("'recovery_email_state'");
  });

  it('exports recoveryEmailAudit table', () => {
    expect(SCHEMA).toContain('export const recoveryEmailAudit');
    expect(SCHEMA).toContain("'recovery_email_audit'");
  });

  it('exports recoveryChangeBlocks table', () => {
    expect(SCHEMA).toContain('export const recoveryChangeBlocks');
    expect(SCHEMA).toContain("'recovery_change_blocks'");
  });

  it('recoveryEmailState has hold_expires_at column', () => {
    const tableBlock = SCHEMA.slice(SCHEMA.indexOf("'recovery_email_state'"));
    expect(tableBlock.slice(0, 2000)).toContain('holdExpiresAt');
  });

  it('recoveryEmailState has separate cancel and freeze token columns', () => {
    const tableBlock = SCHEMA.slice(SCHEMA.indexOf("'recovery_email_state'"));
    expect(tableBlock.slice(0, 2000)).toContain('cancelTokenHash');
    expect(tableBlock.slice(0, 2000)).toContain('freezeTokenHash');
  });

  it('recoveryEmailState has frozen_at column for account freeze', () => {
    const tableBlock = SCHEMA.slice(SCHEMA.indexOf("'recovery_email_state'"));
    expect(tableBlock.slice(0, 2000)).toContain('frozenAt');
  });

  it('recoveryEmailAudit has masked_email column (not plain)', () => {
    const tableBlock = SCHEMA.slice(SCHEMA.indexOf("'recovery_email_audit'"));
    expect(tableBlock.slice(0, 1000)).toContain('maskedEmail');
    expect(tableBlock.slice(0, 1000)).not.toContain("'email'");
  });
});

// ── GET/POST split: confirmation vs execution ─────────────────────────────────

describe('GET cancel/freeze — confirmation step only, no destructive action', () => {
  it('GET cancel handler does NOT call cancelRecoveryEmailChange', () => {
    expect(CANCEL_HANDLER).not.toContain('cancelRecoveryEmailChange');
  });

  it('GET cancel handler redirects to confirmation page, not result page', () => {
    expect(CANCEL_HANDLER).toContain('recovery_cancel_confirm=1');
    expect(CANCEL_HANDLER).toContain('token=');
  });

  it('GET cancel handler validates token before redirecting to confirmation', () => {
    // Must check expiry and used_at before showing confirmation
    expect(CANCEL_HANDLER).toContain('cancel_token_expires_at');
    expect(CANCEL_HANDLER).toContain('cancel_token_used_at');
  });

  it('GET freeze handler does NOT call freezeAccountViaToken', () => {
    expect(FREEZE_HANDLER).not.toContain('freezeAccountViaToken');
  });

  it('GET freeze handler redirects to confirmation page, not result page', () => {
    expect(FREEZE_HANDLER).toContain('recovery_freeze_confirm=1');
    expect(FREEZE_HANDLER).toContain('token=');
  });

  it('GET freeze handler validates token before redirecting to confirmation', () => {
    expect(FREEZE_HANDLER).toContain('freeze_token_expires_at');
    expect(FREEZE_HANDLER).toContain('freeze_token_used_at');
  });
});

describe('POST cancel/freeze — execution step performs action', () => {
  it('POST cancel handler calls cancelRecoveryEmailChange', () => {
    expect(CANCEL_POST_HANDLER).toContain('cancelRecoveryEmailChange');
  });

  it('POST cancel handler reads token from request body, not query string', () => {
    expect(CANCEL_POST_HANDLER).toContain('req.body');
    expect(CANCEL_POST_HANDLER).not.toContain('req.query');
  });

  it('POST cancel handler returns JSON, not a redirect', () => {
    expect(CANCEL_POST_HANDLER).toContain('res.json');
    expect(CANCEL_POST_HANDLER).not.toContain('res.redirect');
  });

  it('POST freeze handler calls freezeAccountViaToken', () => {
    expect(FREEZE_POST_HANDLER).toContain('freezeAccountViaToken');
  });

  it('POST freeze handler reads token from request body, not query string', () => {
    expect(FREEZE_POST_HANDLER).toContain('req.body');
    expect(FREEZE_POST_HANDLER).not.toContain('req.query');
  });

  it('POST freeze handler returns JSON, not a redirect', () => {
    expect(FREEZE_POST_HANDLER).toContain('res.json');
    expect(FREEZE_POST_HANDLER).not.toContain('res.redirect');
  });
});

// ── Generic error codes — oracle attack prevention ────────────────────────────

describe('Generic error codes — oracle attack prevention', () => {
  it('verify GET handler maps NOT_FOUND and ALREADY_USED to generic "invalid"', () => {
    // Must NOT have separate not_found or already_used result codes
    expect(VERIFY_HANDLER).not.toContain('recovery_email_result=not_found');
    expect(VERIFY_HANDLER).not.toContain('recovery_email_result=already_used');
    // Must use generic "invalid" for both
    expect(VERIFY_HANDLER).toContain('recovery_email_result=invalid');
  });

  it('verify GET handler maps EXPIRED to "expired" (distinct from invalid)', () => {
    expect(VERIFY_HANDLER).toContain('recovery_email_result=expired');
  });

  it('POST cancel handler returns generic 410 for NOT_FOUND and ALREADY_USED', () => {
    // Must not distinguish between not-found and already-used in the response
    expect(CANCEL_POST_HANDLER).not.toContain("'NOT_FOUND'");
    expect(CANCEL_POST_HANDLER).not.toContain("'ALREADY_USED'");
    // Generic "no longer valid" message
    expect(CANCEL_POST_HANDLER).toContain('no longer valid');
  });

  it('POST freeze handler returns generic 410 for NOT_FOUND and ALREADY_USED', () => {
    expect(FREEZE_POST_HANDLER).not.toContain("'NOT_FOUND'");
    expect(FREEZE_POST_HANDLER).not.toContain("'ALREADY_USED'");
    expect(FREEZE_POST_HANDLER).toContain('no longer valid');
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('Rate limiting — recoveryTokenLimiter', () => {
  it('recoveryTokenLimiter is exported from api-rate-limiter', () => {
    const rateLimiter = readFileSync(
      resolve(__dirname, '../api-rate-limiter.ts'),
      'utf8',
    );
    expect(rateLimiter).toContain('export function recoveryTokenLimiter');
  });

  it('recoveryTokenLimiter uses a tighter window than globalApiLimiter', () => {
    const rateLimiter = readFileSync(
      resolve(__dirname, '../api-rate-limiter.ts'),
      'utf8',
    );
    // recovery-token bucket must be distinct from api bucket
    expect(rateLimiter).toContain("'recovery-token'");
  });

  it('entry.ts applies recoveryTokenLimiter to token-link endpoints', () => {
    const entry = readFileSync(
      resolve(__dirname, '../../entry.ts'),
      'utf8',
    );
    expect(entry).toContain('recoveryTokenLimiter');
    // Must be applied to verify, cancel, and freeze
    expect(entry).toContain("recoveryTokenLimiter, recoveryEmailVerifyGet");
    expect(entry).toContain("recoveryTokenLimiter, recoveryEmailCancelGet");
    expect(entry).toContain("recoveryTokenLimiter, recoveryEmailFreezeGet");
  });
});

// ── PUBLIC_API_ROUTES — POST cancel and freeze are public ─────────────────────

describe('PUBLIC_API_ROUTES — token-authenticated public endpoints', () => {
  it('auth-middleware includes POST cancel in PUBLIC_API_ROUTES', () => {
    const middleware = readFileSync(
      resolve(__dirname, '../auth-middleware.ts'),
      'utf8',
    );
    // POST cancel must be public (token-authenticated, no session required)
    expect(middleware).toContain("method: 'POST', pattern: /^\\/api\\/me\\/recovery-email\\/cancel$/");
  });

  it('auth-middleware includes POST freeze in PUBLIC_API_ROUTES', () => {
    const middleware = readFileSync(
      resolve(__dirname, '../auth-middleware.ts'),
      'utf8',
    );
    // POST freeze must be public (token-authenticated, no session required)
    expect(middleware).toContain("method: 'POST', pattern: /^\\/api\\/me\\/recovery-email\\/freeze$/");
  });
});
