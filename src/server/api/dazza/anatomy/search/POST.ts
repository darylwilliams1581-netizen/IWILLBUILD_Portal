/**
 * POST /api/dazza/anatomy/search
 * Platform-owner only. Full-text search across the active anatomy snapshot.
 * Returns file paths, line ranges, and matching content snippets.
 * Never returns quarantined or excluded files.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getActiveSnapshotId } from '../../../../lib/anatomy-indexer.js';

const MAX_RESULTS = 20;
const MAX_SNIPPET_CHARS = 500;

export default async function handler(req: Request, res: Response) {
  const { query, snapshotId: reqSnapshotId, language, fileType, limit = 10 } = req.body as {
    query?: string;
    snapshotId?: string;
    language?: string;
    fileType?: string;
    limit?: number;
  };

  if (!query || query.trim().length < 2) {
    res.status(400).json({ error: 'query must be at least 2 characters' });
    return;
  }

  const safeLimit = Math.min(Math.max(1, limit), MAX_RESULTS);

  // Resolve snapshot
  const snapshotId = reqSnapshotId ?? await getActiveSnapshotId();
  if (!snapshotId) {
    res.status(404).json({ error: 'No active anatomy snapshot. Activate a snapshot first.' });
    return;
  }

  // Verify snapshot exists and is not deleted
  const [snapRows] = await db.execute(sql.raw(`
    SELECT id, status, is_active, source_type, repo_name, commit_sha, snapshot_name
    FROM anatomy_snapshots
    WHERE id = '${snapshotId.replace(/'/g, "''")}' AND status != 'deleted'
    LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!snapRows?.length) {
    res.status(404).json({ error: 'Snapshot not found or deleted' });
    return;
  }

  // Build language/fileType filter
  const langFilter  = language  ? `AND af.language  = '${language.replace(/'/g, "''")}'`  : '';
  const typeFilter  = fileType  ? `AND af.file_type = '${fileType.replace(/'/g, "''")}'`   : '';

  // Full-text search on chunks
  const safeQuery = query.replace(/['"\\]/g, ' ').slice(0, 200);

  const [rows] = await db.execute(sql.raw(`
    SELECT
      ac.id,
      ac.rel_path,
      ac.start_line,
      ac.end_line,
      ac.chunk_type,
      ac.symbol_name,
      SUBSTRING(ac.content, 1, ${MAX_SNIPPET_CHARS}) AS snippet,
      MATCH(ac.content) AGAINST ('${safeQuery}' IN BOOLEAN MODE) AS relevance
    FROM anatomy_chunks ac
    JOIN anatomy_files af ON af.id = ac.file_id
    WHERE ac.snapshot_id = '${snapshotId.replace(/'/g, "''")}'
      AND af.is_excluded = 0
      AND af.is_quarantined = 0
      AND MATCH(ac.content) AGAINST ('${safeQuery}' IN BOOLEAN MODE)
      ${langFilter}
      ${typeFilter}
    ORDER BY relevance DESC
    LIMIT ${safeLimit}
  `)) as unknown as [Array<Record<string, unknown>>, unknown];

  res.json({
    ok:         true,
    query,
    snapshotId,
    snapshot:   snapRows[0],
    results:    rows ?? [],
    resultCount: (rows ?? []).length,
  });
}
