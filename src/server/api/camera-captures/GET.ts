/**
 * GET /api/camera-captures
 * Returns the current user's unassigned camera captures (company-isolated).
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { getSignedUrl } from '../../storage/storage-service.js';

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

    const rows = await db.execute(sql`
      SELECT
        id, company_id, user_id, storage_key, mime_type, size_bytes,
        original_name, note, job_id, status, captured_at, created_at
      FROM camera_captures
      WHERE company_id = ${profile.companyId}
        AND user_id    = ${session.user.id}
        AND status     != 'deleted'
      ORDER BY captured_at DESC
      LIMIT 200
    `) as unknown as [Array<{
      id: number;
      company_id: number;
      user_id: string;
      storage_key: string;
      mime_type: string;
      size_bytes: number | null;
      original_name: string | null;
      note: string | null;
      job_id: number | null;
      status: string;
      captured_at: string;
      created_at: string;
    }>, unknown];

    const captures = await Promise.all(
      (rows[0] ?? []).map(async (r) => ({
        id: r.id,
        storageKey: r.storage_key,
        url: await getSignedUrl(r.storage_key, 'camera-captures', 3600),
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        originalName: r.original_name,
        note: r.note,
        jobId: r.job_id,
        status: r.status,
        capturedAt: r.captured_at,
        createdAt: r.created_at,
      }))
    );

    res.json({ captures });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('GET /api/camera-captures error:', msg);
    res.status(500).json({ error: msg });
  }
}
