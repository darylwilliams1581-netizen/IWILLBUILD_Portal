import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { formTemplates, profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { getPlanLimits, getCompanyPlan, checkLimit } from '../../lib/plan-limits.js';

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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // ── Plan limit check: form templates ──────────────────────────────────────
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);

    const [countRow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM form_templates WHERE company_id = ${profile.companyId}`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    const currentCount = Number(countRow?.[0]?.cnt ?? 0);

    const limitCheck = checkLimit(currentCount, limits.formTemplates, 'Form Templates');
    if (!limitCheck.allowed) {
      return res.status(403).json({ code: limitCheck.code, error: limitCheck.message });
    }

    const {
      name,
      formType = 'Job',
      category,
      description,
      isActive = true,
      onDashboard = false,
      onJobs = false,
      onFleet = false,
    } = req.body as {
      name?: string;
      formType?: string;
      category?: string;
      description?: string;
      isActive?: boolean;
      onDashboard?: boolean;
      onJobs?: boolean;
      onFleet?: boolean;
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const [inserted] = await db
      .insert(formTemplates)
      .values({
        companyId: profile.companyId,
        name: name.trim(),
        formType,
        category: category?.trim() || null,
        description: description?.trim() || null,
        isActive,
        onDashboard,
        onJobs,
        onFleet,
      })
      .$returningId();

    const created = await db.query.formTemplates.findFirst({
      where: eq(formTemplates.id, inserted.id),
    });

    res.status(201).json({ template: created });
  } catch (error) {
    console.error('POST /api/form-templates error:', error);
    res.status(500).json({ error: 'Failed to create form template' });
  }
}
