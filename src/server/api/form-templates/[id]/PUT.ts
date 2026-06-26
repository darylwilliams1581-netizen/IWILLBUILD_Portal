import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { formTemplates, profiles } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const templateId = parseInt(String(req.params.id), 10);
    if (isNaN(templateId)) return res.status(400).json({ error: 'Invalid template ID' });

    // Ownership check
    const existing = await db.query.formTemplates.findFirst({
      where: and(
        eq(formTemplates.id, templateId),
        eq(formTemplates.companyId, profile.companyId),
      ),
    });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const {
      name,
      formType,
      category,
      description,
      isActive,
      onDashboard,
      onJobs,
      onFleet,
    } = req.body as Partial<{
      name: string;
      formType: string;
      category: string;
      description: string;
      isActive: boolean;
      onDashboard: boolean;
      onJobs: boolean;
      onFleet: boolean;
    }>;

    const updates: Partial<typeof formTemplates.$inferInsert> = {};
    if (name !== undefined) updates.name = name.trim();
    if (formType !== undefined) updates.formType = formType;
    if (category !== undefined) updates.category = category?.trim() || null;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (isActive !== undefined) updates.isActive = isActive;
    if (onDashboard !== undefined) updates.onDashboard = onDashboard;
    if (onJobs !== undefined) updates.onJobs = onJobs;
    if (onFleet !== undefined) updates.onFleet = onFleet;

    if (Object.keys(updates).length === 0) {
      return res.json({ template: existing });
    }

    await db
      .update(formTemplates)
      .set(updates)
      .where(eq(formTemplates.id, templateId));

    const updated = await db.query.formTemplates.findFirst({
      where: eq(formTemplates.id, templateId),
    });

    res.json({ template: updated });
  } catch (error) {
    console.error('PUT /api/form-templates/:id error:', error);
    res.status(500).json({ error: 'Failed to update form template' });
  }
}
