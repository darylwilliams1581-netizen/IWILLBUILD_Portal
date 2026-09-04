/**
 * POST /api/studio/generate-from-safety
 * ─────────────────────────────────────────────────────────────────────────────
 * Atomically creates a Studio document from a completed SWMS or WHS Plan.
 *
 * Body:
 *   widgetType:     'swms' | 'whs_plan'
 *   sourceRecordId: number   — ID of the swms_templates or safety_plans row
 *   title:          string   — document title
 *   blocks:         DocumentBlock[]  — pre-converted blocks from the client
 *   safetyCategory: 'SWMS' | 'WHS Plan'
 *
 * Idempotency:
 *   If a Studio document already exists for (company_id, source_widget_type,
 *   source_record_id) it is returned without creating a duplicate.
 *   Pass force=true to create a new revision instead.
 *
 * Returns: { id, alreadyExisted }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { widgetType, sourceRecordId, title, blocks, safetyCategory, force } = req.body as {
      widgetType: 'swms' | 'whs_plan';
      sourceRecordId: number;
      title: string;
      blocks: unknown[];
      safetyCategory: string;
      force?: boolean;
    };

    if (!widgetType || !['swms', 'whs_plan'].includes(widgetType)) {
      return res.status(400).json({ error: 'widgetType must be swms or whs_plan' });
    }
    if (!sourceRecordId || !Number.isInteger(Number(sourceRecordId))) {
      return res.status(400).json({ error: 'sourceRecordId is required' });
    }
    if (!title?.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({ error: 'blocks array is required' });
    }

    const companyId = profile.companyId;
    const srcId = Number(sourceRecordId);

    // ── Idempotency check ─────────────────────────────────────────────────────
    if (!force) {
      try {
        const [existing] = await db.execute(sql.raw(
          `SELECT id FROM document_templates
           WHERE company_id = ${companyId}
             AND source_widget_type = ${JSON.stringify(widgetType)}
             AND source_record_id = ${srcId}
           LIMIT 1`
        )) as unknown as [Array<{ id: number }>, unknown];
        if (existing?.length) {
          return res.json({ id: existing[0].id, alreadyExisted: true });
        }
      } catch {
        // source_widget_type column may not exist yet — proceed to create
      }
    }

    // ── Build builder_json ────────────────────────────────────────────────────
    const builderJson = JSON.stringify({
      blocks,
      systemFields: [],
      sourceAttachments: [],
    });
    const pageLayoutJson = JSON.stringify({ paperSize: 'A4', orientation: 'portrait', margins: 'standard' });
    const themeJson = JSON.stringify({ backgroundColor: '#ffffff', accentColor: '#7c3aed', textColor: '#1e293b', tableHeaderColor: '#1e293b', tableHeaderTextColor: '#ffffff' });
    const templateType = widgetType === 'swms' ? 'swms' : 'safety_plan';
    const category = safetyCategory ?? (widgetType === 'swms' ? 'SWMS' : 'WHS Plan');

    // ── Atomic INSERT ─────────────────────────────────────────────────────────
    let insertId: number;
    try {
      const [result] = await db.execute(sql.raw(
        `INSERT INTO document_templates
           (company_id, name, template_type, builder_json, page_layout_json, theme_json,
            doc_kind, requires_acknowledgement, acknowledgement_label, acknowledgement_text,
            submit_label, requires_signature, doc_status,
            source_widget_type, source_record_id, safety_category,
            is_active, created_by_user_id)
         VALUES
           (${companyId}, ${JSON.stringify(title.trim())}, ${JSON.stringify(templateType)},
            ${JSON.stringify(builderJson)}, ${JSON.stringify(pageLayoutJson)}, ${JSON.stringify(themeJson)},
            'doc', 1, 'Sign Onto SWMS',
            'By signing, I confirm I have read, understood, and agree to comply with this document.',
            'Submit', 0, 'draft',
            ${JSON.stringify(widgetType)}, ${srcId}, ${JSON.stringify(category)},
            1, ${JSON.stringify(session.user.id)})`
      )) as unknown as [{ insertId: number }, unknown];
      insertId = result.insertId;
    } catch (insertErr: unknown) {
      // Fallback: columns source_widget_type / source_record_id / safety_category may not exist yet
      const msg = String((insertErr as { message?: string }).message ?? insertErr);
      if (msg.includes('ER_BAD_FIELD_ERROR') || msg.includes('Unknown column')) {
        const [result] = await db.execute(sql.raw(
          `INSERT INTO document_templates
             (company_id, name, template_type, builder_json, page_layout_json, theme_json,
              doc_kind, requires_acknowledgement, acknowledgement_label, acknowledgement_text,
              submit_label, requires_signature, doc_status,
              is_active, created_by_user_id)
           VALUES
             (${companyId}, ${JSON.stringify(title.trim())}, ${JSON.stringify(templateType)},
              ${JSON.stringify(builderJson)}, ${JSON.stringify(pageLayoutJson)}, ${JSON.stringify(themeJson)},
              'doc', 1, 'Sign Onto SWMS',
              'By signing, I confirm I have read, understood, and agree to comply with this document.',
              'Submit', 0, 'draft',
              1, ${JSON.stringify(session.user.id)})`
        )) as unknown as [{ insertId: number }, unknown];
        insertId = result.insertId;
      } else {
        throw insertErr;
      }
    }

    return res.status(201).json({ id: insertId, alreadyExisted: false });
  } catch (err) {
    console.error('POST /api/studio/generate-from-safety error:', err);
    return res.status(500).json({ error: 'Failed to generate Studio document' });
  }
}
