/**
 * DELETE /api/owner-console/sources/swms/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Permanently deletes a swms_template source record.
 *
 * Safety rules enforced server-side:
 *   - Only the developer company's own templates can be deleted.
 *   - Does NOT delete library_items rows — the Global Library entry is preserved.
 *   - Does NOT delete job_swms records (SWMS attached to jobs).
 *   - Refuses to delete if the template is referenced by active job SWMS.
 *
 * The caller must confirm in the UI before calling this endpoint.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

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
    if (profile.platformRole !== 'owner') return res.status(403).json({ error: 'Platform owner access required' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership
    const [rows] = await db.execute(sql`
      SELECT id, title FROM swms_templates
      WHERE id = ${id} AND company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number; title: string }>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    // Check for active job SWMS referencing this template
    const [jobRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM job_swms
      WHERE template_id = ${id} AND status NOT IN ('archived', 'deleted')
      LIMIT 1
    `) as unknown as [Array<{ cnt: number }>, unknown];

    const activeCount = Number(jobRows?.[0]?.cnt ?? 0);
    if (activeCount > 0) {
      return res.status(409).json({
        error: `Cannot delete — this template is used in ${activeCount} active job SWMS record(s). Archive it instead.`,
      });
    }

    await db.execute(sql`
      DELETE FROM swms_templates
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/owner-console/sources/swms/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete SWMS template' });
  }
}
