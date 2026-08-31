/**
 * One-shot provisioning script for the Apple App Review account.
 * Run via: npx tsx scripts/provision-apple-review.ts
 * Password is passed as env var REVIEW_PASSWORD to avoid shell history exposure.
 */
import { db } from '../src/server/db/client.ts';
import { sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import type { ResultSetHeader } from 'mysql2';

const REVIEWER_EMAIL = 'support@iwillbuild.com';
const REVIEWER_NAME  = 'Apple Reviewer';
const COMPANY_NAME   = 'IWILLBUILD App Review Demo';
const PLAN           = 'team';
const SUB_STATUS     = 'active';

const password = process.env.REVIEW_PASSWORD;
if (!password) { console.error('REVIEW_PASSWORD env var required'); process.exit(1); }

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function run() {
  // Hash immediately — never log the plaintext
  const passwordHash = await hashPassword(password!);

  // ── 1. User ───────────────────────────────────────────────────────────────
  const [existingUsers] = await db.execute(
    sql`SELECT id, email_verified FROM \`user\` WHERE email = ${REVIEWER_EMAIL} LIMIT 1`
  ) as unknown as [Array<{ id: string; email_verified: number }>, unknown];

  const existingUser = existingUsers?.[0] ?? null;
  let userId: string;
  let action: string;

  if (!existingUser) {
    userId = makeId();
    action = 'created';
    await db.execute(sql`
      INSERT INTO \`user\`
        (id, name, email, email_verified, phone_verified,
         two_factor_enabled, sms_2fa_enabled, created_at, updated_at)
      VALUES
        (${userId}, ${REVIEWER_NAME}, ${REVIEWER_EMAIL},
         1, 0, 0, 0, NOW(), NOW())
    `);
    await db.execute(sql`
      INSERT INTO account
        (id, account_id, provider_id, user_id, password, issuer, created_at, updated_at)
      VALUES
        (${makeId()}, ${REVIEWER_EMAIL}, 'credential', ${userId},
         ${passwordHash}, 'local:credential', NOW(), NOW())
    `);
  } else {
    userId = existingUser.id;
    action = 'updated';
    await db.execute(sql`
      UPDATE \`user\`
      SET email_verified=1, phone_verified=0,
          two_factor_enabled=0, sms_2fa_enabled=0, updated_at=NOW()
      WHERE id=${userId}
    `);
    const [acctRows] = await db.execute(
      sql`SELECT id FROM account WHERE user_id=${userId} AND provider_id='credential' LIMIT 1`
    ) as unknown as [Array<{ id: string }>, unknown];

    if (acctRows?.[0]) {
      await db.execute(sql`
        UPDATE account SET password=${passwordHash}, updated_at=NOW()
        WHERE user_id=${userId} AND provider_id='credential'
      `);
    } else {
      await db.execute(sql`
        INSERT INTO account (id,account_id,provider_id,user_id,password,issuer,created_at,updated_at)
        VALUES (${makeId()},${REVIEWER_EMAIL},'credential',${userId},${passwordHash},'local:credential',NOW(),NOW())
      `);
    }
    // Invalidate sessions and clear any TOTP secrets
    await db.execute(sql`DELETE FROM session WHERE user_id=${userId}`);
    await db.execute(sql`DELETE FROM twoFactor WHERE user_id=${userId}`).catch(() => {});
  }

  // ── 2. Company ────────────────────────────────────────────────────────────
  const [existingCo] = await db.execute(
    sql`SELECT id FROM companies WHERE name=${COMPANY_NAME} LIMIT 1`
  ) as unknown as [Array<{ id: number }>, unknown];

  let companyId: number;
  let coAction: string;

  if (!existingCo?.[0]) {
    coAction = 'created';
    const [r] = await db.execute(sql`
      INSERT INTO companies
        (name, plan, subscription_status,
         stripe_customer_id, stripe_subscription_id,
         cancel_at_period_end, starter_pack_loaded, starter_pack_loaded_at,
         created_at, updated_at)
      VALUES
        (${COMPANY_NAME}, ${PLAN}, ${SUB_STATUS},
         NULL, NULL, 0, 1, NOW(), NOW(), NOW())
    `) as unknown as [ResultSetHeader, unknown];
    companyId = r.insertId;
  } else {
    companyId = existingCo[0].id;
    coAction = 'existing';
    await db.execute(sql`
      UPDATE companies
      SET plan=${PLAN}, subscription_status=${SUB_STATUS},
          cancel_at_period_end=0, starter_pack_loaded=1, updated_at=NOW()
      WHERE id=${companyId}
    `);
  }

  // ── 3. Profile ────────────────────────────────────────────────────────────
  const [existingProf] = await db.execute(
    sql`SELECT id, role FROM profiles WHERE user_id=${userId} LIMIT 1`
  ) as unknown as [Array<{ id: number; role: string }>, unknown];

  let profAction: string;
  if (!existingProf?.[0]) {
    profAction = 'created';
    // must_change_password is a raw-SQL-only column (not in Drizzle schema).
    // Omit it on INSERT — it defaults to 0 in the DB.
    await db.execute(sql`
      INSERT INTO profiles (user_id, company_id, role, created_at, updated_at)
      VALUES (${userId}, ${companyId}, 'admin', NOW(), NOW())
    `);
  } else {
    profAction = 'updated';
    // Use raw SQL to set must_change_password=0 safely
    await db.execute(sql`
      UPDATE profiles
      SET company_id=${companyId}, role='admin', updated_at=NOW()
      WHERE user_id=${userId}
    `);
    // Clear must_change_password via raw SQL (column exists in DB but not Drizzle schema)
    await db.execute(sql`
      UPDATE profiles SET must_change_password=0 WHERE user_id=${userId}
    `).catch(() => { /* column may not exist in all schema versions — non-fatal */ });
  }

  // ── 4. Seed starter pack (new company only) ───────────────────────────────
  let seedResult = 'skipped (existing company — data preserved)';
  if (coAction === 'created') {
    try {
      // Temporarily clear the guard so seedStarterPack will run
      await db.execute(sql`UPDATE companies SET starter_pack_loaded=0 WHERE id=${companyId}`);
      const { seedStarterPack } = await import('../src/server/lib/seed-starter-pack.ts');
      const sr = await seedStarterPack(companyId, userId);
      await db.execute(sql`UPDATE companies SET starter_pack_loaded=1 WHERE id=${companyId}`);
      seedResult = sr.ok
        ? `seeded (${Object.keys(sr.sections).length} sections)`
        : `partial: ${sr.errors.slice(0, 2).join('; ')}`;
    } catch (e) {
      seedResult = `error: ${String(e).slice(0, 120)}`;
    }
  }

  // ── 5. Verification read ──────────────────────────────────────────────────
  const [vu] = await db.execute(
    sql`SELECT id, email, email_verified, two_factor_enabled, sms_2fa_enabled
        FROM \`user\` WHERE id=${userId} LIMIT 1`
  ) as unknown as [Array<{ id: string; email: string; email_verified: number; two_factor_enabled: number; sms_2fa_enabled: number }>, unknown];

  const [vc] = await db.execute(
    sql`SELECT id, name, plan, subscription_status, starter_pack_loaded
        FROM companies WHERE id=${companyId} LIMIT 1`
  ) as unknown as [Array<{ id: number; name: string; plan: string; subscription_status: string; starter_pack_loaded: number }>, unknown];

  const [vp] = await db.execute(
    sql`SELECT role FROM profiles WHERE user_id=${userId} LIMIT 1`
  ) as unknown as [Array<{ role: string }>, unknown];

  const u = vu?.[0]; const c = vc?.[0]; const p = vp?.[0];

  console.log(JSON.stringify({
    ok: true,
    account: {
      action,
      email: u?.email,
      emailVerified: !!u?.email_verified,
      twoFactorEnabled: !!u?.two_factor_enabled,
      sms2faEnabled: !!u?.sms_2fa_enabled,
      // password intentionally omitted
    },
    company: {
      action: coAction,
      id: c?.id,
      name: c?.name,
      plan: c?.plan,
      subscriptionStatus: c?.subscription_status,
      starterPackLoaded: !!c?.starter_pack_loaded,
    },
    profile: {
      action: profAction,
      role: p?.role,
    },
    seed: seedResult,
  }, null, 2));

  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
