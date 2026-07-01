/**
 * POST /api/owner-console/companies
 * Platform owner only — create a new company with a trial subscription.
 * Access enforced by requirePlatformOwner middleware in entry.ts.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { companies } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';

const PLAN_MAX_USERS: Record<string, number> = {
  solo:       1,
  team:       5,
  pro:        10,
  enterprise: 999,
};

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts

    const { name, plan, abn, phone, email } = req.body as {
      name?: string;
      plan?: string;
      abn?: string;
      phone?: string;
      email?: string;
    };

    if (!name?.trim()) return res.status(400).json({ error: 'Company name is required.' });

    const resolvedPlan = PLAN_MAX_USERS[plan ?? ''] ? (plan as string) : 'trial';
    const maxUsers = PLAN_MAX_USERS[resolvedPlan] ?? 1;
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [newCompany] = await db
      .insert(companies)
      .values({
        name: name.trim(),
        abn: abn?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        plan: resolvedPlan,
        subscriptionStatus: 'trial',
        trialEndsAt,
        maxUsers,
      })
      .$returningId();

    res.status(201).json({ ok: true, companyId: newCompany?.id });
  } catch (error) {
    console.error('owner-console/companies POST error:', error);
    res.status(500).json({ error: String(error) });
  }
}
