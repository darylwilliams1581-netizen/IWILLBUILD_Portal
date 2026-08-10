/**
 * DELETE /api/incidents/:incidentId/attachments/:attachId
 * Remove an attachment from an incident (also deletes from storage).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { deleteFile } from '../../../../../storage/storage-service.js';

const BUCKET = 'incident-attachments';

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

    const incidentId = parseInt(req.params.incidentId, 10);
    const attachId = parseInt(req.params.attachId, 10);
    if (isNaN(incidentId) || isNaN(attachId)) return res.status(400).json({ error: 'Invalid ID' });

    const rows = (await db.execute(sql.raw(
      `SELECT id, storage_key FROM incident_attachments WHERE id = ${attachId} AND incident_id = ${incidentId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; storage_key: string }>, unknown])[0];

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

    const attach = rows[0];

    // Delete from storage (best-effort)
    try {
      await deleteFile(attach.storage_key, BUCKET);
    } catch (e) {
      console.warn('[incident-attachments DELETE] storage delete failed:', e);
    }

    await db.execute(sql.raw(`DELETE FROM incident_attachments WHERE id = ${attachId}`));

    return res.json({ ok: true });
  } catch (e) {
    console.error('[incident-attachments DELETE]', e);
    return res.status(500).json({ error: 'Delete failed' });
  }
}
