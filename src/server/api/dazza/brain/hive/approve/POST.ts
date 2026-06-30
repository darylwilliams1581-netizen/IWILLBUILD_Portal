/**
 * POST /api/dazza/brain/hive/approve
 * Approve a pending hive entry — promotes it to dazza_brain_entries.
 * Admin/Owner only. Requires explicit approval — nothing auto-approves.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { derivePermissions } from '../../../../../lib/dazza-context.js';
import { wall10_auditLog } from '../../../../../lib/dazza-walls.js';

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

    const permissions = derivePermissions(profile);
    if (!permissions.isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { id, title, content, category, confidence } = req.body as {
      id: number;
      title?: string;
      content?: string;
      category?: string;
      confidence?: string;
    };

    if (!id) return res.status(400).json({ error: 'id required' });

    // Fetch the pending entry — must belong to this company
    const [pendingRows] = await db.execute(
      sql`SELECT * FROM dazza_hive_pending WHERE id = ${id} AND company_id = ${profile.companyId} AND status = 'pending' LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const pending = pendingRows?.[0];
    if (!pending) return res.status(404).json({ error: 'Pending entry not found' });

    const finalTitle    = (title    ?? String(pending.suggested_title    ?? '')).slice(0, 255);
    const finalContent  = (content  ?? String(pending.suggested_content  ?? '')).slice(0, 4000);
    const finalCategory = (category ?? String(pending.suggested_category ?? 'General')).slice(0, 60);
    const finalConf     = (confidence ?? 'Medium').slice(0, 20);

    // Insert into brain entries
    await db.execute(
      sql`INSERT INTO dazza_brain_entries
            (company_id, title, category, content, source_label, confidence,
             approved, active, approved_by_user_id, usage_count)
          VALUES
            (${profile.companyId}, ${finalTitle}, ${finalCategory}, ${finalContent},
             ${'Hive Learning'}, ${finalConf}, 1, 1, ${session.user.id}, 0)`
    );

    // Mark pending as approved
    await db.execute(
      sql`UPDATE dazza_hive_pending
          SET status = 'approved', reviewed_by_user_id = ${session.user.id}, reviewed_at = NOW()
          WHERE id = ${id}`
    );

    // Wall 10: Audit hive approval
    void wall10_auditLog({
      companyId: profile.companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      eventType: 'brain_hive_approve',
      questionSummary: `Hive entry approved: "${finalTitle.slice(0, 100)}"`,
      metadata: { hiveId: id, category: finalCategory },
    });

    res.json({ ok: true, message: 'Entry approved and added to brain' });
  } catch (error) {
    console.error('POST /api/dazza/brain/hive/approve error:', error);
    res.status(500).json({ error: 'Failed to approve entry' });
  }
}
