/**
 * GET /api/secure-share/:token/download/:fileId
 * Public file download via a secure share link.
 * Validates permissions and company isolation before serving.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../../../lib/share-tokens.js';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function handler(req: Request, res: Response) {
  try {
    const { token, fileId } = req.params as { token: string; fileId: string };
    if (!token || token.length < 20) return res.status(400).json({ error: 'Invalid token' });

    const tokenHash = hashToken(token);
    const fid = parseInt(fileId, 10);
    if (isNaN(fid)) return res.status(400).json({ error: 'Invalid fileId' });

    const [rows] = await db.execute(sql`
      SELECT id, company_id, target_type, target_id,
             permissions_json, revoked, expires_at, max_uses, use_count
      FROM secure_share_links
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as [Array<{
      id: number;
      company_id: number;
      target_type: string;
      target_id: string;
      permissions_json: string;
      revoked: number;
      expires_at: string | null;
      max_uses: number | null;
      use_count: number;
    }>];

    if (!rows.length) return res.status(404).json({ error: 'Link not found' });

    const link = rows[0];

    if (link.revoked) return res.status(410).json({ error: 'Link revoked' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired' });
    if (link.max_uses !== null && link.use_count >= link.max_uses) return res.status(410).json({ error: 'Max uses reached' });

    const permissions: string[] = JSON.parse(link.permissions_json || '[]');
    if (!permissions.includes('download') && !permissions.includes('view')) {
      return res.status(403).json({ error: 'Download not permitted on this link' });
    }

    // Verify file belongs to this company
    const [fileRows] = await db.execute(sql`
      SELECT id, original_name, stored_name, mime_type, size_bytes
      FROM uploaded_files
      WHERE id = ${fid} AND company_id = ${link.company_id}
      LIMIT 1
    `) as unknown as [Array<{
      id: number;
      original_name: string;
      stored_name: string;
      mime_type: string;
      size_bytes: number;
    }>];

    if (!fileRows.length) return res.status(404).json({ error: 'File not found' });

    const file = fileRows[0];
    const filePath = join('/shared-storage/public/assets/uploads', file.stored_name);

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Log download event
    await db.execute(sql`
      INSERT INTO secure_share_events
        (share_link_id, company_id, event_type, ip_address, user_agent, file_id)
      VALUES
        (${link.id}, ${link.company_id}, 'downloaded',
         ${req.ip ?? null}, ${req.headers['user-agent']?.slice(0, 500) ?? null}, ${fid})
    `);

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
    res.setHeader('Content-Length', file.size_bytes);
    createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('GET /api/secure-share/:token/download/:fileId error:', err);
    return res.status(500).json({ error: 'Download failed' });
  }
}
