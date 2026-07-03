/**
 * activity-log.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central helper for writing to platform_activity_log.
 *
 * All writes are fire-and-forget safe — errors are swallowed so they never
 * break the main request flow.
 *
 * Event types:
 *   login_success          – successful email/password sign-in
 *   login_failed           – failed sign-in attempt (wrong password, unknown email, etc.)
 *   login_blocked_unverified – sign-in blocked because email not verified
 *   login_blocked_inactive – sign-in blocked because account is inactive
 *   logout                 – user signed out
 *   password_reset_requested – forgot-password email sent
 *   password_changed       – password successfully changed
 *   email_verification_sent – verification email dispatched
 *   email_verified         – user verified their email
 *   manual_verified        – developer manually verified a user
 *   account_deactivated    – developer deactivated an account
 *   account_reactivated    – developer reactivated an account
 *   role_changed           – developer changed a user's company role
 *   pin_login_success      – PIN login succeeded
 *   pin_login_failed       – PIN login failed
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export interface ActivityLogParams {
  eventType: string;
  success: boolean;
  userId?: string | null;
  email?: string | null;
  companyId?: number | null;
  performedByUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Write one activity log entry. Fire-and-forget — never throws.
 */
export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    const metaJson = params.metadata ? JSON.stringify(params.metadata) : null;
    await db.execute(sql`
      INSERT INTO platform_activity_log
        (event_type, success, user_id, email, company_id,
         performed_by_user_id, ip_address, user_agent, reason, metadata_json, created_at)
      VALUES (
        ${params.eventType},
        ${params.success ? 1 : 0},
        ${params.userId ?? null},
        ${params.email ?? null},
        ${params.companyId ?? null},
        ${params.performedByUserId ?? null},
        ${params.ipAddress ?? null},
        ${params.userAgent ? params.userAgent.slice(0, 500) : null},
        ${params.reason ?? null},
        ${metaJson},
        NOW()
      )
    `);
  } catch (err) {
    // Non-critical — log to console but never propagate
    const e = err as Error & { code?: string; sqlMessage?: string };
    console.warn('[activity-log] insert failed:', e?.sqlMessage ?? e?.message ?? String(err));
  }
}

/**
 * Extract IP address from an Express request.
 */
export function getIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return first.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Extract User-Agent from an Express request.
 */
export function getUserAgent(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const ua = req.headers['user-agent'];
  if (!ua) return null;
  return Array.isArray(ua) ? ua[0] : ua;
}
