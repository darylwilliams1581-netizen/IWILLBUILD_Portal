/**
 * PUT /api/document-templates/:id
 * Save (overwrite) a document template's canvas JSON and metadata.
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

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership
    const [rows] = await db.execute(sql.raw(
      `SELECT id FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    const { name, templateType, pageLayout, theme, blocks, systemFields, sourceAttachments, pdfSettings,
            sourceJobId,
            docKind, requiresAcknowledgement, acknowledgementLabel, acknowledgementText, submitLabel, requiresSignature } = req.body as {
      name?: string;
      templateType?: string;
      pageLayout?: unknown;
      theme?: unknown;
      blocks?: unknown;
      systemFields?: unknown;
      sourceAttachments?: unknown;
      pdfSettings?: unknown;
      sourceJobId?: number | null;
      docKind?: string;
      requiresAcknowledgement?: boolean;
      acknowledgementLabel?: string;
      acknowledgementText?: string;
      submitLabel?: string;
      requiresSignature?: boolean;
    };

    const builderJson = JSON.stringify({ blocks: blocks ?? [], systemFields: systemFields ?? [], sourceAttachments: sourceAttachments ?? [] });
    const pageLayoutJson = JSON.stringify(pageLayout ?? {});
    const themeJson = JSON.stringify(theme ?? {});
    const pdfSettingsJson = pdfSettings ? JSON.stringify(pdfSettings) : null;

    const setParts: string[] = [
      `builder_json = ${JSON.stringify(builderJson)}`,
      `page_layout_json = ${JSON.stringify(pageLayoutJson)}`,
      `theme_json = ${JSON.stringify(themeJson)}`,
    ];
    if (pdfSettingsJson !== null) setParts.push(`pdf_settings_json = ${JSON.stringify(pdfSettingsJson)}`);
    if (name?.trim()) setParts.push(`name = ${JSON.stringify(name.trim())}`);
    if (templateType) setParts.push(`template_type = ${JSON.stringify(templateType)}`);

    // Newer columns — only added if they exist on the DB (colsToEnsure adds them on startup)
    const newerParts: string[] = [];
    if (sourceJobId !== undefined) newerParts.push(`source_job_id = ${sourceJobId != null ? Number(sourceJobId) : 'NULL'}`);
    if (docKind) newerParts.push(`doc_kind = ${JSON.stringify(docKind)}`);
    if (requiresAcknowledgement !== undefined) newerParts.push(`requires_acknowledgement = ${requiresAcknowledgement ? 1 : 0}`);
    if (acknowledgementLabel !== undefined) newerParts.push(`acknowledgement_label = ${JSON.stringify(acknowledgementLabel)}`);
    if (acknowledgementText !== undefined) newerParts.push(`acknowledgement_text = ${JSON.stringify(acknowledgementText)}`);
    if (submitLabel !== undefined) newerParts.push(`submit_label = ${JSON.stringify(submitLabel)}`);
    if (requiresSignature !== undefined) newerParts.push(`requires_signature = ${requiresSignature ? 1 : 0}`);

    const runUpdate = async (parts: string[]) =>
      db.execute(sql.raw(
        `UPDATE document_templates SET ${parts.join(', ')} WHERE id = ${id} AND company_id = ${profile.companyId}`
      ));

    try {
      await runUpdate([...setParts, ...newerParts]);
    } catch (updateErr: unknown) {
      const msg = String((updateErr as Error)?.message ?? updateErr);
      if ((msg.includes('ER_BAD_FIELD_ERROR') || msg.includes('Unknown column')) && newerParts.length > 0) {
        // Newer columns don't exist yet on this DB — save core fields only
        console.warn('[document-templates PUT] Newer columns missing — saving core fields only. Redeploy to apply migrations.');
        await runUpdate(setParts);
      } else {
        throw updateErr;
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/document-templates/:id error:', err);
    return res.status(500).json({ error: 'Failed to save template' });
  }
}
