/**
 * POST /api/secure-share/:token/upload
 * Public file upload via a secure share link.
 * Validates permissions, file type, size, then stores the file.
 *
 * TODO: Add virus scanning integration here when available.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ResultSetHeader } from 'mysql2';
import busboy from 'busboy';

// Blocked MIME types / extensions
const BLOCKED_EXTENSIONS = new Set(['.heic', '.heif', '.exe', '.bat', '.sh', '.cmd', '.msi', '.dmg', '.app']);
const BLOCKED_MIMES = new Set(['image/heic', 'image/heif', 'application/x-msdownload', 'application/x-sh']);

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) return res.status(400).json({ error: 'Invalid token' });

    const tokenHash = hashToken(token);

    const [rows] = await db.execute(sql`
      SELECT id, company_id, link_type, target_type, target_id,
             permissions_json, metadata_json, revoked, expires_at, max_uses, use_count
      FROM secure_share_links
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as [Array<{
      id: number;
      company_id: number;
      link_type: string;
      target_type: string;
      target_id: string;
      permissions_json: string;
      metadata_json: string;
      revoked: number;
      expires_at: string | null;
      max_uses: number | null;
      use_count: number;
    }>];

    if (!rows.length) return res.status(404).json({ error: 'Link not found' });

    const link = rows[0];

    if (link.revoked) return res.status(410).json({ error: 'Link revoked', code: 'REVOKED' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired', code: 'EXPIRED' });
    if (link.max_uses !== null && link.use_count >= link.max_uses) return res.status(410).json({ error: 'Max uses reached', code: 'MAX_USES' });

    const permissions: string[] = JSON.parse(link.permissions_json || '[]');
    if (!permissions.includes('upload')) {
      return res.status(403).json({ error: 'Upload not permitted on this link', code: 'NO_UPLOAD' });
    }

    const metadata: Record<string, unknown> = JSON.parse(link.metadata_json || '{}');
    const allowedTypes: string[] | null = (metadata.allowed_file_types as string[]) ?? null;
    const maxSizeMb: number = (metadata.max_file_size_mb as number) ?? 50;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    // Parse multipart
    const bb = busboy({ headers: req.headers, limits: { fileSize: maxSizeBytes + 1 } });

    let fileBuffer: Buffer | null = null;
    let originalName = 'upload';
    let mimeType = 'application/octet-stream';
    let sizeLimitExceeded = false;
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      bb.on('file', (_field, stream, info) => {
        originalName = info.filename || 'upload';
        mimeType = info.mimeType || 'application/octet-stream';
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('limit', () => { sizeLimitExceeded = true; stream.resume(); });
        stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
      });
      bb.on('finish', resolve);
      bb.on('error', reject);
      req.pipe(bb);
    });

    if (sizeLimitExceeded) {
      return res.status(413).json({ error: `File exceeds maximum size of ${maxSizeMb} MB`, code: 'TOO_LARGE' });
    }

    if (!fileBuffer || (fileBuffer as Buffer).length === 0) {
      return res.status(400).json({ error: 'No file received' });
    }

    // Extension check
    const ext = extname(originalName).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: `File type ${ext} is not allowed`, code: 'BLOCKED_TYPE' });
    }
    if (BLOCKED_MIMES.has(mimeType)) {
      return res.status(400).json({ error: `File type ${mimeType} is not allowed`, code: 'BLOCKED_TYPE' });
    }

    // Allowed types check
    if (allowedTypes && allowedTypes.length > 0) {
      const extNoDot = ext.replace('.', '');
      if (!allowedTypes.includes(extNoDot) && !allowedTypes.includes(mimeType)) {
        return res.status(400).json({
          error: `Only ${allowedTypes.join(', ')} files are allowed`,
          code: 'WRONG_TYPE',
        });
      }
    }

    // Store file
    const storedName = `${randomBytes(16).toString('hex')}${ext}`;
    const uploadDir = `/shared-storage/public/assets/uploads/share/${link.company_id}`;
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, storedName), fileBuffer as Buffer);

    // TODO: Virus scanning placeholder — integrate ClamAV or cloud AV here
    // await scanFile(join(uploadDir, storedName));

    const publicUrl = `/airo-assets/uploads/share/${link.company_id}/${storedName}`;

    // Register in uploaded_files table
    const [fileResult] = await db.execute(sql`
      INSERT INTO uploaded_files
        (company_id, job_id, fleet_asset_id, original_name, stored_name, mime_type,
         size_bytes, uploaded_by_user_id, source, created_at)
      VALUES
        (${link.company_id},
         ${link.target_type === 'job' ? parseInt(link.target_id, 10) : null},
         ${link.target_type === 'fleet' ? parseInt(link.target_id, 10) : null},
         ${originalName}, ${storedName}, ${mimeType},
         ${(fileBuffer as Buffer).length}, NULL, 'share_link', NOW())
    `) as unknown as [ResultSetHeader];

    const fileId = fileResult.insertId;

    // Log event
    await db.execute(sql`
      INSERT INTO secure_share_events
        (share_link_id, company_id, event_type, ip_address, user_agent, file_id)
      VALUES
        (${link.id}, ${link.company_id}, 'uploaded',
         ${req.ip ?? null}, ${req.headers['user-agent']?.slice(0, 500) ?? null}, ${fileId})
    `);

    return res.status(201).json({
      ok: true,
      fileId,
      originalName,
      publicUrl,
      sizeBytes: (fileBuffer as Buffer).length,
    });
  } catch (err) {
    console.error('POST /api/secure-share/:token/upload error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
