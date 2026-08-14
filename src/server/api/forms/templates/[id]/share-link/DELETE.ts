/**
 * DELETE /api/forms/templates/:id/share-link
 * Revokes all active public share tokens for a form template.
 * Existing submissions are preserved — only new form fills are blocked.
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

    const templateId = parseInt(String(req.params.id), 10);
    if (isNaN(templateId)) return res.status(400).json({ error: 'Invalid template ID' });

    // Verify template belongs to company
    const [tplCheck] = await db.execute(
      sql`SELECT id FROM form_templates WHERE id = ${templateId} AND company_id = ${profile.companyId} LIMIT 1`,
    ) as unknown as [Array<{ id: number }>];
    if (!tplCheck?.length) return res.status(404).json({ error: 'Template not found' });

    // Revoke all active tokens for this template
    await db.execute(sql`
      UPDATE form_share_tokens
      SET revoked = 1, updated_at = NOW()
      WHERE template_id = ${templateId}
        AND company_id = ${profile.companyId}
        AND revoked = 0
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/forms/templates/:id/share-link error:', err);
    return res.status(500).json({ error: 'Failed to revoke share link' });
  }
}
