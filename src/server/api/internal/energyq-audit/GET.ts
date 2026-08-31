/**
 * TEMPORARY READ-ONLY AUDIT ENDPOINT — EnergyQ login investigation
 * This file must be deleted immediately after the audit is complete.
 * It is protected by a hardcoded token and returns NO secrets, hashes, or tokens.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

const AUDIT_TOKEN = 'energyq-audit-2026-08-31-readonly';

export default async function handler(req: Request, res: Response) {
  // Token gate — must match exactly
  if (req.headers['x-audit-token'] !== AUDIT_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const TARGET_EMAIL = 'daryl.williams@energyq.com.au';

  try {
    // ── 1. DB identity ────────────────────────────────────────────────────────
    const [dbNameRows] = await db.execute(sql`SELECT DATABASE() AS db_name`) as unknown as [Array<{ db_name: string }>, unknown];
    const dbName = dbNameRows?.[0]?.db_name ?? 'unknown';

    // ── 2. User lookup — exact, case-insensitive, trimmed ────────────────────
    const [exactRows] = await db.execute(
      sql`SELECT id, email, email_verified, two_factor_enabled, phone_number, phone_verified, created_at, updated_at
          FROM user WHERE email = ${TARGET_EMAIL} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const [ciRows] = await db.execute(
      sql`SELECT id, email, email_verified, two_factor_enabled, created_at
          FROM user WHERE LOWER(TRIM(email)) = LOWER(TRIM(${TARGET_EMAIL})) LIMIT 5`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // ── 3. Account (credential) row ───────────────────────────────────────────
    let accountRows: Array<Record<string, unknown>> = [];
    if (exactRows.length > 0) {
      const userId = exactRows[0].id as string;
      const [ar] = await db.execute(
        sql`SELECT id, account_id, provider_id, user_id,
                   CASE WHEN password IS NOT NULL AND password != '' THEN 'EXISTS' ELSE 'MISSING_OR_EMPTY' END AS password_status,
                   created_at, updated_at
            FROM account WHERE user_id = ${userId}`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      accountRows = ar;
    }

    // ── 4. Two-factor row ─────────────────────────────────────────────────────
    let twoFactorRows: Array<Record<string, unknown>> = [];
    if (exactRows.length > 0) {
      const userId = exactRows[0].id as string;
      const [tfr] = await db.execute(
        sql`SELECT id, user_id, verified, failed_verification_count, locked_until,
                   CASE WHEN secret IS NOT NULL AND secret != '' THEN 'EXISTS' ELSE 'MISSING' END AS secret_status,
                   CASE WHEN backup_codes IS NOT NULL AND backup_codes != '' THEN 'EXISTS' ELSE 'MISSING' END AS backup_codes_status
            FROM twoFactor WHERE user_id = ${userId}`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      twoFactorRows = tfr;
    }

    // ── 5. Company membership ─────────────────────────────────────────────────
    let memberRows: Array<Record<string, unknown>> = [];
    if (exactRows.length > 0) {
      const userId = exactRows[0].id as string;
      const [mr] = await db.execute(
        sql`SELECT cm.id, cm.company_id, cm.user_id, cm.role, cm.created_at,
                   c.name AS company_name, c.plan, c.subscription_status,
                   c.stripe_customer_id IS NOT NULL AS has_stripe_customer,
                   c.stripe_subscription_id IS NOT NULL AS has_stripe_subscription,
                   LEFT(c.stripe_customer_id, 8) AS stripe_cust_prefix,
                   LEFT(c.stripe_subscription_id, 8) AS stripe_sub_prefix,
                   c.current_period_end, c.cancel_at_period_end, c.cancelled_at
            FROM company_members cm
            JOIN companies c ON c.id = cm.company_id
            WHERE cm.user_id = ${userId}`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      memberRows = mr;
    }

    // ── 6. Profile row ────────────────────────────────────────────────────────
    let profileRows: Array<Record<string, unknown>> = [];
    if (exactRows.length > 0) {
      const userId = exactRows[0].id as string;
      const [pr] = await db.execute(
        sql`SELECT id, user_id, company_id, role, status, platform_role,
                   last_login_at, last_active_at, created_at
            FROM profiles WHERE user_id = ${userId}`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      profileRows = pr;
    }

    // ── 7. Recent activity log for this email ─────────────────────────────────
    const [activityRows] = await db.execute(
      sql`SELECT id, event_type, success, email, company_id, reason,
                 LEFT(metadata_json, 200) AS metadata_preview,
                 created_at
          FROM platform_activity_log
          WHERE email = ${TARGET_EMAIL}
             OR (user_id IS NOT NULL AND user_id = (SELECT id FROM user WHERE email = ${TARGET_EMAIL} LIMIT 1))
          ORDER BY created_at DESC LIMIT 20`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // ── 8. Verification table (pending email verifications) ───────────────────
    const [verificationRows] = await db.execute(
      sql`SELECT id, identifier, expires_at, created_at,
                 CASE WHEN value IS NOT NULL THEN 'EXISTS' ELSE 'NULL' END AS value_status
          FROM verification
          WHERE identifier LIKE ${`%${TARGET_EMAIL}%`}
          ORDER BY created_at DESC LIMIT 5`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // ── 9. SMS verification codes (recent) ───────────────────────────────────
    let smsRows: Array<Record<string, unknown>> = [];
    if (exactRows.length > 0) {
      const userId = exactRows[0].id as string;
      const [sr] = await db.execute(
        sql`SELECT id, user_id, phone, expires_at, attempts, verified_at, used_at, created_at
            FROM sms_verification_codes
            WHERE user_id = ${userId}
            ORDER BY created_at DESC LIMIT 5`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      smsRows = sr;
    }

    // ── 10. Mask user IDs for safe reporting ──────────────────────────────────
    const maskId = (id: unknown) => {
      if (typeof id !== 'string' || id.length < 8) return id;
      return id.slice(0, 4) + '****' + id.slice(-4);
    };

    const maskRows = (rows: Array<Record<string, unknown>>, fields: string[]) =>
      rows.map(row => {
        const out: Record<string, unknown> = { ...row };
        for (const f of fields) {
          if (out[f]) out[f] = maskId(out[f]);
        }
        return out;
      });

    return res.json({
      audit_target: TARGET_EMAIL,
      timestamp: new Date().toISOString(),
      db_schema: dbName,

      user: {
        exact_match_count: exactRows.length,
        ci_match_count: ciRows.length,
        rows: maskRows(exactRows, ['id']),
        ci_rows: maskRows(ciRows, ['id']),
      },

      account_credential: {
        count: accountRows.length,
        rows: maskRows(accountRows, ['id', 'user_id', 'account_id']),
      },

      two_factor: {
        count: twoFactorRows.length,
        rows: maskRows(twoFactorRows, ['id', 'user_id']),
      },

      company_membership: {
        count: memberRows.length,
        rows: maskRows(memberRows, ['user_id']),
      },

      profile: {
        count: profileRows.length,
        rows: maskRows(profileRows, ['id', 'user_id']),
      },

      activity_log: {
        count: activityRows.length,
        rows: activityRows,
      },

      verification_table: {
        count: verificationRows.length,
        rows: verificationRows,
      },

      sms_codes: {
        count: smsRows.length,
        rows: maskRows(smsRows, ['id', 'user_id']),
      },
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Audit query failed',
      message: String((err as Error)?.message ?? err),
    });
  }
}
