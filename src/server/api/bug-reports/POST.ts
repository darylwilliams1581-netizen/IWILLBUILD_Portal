/**
 * POST /api/bug-reports
 * Multipart: fields { category, description, page_url, user_agent }
 *            file   { screenshot? } — optional image, max 10 MB
 *
 * Any authenticated user can submit.
 */
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import { saveFile } from '../../storage/storage-service.js';

const BUCKET_BUG_SCREENSHOTS = 'bug-reports';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const { fields, files } = await parseMultipartForm(req, {
      maxFileSize: 10 * 1024 * 1024,
      allowedMimes: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' },
    });

    const category    = (fields.category    ?? '').toString().trim().slice(0, 100);
    const description = (fields.description ?? '').toString().trim().slice(0, 5000);
    const pageUrl     = (fields.page_url    ?? '').toString().trim().slice(0, 500);
    const userAgent   = (fields.user_agent  ?? req.headers['user-agent'] ?? '').toString().slice(0, 500);

    if (!description) {
      return res.status(400).json({ error: 'Description is required.' });
    }

    // Upload screenshot if provided
    let screenshotPath: string | null = null;
    const screenshot = files.screenshot ?? files.file ?? null;
    if (screenshot) {
      const ext = screenshot.mimetype.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      const key = `${randomBytes(12).toString('hex')}.${ext}`;
      try {
        const result = await saveFile({
          buffer: screenshot.buffer,
          mimeType: screenshot.mimetype,
          storageKey: key,
          bucket: BUCKET_BUG_SCREENSHOTS,
          originalName: screenshot.filename || `screenshot.${ext}`,
        });
        screenshotPath = result.storageKey;
      } catch (uploadErr) {
        console.warn('[bug-reports] screenshot upload failed, continuing without it:', uploadErr);
      }
    }

    const id = randomBytes(16).toString('hex');
    const safeCategory    = category.replace(/'/g, "''");
    const safeDescription = description.replace(/'/g, "''");
    const safePageUrl     = pageUrl.replace(/'/g, "''");
    const safeUserAgent   = userAgent.replace(/'/g, "''");
    const safeScreenshot  = screenshotPath ? `'${screenshotPath.replace(/'/g, "''")}'` : 'NULL';
    const safeScreenshotBucket = screenshotPath ? `'${BUCKET_BUG_SCREENSHOTS}'` : 'NULL';

    await db.execute(sql.raw(`
      INSERT INTO bug_reports
        (id, submitted_by_user_id, submitted_by_name, submitted_by_email,
         company_id, category, description, page_url, user_agent,
         screenshot_path, screenshot_bucket, status, created_at, updated_at)
      VALUES (
        '${id}',
        '${auth.session.user.id}',
        '${(auth.profile?.name ?? '').replace(/'/g, "''")}',
        '${(auth.session.user.email ?? '').replace(/'/g, "''")}',
        ${auth.profile?.companyId ?? 'NULL'},
        '${safeCategory}',
        '${safeDescription}',
        '${safePageUrl}',
        '${safeUserAgent}',
        ${safeScreenshot},
        ${safeScreenshotBucket},
        'open',
        NOW(),
        NOW()
      )
    `));

    return res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('[bug-reports/POST]', err);
    return res.status(500).json({ error: 'Failed to submit bug report.' });
  }
}
