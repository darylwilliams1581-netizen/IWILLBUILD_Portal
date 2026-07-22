import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { formTemplateFields, formTemplates, profiles } from '../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    // Verify template belongs to company
    const template = await db.query.formTemplates.findFirst({
      where: and(eq(formTemplates.id, templateId), eq(formTemplates.companyId, profile.companyId)),
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const fields = await db.query.formTemplateFields.findMany({
      where: and(
        eq(formTemplateFields.templateId, templateId),
        eq(formTemplateFields.companyId, profile.companyId),
      ),
      orderBy: [asc(formTemplateFields.fieldOrder)],
    });

    res.json({ fields, template });
  } catch (error) {
    console.error('GET /api/forms/:id/fields error:', error);
    res.status(500).json({ error: 'Failed to load fields' });
  }
}
