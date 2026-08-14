/**
 * POST /api/dazza/anatomy/upload-zip
 * Platform-owner only.
 * Accepts a manually uploaded ZIP (Airo workspace export, local patch, etc.),
 * runs the security pipeline, indexes content, creates an inactive snapshot.
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { scanArchive, ANATOMY_LIMITS } from '../../../../lib/anatomy-security.js';
import { indexSnapshot, computePackageSha256 } from '../../../../lib/anatomy-indexer.js';

export default async function handler(req: Request, res: Response) {
  const ownerInfo = await getPlatformOwnerInfo(req);
  if (!ownerInfo?.isPlatformOwner) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  // Parse multipart form
  let fields: Record<string, string> = {};
  let fileBuffer: Buffer | null = null;

  try {
    const parsed = await parseMultipartForm(req, { maxFileSizeBytes: ANATOMY_LIMITS.MAX_COMPRESSED_BYTES });
    fields = parsed.fields as Record<string, string>;
    const files = parsed.files ?? [];
    const zipFile = files.find(f => f.fieldname === 'archive' || f.originalname?.endsWith('.zip'));
    if (!zipFile?.buffer) {
      res.status(400).json({ ok: false, error: 'No ZIP file found in upload. Use field name "archive".' });
      return;
    }
    fileBuffer = zipFile.buffer;
  } catch (e) {
    res.status(400).json({ ok: false, error: `Upload parse error: ${String(e).slice(0, 200)}` });
    return;
  }

  const snapshotName  = (fields.snapshot_name  ?? 'Manual ZIP Upload').slice(0, 199);
  const sourceDesc    = (fields.source_desc     ?? '').slice(0, 499);
  const appVersion    = (fields.app_version     ?? '').slice(0, 99);
  const buildNumber   = (fields.build_number    ?? '').slice(0, 99);
  const gitRef        = (fields.git_ref         ?? '').slice(0, 199);

  // ── Security scan ─────────────────────────────────────────────────────────
  let scanResult: Awaited<ReturnType<typeof scanArchive>>;
  try {
    scanResult = await scanArchive(fileBuffer, fileBuffer.length);
  } catch (e) {
    res.status(400).json({ ok: false, error: `Security scan failed: ${String(e).slice(0, 200)}` });
    return;
  }

  const packageSha256 = computePackageSha256(fileBuffer);

  // ── Create snapshot record ────────────────────────────────────────────────
  const snapshotId = randomUUID();
  await db.execute(sql.raw(`
    INSERT INTO anatomy_snapshots
      (id, source_type, snapshot_name, source_desc, app_version, build_number, git_ref,
       package_sha256, status, uploader_user_id, created_at, updated_at)
    VALUES
      ('${snapshotId}', 'zip',
       '${snapshotName.replace(/'/g, "''")}',
       '${sourceDesc.replace(/'/g, "''")}',
       '${appVersion.replace(/'/g, "''")}',
       '${buildNumber.replace(/'/g, "''")}',
       '${gitRef.replace(/'/g, "''")}',
       '${packageSha256}', 'indexing',
       '${ownerInfo.userId}', NOW(), NOW())
  `));

  // Record quarantined files
  for (const q of scanResult.quarantined) {
    await db.execute(sql.raw(`
      INSERT INTO anatomy_quarantine (snapshot_id, rel_path, reason, pattern_matched)
      VALUES ('${snapshotId}', '${q.relPath.slice(0, 990).replace(/'/g, "''")}',
              'secret pattern detected', '${q.patternName.replace(/'/g, "''")}')
    `)).catch(() => {/* non-fatal */});
  }

  // Record excluded files
  for (const ex of scanResult.excluded) {
    await db.execute(sql.raw(`
      INSERT INTO anatomy_files
        (snapshot_id, rel_path, language, file_type, line_count, byte_size, is_excluded, is_quarantined)
      VALUES
        ('${snapshotId}', '${ex.relPath.slice(0, 990).replace(/'/g, "''")}',
         'unknown', 'excluded', 0, 0, 1, 0)
    `)).catch(() => {/* non-fatal */});
  }

  // ── Index allowed files ───────────────────────────────────────────────────
  const indexResult = await indexSnapshot(snapshotId, scanResult.allowed);

  // ── Finalise ──────────────────────────────────────────────────────────────
  await db.execute(sql.raw(`
    UPDATE anatomy_snapshots SET
      status           = 'ready',
      total_files      = ${scanResult.fileCount},
      indexed_files    = ${indexResult.filesIndexed},
      excluded_files   = ${scanResult.excluded.length},
      quarantine_count = ${scanResult.quarantined.length},
      updated_at       = NOW()
    WHERE id = '${snapshotId}'
  `));

  res.json({
    ok:            true,
    snapshotId,
    packageSha256,
    totalFiles:    scanResult.fileCount,
    indexedFiles:  indexResult.filesIndexed,
    excludedFiles: scanResult.excluded.length,
    quarantined:   scanResult.quarantined.length,
    errors:        [...scanResult.errors, ...indexResult.errors].slice(0, 20),
    status:        'ready',
    isActive:      false,
  });
}
