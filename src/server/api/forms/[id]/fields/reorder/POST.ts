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
    if (isNaN(templateId)) return res.status(400).json({ error: 'Invalid ID' });

    const template = await db.query.formTemplates.findFirst({
      where: and(eq(formTemplates.id, templateId), eq(formTemplates.companyId, profile.companyId)),
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    // Expect: { order: [{ id: number, fieldOrder: number }] }
    const { order } = req.body as { order: { id: number; fieldOrder: number }[] };
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

    await Promise.all(
      order.map(({ id, fieldOrder }) =>
        db.update(formTemplateFields)
          .set({ fieldOrder })
          .where(and(
            eq(formTemplateFields.id, id),
            eq(formTemplateFields.templateId, templateId),
            eq(formTemplateFields.companyId, profile.companyId!),
          ))
      )
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('POST /api/forms/:id/fields/reorder error:', error);
    res.status(500).json({ error: 'Failed to reorder fields' });
  }
}
