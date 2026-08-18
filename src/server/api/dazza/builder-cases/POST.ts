/**
 * POST /api/dazza/builder-cases
 * ─────────────────────────────────────────────────────────────────────────────
 * Create a new Builder Case.
 * Platform owner only.
 *
 * Body:
 *   title             string (required)
 *   requestedResult   string (optional)
 *   linkedBugId       string (optional) — existing bug_reports.id
 *   conversationId    string (optional)
 *   sourceVersion     string (optional)
 *
 * Anatomy snapshot is resolved server-side from the active snapshot.
 * Never accept snapshot identity from the browser.
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';
import { createBuilderCase } from '../../../lib/builder-case-service.js';
import { getActiveSnapshotId, getSnapshotMeta } from '../../../lib/anatomy-indexer.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { title, requestedResult, linkedBugId, conversationId, sourceVersion } = req.body as {
      title?: string;
      requestedResult?: string;
      linkedBugId?: string;
      conversationId?: string;
      sourceVersion?: string;
    };

    if (!title?.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Resolve active anatomy snapshot server-side
    let anatomySnapshotId: string | null = null;
    let anatomyCommitSha: string | null = null;
    let anatomySnapshotName: string | null = null;
    try {
      anatomySnapshotId = await getActiveSnapshotId();
      if (anatomySnapshotId) {
        const meta = await getSnapshotMeta(anatomySnapshotId);
        anatomyCommitSha = (meta?.commit_sha as string | null) ?? null;
        anatomySnapshotName = (meta?.snapshot_name as string | null) ?? null;
      }
    } catch {
      // Anatomy not yet indexed — proceed without
    }

    const caseRow = await createBuilderCase({
      ownerUserId: ownerInfo.userId,
      title: title.trim(),
      requestedResult: requestedResult?.trim() ?? null,
      linkedBugId: linkedBugId?.trim() ?? null,
      conversationId: conversationId?.trim() ?? null,
      anatomySnapshotId,
      anatomyCommitSha,
      anatomySnapshotName,
      sourceVersion: sourceVersion?.trim() ?? null,
    });

    return res.status(201).json({ ok: true, case: caseRow });
  } catch (err) {
    console.error('[builder-cases/POST]', err);
    return res.status(500).json({ error: 'Failed to create builder case.' });
  }
}
