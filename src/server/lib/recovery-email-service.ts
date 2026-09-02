/**
 * recovery-email-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core domain logic for the protected recovery-email change flow.
 *
 * Security model:
 *  - Changing requires current password + active 2FA (when enrolled)
 *  - Proposed address stored separately; old address stays active during hold
 *  - 7-day hold before activation; new address cannot be used for recovery until then
 *  - Old address receives signed cancel + freeze links (48-byte random tokens, SHA-256 stored)
 *  - Both addresses notified immediately on request
 *  - Old-owner cancel: revokes proposal, all sessions intact
 *  - Old-owner freeze: revokes ALL sessions, freezes account, opens recovery case
 *  - 72-hour block after password reset, MFA reset, suspicious login, new-device login
 *  - Addresses masked in all public-facing outputs
 *  - Immutable audit log for every state transition
 *
 * This module is pure domain logic — it does not import Express or send HTTP
 * responses. Handlers call these functions and translate results to HTTP.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { sendEmail } from '../email.js';
import { APP_URL } from './app-url.js';

// ── Safe execute helper ───────────────────────────────────────────────────────
// Uses the sql tagged template for all parameterised writes. The Drizzle MySQL
// dialect correctly generates one `?` per interpolation; this wrapper keeps
// call sites clean and avoids repeating the cast boilerplate.
async function exec(queryFn: () => ReturnType<typeof sql>): Promise<void> {
  await db.execute(queryFn());
}

// SELECT variant — returns the rows array
async function execRows<T = Record<string, unknown>>(queryFn: () => ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(queryFn());
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Days the old address remains active after a change is requested. */
export const HOLD_DAYS = 7;

/** Hours a change is blocked after a high-risk event. */
export const BLOCK_HOURS = 72;

/** Minutes the verify-link token is valid. */
const VERIFY_TOKEN_MINUTES = 60;

/** Days the cancel/freeze tokens are valid (covers the full hold window). */
const ACTION_TOKEN_DAYS = 8;

// ── Crypto helpers ────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(48).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeCompareHash(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Address masking ───────────────────────────────────────────────────────────

/**
 * Mask an email address for display.
 * "alice@example.com" → "a***@e***.com"
 * Never returns the plain address.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return '***';
  const local  = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot    = domain.lastIndexOf('.');
  const domainBase = dot > 0 ? domain.slice(0, dot) : domain;
  const tld        = dot > 0 ? domain.slice(dot)    : '';
  const maskedLocal  = local.slice(0, 1)      + '***';
  const maskedDomain = domainBase.slice(0, 1) + '***';
  return `${maskedLocal}@${maskedDomain}${tld}`;
}

// ── Audit logging ─────────────────────────────────────────────────────────────

export type AuditEvent =
  | 'requested'
  | 'verified'
  | 'activated'
  | 'cancelled'
  | 'frozen'
  | 'freeze_lifted'
  | 'admin_freeze'
  | 'admin_case_opened';

export async function auditLog(params: {
  userId:      string;
  event:       AuditEvent;
  email?:      string;       // plain — will be masked before storage
  performedBy?: string;
  ipAddress?:  string;
  userAgent?:  string;
  metadata?:   Record<string, unknown>;
}): Promise<void> {
  try {
    const masked   = params.email ? maskEmail(params.email) : null;
    const metaJson = params.metadata ? JSON.stringify(params.metadata) : null;
    await exec(() => sql`
      INSERT INTO recovery_email_audit
        (user_id, event, masked_email, performed_by, ip_address, user_agent, metadata, created_at)
      VALUES (
        ${params.userId}, ${params.event}, ${masked},
        ${params.performedBy ?? null}, ${params.ipAddress ?? null},
        ${params.userAgent ? params.userAgent.slice(0, 500) : null},
        ${metaJson}, NOW(3)
      )
    `);
  } catch (err) {
    console.warn('[recovery-email] audit insert failed:', err instanceof Error ? err.message : String(err));
  }
}

// ── Block helpers ─────────────────────────────────────────────────────────────

export type BlockReason = 'password_reset' | 'mfa_reset' | 'suspicious_login' | 'new_device_login';

/**
 * Place a 72-hour block on recovery-email changes for a user.
 * Called by password-reset, MFA-reset, and login handlers.
 */
export async function placeChangeBlock(userId: string, reason: BlockReason): Promise<void> {
  const id          = randomBytes(18).toString('hex');
  const blockedUntil = new Date(Date.now() + BLOCK_HOURS * 60 * 60 * 1000);
  try {
    await exec(() => sql`
      INSERT INTO recovery_change_blocks (id, user_id, reason, blocked_until, created_at)
      VALUES (${id}, ${userId}, ${reason}, ${blockedUntil}, NOW(3))
    `);
  } catch (err) {
    console.warn('[recovery-email] placeChangeBlock failed:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Returns the earliest block expiry for a user, or null if unblocked.
 */
export async function getActiveBlock(userId: string): Promise<Date | null> {
  const rows = await execRows<{ until: Date | null }>(() => sql`
    SELECT MAX(blocked_until) AS until
    FROM recovery_change_blocks
    WHERE user_id = ${userId} AND blocked_until > NOW(3)
  `);
  return rows[0]?.until ?? null;
}

// ── State helpers ─────────────────────────────────────────────────────────────

interface RecoveryState {
  id:                   string;
  userId:               string;
  activeEmail:          string | null;
  activeVerifiedAt:     Date | null;
  proposedEmail:        string | null;
  proposedAt:           Date | null;
  verifyTokenHash:      string | null;
  verifyTokenExpiresAt: Date | null;
  proposedVerifiedAt:   Date | null;
  holdExpiresAt:        Date | null;
  cancelTokenHash:      string | null;
  cancelTokenExpiresAt: Date | null;
  cancelTokenUsedAt:    Date | null;
  freezeTokenHash:      string | null;
  freezeTokenExpiresAt: Date | null;
  freezeTokenUsedAt:    Date | null;
  frozenAt:             Date | null;
  frozenReason:         string | null;
}

async function getState(userId: string): Promise<RecoveryState | null> {
  const rows = await execRows<Record<string, unknown>>(() => sql`
    SELECT * FROM recovery_email_state WHERE user_id = ${userId} LIMIT 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id:                   r['id'] as string,
    userId:               r['user_id'] as string,
    activeEmail:          (r['active_email'] as string | null) ?? null,
    activeVerifiedAt:     (r['active_verified_at'] as Date | null) ?? null,
    proposedEmail:        (r['proposed_email'] as string | null) ?? null,
    proposedAt:           (r['proposed_at'] as Date | null) ?? null,
    verifyTokenHash:      (r['verify_token_hash'] as string | null) ?? null,
    verifyTokenExpiresAt: (r['verify_token_expires_at'] as Date | null) ?? null,
    proposedVerifiedAt:   (r['proposed_verified_at'] as Date | null) ?? null,
    holdExpiresAt:        (r['hold_expires_at'] as Date | null) ?? null,
    cancelTokenHash:      (r['cancel_token_hash'] as string | null) ?? null,
    cancelTokenExpiresAt: (r['cancel_token_expires_at'] as Date | null) ?? null,
    cancelTokenUsedAt:    (r['cancel_token_used_at'] as Date | null) ?? null,
    freezeTokenHash:      (r['freeze_token_hash'] as string | null) ?? null,
    freezeTokenExpiresAt: (r['freeze_token_expires_at'] as Date | null) ?? null,
    freezeTokenUsedAt:    (r['freeze_token_used_at'] as Date | null) ?? null,
    frozenAt:             (r['frozen_at'] as Date | null) ?? null,
    frozenReason:         (r['frozen_reason'] as string | null) ?? null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export type RequestResult =
  | { ok: true }
  | { ok: false; code: 'BLOCKED'; blockedUntil: Date }
  | { ok: false; code: 'FROZEN' }
  | { ok: false; code: 'SAME_AS_ACTIVE' }
  | { ok: false; code: 'SAME_AS_PROPOSED' };

/**
 * Initiate a recovery-email change request.
 *
 * Pre-conditions (enforced by the handler, not here):
 *   - Session is authenticated
 *   - Password has been re-verified
 *   - 2FA has been re-verified (when enrolled)
 *
 * This function:
 *   1. Checks for active blocks
 *   2. Generates verify + cancel + freeze tokens
 *   3. Writes/upserts recovery_email_state
 *   4. Sends emails to both old and new addresses
 *   5. Writes audit event
 */
export async function requestRecoveryEmailChange(params: {
  userId:       string;
  newEmail:     string;
  ipAddress?:   string;
  userAgent?:   string;
}): Promise<RequestResult> {
  const { userId, newEmail, ipAddress, userAgent } = params;

  // 1. Block check
  const blockUntil = await getActiveBlock(userId);
  if (blockUntil) return { ok: false, code: 'BLOCKED', blockedUntil: blockUntil };

  // 2. Load existing state
  const existing = await getState(userId);
  if (existing?.frozenAt) return { ok: false, code: 'FROZEN' };

  const normalised = newEmail.trim().toLowerCase();
  if (existing?.activeEmail?.toLowerCase() === normalised) {
    return { ok: false, code: 'SAME_AS_ACTIVE' };
  }
  if (existing?.proposedEmail?.toLowerCase() === normalised) {
    return { ok: false, code: 'SAME_AS_PROPOSED' };
  }

  // 3. Generate tokens
  const verifyToken  = generateToken();
  const cancelToken  = generateToken();
  const freezeToken  = generateToken();
  const now          = new Date();
  const verifyExpiry = new Date(now.getTime() + VERIFY_TOKEN_MINUTES * 60 * 1000);
  const actionExpiry = new Date(now.getTime() + ACTION_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  const holdExpiry   = new Date(now.getTime() + HOLD_DAYS * 24 * 60 * 60 * 1000);

  // 4. Upsert state row
  const stateId = existing?.id ?? randomBytes(18).toString('hex');
  if (existing) {
    await exec(() => sql`
      UPDATE recovery_email_state SET
        proposed_email           = ${normalised},
        proposed_at              = ${now},
        verify_token_hash        = ${hashToken(verifyToken)},
        verify_token_expires_at  = ${verifyExpiry},
        proposed_verified_at     = NULL,
        hold_expires_at          = ${holdExpiry},
        cancel_token_hash        = ${hashToken(cancelToken)},
        cancel_token_expires_at  = ${actionExpiry},
        cancel_token_used_at     = NULL,
        freeze_token_hash        = ${hashToken(freezeToken)},
        freeze_token_expires_at  = ${actionExpiry},
        freeze_token_used_at     = NULL,
        updated_at               = NOW(3)
      WHERE user_id = ${userId}
    `);
  } else {
    await exec(() => sql`
      INSERT INTO recovery_email_state (
        id, user_id,
        proposed_email, proposed_at,
        verify_token_hash, verify_token_expires_at,
        hold_expires_at,
        cancel_token_hash, cancel_token_expires_at,
        freeze_token_hash, freeze_token_expires_at,
        created_at, updated_at
      ) VALUES (
        ${stateId}, ${userId},
        ${normalised}, ${now},
        ${hashToken(verifyToken)}, ${verifyExpiry},
        ${holdExpiry},
        ${hashToken(cancelToken)}, ${actionExpiry},
        ${hashToken(freezeToken)}, ${actionExpiry},
        NOW(3), NOW(3)
      )
    `);
  }

  // 5. Send emails (fire-and-forget — don't block on delivery)
  const verifyLink = `${APP_URL}/api/me/recovery-email/verify?token=${verifyToken}`;
  const cancelLink = `${APP_URL}/api/me/recovery-email/cancel?token=${cancelToken}`;
  const freezeLink = `${APP_URL}/api/me/recovery-email/freeze?token=${freezeToken}`;

  // Email to NEW address: verify ownership
  void sendEmail({
    to:      normalised,
    subject: 'Verify your IWIllBUIlD recovery email',
    html:    buildVerifyEmail({ verifyLink, holdDays: HOLD_DAYS }),
    text:    `Verify your recovery email: ${verifyLink}\n\nThis link expires in ${VERIFY_TOKEN_MINUTES} minutes.`,
  }).catch(e => console.error('[recovery-email] verify email failed:', e));

  // Email to OLD address: notification + cancel/freeze links
  if (existing?.activeEmail) {
    void sendEmail({
      to:      existing.activeEmail,
      subject: 'Your IWIllBUIlD recovery email is being changed',
      html:    buildNotifyOldEmail({ maskedNew: maskEmail(normalised), cancelLink, freezeLink, holdDays: HOLD_DAYS }),
      text:    `Your recovery email is being changed to ${maskEmail(normalised)}.\n\nCancel: ${cancelLink}\nFreeze account: ${freezeLink}\n\nThis change takes effect in ${HOLD_DAYS} days.`,
    }).catch(e => console.error('[recovery-email] notify-old email failed:', e));
  }

  // 6. Audit
  await auditLog({ userId, event: 'requested', email: normalised, ipAddress, userAgent });

  return { ok: true };
}

// ── Verify token (new address clicks link) ────────────────────────────────────

export type VerifyResult =
  | { ok: true; holdExpiresAt: Date; alreadyActive: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'FROZEN' };

export async function verifyRecoveryEmailToken(params: {
  token:      string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<VerifyResult> {
  const { token, ipAddress, userAgent } = params;
  const hash = hashToken(token);

  const rows = await execRows<Record<string, unknown>>(() => sql`
    SELECT * FROM recovery_email_state WHERE verify_token_hash = ${hash} LIMIT 1
  `);
  const raw = rows[0];
  if (!raw) return { ok: false, code: 'NOT_FOUND' };

  const state = raw;
  const userId = state['user_id'] as string;

  if (state['frozen_at']) return { ok: false, code: 'FROZEN' };
  if (state['proposed_verified_at']) return { ok: false, code: 'ALREADY_USED' };

  const expiry = state['verify_token_expires_at'] as Date | null;
  if (!expiry || new Date() > expiry) return { ok: false, code: 'EXPIRED' };

  // Mark as verified — hold still applies
  await exec(() => sql`
    UPDATE recovery_email_state
    SET proposed_verified_at = NOW(3), updated_at = NOW(3)
    WHERE user_id = ${userId}
  `);

  const holdExpiry = state['hold_expires_at'] as Date;
  const alreadyActive = holdExpiry <= new Date();

  // If hold already expired (edge case: token verified very late), activate now
  if (alreadyActive) {
    await activateProposed(userId, ipAddress, userAgent);
  } else {
    await auditLog({ userId, event: 'verified', email: state['proposed_email'] as string, ipAddress, userAgent });
  }

  return { ok: true, holdExpiresAt: holdExpiry, alreadyActive };
}

// ── Activate proposed (called by cron/scheduler or verify handler) ────────────

async function activateProposed(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
  const state = await getState(userId);
  if (!state?.proposedEmail || !state.proposedVerifiedAt) return;
  if (!state.holdExpiresAt || new Date() < state.holdExpiresAt) return;

  const newEmail = state.proposedEmail;

  await exec(() => sql`
    UPDATE recovery_email_state SET
      active_email              = ${newEmail},
      active_verified_at        = NOW(3),
      proposed_email            = NULL,
      proposed_at               = NULL,
      verify_token_hash         = NULL,
      verify_token_expires_at   = NULL,
      proposed_verified_at      = NULL,
      hold_expires_at           = NULL,
      cancel_token_hash         = NULL,
      cancel_token_expires_at   = NULL,
      freeze_token_hash         = NULL,
      freeze_token_expires_at   = NULL,
      updated_at                = NOW(3)
    WHERE user_id = ${userId}
  `);

  await auditLog({ userId, event: 'activated', email: newEmail, ipAddress, userAgent });

  // Notify new address that it is now active
  void sendEmail({
    to:      newEmail,
    subject: 'Your IWIllBUIlD recovery email is now active',
    html:    buildActivatedEmail(),
    text:    'Your recovery email address is now active on IWIllBUIlD.',
  }).catch(e => console.error('[recovery-email] activated email failed:', e));
}

/**
 * Scheduled activation check — call this from a periodic job or on each login.
 * Activates any proposals where hold has expired and new owner has verified.
 */
export async function activateMatureProposals(): Promise<void> {
  const list = await execRows<{ user_id: string }>(() => sql`
    SELECT user_id FROM recovery_email_state
    WHERE proposed_email IS NOT NULL
      AND proposed_verified_at IS NOT NULL
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at <= NOW(3)
      AND frozen_at IS NULL
  `);
  for (const row of list) {
    await activateProposed(row.user_id);
  }
}

// ── Cancel (old address disputes) ─────────────────────────────────────────────

export type CancelResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'NO_PENDING' };

export async function cancelRecoveryEmailChange(params: {
  token:      string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<CancelResult> {
  const { token, ipAddress, userAgent } = params;
  const hash = hashToken(token);

  const rows = await execRows<Record<string, unknown>>(() => sql`
    SELECT * FROM recovery_email_state WHERE cancel_token_hash = ${hash} LIMIT 1
  `);
  const raw = rows[0];
  if (!raw) return { ok: false, code: 'NOT_FOUND' };

  const state = raw;
  const userId = state['user_id'] as string;

  if (!state['proposed_email']) return { ok: false, code: 'NO_PENDING' };
  if (state['cancel_token_used_at']) return { ok: false, code: 'ALREADY_USED' };

  const expiry = state['cancel_token_expires_at'] as Date | null;
  if (!expiry || new Date() > expiry) return { ok: false, code: 'EXPIRED' };

  const cancelledEmail = state['proposed_email'] as string;

  await exec(() => sql`
    UPDATE recovery_email_state SET
      proposed_email          = NULL,
      proposed_at             = NULL,
      verify_token_hash       = NULL,
      verify_token_expires_at = NULL,
      proposed_verified_at    = NULL,
      hold_expires_at         = NULL,
      cancel_token_used_at    = NOW(3),
      freeze_token_hash       = NULL,
      freeze_token_expires_at = NULL,
      updated_at              = NOW(3)
    WHERE user_id = ${userId}
  `);

  await auditLog({ userId, event: 'cancelled', email: cancelledEmail, ipAddress, userAgent });

  return { ok: true };
}

// ── Freeze (old address suspects account takeover) ────────────────────────────

export type FreezeResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'ALREADY_FROZEN' };

export async function freezeAccountViaToken(params: {
  token:      string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<FreezeResult> {
  const { token, ipAddress, userAgent } = params;
  const hash = hashToken(token);

  const rows = await execRows<Record<string, unknown>>(() => sql`
    SELECT * FROM recovery_email_state WHERE freeze_token_hash = ${hash} LIMIT 1
  `);
  const raw = rows[0];
  if (!raw) return { ok: false, code: 'NOT_FOUND' };

  const state = raw;
  const userId = state['user_id'] as string;

  if (state['frozen_at']) return { ok: false, code: 'ALREADY_FROZEN' };
  if (state['freeze_token_used_at']) return { ok: false, code: 'ALREADY_USED' };

  const expiry = state['freeze_token_expires_at'] as Date | null;
  if (!expiry || new Date() > expiry) return { ok: false, code: 'EXPIRED' };

  await exec(() => sql`
    UPDATE recovery_email_state SET
      frozen_at               = NOW(3),
      frozen_reason           = 'old_owner_dispute',
      freeze_token_used_at    = NOW(3),
      proposed_email          = NULL,
      proposed_at             = NULL,
      verify_token_hash       = NULL,
      verify_token_expires_at = NULL,
      proposed_verified_at    = NULL,
      hold_expires_at         = NULL,
      updated_at              = NOW(3)
    WHERE user_id = ${userId}
  `);

  // Revoke ALL sessions for this user
  await revokeAllSessions(userId);

  await auditLog({
    userId,
    event:     'frozen',
    ipAddress,
    userAgent,
    metadata:  { reason: 'old_owner_dispute' },
  });

  return { ok: true };
}

// ── Admin freeze (operator — no direct address overwrite) ─────────────────────

export async function adminFreezeAccount(params: {
  userId:      string;
  reason:      string;
  performedBy: string;
  ipAddress?:  string;
}): Promise<void> {
  const { userId, reason, performedBy, ipAddress } = params;

  // Upsert state row if it doesn't exist yet
  const existing = await getState(userId);
  if (existing) {
    await exec(() => sql`
      UPDATE recovery_email_state SET
        frozen_at     = NOW(3),
        frozen_reason = ${reason},
        updated_at    = NOW(3)
      WHERE user_id = ${userId}
    `);
  } else {
    const id = randomBytes(18).toString('hex');
    await exec(() => sql`
      INSERT INTO recovery_email_state (id, user_id, frozen_at, frozen_reason, created_at, updated_at)
      VALUES (${id}, ${userId}, NOW(3), ${reason}, NOW(3), NOW(3))
    `);
  }

  await revokeAllSessions(userId);

  await auditLog({
    userId,
    event:       'admin_freeze',
    performedBy,
    ipAddress,
    metadata:    { reason },
  });
}

// ── Session revocation ────────────────────────────────────────────────────────

async function revokeAllSessions(userId: string): Promise<void> {
  try {
    await exec(() => sql`DELETE FROM session WHERE user_id = ${userId}`);
  } catch (err) {
    console.error('[recovery-email] revokeAllSessions failed:', err instanceof Error ? err.message : String(err));
  }
}

// ── Read state (masked) ───────────────────────────────────────────────────────

export interface PublicRecoveryState {
  hasActive:        boolean;
  maskedActive:     string | null;
  hasPending:       boolean;
  maskedPending:    string | null;
  pendingVerified:  boolean;
  holdExpiresAt:    Date | null;
  frozen:           boolean;
}

export async function getPublicState(userId: string): Promise<PublicRecoveryState> {
  const state = await getState(userId);
  if (!state) {
    return { hasActive: false, maskedActive: null, hasPending: false, maskedPending: null, pendingVerified: false, holdExpiresAt: null, frozen: false };
  }
  return {
    hasActive:       !!state.activeEmail,
    maskedActive:    state.activeEmail ? maskEmail(state.activeEmail) : null,
    hasPending:      !!state.proposedEmail,
    maskedPending:   state.proposedEmail ? maskEmail(state.proposedEmail) : null,
    pendingVerified: !!state.proposedVerifiedAt,
    holdExpiresAt:   state.holdExpiresAt,
    frozen:          !!state.frozenAt,
  };
}

// ── Email templates ───────────────────────────────────────────────────────────

function buildVerifyEmail(p: { verifyLink: string; holdDays: number }): string {
  return `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
<h2 style="color:#7c3aed">Verify your recovery email</h2>
<p>Someone requested to set this address as the recovery email for an IWIllBUIlD account.</p>
<p>Click the button below to confirm you own this address. Your address will not be used for account recovery until the <strong>${p.holdDays}-day security hold</strong> expires.</p>
<p style="margin:24px 0">
  <a href="${p.verifyLink}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Verify my email address</a>
</p>
<p style="font-size:12px;color:#64748b">This link expires in 60 minutes. If you did not request this, you can safely ignore this email.</p>
<p style="font-size:12px;color:#64748b">Or copy this link: ${p.verifyLink}</p>
</body></html>`;
}

function buildNotifyOldEmail(p: { maskedNew: string; cancelLink: string; freezeLink: string; holdDays: number }): string {
  return `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
<h2 style="color:#7c3aed">Your recovery email is being changed</h2>
<p>A request was made to change the recovery email on your IWIllBUIlD account to <strong>${p.maskedNew}</strong>.</p>
<p>The change will take effect in <strong>${p.holdDays} days</strong>. Your current address remains active until then.</p>
<p><strong>If this was you</strong>, no action is needed.</p>
<p><strong>If this was NOT you</strong>, act immediately:</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr>
    <td style="padding:8px">
      <a href="${p.cancelLink}" style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Cancel this change</a>
    </td>
    <td style="padding:8px">
      <a href="${p.freezeLink}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Freeze my account</a>
    </td>
  </tr>
</table>
<p style="font-size:12px;color:#64748b"><strong>Freeze account</strong> will immediately sign out all devices and lock your account. Use this if you believe your account has been compromised.</p>
<p style="font-size:12px;color:#64748b">These links are valid for ${p.holdDays + 1} days.</p>
</body></html>`;
}

function buildActivatedEmail(): string {
  return `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
<h2 style="color:#7c3aed">Recovery email activated</h2>
<p>Your recovery email address is now active on IWIllBUIlD. You can use it to recover your account if you lose access.</p>
<p style="font-size:12px;color:#64748b">If you did not set this up, please contact IWIllBUIlD support immediately.</p>
</body></html>`;
}
