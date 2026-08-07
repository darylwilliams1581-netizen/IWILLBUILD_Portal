/**
 * POST /api/job-cards/:id/photos
 * Upload one or more photos to a Job Card.
 *
 * Mirrors the proven flow from /api/jobs/:id/photos/POST.ts:
 *  - parseMultipartForm (busboy-based, no multer)
 *  - Full MIME reclassification: extension → magic-byte sniff → safe default
 *  - compressImageIfNeeded: HEIC→JPEG conversion + resize
 *  - saveFile: creates bucket directory automatically, returns publicUrl
 *  - Inserts into job_card_photos table
 *  - Returns the real error message to the client (never a generic string)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import {
  compressImageIfNeeded,
  saveFile,
  ALLOWED_IMAGE_MIMES,
} from '../../../../storage/storage-service.js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'job-card-photos';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file
const MAX_FILES = 10;

export default async function handler(req: Request, res: Response) {
  // ── 1. Parse multipart ──────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_BYTES, maxFiles: MAX_FILES });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload error';
    console.error(`[job-card-photos POST] parseMultipartForm failed: ${msg}`);
    return res.status(400).json({ error: msg });
  }
  if (parsed.limitError) {
    console.warn(`[job-card-photos POST] limit error: ${parsed.limitError}`);
    return res.status(400).json({ error: parsed.limitError });
  }

  console.log(`[job-card-photos POST] cardId=${req.params.id} files=${parsed.files.length} fields=${JSON.stringify(Object.keys(parsed.fields))}`);
  for (const f of parsed.files) {
    console.log(`[job-card-photos POST] received: name="${f.originalname}" mime="${f.mimetype}" size=${f.size} field="${f.fieldname}"`);
  }

  // ── 2. MIME reclassification ────────────────────────────────────────────────
  // iOS sends HEIC as application/octet-stream or with no extension ("image").
  // Reclassify by extension first, then fall back to magic-byte sniffing.
  for (const f of parsed.files) {
    const ext = (f.originalname.split('.').pop() ?? '').toLowerCase();
    const noExt = !f.originalname.includes('.') || ext === f.originalname.toLowerCase();

    if (
      f.mimetype === 'application/octet-stream' ||
      f.mimetype === '' ||
      f.mimetype === 'application/unknown' ||
      !f.mimetype
    ) {
      if (ext === 'heic' || ext === 'heif') {
        f.mimetype = 'image/heic';
      } else if (ext === 'jpg' || ext === 'jpeg') {
        f.mimetype = 'image/jpeg';
      } else if (ext === 'png') {
        f.mimetype = 'image/png';
      } else if (ext === 'webp') {
        f.mimetype = 'image/webp';
      } else if (noExt && f.buffer.length > 3) {
        // Magic-byte sniff for files with no extension (iOS "image" filename)
        const sig = f.buffer.slice(0, 12);
        if (sig[0] === 0xFF && sig[1] === 0xD8) f.mimetype = 'image/jpeg';       // JPEG
        else if (sig[0] === 0x89 && sig[1] === 0x50) f.mimetype = 'image/png';   // PNG
        else if (sig[0] === 0x52 && sig[1] === 0x49) f.mimetype = 'image/webp';  // RIFF/WebP
        else f.mimetype = 'image/jpeg'; // safe default for iOS camera output
      }
    }

    // Normalise non-standard aliases
    if (f.mimetype === 'image/jpg') f.mimetype = 'image/jpeg';
    if (f.mimetype === 'image/heif') f.mimetype = 'image/heic';

    console.log(`[job-card-photos POST] after reclassify: name="${f.originalname}" mime="${f.mimetype}"`);

    if (!ALLOWED_IMAGE_MIMES[f.mimetype]) {
      const msg = `"${f.originalname}" is not a supported image type (${f.mimetype}). Supported: JPEG, PNG, WebP, HEIC.`;
      console.warn(`[job-card-photos POST] rejected: ${msg}`);
      return res.status(400).json({ error: msg });
    }
  }

  if (parsed.files.length === 0) {
    return res.status(400).json({ error: 'No files received. Please try again.' });
  }

  // ── 3. Auth ─────────────────────────────────────────────────────────────────
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company associated with this account' });

    const cardId = parseInt(String(req.params.id), 10);
    if (isNaN(cardId) || cardId <= 0) return res.status(400).json({ error: 'Invalid job card ID' });

    // ── 4. Verify ownership ───────────────────────────────────────────────────
    const ownerResult = await db.execute(
      sql`SELECT id FROM job_cards WHERE id = ${cardId} AND company_id = ${profile.companyId}`
    );
    const ownerRows = ownerResult[0] as Array<{ id: number }>;
    if (!ownerRows?.length) return res.status(404).json({ error: 'Job card not found' });

    const caption = String(parsed.fields.caption ?? '').trim() || null;
    const saved: Array<{ id: number; file_path: string; file_name: string; mime_type: string; caption: string | null }> = [];

    // ── 5. Process each file ──────────────────────────────────────────────────
    for (const file of parsed.files) {
      // Compress + convert HEIC→JPEG
      let compressed: Buffer;
      let outMime: string;
      try {
        const result = await compressImageIfNeeded(file.buffer, file.mimetype);
        compressed = result.buffer;
        outMime = result.mimeType;
        console.log(`[job-card-photos POST] compress: "${file.originalname}" ${file.mimetype} → ${outMime} (${file.size}→${compressed.length} bytes)`);
      } catch (convErr) {
        const msg = convErr instanceof Error ? convErr.message : 'Image conversion failed';
        console.error(`[job-card-photos POST] compress failed for "${file.originalname}":`, convErr);
        return res.status(400).json({ error: `Could not process "${file.originalname}": ${msg}` });
      }

      const ext = outMime === 'image/png' ? 'png' : 'jpg';
      const storageKey = `jc-${cardId}-${randomUUID()}.${ext}`;

      // Save to storage — saveFile() creates the bucket directory automatically
      let saveResult: { publicUrl: string; storageKey: string };
      try {
        saveResult = await saveFile({
          buffer: compressed,
          originalName: file.originalname,
          mimeType: outMime,
          bucket: BUCKET,
          storageKey,
        });
        console.log(`[job-card-photos POST] saved: key=${saveResult.storageKey} url=${saveResult.publicUrl}`);
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : 'Storage error';
        console.error(`[job-card-photos POST] saveFile failed for "${file.originalname}":`, saveErr);
        return res.status(500).json({ error: `Could not store "${file.originalname}": ${msg}` });
      }

      // Insert DB record
      try {
        const insResult = await db.execute(sql`
          INSERT INTO job_card_photos (job_card_id, company_id, file_path, file_name, mime_type, caption, uploaded_by)
          VALUES (${cardId}, ${profile.companyId}, ${saveResult.publicUrl}, ${file.originalname}, ${outMime}, ${caption}, ${session.user.id})
        `);
        const ins = insResult[0] as { insertId?: number };
        const insertId = Number(ins?.insertId ?? 0);
        console.log(`[job-card-photos POST] DB record inserted: id=${insertId} cardId=${cardId} url=${saveResult.publicUrl}`);
        saved.push({
          id: insertId,
          file_path: saveResult.publicUrl,
          file_name: file.originalname,
          mime_type: outMime,
          caption,
        });
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : 'Database error';
        console.error(`[job-card-photos POST] DB insert failed for "${file.originalname}":`, dbErr);
        return res.status(500).json({ error: `Could not save photo record: ${msg}` });
      }
    }

    console.log(`[job-card-photos POST] complete: cardId=${cardId} saved=${saved.length} photos`);
    return res.status(201).json({ photos: saved });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[job-card-photos POST] unhandled error:', err);
    return res.status(500).json({ error: msg || 'Failed to upload photos' });
  }
}
