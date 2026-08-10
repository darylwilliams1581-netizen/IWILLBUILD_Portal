/**
 * POST /api/me/profile-attachments
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload a file attachment for the user's profile (max 5 total, 10 MB each).
 *
 * Migrated to canonical uploadService:
 *  - Stores file via storage service (R2 / local) instead of local filesystem
 *  - Creates media_assets + media_asset_links rows
 *  - Preserves existing JSON response shape (profiles.profile_attachments)
 *    for backwards compatibility
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../lib/file-upload.js';
import { uploadMedia, normaliseMime } from '../../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';

const MAX_ATTACHMENTS = 5;
const MAX_SIZE_BYTES   = 10 * 1024 * 1024;
const BUCKET           = 'profile-attachments';

interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
  mimeType?: string;
  mediaAssetId?: number;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    if (!profile.companyId) return res.status(403).json({ error: 'No company' });

    // Read existing attachments
    const [rows] = await db.execute(
      sql`SELECT profile_attachments FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ profile_attachments?: string }>, unknown];
    let attachments: Attachment[] = [];
    try {
      const raw = rows?.[0]?.profile_attachments;
      if (raw) attachments = JSON.parse(raw) as Attachment[];
    } catch { /* ignore */ }

    if (attachments.length >= MAX_ATTACHMENTS) {
      return res.status(400).json({ error: `Maximum ${MAX_ATTACHMENTS} attachments allowed. Remove one before adding another.` });
    }

    // Parse multipart
    let parsed;
    try {
      parsed = await parseMultipartForm(req, { maxFileSize: MAX_SIZE_BYTES, maxFiles: 1 });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
    }
    if (parsed.limitError) return res.status(400).json({ error: `File exceeds the 10 MB limit.` });
    if (!parsed.file) return res.status(400).json({ error: 'No file received.' });

    const file = parsed.file;
    normaliseMime(file);

    const id = randomUUID();
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200);
    const ext = safeFilename.includes('.') ? safeFilename.split('.').pop() ?? 'bin' : 'bin';
    const storageKey = `${session.user.id}/${id}-${safeFilename}.${ext === safeFilename ? 'bin' : ''}`.replace(/\.$/, '');
    // Use a clean key: userId/uuid-safeFilename
    const cleanKey = `${session.user.id}/${id}-${safeFilename}`;
    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;

    const result = await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: BUCKET,
      storageKey: cleanKey,
      destinationType: 'profile_attachment',
      destinationId: null,
      fieldKey: session.user.id,
      clientId,
      imageOnly: false,
      // No compatibility row needed — we update profiles.profile_attachments JSON below
    });

    const newAttachment: Attachment = {
      id,
      filename: safeFilename,
      url: result.url,
      size: result.sizeBytes,
      uploadedAt: new Date().toISOString(),
      mimeType: file.mimetype,
      mediaAssetId: result.mediaAssetId,
    };

    attachments.push(newAttachment);
    await db.execute(sql`
      UPDATE profiles SET profile_attachments = ${JSON.stringify(attachments)}
      WHERE user_id = ${session.user.id}
    `);

    return res.json({ ok: true, attachments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status ?? 500;
    console.error('POST /api/me/profile-attachments error:', err);
    return res.status(status).json({ error: msg || 'Failed to upload attachment' });
  }
}
