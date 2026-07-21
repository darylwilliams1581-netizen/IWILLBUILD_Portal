/**
 * POST /api/document-templates
 * Create a new document template.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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

    const { name, templateType, pageLayout, theme, blocks, systemFields, sourceAttachments, pdfSettings,
            docKind, requiresAcknowledgement, acknowledgementLabel, acknowledgementText, submitLabel, requiresSignature } = req.body as {
      name?: string;
      templateType?: string;
      pageLayout?: unknown;
      theme?: unknown;
      blocks?: unknown;
      systemFields?: unknown;
      sourceAttachments?: unknown;
      pdfSettings?: unknown;
      docKind?: string;
      requiresAcknowledgement?: boolean;
      acknowledgementLabel?: string;
      acknowledgementText?: string;
      submitLabel?: string;
      requiresSignature?: boolean;
    };

    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const builderJson = JSON.stringify({ blocks: blocks ?? [], systemFields: systemFields ?? [], sourceAttachments: sourceAttachments ?? [] });
    const pageLayoutJson = JSON.stringify(pageLayout ?? {});
    const themeJson = JSON.stringify(theme ?? {});
    const pdfSettingsJson = pdfSettings ? JSON.stringify(pdfSettings) : null;
    const tType = templateType ?? 'document';
    const kind = docKind ?? 'doc';
    const reqAck = requiresAcknowledgement ? 1 : 0;
    const ackLabel = acknowledgementLabel ?? 'Sign Onto / Acknowledge';
    const ackText = acknowledgementText ?? 'By signing, I confirm I have read, understood, and agree to comply with this document.';
    const subLabel = submitLabel ?? 'Submit Form';
    const reqSig = requiresSignature ? 1 : 0;

    // Try full INSERT with newer columns first; fall back to core columns if they don't exist yet
    let insertId: number;
    try {
      const [result] = await db.execute(sql.raw(
        `INSERT INTO document_templates (company_id, name, template_type, builder_json, page_layout_json, theme_json, pdf_settings_json,
          doc_kind, requires_acknowledgement, acknowledgement_label, acknowledgement_text, submit_label, requires_signature,
          is_active, created_by_user_id)
         VALUES (${profile.companyId}, ${JSON.stringify(name.trim())}, ${JSON.stringify(tType)}, ${JSON.stringify(builderJson)},
          ${JSON.stringify(pageLayoutJson)}, ${JSON.stringify(themeJson)}, ${pdfSettingsJson ? JSON.stringify(pdfSettingsJson) : 'NULL'},
          ${JSON.stringify(kind)}, ${reqAck}, ${JSON.stringify(ackLabel)}, ${JSON.stringify(ackText)}, ${JSON.stringify(subLabel)}, ${reqSig},
          1, ${JSON.stringify(session.user.id)})`
      )) as unknown as [{ insertId: number }, unknown];
      insertId = result.insertId;
    } catch (insertErr: unknown) {
      const msg = String((insertErr as Error)?.message ?? insertErr);
      if (msg.includes('ER_BAD_FIELD_ERROR') || msg.includes('Unknown column')) {
        // Newer columns don't exist yet — insert core fields only (DB defaults cover the rest)
        console.warn('[document-templates POST] Newer columns missing — inserting core fields only. Redeploy to apply migrations.');
        const [result] = await db.execute(sql.raw(
          `INSERT INTO document_templates (company_id, name, template_type, builder_json, page_layout_json, theme_json,
            is_active, created_by_user_id)
           VALUES (${profile.companyId}, ${JSON.stringify(name.trim())}, ${JSON.stringify(tType)}, ${JSON.stringify(builderJson)},
            ${JSON.stringify(pageLayoutJson)}, ${JSON.stringify(themeJson)},
            1, ${JSON.stringify(session.user.id)})`
        )) as unknown as [{ insertId: number }, unknown];
        insertId = result.insertId;
      } else {
        throw insertErr;
      }
    }

    return res.status(201).json({ id: insertId, ok: true });
  } catch (err) {
    console.error('POST /api/document-templates error:', err);
    return res.status(500).json({ error: 'Failed to create document template' });
  }
}
