/**
 * GET /api/dazza/anatomy/snapshots
 * Platform-owner only. List all non-deleted anatomy snapshots.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const [rows] = await db.execute(sql`
    SELECT id, source_type, repo_owner, repo_name, branch, commit_sha, commit_date,
           snapshot_name, source_desc, app_version, build_number, git_ref,
           status, is_active, total_files, indexed_files, excluded_files,
           quarantine_count, error_message, uploader_user_id, created_at, updated_at
    FROM anatomy_snapshots
    WHERE status != 'deleted'
    ORDER BY created_at DESC
    LIMIT 50
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  res.json({ ok: true, snapshots: rows ?? [] });
}
