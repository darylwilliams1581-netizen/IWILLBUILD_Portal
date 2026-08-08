/**
 * PATCH /api/camera-captures/:id
 * Update note, jobId, status, or rotate a capture.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getDownloadStream, saveFile } from '../../../storage/storage-service.js';

const BUCKET = 'camera-captures';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

let _CustomJimp: unknown = null;
let _JimpMime: unknown = null;
async function getJimp() {
  if (_CustomJimp) return { CustomJimp: _CustomJimp as { read: (b: Buffer) => Promise<{ rotate: (d: number) => void; getBuffer: (m: unknown, o?: unknown) => Promise<Buffer> }> }, JimpMime: _JimpMime as { jpeg: unknown; png: unknown } };
  const [core, , resizePkg] = await Promise.all([
    import('@jimp/core'),
    import('jimp'),
    import('@jimp/plugin-resize'),
  ]);
  const createJimp = (core as { createJimp?: unknown }).createJimp;
  if (typeof createJimp === 'function') {
    _CustomJimp = createJimp({ plugins: [(resizePkg as { default?: unknown }).default ?? resizePkg] });
  } else {
    _CustomJimp = (await import('jimp')).Jimp ?? (await import('jimp')).default;
  }
  const jimpPkg = await import('jimp');
  _JimpMime = (jimpPkg as { JimpMime?: unknown }).JimpMime ?? { jpeg: 'image/jpeg', png: 'image/png' };
  return { CustomJimp: _CustomJimp as { read: (b: Buffer) => Promise<{ rotate: (d: number) => void; getBuffer: (m: unknown, o?: unknown) => Promise<Buffer> }> }, JimpMime: _JimpMime as { jpeg: unknown; png: unknown } };
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const captureId = parseInt(String(req.params.id), 10);
    if (isNaN(captureId)) return res.status(400).json({ error: 'Invalid ID' });

    const body = req.body as {
      note?: string | null;
      jobId?: number | null;
      status?: string;
      rotate?: 'left' | 'right';
    };

    // ── Rotation ──────────────────────────────────────────────────────────────
    if (body.rotate === 'left' || body.rotate === 'right') {
      // Fetch capture record
      const rows = await db.execute(sql`
        SELECT storage_key, mime_type FROM camera_captures
        WHERE id = ${captureId} AND company_id = ${profile.companyId}
      `) as unknown as Array<{ storage_key: string; mime_type: string }>;
      const capture = rows?.[0];
      if (!capture) return res.status(404).json({ error: 'Capture not found' });

      const mime = capture.mime_type ?? 'image/jpeg';
      if (mime === 'image/heic' || mime === 'image/heif') {
        return res.status(400).json({ error: 'HEIC/HEIF rotation is not supported.' });
      }

      const { stream } = await getDownloadStream(capture.storage_key, BUCKET);
      const buffer = await streamToBuffer(stream);

      const { CustomJimp, JimpMime } = await getJimp();
      const img = await CustomJimp.read(buffer);
      const degrees = body.rotate === 'left' ? 90 : -90;
      img.rotate(degrees);

      const outputMime = mime === 'image/png' ? JimpMime.png : JimpMime.jpeg;
      const outBuffer = await img.getBuffer(outputMime, mime !== 'image/png' ? { quality: 82 } : undefined);

      await saveFile({
        buffer: outBuffer,
        originalName: capture.storage_key,
        mimeType: mime,
        bucket: BUCKET,
        storageKey: capture.storage_key,
      });

      await db.execute(sql`
        UPDATE camera_captures SET size_bytes = ${outBuffer.length}
        WHERE id = ${captureId} AND company_id = ${profile.companyId}
      `);

      return res.json({ ok: true });
    }

    // ── Note update ───────────────────────────────────────────────────────────
    if ('note' in body && !('jobId' in body) && !('status' in body)) {
      await db.execute(sql`
        UPDATE camera_captures SET note = ${body.note ?? null}
        WHERE id = ${captureId} AND company_id = ${profile.companyId} AND user_id = ${session.user.id}
      `);
      return res.json({ ok: true });
    }

    // ── Job assignment ────────────────────────────────────────────────────────
    if ('jobId' in body) {
      const newJobId = body.jobId ?? null;
      const newStatus = newJobId != null ? 'assigned' : 'captured';

      // Update the camera_captures record
      await db.execute(sql`
        UPDATE camera_captures SET job_id = ${newJobId}, status = ${newStatus}
        WHERE id = ${captureId} AND company_id = ${profile.companyId} AND user_id = ${session.user.id}
      `);

      // ── Copy image into job_photos (same path as the Upload button) ─────────
      // Only when assigning to a job (not clearing). Fetch the capture record,
      // stream the image from R2, and POST it to the jobs photo endpoint so it
      // appears in the job's photo gallery immediately.
      if (newJobId != null) {
        try {
          const captureRows = await db.execute(sql`
            SELECT storage_key, mime_type, original_name, size_bytes
            FROM camera_captures
            WHERE id = ${captureId} AND company_id = ${profile.companyId}
            LIMIT 1
          `) as unknown as [Array<{ storage_key: string; mime_type: string; original_name: string | null; size_bytes: number | null }>, unknown];
          const capture = captureRows[0]?.[0];

          if (capture?.storage_key) {
            const { stream: imgStream } = await getDownloadStream(capture.storage_key, 'camera-captures');
            const imgBuffer = await streamToBuffer(imgStream);

            // Build a multipart form using Node 18+ built-in FormData + Blob
            const ext = (capture.mime_type === 'image/png') ? 'png' : 'jpg';
            const filename = capture.original_name ?? `capture.${ext}`;
            const blob = new Blob([imgBuffer], { type: capture.mime_type ?? 'image/jpeg' });
            const fd = new FormData();
            fd.append('photos', blob, filename);

            // Forward auth cookies so the jobs photo handler can authenticate
            const cookieHeader = req.headers['cookie'] ?? '';
            const protocol = req.protocol ?? 'http';
            const host = req.headers['host'] ?? 'localhost';
            const internalUrl = `${protocol}://${host}/api/jobs/${newJobId}/photos`;

            const uploadRes = await fetch(internalUrl, {
              method: 'POST',
              headers: { cookie: cookieHeader },
              body: fd,
            });

            if (!uploadRes.ok) {
              const errText = await uploadRes.text().catch(() => '');
              console.warn(`[camera-captures PATCH] job photo copy failed (${uploadRes.status}): ${errText}`);
            } else {
              console.log(`[camera-captures PATCH] copied capture ${captureId} → job ${newJobId} photos`);
            }
          }
        } catch (copyErr) {
          // Non-fatal — the assignment metadata is already saved; log and continue
          console.warn('[camera-captures PATCH] job photo copy error (non-fatal):', copyErr instanceof Error ? copyErr.message : copyErr);
        }
      }

      return res.json({ ok: true });
    }

    // ── Status update ─────────────────────────────────────────────────────────
    if ('status' in body && body.status) {
      await db.execute(sql`
        UPDATE camera_captures SET status = ${body.status}
        WHERE id = ${captureId} AND company_id = ${profile.companyId} AND user_id = ${session.user.id}
      `);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Nothing to update' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('PATCH /api/camera-captures/:id error:', msg);
    res.status(500).json({ error: msg });
  }
}

