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

export default async function handler(req: Request, res: Response) {
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
  } catch (e) {
    res.status(400).json({ ok: false, error: `Could not resolve ref: ${String(e).slice(0, 200)}` });
    return;
  }

  // ── Step 2: Duplicate SHA check ───────────────────────────────────────────
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
    res.json({
      ok: true,
      duplicate: true,
      snapshotId: existing.id,
      status:     existing.status,
      isActive:   !!existing.is_active,
      message:    `Snapshot for SHA ${commitSha.slice(0, 8)} already exists (${existing.status}).`,
    });
    return;
  }

  // ── Step 3: Create pending snapshot record ────────────────────────────────
  const snapshotId = randomUUID();
  await db.execute(sql.raw(`
    INSERT INTO anatomy_snapshots
      (id, source_type, repo_owner, repo_name, branch, commit_sha, commit_date,
       snapshot_name, status, uploader_user_id, created_at, updated_at)
    VALUES
      ('${snapshotId}', 'github',
       '${ALLOWED_REPO.owner}', '${ALLOWED_REPO.repo}',
       '${ref.replace(/'/g, "''")}',
       '${commitSha}',
       '${commitDate.replace(/'/g, "''")}',
       'GitHub: ${ALLOWED_REPO.repo}@${commitSha.slice(0, 8)} (${ref.replace(/'/g, "''")})'.slice(0, 199),
       'pending', '${ownerInfo.userId}', NOW(), NOW())
  `));

  // ── Step 4: Download archive ──────────────────────────────────────────────
  let archiveBuffer: Buffer;
  try {
    await db.execute(sql.raw(`UPDATE anatomy_snapshots SET status='indexing', updated_at=NOW() WHERE id='${snapshotId}'`));
    archiveBuffer = await downloadArchiveForSha(commitSha);
  } catch (e) {
    await db.execute(sql.raw(`
      UPDATE anatomy_snapshots
      SET status='failed', error_message='${String(e).slice(0, 490).replace(/'/g, "''")}', updated_at=NOW()
      WHERE id='${snapshotId}'
    `));
    res.status(500).json({ ok: false, error: `Archive download failed: ${String(e).slice(0, 200)}` });
    return;
  }

  // ── Step 5: Security scan ─────────────────────────────────────────────────
  let scanResult: Awaited<ReturnType<typeof scanArchive>>;
  try {
    scanResult = await scanArchive(archiveBuffer, archiveBuffer.length);
  } catch (e) {
    await db.execute(sql.raw(`
      UPDATE anatomy_snapshots
      SET status='failed', error_message='${String(e).slice(0, 490).replace(/'/g, "''")}', updated_at=NOW()
      WHERE id='${snapshotId}'
    `));
    res.status(400).json({ ok: false, error: `Security scan failed: ${String(e).slice(0, 200)}` });
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
  const indexResult = await indexSnapshot(snapshotId, scanResult.allowed);

  // ── Step 7: Finalise snapshot ─────────────────────────────────────────────
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
  });
}
