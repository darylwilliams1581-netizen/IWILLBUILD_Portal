/**
 * pending-2fa.ts
 *
 * Server-controlled pending-2FA session state.
 *
 * Design:
 *   After a successful password check for a 2FA-enabled user, the login handler
 *   inserts a row into `pending_2fa_challenges` and returns a short-lived
 *   challenge token (NOT a full BetterAuth session cookie).
 *
 *   All protected API routes check for this token and reject with
 *   TWO_FACTOR_REQUIRED (403) until the second factor succeeds.
 *
 *   On success, the challenge is deleted and a full BetterAuth session is
 *   established via the normal sign-in flow.
 *
 * Challenge token:
 *   - 32 random bytes, hex-encoded (64 chars)
 *   - Stored as SHA-256 hash in the DB (never the raw token)
 *   - Sent to the client as a cookie: iwb_2fa_challenge (HttpOnly, SameSite=Strict)
 *   - Expires in 10 minutes
 *
 * Replay prevention:
 *   - Challenge is deleted on first successful verification
 *   - Attempt counter: max 5 wrong codes → challenge deleted
 *   - IP rate limit: 10 attempts per IP per 15 minutes
 *
 * NEVER log the raw challenge token.
 */

import { randomBytes, createHash } from 'node:crypto';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export const CHALLENGE_COOKIE   = 'iwb_2fa_challenge';
export const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_CHALLENGE_ATTEMPTS = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingChallenge {
  id: string;
  userId: string;
  method: 'totp' | 'sms';
  expiresAt: Date;
  attempts: number;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export function generateChallengeToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashChallengeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Create a new pending challenge for a user.
 * Deletes any existing challenge for the same user first.
 * Returns the raw (unhashed) token to send to the client.
 */
export async function createChallenge(
  userId: string,
  method: 'totp' | 'sms',
): Promise<string> {
  const token     = generateChallengeToken();
  const tokenHash = hashChallengeToken(token);
  const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRY_MS);
  const id        = randomBytes(18).toString('hex');

  // Clear any existing challenge for this user
  await db.execute(
    sql`DELETE FROM pending_2fa_challenges WHERE user_id = ${userId}`,
  );

  await db.execute(
    sql`INSERT INTO pending_2fa_challenges
          (id, user_id, token_hash, method, expires_at, attempts)
        VALUES
          (${id}, ${userId}, ${tokenHash}, ${method}, ${expiresAt}, 0)`,
  );

  return token;
}

/**
 * Look up a challenge by its raw token.
 * Returns null if not found, expired, or already used.
 */
export async function getChallenge(token: string): Promise<PendingChallenge | null> {
  const tokenHash = hashChallengeToken(token);
  const now = new Date();

  const rows = (await db.execute(
    sql`SELECT id, user_id, method, expires_at, attempts
        FROM pending_2fa_challenges
        WHERE token_hash = ${tokenHash}
          AND expires_at > ${now}
        LIMIT 1`,
  )) as unknown as [Array<{
    id: string;
    user_id: string;
    method: string;
    expires_at: Date | string;
    attempts: number;
  }>, unknown];

  const row = rows[0]?.[0];
  if (!row) return null;

  return {
    id:        row.id,
    userId:    row.user_id,
    method:    row.method as 'totp' | 'sms',
    expiresAt: new Date(row.expires_at),
    attempts:  row.attempts,
  };
}

/**
 * Increment the attempt counter for a challenge.
 * If attempts reach MAX_CHALLENGE_ATTEMPTS, delete the challenge.
 * Returns true if the challenge was deleted (locked out).
 */
export async function incrementChallengeAttempts(challengeId: string, currentAttempts: number): Promise<boolean> {
  const newAttempts = currentAttempts + 1;
  if (newAttempts >= MAX_CHALLENGE_ATTEMPTS) {
    await deleteChallenge(challengeId);
    return true; // locked out
  }
  await db.execute(
    sql`UPDATE pending_2fa_challenges SET attempts = ${newAttempts} WHERE id = ${challengeId}`,
  );
  return false;
}

/**
 * Delete a challenge (on success or lockout).
 */
export async function deleteChallenge(challengeId: string): Promise<void> {
  await db.execute(
    sql`DELETE FROM pending_2fa_challenges WHERE id = ${challengeId}`,
  );
}

/**
 * Delete all challenges for a user (e.g. on logout).
 */
export async function deleteUserChallenges(userId: string): Promise<void> {
  await db.execute(
    sql`DELETE FROM pending_2fa_challenges WHERE user_id = ${userId}`,
  );
}

// ── Cookie helpers ─────────────────────────────────────────────────────────────

import type { Response } from 'express';

/**
 * Set the challenge cookie on the response.
 * HttpOnly, SameSite=Strict, Secure in production.
 */
export function setChallengecookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(CHALLENGE_COOKIE, token, {
    httpOnly:  true,
    sameSite:  'strict',
    secure:    isProd,
    maxAge:    CHALLENGE_EXPIRY_MS,
    path:      '/',
  });
}

/**
 * Clear the challenge cookie.
 */
export function clearChallengeCookie(res: Response): void {
  res.clearCookie(CHALLENGE_COOKIE, { path: '/' });
}

/**
 * Read the challenge token from the request cookie.
 */
export function getChallengeTokenFromRequest(req: import('express').Request): string | null {
  return (req.cookies as Record<string, string>)?.[CHALLENGE_COOKIE] ?? null;
}
