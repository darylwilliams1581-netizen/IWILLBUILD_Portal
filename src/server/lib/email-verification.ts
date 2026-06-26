/**
 * Email Verification — token generation, storage, and sending.
 *
 * Design decisions:
 * - Tokens are 32 random bytes → 64-char hex string (256-bit entropy, unguessable)
 * - We store a SHA-256 hash of the token in the DB; the raw token only travels in email
 * - Tokens expire after 24 hours
 * - One active token per user (old tokens are deleted on resend)
 * - We use the existing BetterAuth `verification` table (identifier = "email-verify:<userId>")
 */

import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/client.js';
import { verification, user } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sendEmail } from '../email.js';

const IDENTIFIER_PREFIX = 'email-verify:';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Generate a cryptographically random 64-char hex token */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash of a token for safe DB storage */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Identifier used in the verification table for a given userId */
function identifier(userId: string): string {
  return `${IDENTIFIER_PREFIX}${userId}`;
}

/**
 * Create (or replace) a verification token for the user and send the email.
 * Returns the raw token (for testing only — never log it in production).
 */
export async function sendVerificationEmail(userId: string, userEmail: string, userName: string): Promise<void> {
  const token = generateToken();
  const hashed = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);
  const id = randomBytes(18).toString('hex'); // unique row id

  // Delete any existing token for this user
  await db.delete(verification).where(eq(verification.identifier, identifier(userId)));

  // Insert new hashed token
  await db.insert(verification).values({
    id,
    identifier: identifier(userId),
    value: hashed,
    expiresAt,
  });

  // Build the verification URL
  const baseUrl = process.env.BETTER_AUTH_URL || process.env.AIRO_PREVIEW_URL || 'https://iwillbuild.com';
  const verifyUrl = `${baseUrl}/verify-email?token=${token}&uid=${userId}`;

  const firstName = userName.split(' ')[0] || userName;

  await sendEmail({
    fromName: 'IWILLBUILD Portal',
    to: userEmail,
    subject: 'Verify your email — IWILLBUILD Portal',
    text: [
      `Hi ${firstName},`,
      '',
      'Thanks for signing up to IWILLBUILD Portal. Please verify your email address to activate your account.',
      '',
      `Verification link: ${verifyUrl}`,
      '',
      'This link expires in 24 hours.',
      '',
      'If you did not create an account, you can safely ignore this email.',
      '',
      '— The IWILLBUILD Team',
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1117;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1A1D27;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#F97316;padding:24px 32px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px;">IWILLBUILD Portal</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Verify your email</h1>
            <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.6;">
              Hi ${firstName}, thanks for signing up. Click the button below to verify your email address and activate your account.
            </p>
            <a href="${verifyUrl}" style="display:inline-block;background:#F97316;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:8px;letter-spacing:0.2px;">
              Verify Email Address
            </a>
            <p style="margin:24px 0 0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;">
              This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:rgba(255,255,255,0.25);word-break:break-all;">
              Or copy this link: ${verifyUrl}
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);">© ${new Date().getFullYear()} IWILLBUILD Portal. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

/**
 * Verify a token. Returns the userId if valid, or null if invalid/expired.
 * Deletes the token on success (one-time use).
 */
export async function verifyEmailToken(rawToken: string, userId: string): Promise<boolean> {
  const hashed = hashToken(rawToken);
  const id = identifier(userId);

  const [row] = await db
    .select()
    .from(verification)
    .where(and(eq(verification.identifier, id), eq(verification.value, hashed)))
    .limit(1);

  if (!row) return false;
  if (row.expiresAt < new Date()) {
    // Expired — clean up
    await db.delete(verification).where(eq(verification.identifier, id));
    return false;
  }

  // Mark user as verified
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));

  // Delete the used token
  await db.delete(verification).where(eq(verification.identifier, id));

  return true;
}

/**
 * Check if a user's email is verified.
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.emailVerified === true;
}
