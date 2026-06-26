import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { formTemplates, profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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
