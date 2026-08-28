/**
 * POST /api/document-templates/:id/source-document/replace
 * Replaces the source file with a new revision.
 * Multipart: field "file" = new DOCX or PDF; field "notes" = optional change notes.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../../../../lib/file-upload.js';
import { uploadSourceDocument } from '../../../../../lib/source-document-storage.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, source_revision FROM document_templates
       WHERE id = ${id} AND company_id = ${auth.profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; source_revision: number | null }>, unknown];

    const doc = rows?.[0];
    if (!doc) return res.status(404).json({ error: 'Template not found' });

    const { files, fields } = await parseMultipartForm(req, { maxFileSize: 50 * 1024 * 1024 });
    const uploaded = files.find((f) =>
      f.fieldname === 'file' ||
      f.originalname?.endsWith('.docx') ||
      f.originalname?.endsWith('.pdf')
    );
    if (!uploaded?.buffer) return res.status(400).json({ error: 'No file uploaded.' });

    const originalName = uploaded.originalname ?? 'document.docx';
    const isPdf = originalName.toLowerCase().endsWith('.pdf');
    const mimeType = isPdf ? 'application/pdf' : DOCX_MIME;
    const srcType = isPdf ? 'pdf' : 'docx';
    const notes = (fields.notes as string | undefined) ?? null;
    const newRevision = Number(doc.source_revision ?? 0) + 1;

    const upload = await uploadSourceDocument(uploaded.buffer, {
      companyId: auth.profile.companyId,
      templateId: id,
      revision: newRevision,
      originalName,
      mimeType,
    });

    const safe = (s: string) => s.replace(/'/g, "''");
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(sql.raw(
      `UPDATE document_templates SET
         source_type       = '${srcType}',
         source_file_key   = '${safe(upload.storageKey)}',
         source_file_name  = '${safe(originalName)}',
         source_mime_type  = '${safe(mimeType)}',
         source_sha256     = '${safe(upload.sha256)}',
         source_revision   = ${newRevision},
         source_updated_at = '${now}',
         rendered_pdf_key  = NULL,
         updated_at        = '${now}'
       WHERE id = ${id}`
    ));

    // Insert revision history (table may not exist yet — non-fatal)
    await db.execute(sql.raw(
      `INSERT INTO document_template_revisions
         (template_id, company_id, revision, source_type, source_file_key,
          source_file_name, source_mime_type, source_sha256, file_size_bytes,
          uploaded_by, uploaded_at, notes)
       VALUES
         (${id}, ${auth.profile.companyId}, ${newRevision}, '${srcType}',
          '${safe(upload.storageKey)}', '${safe(originalName)}', '${safe(mimeType)}',
          '${safe(upload.sha256)}', ${upload.sizeBytes},
          '${safe(auth.session.user.id)}', '${now}',
          ${notes ? `'${safe(notes)}'` : 'NULL'})`
    )).catch((e: unknown) => {
      console.warn('[source-document/replace] revision history insert failed:', e);
    });

    return res.json({
      revision: newRevision,
      sha256: upload.sha256,
      sizeBytes: upload.sizeBytes,
      storageKey: upload.storageKey,
      sourceFileName: originalName,
      sourceType: srcType,
    });
  } catch (err) {
    console.error('POST source-document/replace error:', err);
    return res.status(500).json({ error: 'Replace failed' });
  }
}
