/**
 * POST /api/admin/fix-photo-record-fields
 * One-time migration: fixes Photo Record form template fields that were seeded
 * with non-standard field types ('text', 'textarea', 'select') and ensures the
 * Photos field has multiple:true in its settingsJson.
 *
 * Safe to run multiple times (idempotent).
 * Owner-only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { formFields, formTemplates, profiles } from '../../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';

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

    // Find all Photo Record templates for this company
    const templates = await db.query.formTemplates.findMany({
      where: and(
        eq(formTemplates.companyId, profile.companyId),
        eq(formTemplates.name, 'Photo Record'),
      ),
      columns: { id: true, name: true },
    });

    if (templates.length === 0) {
      return res.json({ ok: true, message: 'No Photo Record templates found', fixed: 0 });
    }

    const templateIds = templates.map((t) => t.id);
    const fields = await db.query.formFields.findMany({
      where: inArray(formFields.templateId, templateIds),
    });

    let fixed = 0;
    const changes: string[] = [];

    for (const field of fields) {
      let newType: string | null = null;
      let newSettings: string | null = null;

      // Fix legacy field types
      if (field.fieldType === 'text') {
        newType = 'short_text';
        changes.push(`Field "${field.label}" (id=${field.id}): text → short_text`);
      } else if (field.fieldType === 'textarea') {
        newType = 'long_text';
        changes.push(`Field "${field.label}" (id=${field.id}): textarea → long_text`);
      } else if (field.fieldType === 'select') {
        newType = 'single_choice';
        changes.push(`Field "${field.label}" (id=${field.id}): select → single_choice`);
      }

      // Fix photo field to allow multiple
      if (field.fieldType === 'photo' || (newType === null && field.fieldType === 'photo')) {
        let settings: Record<string, unknown> = {};
        try { if (field.settingsJson) settings = JSON.parse(field.settingsJson) as Record<string, unknown>; } catch { /* ignore */ }
        if (!settings.multiple) {
          settings.multiple = true;
          newSettings = JSON.stringify(settings);
          changes.push(`Field "${field.label}" (id=${field.id}): photo → multiple:true`);
        }
      }

      if (newType !== null || newSettings !== null) {
        await db.update(formFields)
          .set({
            ...(newType ? { fieldType: newType } : {}),
            ...(newSettings ? { settingsJson: newSettings } : {}),
          })
          .where(eq(formFields.id, field.id));
        fixed++;
      }
    }

    return res.json({ ok: true, fixed, changes, templateIds });
  } catch (err) {
    console.error('POST /api/admin/fix-photo-record-fields error:', err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
}
