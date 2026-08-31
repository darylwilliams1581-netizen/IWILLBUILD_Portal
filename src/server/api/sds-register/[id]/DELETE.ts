/**
 * DELETE /api/sds-register/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Archive (soft-delete) an SDS entry. Pass ?hard=1 to permanently delete
 * (owner only). Company-scoped. Admin/owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { deleteFile, BUCKET_COMPANY_FILES } from '../../../storage/storage-service.js';
import { recordStorageDeletion } from '../../../lib/storageAudit.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const entryId = parseInt(req.params['id'] as string, 10);
    if (isNaN(entryId)) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql.raw(`
      SELECT * FROM sds_register WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>];
    const record = rows[0];
    if (!record) return res.status(404).json({ error: 'SDS entry not found' });

    const hardDelete = req.query['hard'] === '1' && profile.role === 'owner';

    if (hardDelete) {
      // Permanently delete storage object + row
      const storedName = record['storedName'] as string || record['stored_name'] as string;
      await db.execute(sql.raw(`DELETE FROM sds_register WHERE id = ${entryId} AND company_id = ${profile.companyId}`));
      let deleteSuccess = true;
      let errorCategory: string | undefined;
      try {
        await deleteFile(storedName, BUCKET_COMPANY_FILES);
      } catch (err) {
        deleteSuccess = false;
        errorCategory = err instanceof Error ? err.constructor.name : 'UnknownError';
        console.warn('[sds DELETE] storage deleteFile failed:', errorCategory);
      }
      await recordStorageDeletion({
        actorUserId: session.user.id,
        companyId: profile.companyId,
        category: BUCKET_COMPANY_FILES,
        storageKey: storedName,
        success: deleteSuccess,
        errorCategory,
      });
      return res.json({ ok: true, deleted: true });
    }

    // Soft archive
    await db.execute(sql.raw(`
      UPDATE sds_register SET archived_at = NOW() WHERE id = ${entryId} AND company_id = ${profile.companyId}
    `));
    return res.json({ ok: true, archived: true });
  } catch (err) {
    console.error('DELETE /api/sds-register/:id error:', err);
    return res.status(500).json({ error: 'Failed to archive SDS entry' });
  }
}
