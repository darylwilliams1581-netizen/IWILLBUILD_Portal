/**
 * POST /api/admin/fix-all-photo-fields
 * Sets multiple:true on every photo field across ALL form templates for this company.
 * Safe to run multiple times (idempotent). Owner/admin only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { formFields, formTemplates, profiles } from '../../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (profile.role !== 'owner' && profile.role !== 'admin') return res.status(403).json({ error: 'Owner/admin only' });

    // Get all templates for this company
    const templates = await db.query.formTemplates.findMany({
      where: eq(formTemplates.companyId, profile.companyId),
      columns: { id: true, name: true },
    });

    if (templates.length === 0) {
      return res.json({ ok: true, message: 'No templates found', fixed: 0 });
    }

    // Get all photo fields across all templates
    const allFields = await db.query.formFields.findMany({
      where: and(
        eq(formFields.fieldType, 'photo'),
      ),
    });

    // Filter to only fields belonging to this company's templates
    const templateIds = new Set(templates.map((t) => t.id));
    const photoFields = allFields.filter((f) => templateIds.has(f.templateId));

    let fixed = 0;
    const changes: string[] = [];

    for (const field of photoFields) {
      let settings: Record<string, unknown> = {};
      try { if (field.settingsJson) settings = JSON.parse(field.settingsJson) as Record<string, unknown>; } catch { /* ignore */ }

      if (!settings.multiple) {
        settings.multiple = true;
        await db.update(formFields)
          .set({ settingsJson: JSON.stringify(settings) })
          .where(eq(formFields.id, field.id));
        fixed++;
        const tmpl = templates.find((t) => t.id === field.templateId);
        changes.push(`Template "${tmpl?.name ?? field.templateId}" → field "${field.label}" (id=${field.id}): multiple:true`);
      }
    }

    return res.json({ ok: true, fixed, total: photoFields.length, changes });
  } catch (err) {
    console.error('POST /api/admin/fix-all-photo-fields error:', err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
}
