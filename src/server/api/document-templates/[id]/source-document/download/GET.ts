/**
 * GET /api/document-templates/:id/source-document/download
 * Downloads the original source file (DOCX/PDF) byte-for-byte.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import { downloadSourceDocument } from '../../../../../lib/source-document-storage.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, source_type, source_file_key, source_file_name,
              source_mime_type, source_sha256
       FROM document_templates
       WHERE id = ${id} AND company_id = ${auth.profile.companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = rows?.[0];
    if (!doc) return res.status(404).json({ error: 'Template not found' });

    const srcType = String(doc.source_type ?? 'blocks');
    if (srcType !== 'docx' && srcType !== 'pdf') {
      return res.status(400).json({ error: 'This document does not have a source file.' });
    }

    const fileKey = doc.source_file_key ? String(doc.source_file_key) : null;
    if (!fileKey) return res.status(404).json({ error: 'Source file key not found.' });

    const buffer = await downloadSourceDocument(fileKey);
    if (!buffer) return res.status(404).json({ error: 'Source file not found in storage.' });

    const fileName = doc.source_file_name
      ? String(doc.source_file_name)
      : `${String(doc.name ?? 'document')}.${srcType}`;
    const safeName = fileName.replace(/[^\w\s.\-()]/g, '_');
    const mime = doc.source_mime_type
      ? String(doc.source_mime_type)
      : srcType === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';
    const sha256 = doc.source_sha256 ? String(doc.source_sha256) : '';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', buffer.length);
    if (sha256) {
      res.setHeader('Content-Digest', `sha-256=:${Buffer.from(sha256, 'hex').toString('base64')}:`);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(buffer);
  } catch (err) {
    console.error('GET source-document/download error:', err);
    return res.status(500).json({ error: 'Download failed' });
  }
}
