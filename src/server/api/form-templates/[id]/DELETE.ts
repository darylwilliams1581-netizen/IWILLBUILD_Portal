import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { formTemplates, formTemplateFields, jobFormSubmissions, profiles } from '../../../db/schema.js';
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

    // Explicitly delete child rows first — MySQL FK constraints may not have
    // been applied at table-creation time (runStartupMigrations only patches
    // columns, not constraints), so we can't rely on ON DELETE CASCADE.
    await db
      .delete(jobFormSubmissions)
      .where(eq(jobFormSubmissions.templateId, templateId));

    await db
      .delete(formTemplateFields)
      .where(eq(formTemplateFields.templateId, templateId));

    await db
      .delete(formTemplates)
      .where(eq(formTemplates.id, templateId));

    return res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/form-templates/:id error:', error);
    return res.status(500).json({ error: 'Failed to delete form template' });
  }
}
