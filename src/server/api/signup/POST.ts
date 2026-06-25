import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { user, profiles, companies } from '@/server/db/schema';
import { getAuth } from '@/lib/auth/auth';

// Password policy: min 8 chars, at least 1 letter, 1 number, 1 symbol
function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one symbol.';
  return null;
}

export default async function handler(req: Request, res: Response) {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const auth = getAuth();

    // Register via BetterAuth (handles hashing, user row, account row)
    const result = await auth.api.signUpEmail({
      body: { name: name.trim(), email: email.trim().toLowerCase(), password },
    });

    if (!result || !result.user?.id) {
      return res.status(400).json({ error: 'Signup failed. That email may already be in use.' });
    }

    const userId = result.user.id;

    // Determine role: first user in the system becomes admin
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(user);
    const isFirstUser = Number(count) <= 1; // <=1 because this user was just created
    const role = isFirstUser ? 'admin' : 'member';

    // Ensure a company exists (or create one for the first user)
    let companyId: number | null = null;
    const existingCompanies = await db.select({ id: companies.id }).from(companies).limit(1);
    if (existingCompanies.length > 0) {
      companyId = existingCompanies[0].id;
    } else {
      const [newCompany] = await db.insert(companies).values({ name: 'IWILLBUILD' }).$returningId();
      companyId = newCompany?.id ?? null;
    }

    // Create profile row
    const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (existing.length === 0) {
      await db.insert(profiles).values({ userId, companyId, role });
    }

    return res.status(201).json({ ok: true, role });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // BetterAuth throws on duplicate email
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already')) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    console.error('signup.error', msg);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
