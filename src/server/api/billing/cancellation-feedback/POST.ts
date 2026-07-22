/**
 * POST /api/billing/cancellation-feedback
 * Saves optional cancellation reason + comment before the user proceeds to cancel.
 * Auth required. Company-scoped. Feedback is optional — empty body is accepted.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const VALID_REASONS = [
  'Too expensive',
  'Not using it enough',
  'Missing features',
  'Too hard to use',
  'Changed business / no longer needed',
  'Moving to another system',
  'Technical issues',
  'Prefer not to say',
  'Other',
] as const;

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(400).json({ error: 'No company found.' });

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, profile.companyId),
    });

    const { reason, comment } = req.body as { reason?: string; comment?: string };

    // Validate reason if provided
    const cleanReason = reason && VALID_REASONS.includes(reason as typeof VALID_REASONS[number])
      ? reason
      : reason
        ? null  // unknown reason — discard silently
        : null;

    const cleanComment = typeof comment === 'string' ? comment.slice(0, 2000).trim() || null : null;

    // Save feedback (even if both are null — records the cancellation event)
    await db.execute(sql`
      INSERT INTO subscription_cancellation_feedback
        (company_id, user_id, subscription_id, plan, reason, comment)
      VALUES (
        ${profile.companyId},
        ${session.user.id},
        ${company?.stripeSubscriptionId ?? null},
        ${company?.plan ?? 'unknown'},
        ${cleanReason},
        ${cleanComment}
      )
    `);

    res.json({ ok: true });
  } catch (error) {
    console.error('cancellation-feedback error:', error);
    res.status(500).json({ error: String(error) });
  }
}
