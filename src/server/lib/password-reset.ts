/**
 * Password Reset — token generation, storage, and email sending.
 *
 * Security design:
 * - 32-byte random token → 64-char hex (256-bit entropy)
 * - SHA-256 hash stored in DB; raw token only travels in email
 * - Tokens expire after 30 minutes
 * - One active token per user (old tokens deleted on new request)
 * - Never reveal whether an email exists in the response
 */

import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/client.js';
import { passwordResetTokens, user } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { sendEmail } from '../email.js';

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function randomId(): string {
  return randomBytes(18).toString('hex');
}

/**
 * Create a password reset token and send the email.
 * Always resolves (never throws to caller) — errors are logged.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const normalised = email.trim().toLowerCase();

  // Look up user — don't reveal existence to caller
  let existing: { id: string; name: string | null } | undefined;
  try {
    const [row] = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.email, normalised))
      .limit(1);
    existing = row;
  } catch {
    // DB error — silently succeed
    return;
  }

  if (!existing) {
    // Silently succeed — don't reveal whether email exists
    return;
  }

  const token = generateToken();
  const hashed = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Delete any existing tokens for this user, then insert new one.
  // Wrapped in try/catch — if the table doesn't exist yet, fall through
  // to a "tokenless" email so the user at least gets a helpful message.
  let tokenStored = false;
  try {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, existing.id));
    await db.insert(passwordResetTokens).values({
      id: randomId(),
      userId: existing.id,
      tokenHash: hashed,
      expiresAt,
    });
    tokenStored = true;
  } catch (err) {
    const msg = String(err);
    if (msg.includes('ER_NO_SUCH_TABLE') || msg.includes("doesn't exist")) {
      console.warn('[password-reset] password_reset_tokens table missing — migration not yet run. Sending fallback email.');
    } else {
      console.error('[password-reset] token insert failed:', err);
      return; // Unknown DB error — bail silently
    }
  }

  const baseUrl = process.env.BETTER_AUTH_URL || process.env.AIRO_PREVIEW_URL || 'https://iwillbuild.com';
  const resetUrl = tokenStored
    ? `${baseUrl}/reset-password?token=${token}&uid=${existing.id}`
    : null;
  const firstName = (existing.name ?? 'there').split(' ')[0];

  const bodyText = tokenStored
    ? [
        `Hi ${firstName},`,
        '',
        'We received a request to reset your IWIllBUIlD Portal password.',
        '',
        `Reset link: ${resetUrl}`,
        '',
        'This link expires in 30 minutes.',
        '',
        'If you did not request a password reset, you can safely ignore this email.',
        '',
        '— The IWIllBUIlD Team',
      ].join('\n')
    : [
        `Hi ${firstName},`,
        '',
        'We received a request to reset your IWIllBUIlD Portal password.',
        '',
        'Our system is currently being set up. Please ask your platform owner to visit the Owner Console to complete the setup, then try again.',
        '',
        '— The IWIllBUIlD Team',
      ].join('\n');

  const bodyHtml = tokenStored ? `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1117;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1A1D27;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr>
          <td style="background:#7C3AED;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px;">IWIllBUIlD Portal</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.6;">
              Hi ${firstName}, click the button below to set a new password. This link expires in <strong style="color:#fff;">30 minutes</strong>.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:8px;letter-spacing:0.2px;">
              Reset Password
            </a>
            <p style="margin:24px 0 0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;">
              If you didn't request this, you can safely ignore this email. Your password won't change.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.25);word-break:break-all;">
              Or copy this link: ${resetUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);">© ${new Date().getFullYear()} IWIllBUIlD Portal. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>` : `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1117;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1A1D27;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="background:#7C3AED;padding:24px 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">IWIllBUIlD Portal</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Password Reset Request</h1>
          <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.6;">
            Hi ${firstName}, we received your request but the system is still being set up.
          </p>
          <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.6;">
            Please ask your platform owner to visit the <strong style="color:#fff;">Owner Console</strong> to complete the database setup, then try again.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);">© ${new Date().getFullYear()} IWIllBUIlD Portal.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await sendEmail({
      fromName: 'IWIllBUIlD Portal',
      to: normalised,
      subject: 'Reset your password — IWIllBUIlD Portal',
      text: bodyText,
      html: bodyHtml,
    });
  } catch (e) {
    console.error('[password-reset] EMAIL SEND FAILED:', e);
  }
}

/**
 * Validate a reset token. Returns userId if valid, null if invalid/expired.
 * Does NOT consume the token — call consumeResetToken after password is set.
 */
export async function validateResetToken(rawToken: string, userId: string): Promise<boolean> {
  try {
    const hashed = hashToken(rawToken);
    const now = new Date();

    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          eq(passwordResetTokens.tokenHash, hashed),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1);

    return !!row && !row.usedAt;
  } catch (err) {
    const msg = String(err);
    if (msg.includes('ER_NO_SUCH_TABLE') || msg.includes("doesn't exist")) {
      return false;
    }
    throw err;
  }
}

/**
 * Consume (mark used) a reset token after successful password change.
 */
export async function consumeResetToken(rawToken: string, userId: string): Promise<void> {
  const hashed = hashToken(rawToken);
  await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        eq(passwordResetTokens.tokenHash, hashed),
      ),
    );

  // Place a 72-hour block on recovery-email changes after a password reset
  // (high-risk event — attacker may have used a stolen reset link)
  try {
    const { placeChangeBlock } = await import('./recovery-email-service.js');
    await placeChangeBlock(userId, 'password_reset');
  } catch (e) {
    console.warn('[password-reset] placeChangeBlock failed:', e instanceof Error ? e.message : String(e));
  }
}
