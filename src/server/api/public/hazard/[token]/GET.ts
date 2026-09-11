/**
 * GET /api/public/hazard/:token
 * Public endpoint — no authentication required.
 * Returns the hazard details, company name, snapshot photo URL, and any
 * public comments/closures for the share page.
 *
 * Information exposed:
 *   - Company name only (no other company data)
 *   - Hazard: title, description, category, risk_level, existing_controls,
 *     additional_controls, status, photo URL (signed, 1 h)
 *   - Public comments on this hazard only
 *
 * Never exposes: other hazards, users, jobs, private records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSignedUrl } from '../../../../storage/storage-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token || token.length < 64) return res.status(400).json({ error: 'Invalid token' });

    // Resolve token
    const [tokenRows] = await db.execute(sql`
      SELECT hazard_id, company_id, revoked
      FROM hazard_share_tokens
      WHERE token = ${token} LIMIT 1
    `) as unknown as [Array<{ hazard_id: number; company_id: number; revoked: number }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });

    const { hazard_id, company_id } = tokenRows[0];

    // Fetch hazard — only safe public fields
    const [hazardRows] = await db.execute(sql`
      SELECT
        r.id, r.title, r.description, r.category, r.hazard_source,
        r.who_is_at_risk, r.existing_controls, r.additional_controls,
        r.likelihood, r.consequence, r.risk_level, r.status,
        r.identified_date, r.photo_path
      FROM risk_register r
      WHERE r.id = ${hazard_id} AND r.company_id = ${company_id} LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!hazardRows?.length) return res.status(404).json({ error: 'Hazard not found' });

    const hazard = { ...hazardRows[0] };

    // Resolve photo to a signed URL (1 hour)
    if (hazard.photo_path) {
      try {
        hazard.photo_url = await getSignedUrl(String(hazard.photo_path), 'hazard-photos', 3600);
      } catch {
        hazard.photo_url = null;
      }
    } else {
      hazard.photo_url = null;
    }
    delete hazard.photo_path; // don't expose storage key

    // Fetch company name only
    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${company_id} LIMIT 1
    `) as unknown as [Array<{ name: string }>];

    // Fetch public comments for this hazard
    const [commentRows] = await db.execute(sql`
      SELECT id, commenter_name, comment, action_taken, previous_status, new_status, created_at
      FROM hazard_public_comments
      WHERE hazard_id = ${hazard_id}
      ORDER BY created_at ASC
    `) as unknown as [Array<Record<string, unknown>>];

    return res.json({
      hazard,
      company: companyRows?.[0] ?? null,
      comments: commentRows ?? [],
    });
  } catch (err) {
    console.error('GET /api/public/hazard/:token error:', err);
    return res.status(500).json({ error: 'Failed to load hazard' });
  }
}
