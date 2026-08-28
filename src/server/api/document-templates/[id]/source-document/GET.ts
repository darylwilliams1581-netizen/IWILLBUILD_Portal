/**
 * GET /api/document-templates/:id/source-document
 * Returns source document metadata for a template.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, source_type, source_file_key, source_file_name,
              source_mime_type, source_sha256, source_revision, source_updated_at
       FROM document_templates
       WHERE id = ${id} AND company_id = ${auth.profile.companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = rows?.[0];
    if (!doc) return res.status(404).json({ error: 'Template not found' });

    const srcType = String(doc.source_type ?? 'blocks');
    if (srcType !== 'docx' && srcType !== 'pdf') {
      return res.json({ hasSourceDocument: false, sourceType: 'blocks' });
    }

    // Load revision history (table may not exist yet on first deploy)
    let revisions: Array<Record<string, unknown>> = [];
    try {
      const [revRows] = await db.execute(sql.raw(
        `SELECT id, revision, source_file_name, source_sha256, file_size_bytes,
                uploaded_by, uploaded_at, notes
         FROM document_template_revisions
         WHERE template_id = ${id} AND company_id = ${auth.profile.companyId}
         ORDER BY revision DESC LIMIT 20`
      )) as unknown as [Array<Record<string, unknown>>, unknown];
      revisions = Array.isArray(revRows) ? revRows : [];
    } catch { /* table may not exist yet */ }

    return res.json({
      hasSourceDocument: true,
      sourceType: srcType,
      sourceFileName: doc.source_file_name ? String(doc.source_file_name) : null,
      sourceMimeType: doc.source_mime_type ? String(doc.source_mime_type) : null,
      sourceSha256: doc.source_sha256 ? String(doc.source_sha256) : null,
      sourceRevision: Number(doc.source_revision ?? 0),
      sourceUpdatedAt: doc.source_updated_at ? String(doc.source_updated_at) : null,
      revisions,
    });
  } catch (err) {
    console.error('GET source-document error:', err);
    return res.status(500).json({ error: 'Failed to load source document metadata' });
  }
}
