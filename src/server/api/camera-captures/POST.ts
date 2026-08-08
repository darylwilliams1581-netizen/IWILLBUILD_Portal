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
 *
 * SCHEMA COMPATIBILITY
 * ────────────────────
 * The production camera_captures table may be on an older schema that is
 * missing the `bucket` and/or `original_name` columns. The startup migration
 * adds them via INFORMATION_SCHEMA checks, but until that runs the INSERT
 * must degrade gracefully.
 *
 * Tier 1 — full schema:  bucket + original_name
 * Tier 2 — no bucket:    original_name only
 * Tier 3 — oldest:       neither bucket nor original_name
 *
 * Only MySQL error 1054 / ER_BAD_FIELD_ERROR / "Unknown column" triggers a
 * fallback. All other errors (connection, constraint, permission) are re-thrown
 * immediately so the storage rollback fires and the caller gets a real 500.
 *
 * DOUBLE-UPLOAD PROTECTION
 * ────────────────────────
 * 1. Synchronous per-process client-id claim (Set<string>) — second request
 *    with the same X-Client-Id is rejected with 409 while the first is in flight.
 * 2. X-Client-Id header forwarded from the client (UUID per upload attempt).
 * 3. Server-side idempotency cache: same (companyId:clientId) within 5 min
 *    returns the cached response without re-inserting.
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

// ── Double-upload protection ──────────────────────────────────────────────────
// In-flight client IDs — prevents a second concurrent request with the same
// X-Client-Id from creating a duplicate record while the first is still running.
const inFlightClientIds = new Set<string>();

// Idempotency cache: key = `${companyId}:${clientId}`, value = saved captures array.
// Entries expire after 5 minutes.
interface IdempotencyEntry {
  captures: Array<{ id: number; storageKey: string; url: string }>;
  expiresAt: number;
}
const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

/** Returns true when the MySQL error is an unknown-column error (1054). */
function isUnknownColumnError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  const code = (e as { code?: string })?.code ?? '';
  const errno = (e as { errno?: number })?.errno ?? 0;
  return (
    errno === 1054 ||
    code === 'ER_BAD_FIELD_ERROR' ||
    msg.includes('Unknown column') ||
    msg.includes('ER_BAD_FIELD_ERROR')
  );
}

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

    // ── Double-upload: idempotency check ─────────────────────────────────────
    const clientId = typeof req.headers['x-client-id'] === 'string'
      ? req.headers['x-client-id'].trim()
      : null;

    if (clientId) {
      const cacheKey = `${profile.companyId}:${clientId}`;

      // Purge stale entries
      const now = Date.now();
      for (const [k, v] of idempotencyCache) {
        if (v.expiresAt < now) idempotencyCache.delete(k);
      }

      // Return cached result if this clientId was already processed
      const cached = idempotencyCache.get(cacheKey);
      if (cached) {
        return res.status(201).json({ captures: cached.captures, replayed: true });
      }

      // Reject concurrent duplicate
      if (inFlightClientIds.has(cacheKey)) {
        return res.status(409).json({ error: 'Upload already in progress for this client ID.' });
      }
      inFlightClientIds.add(cacheKey);
    }

    try {
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

        // ── DB insert — tiered for schema compatibility ───────────────────────
        // Read insertId from the SAME execute result — never SELECT LAST_INSERT_ID().
        let newId = 0;
        try {
          newId = await insertCameraCapture({
            companyId: profile.companyId,
            userId: session.user.id,
            storageKey: storageResult.storageKey,
            mimeType: outMime,
            sizeBytes: storageResult.sizeBytes,
            originalName: file.originalname,
            note,
            jobId,
            initialStatus,
            capturedAt,
          });
        } catch (dbErr) {
          // DB insert failed — roll back the storage file to prevent orphans
          console.error('POST /api/camera-captures: DB insert failed, rolling back storage file:', dbErr);
          await deleteFile(storageResult.storageKey, BUCKET).catch(delErr =>
            console.error('POST /api/camera-captures: deleteFile rollback failed:', delErr)
          );
          throw dbErr; // re-throw → outer catch returns 500
        }

        if (newId <= 0) {
          console.error('POST /api/camera-captures: insertId is 0 after INSERT — rolling back storage file');
          await deleteFile(storageResult.storageKey, BUCKET).catch(delErr =>
            console.error('POST /api/camera-captures: deleteFile rollback failed:', delErr)
          );
          return res.status(500).json({ error: 'Database insert did not return a valid ID.' });
        }

        saved.push({ id: newId, storageKey: storageResult.storageKey, url: storageResult.publicUrl });
      }

      // Cache result for idempotency replay
      if (clientId) {
        const cacheKey = `${profile.companyId}:${clientId}`;
        idempotencyCache.set(cacheKey, { captures: saved, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
      }

      res.status(201).json({ captures: saved });
    } finally {
      // Always release the in-flight lock
      if (clientId) {
        inFlightClientIds.delete(`${profile.companyId}:${clientId}`);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/camera-captures error:', msg);
    res.status(500).json({ error: msg });
  }
}

// ── Tiered INSERT helper ──────────────────────────────────────────────────────
// Returns the new row's insertId.
// Falls back through tiers only on MySQL 1054 (unknown column).
// All other errors are re-thrown immediately — no storage file is deleted here.
interface InsertParams {
  companyId: number;
  userId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  note: string | null;
  jobId: number | null;
  initialStatus: string;
  capturedAt: string | null;
}

export async function insertCameraCapture(p: InsertParams): Promise<number> {
  // Tier 1: full schema — bucket + original_name
  try {
    const r = await db.execute(sql`
      INSERT INTO camera_captures
        (company_id, user_id, storage_key, bucket, mime_type, size_bytes,
         original_name, note, job_id, status, captured_at)
      VALUES
        (${p.companyId}, ${p.userId}, ${p.storageKey},
         ${BUCKET}, ${p.mimeType}, ${p.sizeBytes},
         ${p.originalName}, ${p.note}, ${p.jobId}, ${p.initialStatus}, ${p.capturedAt})
    `);
    return extractInsertId(r);
  } catch (e1) {
    if (!isUnknownColumnError(e1)) throw e1;
  }

  // Tier 2: no bucket column
  try {
    const r = await db.execute(sql`
      INSERT INTO camera_captures
        (company_id, user_id, storage_key, mime_type, size_bytes,
         original_name, note, job_id, status, captured_at)
      VALUES
        (${p.companyId}, ${p.userId}, ${p.storageKey},
         ${p.mimeType}, ${p.sizeBytes},
         ${p.originalName}, ${p.note}, ${p.jobId}, ${p.initialStatus}, ${p.capturedAt})
    `);
    return extractInsertId(r);
  } catch (e2) {
    if (!isUnknownColumnError(e2)) throw e2;
  }

  // Tier 3: oldest schema — no bucket, no original_name
  const r = await db.execute(sql`
    INSERT INTO camera_captures
      (company_id, user_id, storage_key, mime_type, size_bytes,
       note, job_id, status, captured_at)
    VALUES
      (${p.companyId}, ${p.userId}, ${p.storageKey},
       ${p.mimeType}, ${p.sizeBytes},
       ${p.note}, ${p.jobId}, ${p.initialStatus}, ${p.capturedAt})
  `);
  return extractInsertId(r);
}

function extractInsertId(result: unknown): number {
  // Drizzle returns [ResultSetHeader, FieldPacket[]] for raw execute on MySQL.
  return Number(
    (result as unknown as [{ insertId?: number }, unknown])[0]?.insertId ?? 0
  );
}
