/**
 * POST /api/diag/upload-test
 * TEMPORARY — performs a real authenticated upload to job_card_photos using a
 * synthetic 1×1 JPEG. Reports every stage: R2, media_assets, media_asset_links,
 * job_card_photos. Remove before publishing.
 *
 * Body (JSON): { cardId: number }
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { uploadMedia, normaliseMime } from '../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';

// Minimal valid 1×1 white JPEG (631 bytes)
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA' +
  'AAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAA' +
  'AAAA/9oADAMBAAIRAxEAPwCwABmX/9k=';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
  if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

  const { cardId } = req.body as { cardId?: number };
  if (!cardId || !Number.isInteger(cardId) || cardId <= 0) {
    return res.status(400).json({ error: 'Provide { cardId: <positive integer> } in JSON body' });
  }

  // Verify card belongs to company
  const [cardRows] = await db.execute(
    sql`SELECT id FROM job_cards WHERE id = ${cardId} AND company_id = ${profile.companyId}`
  ) as unknown as [Array<{ id: number }>, unknown];
  if (!cardRows?.length) return res.status(404).json({ error: `job_cards row id=${cardId} not found for company ${profile.companyId}` });

  const stages: Record<string, unknown> = {};
  const storageKey = `diag-test-${randomUUID()}.jpg`;

  const file = {
    fieldname: 'photos',
    originalname: 'diag-test.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from(TINY_JPEG_B64, 'base64'),
    size: 0,
    encoding: '7bit',
  };
  file.size = file.buffer.length;
  normaliseMime(file);
  stages.fileReady = { size: file.size, mime: file.mimetype };

  let compatId: number | null = null;
  let uploadResult: Awaited<ReturnType<typeof uploadMedia>> | null = null;

  try {
    uploadResult = await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: 'job-card-photos',
      storageKey,
      destinationType: 'job_card_photo',
      destinationId: cardId,
      caption: 'diag-test',
      clientId: null,
      imageOnly: true,
      allowHeic: false,
      insertCompatibilityRow: async (ctx: CompatibilityContext) => {
        stages.compatibilityRowAttempt = { storageKey: ctx.storageKey, originalName: ctx.originalName };
        const insResult = await db.execute(sql`
          INSERT INTO job_card_photos (job_card_id, company_id, file_path, file_name, mime_type, caption, uploaded_by)
          VALUES (${cardId}, ${ctx.companyId}, ${ctx.storageKey}, ${ctx.originalName}, ${ctx.mimeType}, ${'diag-test'}, ${ctx.userId})
        `);
        compatId = Number((insResult[0] as { insertId?: number })?.insertId ?? 0) || null;
        stages.jobCardPhotosInserted = { insertId: compatId };
        return compatId;
      },
    });
    stages.uploadMediaResult = {
      mediaAssetId: uploadResult.mediaAssetId,
      linkId: uploadResult.linkId,
      storageKey: uploadResult.storageKey,
      url: uploadResult.url,
      sizeBytes: uploadResult.sizeBytes,
    };
  } catch (err) {
    stages.uploadMediaError = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, stages, error: stages.uploadMediaError });
  }

  // Verify DB rows exist
  const [maRows] = await db.execute(
    sql`SELECT id, storage_key, mime_type, size_bytes FROM media_assets WHERE id = ${uploadResult.mediaAssetId}`
  ) as unknown as [Array<Record<string, unknown>>, unknown];
  stages.mediaAssetsRow = maRows?.[0] ?? null;

  const [malRows] = await db.execute(
    sql`SELECT id, destination_type, destination_id FROM media_asset_links WHERE id = ${uploadResult.linkId}`
  ) as unknown as [Array<Record<string, unknown>>, unknown];
  stages.mediaAssetLinksRow = malRows?.[0] ?? null;

  const [jcpRows] = await db.execute(
    sql`SELECT id, job_card_id, file_path, file_name, mime_type FROM job_card_photos WHERE id = ${compatId}`
  ) as unknown as [Array<Record<string, unknown>>, unknown];
  stages.jobCardPhotosRow = jcpRows?.[0] ?? null;

  // Clean up the test row so it doesn't pollute the card
  try {
    await db.execute(sql`DELETE FROM job_card_photos WHERE id = ${compatId}`);
    await db.execute(sql`DELETE FROM media_asset_links WHERE id = ${uploadResult.linkId}`);
    await db.execute(sql`DELETE FROM media_assets WHERE id = ${uploadResult.mediaAssetId}`);
    stages.cleanupDone = true;
  } catch (cleanErr) {
    stages.cleanupError = cleanErr instanceof Error ? cleanErr.message : String(cleanErr);
  }

  return res.status(201).json({
    ok: true,
    message: 'Upload test passed — all 3 DB rows created and cleaned up.',
    stages,
  });
}
