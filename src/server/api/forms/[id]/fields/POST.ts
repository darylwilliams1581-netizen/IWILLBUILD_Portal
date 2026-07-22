import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { formTemplateFields, formTemplates, profiles } from '../../../../db/schema.js';
import { eq, and, max, count } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { LIMITS } from '../../../../lib/limits.js';

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

    // ── Enforce 100-field limit ───────────────────────────────────────────────
    const [countRow] = await db
      .select({ c: count() })
      .from(formTemplateFields)
      .where(and(
        eq(formTemplateFields.templateId, templateId),
        eq(formTemplateFields.companyId, profile.companyId),
      ));
    const currentCount = countRow?.c ?? 0;
    if (currentCount >= LIMITS.FORM_FIELDS) {
      return res.status(400).json({
        code: 'limit_reached',
        error: `Form templates are limited to ${LIMITS.FORM_FIELDS} fields. Delete unused fields before adding more.`,
      });
    }

    const { label, fieldType, required, optionsJson, settingsJson } = req.body as {
      label?: string;
      fieldType?: string;
      required?: boolean;
      optionsJson?: string | null;
      settingsJson?: string | null;
    };

    if (!fieldType) return res.status(400).json({ error: 'fieldType required' });

    // Get next order
    const [maxRow] = await db
      .select({ maxOrder: max(formTemplateFields.fieldOrder) })
      .from(formTemplateFields)
      .where(and(
        eq(formTemplateFields.templateId, templateId),
        eq(formTemplateFields.companyId, profile.companyId),
      ));
    const nextOrder = (maxRow?.maxOrder ?? -1) + 1;

    const [result] = await db.insert(formTemplateFields).values({
      templateId,
      companyId: profile.companyId,
      label: label ?? '',
      fieldType,
      required: required ?? false,
      optionsJson: optionsJson ?? null,
      settingsJson: settingsJson ?? null,
      fieldOrder: nextOrder,
    });

    const field = await db.query.formTemplateFields.findFirst({
      where: eq(formTemplateFields.id, result.insertId),
    });

    res.status(201).json({ ok: true, field });
  } catch (error) {
    console.error('POST /api/forms/:id/fields error:', error);
    res.status(500).json({ error: 'Failed to create field' });
  }
}
