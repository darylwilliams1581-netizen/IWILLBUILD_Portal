/**
 * POST /api/developer/provision-apple-review-account
 *
 * Platform-owner only.
 *
 * Creates or repairs the Apple App Review demo account so the reviewer
 * can sign in and exercise representative app features without hitting
 * any subscription gate, onboarding screen, payment request, or 2FA prompt.
 *
 * IDEMPOTENT — safe to call repeatedly:
 *   • If support@iwillbuild.com does not exist → creates user + account + company + profile
 *   • If it already exists → resets password, repairs required fields, leaves data intact
 *
 * SECURITY RULES enforced here:
 *   • Password is hashed via BetterAuth's own scrypt (hashPassword) — never stored plain
 *   • Password value is NEVER returned in the response
 *   • No Stripe charges, subscriptions or payment methods are created
 *   • platform_role is NOT set (reviewer gets no developer/owner privileges)
 *   • 2FA flags (two_factor_enabled, sms_2fa_enabled) are explicitly set to 0
 *   • subscription_status = 'active', plan = 'team' → bypasses all subscription gates
 *   • starter_pack_loaded = 1 → skips onboarding/starter-pack screen
 *
 * Access: requirePlatformOwner middleware (registered in entry.ts)
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import type { ResultSetHeader } from 'mysql2';

// ── Constants ─────────────────────────────────────────────────────────────────

const REVIEWER_EMAIL    = 'support@iwillbuild.com';
const REVIEWER_NAME     = 'Apple Reviewer';
const COMPANY_NAME      = 'IWIllBUIlD App Review Demo';
const PLAN              = 'team';
const SUBSCRIPTION_STATUS = 'active';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a stable UUID-like string without crypto.randomUUID (not always available in ESM) */
function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // ── 1. Receive and validate password from request body ────────────────────
    const { password } = req.body as { password?: string };
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'password is required (min 8 chars).' });
    }

    // ── 2. Hash the password immediately — never hold plaintext beyond this line
    const passwordHash = await hashPassword(password);

    // ── 3. Check whether the user already exists ──────────────────────────────
    const [existingUsers] = await db.execute(
      sql`SELECT id, name, email_verified FROM \`user\` WHERE email = ${REVIEWER_EMAIL} LIMIT 1`
    ) as unknown as [Array<{ id: string; name: string; email_verified: number }>, unknown];

    const existingUser = existingUsers?.[0] ?? null;
    let userId: string;
    let action: 'created' | 'updated';

    if (!existingUser) {
      // ── 4a. CREATE new user ───────────────────────────────────────────────
      userId = makeId();
      action = 'created';

      await db.execute(sql`
        INSERT INTO \`user\`
          (id, name, email, email_verified, phone_verified,
           two_factor_enabled, sms_2fa_enabled, created_at, updated_at)
        VALUES
          (${userId}, ${REVIEWER_NAME}, ${REVIEWER_EMAIL},
           1, 0,
           0, 0,
           NOW(), NOW())
      `);

      // Create credential account row (BetterAuth's account table)
      await db.execute(sql`
        INSERT INTO account
          (id, account_id, provider_id, user_id, password, issuer, created_at, updated_at)
        VALUES
          (${makeId()}, ${REVIEWER_EMAIL}, 'credential', ${userId},
           ${passwordHash}, 'local:credential',
           NOW(), NOW())
      `);

    } else {
      // ── 4b. UPDATE existing user — reset password + repair flags ──────────
      userId = existingUser.id;
      action = 'updated';

      // Ensure email is verified, 2FA is off
      await db.execute(sql`
        UPDATE \`user\`
        SET email_verified   = 1,
            phone_verified   = 0,
            two_factor_enabled = 0,
            sms_2fa_enabled  = 0,
            updated_at       = NOW()
        WHERE id = ${userId}
      `);

      // Reset password in account table (upsert: update if exists, insert if missing)
      const [acctRows] = await db.execute(
        sql`SELECT id FROM account WHERE user_id = ${userId} AND provider_id = 'credential' LIMIT 1`
      ) as unknown as [Array<{ id: string }>, unknown];

      if (acctRows?.[0]) {
        await db.execute(sql`
          UPDATE account
          SET password = ${passwordHash}, updated_at = NOW()
          WHERE user_id = ${userId} AND provider_id = 'credential'
        `);
      } else {
        await db.execute(sql`
          INSERT INTO account
            (id, account_id, provider_id, user_id, password, issuer, created_at, updated_at)
          VALUES
            (${makeId()}, ${REVIEWER_EMAIL}, 'credential', ${userId},
             ${passwordHash}, 'local:credential',
             NOW(), NOW())
        `);
      }

      // Invalidate any existing sessions so the reviewer starts fresh
      await db.execute(sql`DELETE FROM session WHERE user_id = ${userId}`);

      // Clear any TOTP secrets (twoFactor plugin table) — reviewer must not hit TOTP prompt
      await db.execute(sql`DELETE FROM twoFactor WHERE user_id = ${userId}`).catch(() => {
        // Table may not exist in all schema versions — non-fatal
      });
    }

    // ── 5. Ensure the demo company exists ─────────────────────────────────────
    const [existingCompanies] = await db.execute(
      sql`SELECT id FROM companies WHERE name = ${COMPANY_NAME} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    let companyId: number;
    let companyAction: 'created' | 'existing';

    if (!existingCompanies?.[0]) {
      companyAction = 'created';
      const [companyResult] = await db.execute(sql`
        INSERT INTO companies
          (name, plan, subscription_status,
           stripe_customer_id, stripe_subscription_id,
           cancel_at_period_end, starter_pack_loaded, starter_pack_loaded_at,
           created_at, updated_at)
        VALUES
          (${COMPANY_NAME}, ${PLAN}, ${SUBSCRIPTION_STATUS},
           NULL, NULL,
           0, 1, NOW(),
           NOW(), NOW())
      `) as unknown as [ResultSetHeader, unknown];
      companyId = companyResult.insertId;
    } else {
      companyId = existingCompanies[0].id;
      companyAction = 'existing';

      // Repair subscription fields in case they drifted
      await db.execute(sql`
        UPDATE companies
        SET plan                 = ${PLAN},
            subscription_status  = ${SUBSCRIPTION_STATUS},
            cancel_at_period_end = 0,
            starter_pack_loaded  = 1,
            updated_at           = NOW()
        WHERE id = ${companyId}
      `);
    }

    // ── 6. Ensure profile row links user → company with 'admin' role ──────────
    const [existingProfiles] = await db.execute(
      sql`SELECT id, role FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ id: number; role: string }>, unknown];

    let profileAction: 'created' | 'updated' | 'ok';

    if (!existingProfiles?.[0]) {
      profileAction = 'created';
      // must_change_password is a raw-SQL-only column — omit on INSERT (defaults to 0)
      await db.execute(sql`
        INSERT INTO profiles (user_id, company_id, role, created_at, updated_at)
        VALUES (${userId}, ${companyId}, 'admin', NOW(), NOW())
      `);
    } else {
      const profile = existingProfiles[0];
      profileAction = profile.role !== 'admin' ? 'updated' : 'ok';
      await db.execute(sql`
        UPDATE profiles
        SET company_id = ${companyId}, role = 'admin', updated_at = NOW()
        WHERE user_id = ${userId}
      `);
      // Clear must_change_password via raw SQL (column exists in DB but not Drizzle schema)
      await db.execute(sql`
        UPDATE profiles SET must_change_password = 0 WHERE user_id = ${userId}
      `).catch(() => { /* non-fatal if column absent */ });
    }

    // ── 7. Seed starter pack data if not already loaded ───────────────────────
    // We set starter_pack_loaded=1 above so the auto-seed guard won't run again,
    // but we still want representative data. Call seedStarterPack directly.
    let seedResult: string;
    try {
      const { seedStarterPack } = await import('../../../lib/seed-starter-pack.js');
      // Force-bypass the once-only guard by temporarily clearing the flag,
      // but only if this is a fresh company (companyAction === 'created').
      if (companyAction === 'created') {
        await db.execute(sql`
          UPDATE companies SET starter_pack_loaded = 0 WHERE id = ${companyId}
        `);
        const result = await seedStarterPack(companyId, userId);
        // Re-set the flag (seedStarterPack sets it on success, but ensure it's set)
        await db.execute(sql`
          UPDATE companies SET starter_pack_loaded = 1 WHERE id = ${companyId}
        `);
        seedResult = result.ok
          ? `seeded (${Object.keys(result.sections).length} sections)`
          : `partial: ${result.errors.slice(0, 2).join('; ')}`;
      } else {
        seedResult = 'skipped (existing company — data preserved)';
      }
    } catch (e) {
      seedResult = `skipped (${String(e).slice(0, 80)})`;
    }

    // ── 8. Final verification read — confirm state in DB ─────────────────────
    const [verifyUser] = await db.execute(
      sql`SELECT id, email, email_verified, two_factor_enabled, sms_2fa_enabled
          FROM \`user\` WHERE id = ${userId} LIMIT 1`
    ) as unknown as [Array<{
      id: string; email: string;
      email_verified: number; two_factor_enabled: number; sms_2fa_enabled: number;
    }>, unknown];

    const [verifyCompany] = await db.execute(
      sql`SELECT id, name, plan, subscription_status, starter_pack_loaded
          FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{
      id: number; name: string; plan: string;
      subscription_status: string; starter_pack_loaded: number;
    }>, unknown];

    const [verifyProfile] = await db.execute(
      sql`SELECT role, must_change_password FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ role: string; must_change_password: number }>, unknown];

    const u = verifyUser?.[0];
    const c = verifyCompany?.[0];
    const p = verifyProfile?.[0];

    return res.json({
      ok: true,
      account: {
        action,
        email: u?.email ?? REVIEWER_EMAIL,
        emailVerified: !!u?.email_verified,
        twoFactorEnabled: !!u?.two_factor_enabled,
        sms2faEnabled: !!u?.sms_2fa_enabled,
        // password intentionally omitted
      },
      company: {
        action: companyAction,
        id: c?.id,
        name: c?.name,
        plan: c?.plan,
        subscriptionStatus: c?.subscription_status,
        starterPackLoaded: !!c?.starter_pack_loaded,
      },
      profile: {
        action: profileAction,
        role: p?.role,
        mustChangePassword: !!p?.must_change_password,
      },
      seed: seedResult,
      message: `Apple Review account ${action} successfully. Login: ${REVIEWER_EMAIL}`,
    });

  } catch (err) {
    console.error('[provision-apple-review] Fatal error:', err);
    return res.status(500).json({ error: 'Provisioning failed', detail: String(err) });
  }
}
