/**
 * GET /api/dazza/anatomy/snapshots/:id
 * Platform-owner only. Get snapshot details including file manifest.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

  const [snapRows] = await db.execute(sql.raw(`
    SELECT id, source_type, repo_owner, repo_name, branch, commit_sha, commit_date,
           snapshot_name, source_desc, app_version, build_number, git_ref,
           status, is_active, total_files, indexed_files, excluded_files,
           quarantine_count, error_message, uploader_user_id, created_at, updated_at
    FROM anatomy_snapshots
    WHERE id = '${id.replace(/'/g, "''")}' AND status != 'deleted'
    LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!snapRows?.length) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }

  // File manifest (paths + language + line count, no content)
  const [fileRows] = await db.execute(sql.raw(`
    SELECT rel_path, language, file_type, line_count, byte_size, is_excluded, is_quarantined
    FROM anatomy_files
    WHERE snapshot_id = '${id.replace(/'/g, "''")}' AND is_excluded = 0 AND is_quarantined = 0
    ORDER BY rel_path
    LIMIT 5000
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  // Quarantine list (paths + reasons only — never content)
  const [quarRows] = await db.execute(sql.raw(`
    SELECT rel_path, reason, pattern_matched, created_at
    FROM anatomy_quarantine
    WHERE snapshot_id = '${id.replace(/'/g, "''")}' ORDER BY rel_path LIMIT 200
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  res.json({
    ok:         true,
    snapshot:   snapRows[0],
    files:      fileRows ?? [],
    quarantine: quarRows ?? [],
  });
}
