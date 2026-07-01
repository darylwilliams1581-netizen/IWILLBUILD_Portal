import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { user, profiles, companies } from '@/server/db/schema';
import { getAuth } from '@/lib/auth/auth';
import { sendVerificationEmail } from '../../lib/email-verification.js';
import { checkSignupRate } from '../../lib/signup-rate-limiter.js';
import { seedStarterPack } from '../../lib/seed-starter-pack.js';

const PLAN_MAX_USERS: Record<string, number> = {
  solo:       1,
  team:       5,
  pro:        10,
  enterprise: 999,
};

/** Minimum time (ms) a human takes to fill out the signup form */
const MIN_FORM_TIME_MS = 3000;

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one symbol.';
  return null;
}

export default async function handler(req: Request, res: Response) {
  // ── Anti-spam: IP rate limiting ───────────────────────────────────────────
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!checkSignupRate(ip)) {
    return res.status(429).json({ error: 'Too many signup attempts. Please wait a few minutes before trying again.' });
  }

  const {
    name, email, password, companyName, plan, industry,
    // Anti-spam fields
    _hp,          // honeypot — must be empty
    _t,           // form load timestamp (ms since epoch)
  } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    companyName?: string;
    plan?: string;
    industry?: string;
    _hp?: string;
    _t?: number | string;
  };

  // ── Anti-spam: honeypot check ─────────────────────────────────────────────
  // Bots fill all fields; real users leave hidden fields blank
  if (_hp && _hp.trim().length > 0) {
    // Silently accept — don't tell bots they were caught
    console.warn('signup.honeypot_triggered', { ip });
    return res.status(201).json({ ok: true, role: 'admin', companyId: null, plan: 'team' });
  }

  // ── Anti-spam: minimum form completion time ───────────────────────────────
  if (_t) {
    const loadTime = Number(_t);
    if (!isNaN(loadTime) && Date.now() - loadTime < MIN_FORM_TIME_MS) {
      console.warn('signup.too_fast', { ip, elapsed: Date.now() - loadTime });
      return res.status(400).json({ error: 'Please take a moment to complete the form.' });
    }
  }

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (!companyName?.trim()) {
    return res.status(400).json({ error: 'Company name is required.' });
  }

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const resolvedPlan = PLAN_MAX_USERS[plan ?? ''] ? (plan as string) : 'team';
  const maxUsers = PLAN_MAX_USERS[resolvedPlan];

  try {
    const auth = getAuth();

    // Block signup if email already exists
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.trim().toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    // Register via BetterAuth — creates user with emailVerified: false
    const result = await auth.api.signUpEmail({
      body: { name: name.trim(), email: email.trim().toLowerCase(), password },
    });

    if (!result || !result.user?.id) {
      return res.status(400).json({ error: 'Signup failed. Please try again.' });
    }

    const userId = result.user.id;

    // Ensure emailVerified is false (BetterAuth may set it true by default)
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, userId));

    // Check if this is the very first user in the system (platform owner)
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(user);
    const isFirstUser = Number(count) <= 1;

    // Create a new company for this signup (30-day trial)
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const VALID_INDUSTRIES = ['construction','civil','landscaping','fuel_dangerous_goods','plant_hire','general_trades','other'];
    const cleanIndustry = industry && VALID_INDUSTRIES.includes(industry) ? industry : 'construction';

    const [newCompany] = await db
      .insert(companies)
      .values({
        name: companyName.trim(),
        plan: resolvedPlan,
        subscriptionStatus: 'trial',
        trialEndsAt,
        maxUsers,
        industry: cleanIndustry,
      })
      .$returningId();

    const companyId = newCompany?.id ?? null;

    // Create profile — first user in system = owner, otherwise admin of their company
    const role = isFirstUser ? 'owner' : 'admin';

    await db.insert(profiles).values({
      userId,
      companyId,
      role,
      permJobs:          true,
      permFleet:         true,
      permForms:         true,
      permFiles:         true,
      permEstimating:    true,
      permDazzaAi:       true,
      permAdmin:         true,
      permSeeDollars:    true,
      permInviteUsers:   true,
      permDeleteRecords: true,
    });

    // ── Send verification email (fire-and-forget — don't fail signup if email fails) ──
    sendVerificationEmail(userId, email.trim().toLowerCase(), name.trim())
      .then((r) => console.log(`[signup] verification email sent to ${email} messageId=${r?.messageId ?? 'unknown'}`))
      .catch((e) => {
        console.error('[signup] VERIFICATION EMAIL FAILED:', e);
      });

    // ── Seed starter pack (fire-and-forget — don't fail signup if seeding fails) ──
    if (companyId) {
      seedStarterPack(companyId, userId)
        .then((r) => console.log(`[signup] starter pack seeded for company ${companyId}`, r.sections))
        .catch((e) => console.error('[signup] STARTER PACK SEED FAILED:', e));
    }

    return res.status(201).json({
      ok: true,
      role,
      companyId,
      plan: resolvedPlan,
      emailVerificationSent: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already')) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    console.error('signup.error', msg);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
