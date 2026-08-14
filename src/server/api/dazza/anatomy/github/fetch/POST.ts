/**
 * POST /api/dazza/anatomy/github/fetch
 * Platform-owner only.
 * Resolves a branch/tag/SHA, downloads the archive, runs security scan,
 * indexes content, and creates an inactive anatomy snapshot.
 * Prevents duplicate snapshots for the same repo+SHA.
 */
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { ALLOWED_REPO, resolveRefToSha, downloadArchiveForSha } from '../../../../../lib/anatomy-github.js';
import { scanArchive } from '../../../../../lib/anatomy-security.js';
import { indexSnapshot, computePackageSha256 } from '../../../../../lib/anatomy-indexer.js';

/** Safe error string — never exposes tokens or credentials */
function safeErr(e: unknown): string {
  const raw = String((e as Error)?.message ?? e);
  return raw
    .replace(/ghp_[A-Za-z0-9]+/g, '[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 300);
}

export default async function handler(req: Request, res: Response) {
  const correlationId = randomUUID().slice(0, 8).toUpperCase();

  const ownerInfo = await getPlatformOwnerInfo(req);
  if (!ownerInfo?.isPlatformOwner) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const { ref = ALLOWED_REPO.defaultBranch } = req.body as { ref?: string };

  // ── Step 1: Resolve ref to SHA ────────────────────────────────────────────
  let commitSha: string;
  let commitDate: string;
  let commitMessage: string;

  try {
    const resolved = await resolveRefToSha(ref);
    commitSha    = resolved.sha;
    commitDate   = resolved.commitDate;
    commitMessage = resolved.commitMessage;
    console.log(`[anatomy/fetch:${correlationId}] resolved ref '${ref}' → ${commitSha.slice(0, 8)}`);
  } catch (e) {
    console.warn(`[anatomy/fetch:${correlationId}] stage=resolve_ref error:`, safeErr(e));
    res.status(400).json({
      ok: false,
      stage: 'resolve_ref',
      correlationId,
      error: `Could not resolve ref '${ref.slice(0, 100)}'. Check the branch name and GitHub token. Reference: ANAT-${correlationId}`,
    });
    return;
  }

  // ── Step 2: Duplicate SHA check ───────────────────────────────────────────
  try {
    const [existingRows] = await db.execute(sql.raw(`
      SELECT id, status, is_active FROM anatomy_snapshots
      WHERE repo_owner = '${ALLOWED_REPO.owner}'
        AND repo_name  = '${ALLOWED_REPO.repo}'
        AND commit_sha = '${commitSha}'
        AND status != 'deleted'
      LIMIT 1
    `)) as unknown as [Array<{ id: string; status: string; is_active: number }>, unknown];

    if (existingRows?.length) {
      const existing = existingRows[0];
      console.log(`[anatomy/fetch:${correlationId}] duplicate snapshot ${existing.id} (${existing.status})`);
      res.json({
        ok: true,
        duplicate: true,
        snapshotId: existing.id,
        status:     existing.status,
        isActive:   !!existing.is_active,
        message:    `Snapshot for SHA ${commitSha.slice(0, 8)} already exists (${existing.status}).`,
        correlationId,
      });
      return;
    }
  } catch (e) {
    const msg = safeErr(e);
    console.warn(`[anatomy/fetch:${correlationId}] stage=duplicate_check error:`, msg);
    res.status(500).json({
      ok: false,
      stage: 'duplicate_check',
      correlationId,
      error: `Database error. Reference: ANAT-${correlationId}`,
    });
    return;
  }

  // ── Step 3: Create pending snapshot record ────────────────────────────────
  const snapshotId = randomUUID();
  try {
    const snapshotLabel = `GitHub: ${ALLOWED_REPO.repo}@${commitSha.slice(0, 8)} (${ref})`.slice(0, 199);
    await db.execute(sql.raw(`
      INSERT INTO anatomy_snapshots
        (id, source_type, repo_owner, repo_name, branch, commit_sha, commit_date,
         snapshot_name, status, uploader_user_id, created_at, updated_at)
      VALUES
        ('${snapshotId}', 'github',
         '${ALLOWED_REPO.owner.replace(/'/g, "''")}',
         '${ALLOWED_REPO.repo.replace(/'/g, "''")}',
         '${ref.replace(/'/g, "''")}',
         '${commitSha.replace(/'/g, "''")}',
         '${commitDate.replace(/'/g, "''")}',
         '${snapshotLabel.replace(/'/g, "''")}',
         'pending', '${ownerInfo.userId.replace(/'/g, "''")}', NOW(), NOW())
    `));
    console.log(`[anatomy/fetch:${correlationId}] snapshot ${snapshotId} created (pending)`);
  } catch (e) {
    // Log full detail server-side; return only a safe reference to the client
    console.warn(`[anatomy/fetch:${correlationId}] stage=create_snapshot error:`, safeErr(e));
    res.status(500).json({
      ok: false,
      stage: 'create_snapshot',
      correlationId,
      error: `Snapshot creation failed. Reference: ANAT-${correlationId}`,
    });
    return;
  }

  // ── Step 4: Download archive ──────────────────────────────────────────────
  let archiveBuffer: Buffer;
  try {
    await db.execute(sql.raw(`UPDATE anatomy_snapshots SET status='indexing', updated_at=NOW() WHERE id='${snapshotId}'`));
    console.log(`[anatomy/fetch:${correlationId}] downloading archive for SHA ${commitSha.slice(0, 8)}`);
    archiveBuffer = await downloadArchiveForSha(commitSha);
    console.log(`[anatomy/fetch:${correlationId}] archive downloaded: ${archiveBuffer.length} bytes`);
  } catch (e) {
    const msg = safeErr(e);
    console.warn(`[anatomy/fetch:${correlationId}] stage=download_archive error:`, msg);
    await db.execute(sql.raw(`
      UPDATE anatomy_snapshots
      SET status='failed', error_message='${msg.replace(/'/g, "''")}', updated_at=NOW()
      WHERE id='${snapshotId}'
    `)).catch(() => {});
    res.status(500).json({ ok: false, stage: 'download_archive', correlationId, error: `Archive download failed. Reference: ANAT-${correlationId}` });
    return;
  }

  // ── Step 5: Security scan ─────────────────────────────────────────────────
  let scanResult: Awaited<ReturnType<typeof scanArchive>>;
  try {
    scanResult = await scanArchive(archiveBuffer, archiveBuffer.length);
    console.log(`[anatomy/fetch:${correlationId}] security scan: ${scanResult.fileCount} files, ${scanResult.quarantined.length} quarantined, ${scanResult.excluded.length} excluded`);
  } catch (e) {
    const msg = safeErr(e);
    console.warn(`[anatomy/fetch:${correlationId}] stage=security_scan error:`, msg);
    await db.execute(sql.raw(`
      UPDATE anatomy_snapshots
      SET status='failed', error_message='${msg.replace(/'/g, "''")}', updated_at=NOW()
      WHERE id='${snapshotId}'
    `)).catch(() => {});
    res.status(400).json({ ok: false, stage: 'security_scan', correlationId, error: `Security scan failed. Reference: ANAT-${correlationId}` });
    return;
  }

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

  // ── Step 6: Index allowed files ───────────────────────────────────────────
  const packageSha256 = computePackageSha256(archiveBuffer);
  console.log(`[anatomy/fetch:${correlationId}] indexing ${scanResult.allowed.length} allowed files`);
  let indexResult: Awaited<ReturnType<typeof indexSnapshot>>;
  try {
    indexResult = await indexSnapshot(snapshotId, scanResult.allowed);
    console.log(`[anatomy/fetch:${correlationId}] indexed ${indexResult.filesIndexed} files, ${indexResult.chunksCreated} chunks`);
  } catch (e) {
    const msg = safeErr(e);
    console.warn(`[anatomy/fetch:${correlationId}] stage=index_files error:`, msg);
    await db.execute(sql.raw(`
      UPDATE anatomy_snapshots
      SET status='failed', error_message='${msg.replace(/'/g, "''")}', updated_at=NOW()
      WHERE id='${snapshotId}'
    `)).catch(() => {});
    res.status(500).json({ ok: false, stage: 'index_files', correlationId, error: `Indexing failed. Reference: ANAT-${correlationId}` });
    return;
  }

  // ── Step 7: Finalise snapshot ─────────────────────────────────────────────
  try {
    await db.execute(sql.raw(`
      UPDATE anatomy_snapshots SET
        status          = 'ready',
        package_sha256  = '${packageSha256}',
        total_files     = ${scanResult.fileCount},
        indexed_files   = ${indexResult.filesIndexed},
        excluded_files  = ${scanResult.excluded.length},
        quarantine_count = ${scanResult.quarantined.length},
        updated_at      = NOW()
      WHERE id = '${snapshotId}'
    `));
    console.log(`[anatomy/fetch:${correlationId}] snapshot ${snapshotId} finalised as 'ready'`);
  } catch (e) {
    const msg = safeErr(e);
    console.warn(`[anatomy/fetch:${correlationId}] stage=finalise_snapshot error:`, msg);
    res.status(500).json({ ok: false, stage: 'finalise_snapshot', correlationId, error: `Snapshot finalisation failed. Reference: ANAT-${correlationId}` });
    return;
  }

  res.json({
    ok:            true,
    snapshotId,
    commitSha,
    commitDate,
    commitMessage,
    totalFiles:    scanResult.fileCount,
    indexedFiles:  indexResult.filesIndexed,
    excludedFiles: scanResult.excluded.length,
    quarantined:   scanResult.quarantined.length,
    errors:        [...scanResult.errors, ...indexResult.errors].slice(0, 20),
    status:        'ready',
    isActive:      false,
    correlationId,
  });
}
