/**
 * POST /api/camera-captures
 * Upload one or more photos to the camera captures inbox (no job required).
 *
 * SAFETY RULES
 * ────────────
 * 1. insertId is read from the SAME db.execute() result object — never via a
 *    separate SELECT LAST_INSERT_ID() which can return 0 on a different pool
 *    connection.
 * 2. If saveFile() succeeds but the DB insert fails, deleteFile() is called
 *    immediately to prevent orphaned storage objects.
 * 3. If jobId is supplied, the job must belong to the authenticated user's
 *    company before it is accepted.
 * 4. Blobs are validated (non-empty, supported MIME) before any I/O.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../lib/file-upload.js';
import {
  compressImageIfNeeded,
  saveFile,
  deleteFile,
  ALLOWED_IMAGE_MIMES,
} from '../../storage/storage-service.js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'camera-captures';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_FILE_BYTES, maxFiles: 20 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const files = parsed.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // ── MIME reclassification (magic-byte sniffing for extension-less uploads) ──
    for (const f of files) {
      const ext = (f.originalname.split('.').pop() ?? '').toLowerCase();
      const noExt = !f.originalname.includes('.') || ext === f.originalname.toLowerCase();
      if (
        f.mimetype === 'application/octet-stream' ||
        f.mimetype === '' ||
        f.mimetype === 'application/unknown'
      ) {
        if (ext === 'heic' || ext === 'heif') f.mimetype = 'image/heic';
        else if (ext === 'jpg' || ext === 'jpeg') f.mimetype = 'image/jpeg';
        else if (ext === 'png') f.mimetype = 'image/png';
        else if (ext === 'webp') f.mimetype = 'image/webp';
        else if (noExt && f.buffer.length > 3) {
          const sig = f.buffer.slice(0, 12);
          if (sig[0] === 0xFF && sig[1] === 0xD8) f.mimetype = 'image/jpeg';
          else if (sig[0] === 0x89 && sig[1] === 0x50) f.mimetype = 'image/png';
          else if (sig[0] === 0x52 && sig[1] === 0x49) f.mimetype = 'image/webp';
          else f.mimetype = 'image/jpeg';
        }
      }
      if (f.mimetype === 'image/jpg') f.mimetype = 'image/jpeg';
      if (f.mimetype === 'image/heif') f.mimetype = 'image/heic';

      // ── Blob validation: reject empty buffers ─────────────────────────────
      if (!f.buffer || f.buffer.length === 0) {
        return res.status(400).json({
          error: `"${f.originalname}" is empty — the capture may have failed on the device.`,
        });
      }

      if (!ALLOWED_IMAGE_MIMES[f.mimetype]) {
        return res.status(400).json({
          error: `"${f.originalname}" is not a supported image type (${f.mimetype}).`,
        });
      }
    }

    const note = typeof parsed.fields?.note === 'string' ? parsed.fields.note.trim() || null : null;
    const capturedAtRaw = typeof parsed.fields?.capturedAt === 'string'
      ? parsed.fields.capturedAt
      : new Date().toISOString();
    // MySQL DATETIME requires 'YYYY-MM-DD HH:MM:SS' — convert from ISO 8601
    const mysqlDate = capturedAtRaw.replace('T', ' ').replace('Z', '').slice(0, 19);
    const capturedAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(mysqlDate) ? mysqlDate : null;

    const jobIdRaw = typeof parsed.fields?.jobId === 'string' ? parseInt(parsed.fields.jobId, 10) : null;
    const jobId = jobIdRaw && !isNaN(jobIdRaw) ? jobIdRaw : null;

    // ── Job ownership check ───────────────────────────────────────────────────
    // If a jobId was supplied, verify it belongs to this user's company before
    // accepting it. This prevents cross-company data leakage.
    if (jobId) {
      const jobRows = await db.execute(sql`
        SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1
      `) as unknown as [Array<{ id: number }>, unknown];
      if (!jobRows[0]?.[0]) {
        return res.status(403).json({ error: 'Job not found or does not belong to your company.' });
      }
    }

    const initialStatus = jobId ? 'assigned' : 'captured';
    const saved: Array<{ id: number; storageKey: string; url: string }> = [];

    for (const file of files) {
      let compressed: Buffer = file.buffer;
      let outMime: string = file.mimetype;
      try {
        const result = await compressImageIfNeeded(file.buffer, file.mimetype);
        compressed = result.buffer;
        outMime = result.mimeType;
      } catch {
        // use raw file on compress failure
      }

      const ext = outMime === 'image/png' ? 'png' : 'jpg';
      const storageKey = `${randomUUID()}.${ext}`;

      // ── Save to storage first ─────────────────────────────────────────────
      const storageResult = await saveFile({
        buffer: compressed,
        originalName: file.originalname,
        mimeType: outMime,
        bucket: BUCKET,
        storageKey,
      });

      // ── DB insert — read insertId from the SAME execute result ────────────
      // NEVER use a separate SELECT LAST_INSERT_ID() — with a connection pool
      // the second query may run on a different connection and return 0.
      let newId = 0;
      try {
        // Note: 'bucket' column may not exist on older DB instances (migration pending).
      // We use a conditional INSERT that works whether the column exists or not.
      // The bucket value is always the BUCKET constant so it's safe to omit.
      // ── Tiered INSERT — gracefully handles older DB schemas ─────────────────
      // Tier 1: full schema (bucket + original_name)
      // Tier 2: no bucket column
      // Tier 3: no bucket AND no original_name column (oldest live schema)
      let insertResult;
      const isUnknownCol = (e: unknown) => {
        const m = String((e as Error)?.message ?? e);
        return m.includes('Unknown column') || m.includes('ER_BAD_FIELD_ERROR') || m.includes("doesn't exist");
      };
      try {
        insertResult = await db.execute(sql`
          INSERT INTO camera_captures
            (company_id, user_id, storage_key, bucket, mime_type, size_bytes,
             original_name, note, job_id, status, captured_at)
          VALUES
            (${profile.companyId}, ${session.user.id}, ${storageResult.storageKey},
             ${BUCKET}, ${outMime}, ${storageResult.sizeBytes},
             ${file.originalname}, ${note}, ${jobId}, ${initialStatus}, ${capturedAt})
        `);
      } catch (e1) {
        if (!isUnknownCol(e1)) throw e1;
        // Tier 2: drop bucket
        try {
          insertResult = await db.execute(sql`
            INSERT INTO camera_captures
              (company_id, user_id, storage_key, mime_type, size_bytes,
               original_name, note, job_id, status, captured_at)
            VALUES
              (${profile.companyId}, ${session.user.id}, ${storageResult.storageKey},
               ${outMime}, ${storageResult.sizeBytes},
               ${file.originalname}, ${note}, ${jobId}, ${initialStatus}, ${capturedAt})
          `);
        } catch (e2) {
          if (!isUnknownCol(e2)) throw e2;
          // Tier 3: drop bucket AND original_name
          insertResult = await db.execute(sql`
            INSERT INTO camera_captures
              (company_id, user_id, storage_key, mime_type, size_bytes,
               note, job_id, status, captured_at)
            VALUES
              (${profile.companyId}, ${session.user.id}, ${storageResult.storageKey},
               ${outMime}, ${storageResult.sizeBytes},
               ${note}, ${jobId}, ${initialStatus}, ${capturedAt})
          `);
        }
      }

        // Drizzle returns [ResultSetHeader, FieldPacket[]] for raw execute on MySQL.
        // ResultSetHeader has an insertId property.
        newId = Number(
          (insertResult as unknown as [{ insertId?: number }, unknown])[0]?.insertId ?? 0
        );

        if (newId <= 0) {
          // insertId was 0 — treat as a failed insert, roll back the storage file
          console.error('POST /api/camera-captures: insertId is 0 after INSERT — rolling back storage file');
          await deleteFile(storageResult.storageKey, BUCKET).catch(delErr =>
            console.error('POST /api/camera-captures: deleteFile rollback failed:', delErr)
          );
          return res.status(500).json({ error: 'Database insert did not return a valid ID.' });
        }
      } catch (dbErr) {
        // DB insert threw — roll back the storage file to prevent orphans
        console.error('POST /api/camera-captures: DB insert failed, rolling back storage file:', dbErr);
        await deleteFile(storageResult.storageKey, BUCKET).catch(delErr =>
          console.error('POST /api/camera-captures: deleteFile rollback failed:', delErr)
        );
        throw dbErr; // re-throw so the outer catch returns 500
      }

      saved.push({ id: newId, storageKey: storageResult.storageKey, url: storageResult.publicUrl });
    }

    res.status(201).json({ captures: saved });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/camera-captures error:', msg);
    res.status(500).json({ error: msg });
  }
}
