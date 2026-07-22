/**
 * GET /api/library/items/:id/download
 *
 * Streams the original uploaded file (PDF or DOCX) for a library item.
 * Increments download_count on the source library_items row.
 *
 * Access: any authenticated user with a company profile.
 * The item must be status='active' and visibility='public' (or the caller
 * must be a platform_owner to download drafts/archived items too).
 */
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

// The upload dir used by the owner-console POST handler
const UPLOAD_DIR = '/shared-storage/public/assets/uploads/library-files';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid item ID' });

  try {
    // Fetch item — platform owners can download any status; regular users only active+public
    const [rows] = await db.execute(sql.raw(
      `SELECT id, title, status, visibility, file_path, file_mime, source_file_name
       FROM library_items WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<{
      id: number;
      title: string;
      status: string;
      visibility: string;
      file_path: string | null;
      file_mime: string | null;
      source_file_name: string | null;
    }>, unknown];

    const item = rows?.[0];
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Check visibility for non-owners
    const [ownerCheck] = await db.execute(sql.raw(
      `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
    )) as unknown as [Array<{ role: string }>, unknown];
    const isOwner = ownerCheck?.[0]?.role === 'platform_owner';

    if (!isOwner && (item.status !== 'active' || item.visibility !== 'public')) {
      return res.status(404).json({ error: 'Item not available' });
    }

    if (!item.file_path) {
      return res.status(404).json({ error: 'No file attached to this library item.' });
    }

    // Resolve the file path — file_path is stored as the absolute path
    const filePath = item.file_path.startsWith('/')
      ? item.file_path
      : path.join(UPLOAD_DIR, item.file_path);

    // Verify the file exists
    try {
      await stat(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found on server.' });
    }

    // Determine content-type
    const mime = item.file_mime ?? (
      filePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' :
      filePath.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
      'application/octet-stream'
    );

    // Friendly download filename
    const downloadName = item.source_file_name ?? `${item.title}.${mime.includes('pdf') ? 'pdf' : 'docx'}`;
    const safeDownloadName = downloadName.replace(/[^\w\s.\-()]/g, '_');

    // Increment download count (fire-and-forget)
    db.execute(sql.raw(`UPDATE library_items SET download_count = download_count + 1 WHERE id = ${id}`))
      .catch(() => {/* ignore */});

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'Failed to stream file.' });
    });
    stream.pipe(res);
  } catch (err) {
    console.error('GET /api/library/items/:id/download error:', err);
    return res.status(500).json({ error: 'Download failed' });
  }
}
