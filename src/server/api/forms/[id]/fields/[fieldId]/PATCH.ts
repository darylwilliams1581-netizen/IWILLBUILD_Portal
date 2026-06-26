import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { formTemplateFields, formTemplates, profiles } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const templateId = parseInt(String(req.params.id), 10);
    const fieldId = parseInt(String(req.params.fieldId), 10);
    if (isNaN(templateId) || isNaN(fieldId)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify template ownership
    const template = await db.query.formTemplates.findFirst({
      where: and(eq(formTemplates.id, templateId), eq(formTemplates.companyId, profile.companyId)),
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const field = await db.query.formTemplateFields.findFirst({
      where: and(
        eq(formTemplateFields.id, fieldId),
        eq(formTemplateFields.templateId, templateId),
        eq(formTemplateFields.companyId, profile.companyId),
      ),
    });
    if (!field) return res.status(404).json({ error: 'Field not found' });

    const updates: Partial<typeof formTemplateFields.$inferInsert> = {};
    const body = req.body as Record<string, unknown>;

    if ('label' in body) updates.label = String(body.label ?? '');
    if ('fieldType' in body) updates.fieldType = String(body.fieldType);
    if ('required' in body) updates.required = Boolean(body.required);
    if ('optionsJson' in body) updates.optionsJson = body.optionsJson != null ? String(body.optionsJson) : null;
    if ('settingsJson' in body) updates.settingsJson = body.settingsJson != null ? String(body.settingsJson) : null;
    if ('fieldOrder' in body) updates.fieldOrder = Number(body.fieldOrder);

    await db.update(formTemplateFields).set(updates).where(eq(formTemplateFields.id, fieldId));

    const updated = await db.query.formTemplateFields.findFirst({
      where: eq(formTemplateFields.id, fieldId),
    });

    res.json({ ok: true, field: updated });
  } catch (error) {
    console.error('PATCH /api/forms/:id/fields/:fieldId error:', error);
    res.status(500).json({ error: 'Failed to update field' });
  }
}
