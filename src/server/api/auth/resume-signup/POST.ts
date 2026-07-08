/**
 * POST /api/auth/resume-signup
 * Public — completes signup for an orphaned auth user (auth exists, no profile/company).
 *
 * Body: { userId, companyName, plan, industry, password }
 * - password is re-verified against the existing auth account before proceeding
 * - Creates company + profile, seeds starter pack
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { user, profiles, companies } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';

const PLAN_MAX_USERS: Record<string, number> = {
  solo: 1, team: 5, pro: 10, enterprise: 999,
};

export default async function handler(req: Request, res: Response) {
  try {
    const { userId: rawUserId, companyName: rawCompanyName, plan, industry, password } = req.body as {
      userId?: unknown;
      companyName?: unknown;
      plan?: string;
      industry?: string;
      password?: string;
    };

    const userId = rawUserId != null ? String(rawUserId).trim() : '';
    const companyName = rawCompanyName != null ? String(rawCompanyName).trim() : '';

    if (!userId || !companyName || !password) {
      return res.status(400).json({ error: 'userId, companyName, and password are required.' });
    }

    // Verify user exists and has no profile
    const [authUser] = await db
      .select({ id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!authUser) return res.status(404).json({ error: 'User not found.' });

    const existingProfile = await db.query.profiles.findFirst({ where: eq(profiles.userId, authUser.id) });
    if (existingProfile) {
      return res.status(400).json({ error: 'This account is already complete. Please sign in.' });
    }

    // Verify password by attempting sign-in (don't proceed if wrong password)
    const auth = getAuth();
    try {
      const signInResult = await auth.api.signInEmail({
        body: { email: authUser.email, password },
      });
      if (!signInResult?.user) {
        return res.status(401).json({ error: 'Incorrect password. Please try again or reset your password.' });
      }
    } catch {
      return res.status(401).json({ error: 'Incorrect password. Please try again or reset your password.' });
    }

    const resolvedPlan = PLAN_MAX_USERS[plan ?? ''] ? (plan as string) : 'team';
    const maxUsers = PLAN_MAX_USERS[resolvedPlan];

    const VALID_INDUSTRIES = ['construction', 'civil', 'landscaping', 'fuel_dangerous_goods', 'plant_hire', 'general_trades', 'other'];
    const cleanIndustry = industry && VALID_INDUSTRIES.includes(industry) ? industry : 'construction';

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Create company
    const [newCompany] = await db
      .insert(companies)
      .values({
        name: companyName,
        plan: resolvedPlan,
        subscriptionStatus: 'trial',
        trialEndsAt,
        maxUsers,
        industry: cleanIndustry,
      })
      .$returningId();

    const companyId = newCompany?.id ?? null;

    // Create profile
    await db.insert(profiles).values({
      userId: authUser.id,
      companyId,
      role: 'admin',
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

    // ── Library model: new companies start empty — no auto-seeding ──
    // Content is installed on-demand from the developer-controlled library.

    console.log(`[resume-signup] completed for user=${authUser.email} company=${companyName} plan=${resolvedPlan}`);

    return res.status(201).json({
      ok: true,
      role: 'admin',
      companyId,
      plan: resolvedPlan,
    });
  } catch (err) {
    console.error('POST /api/auth/resume-signup error:', err);
    return res.status(500).json({ error: 'Failed to complete signup. Please try again.' });
  }
}
