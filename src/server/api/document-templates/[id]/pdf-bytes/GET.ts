/**
 * GET /api/document-templates/:id/pdf-bytes
 *
 * Auth-gated PDF byte stream for Studio pdf_page block rendering.
 * Validates that the template belongs to the authenticated user's company,
 * then streams the stored PDF bytes with appropriate headers.
 *
 * Security:
 * - Session required (401 if absent)
 * - Company ownership enforced (404 if mismatch)
 * - source_type must be 'pdf'
 * - No private storage paths exposed in response
 * - Cache-Control: private, max-age=300 (5 min browser cache, no CDN)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const UPLOAD_DIR = '/shared-storage/public/assets/uploads/pdf-imports';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid template ID' });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, source_type, source_file_key, source_file_name, source_mime_type
       FROM document_templates
       WHERE id = ${id} AND company_id = ${auth.profile.companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = rows?.[0];
    if (!doc) return res.status(404).json({ error: 'Template not found' });

    const srcType = String(doc.source_type ?? '');
    if (srcType !== 'pdf') {
      return res.status(400).json({ error: 'This document does not have a PDF source.' });
    }

    // storageKey is "companyId/slug" — resolve to absolute path inside UPLOAD_DIR
    const storageKey = doc.source_file_key ? String(doc.source_file_key) : null;
    if (!storageKey) return res.status(404).json({ error: 'PDF source key not found.' });

    // Prevent path traversal: storageKey must not contain '..'
    if (storageKey.includes('..')) {
      return res.status(400).json({ error: 'Invalid storage key.' });
    }

    const filePath = path.join(UPLOAD_DIR, storageKey);

    let buf: Buffer;
    try {
      buf = await fs.readFile(filePath);
    } catch {
      return res.status(404).json({ error: 'PDF file not found in storage.' });
    }

    const fileName = doc.source_file_name
      ? String(doc.source_file_name)
      : `${String(doc.name ?? 'document')}.pdf`;
    const safeName = fileName.replace(/[^\w\s.\-()]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buf);
  } catch (err) {
    console.error('GET pdf-bytes error:', err);
    return res.status(500).json({ error: 'Failed to stream PDF.' });
  }
}
