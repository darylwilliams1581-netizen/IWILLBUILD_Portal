import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { user, profiles, companies } from '@/server/db/schema';
import { getAuth } from '@/lib/auth/auth';

const PLAN_MAX_USERS: Record<string, number> = {
  solo:       1,
  team:       5,
  pro:        10,
  enterprise: 999,
};

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one symbol.';
  return null;
}

export default async function handler(req: Request, res: Response) {
  const { name, email, password, companyName, plan } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    companyName?: string;
    plan?: string;
  };

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

    // Register via BetterAuth
    const result = await auth.api.signUpEmail({
      body: { name: name.trim(), email: email.trim().toLowerCase(), password },
    });

    if (!result || !result.user?.id) {
      return res.status(400).json({ error: 'Signup failed. Please try again.' });
    }

    const userId = result.user.id;

    // Check if this is the very first user in the system (platform owner)
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(user);
    const isFirstUser = Number(count) <= 1;

    // Create a new company for this signup
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const [newCompany] = await db
      .insert(companies)
      .values({
        name: companyName.trim(),
        plan: resolvedPlan,
        subscriptionStatus: 'trial',
        trialEndsAt,
        maxUsers,
      })
      .$returningId();

    const companyId = newCompany?.id ?? null;

    // Create profile — first user in system = owner, otherwise admin of their company
    const role = isFirstUser ? 'owner' : 'admin';

    // Always insert a fresh profile for the new userId (email was unique-checked above)
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

    return res.status(201).json({ ok: true, role, companyId, plan: resolvedPlan });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already')) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    console.error('signup.error', msg);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
