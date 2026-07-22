/**
 * POST /api/forms/templates/:id/share-link
 * Generates (or returns existing) a public share link for a form template.
 * Auth required. Returns { token, url }.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

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
      sql`SELECT id, name FROM form_templates WHERE id = ${templateId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string }>];
    if (!tplCheck?.length) return res.status(404).json({ error: 'Template not found' });

    // Check for existing active token
    const [existing] = await db.execute(sql`
      SELECT token FROM form_share_tokens
      WHERE template_id = ${templateId} AND company_id = ${profile.companyId} AND revoked = 0
      ORDER BY created_at DESC LIMIT 1
    `) as unknown as [Array<{ token: string }>];

    let token: string;
    if (existing?.length) {
      token = existing[0].token;
    } else {
      token = crypto.randomBytes(32).toString('hex');
      await db.execute(sql`
        INSERT INTO form_share_tokens (company_id, template_id, token, created_by_user_id)
        VALUES (${profile.companyId}, ${templateId}, ${token}, ${session.user.id})
      `);
    }

    const origin = req.headers.origin ?? `https://${req.headers.host}`;
    res.json({ token, url: `${origin}/forms/fill/${token}` });
  } catch (err) {
    console.error('POST /api/forms/templates/:id/share-link error:', err);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
}
