/**
 * GET /api/public/hazard/:token
 * Public endpoint — no authentication required.
 *
 * Resolves the raw URL token by hashing it (SHA-256) and comparing token_hash.
 * The raw token is never stored in the database.
 *
 * Returns ONLY:
 *   - Company name (no other company data)
 *   - Hazard: id, title, description, category, hazard_source, who_is_at_risk,
 *     existing_controls, additional_controls, likelihood, consequence,
 *     risk_level, status, identified_date, photo_url (signed 1 h)
 *
 * Never returns: comments, commenter names, user IDs, storage keys,
 *                other hazards, jobs, or private records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSignedUrl } from '../../../../storage/storage-service.js';
import { createHash } from 'node:crypto';

function sha256hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    // Minimum 64 chars — raw token is 96 hex chars; reject obviously malformed values
    if (!token || token.length < 64 || !/^[0-9a-f]+$/i.test(token)) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const tokenHash = sha256hex(token);

    // Resolve token by hash — never by raw value
    const [tokenRows] = await db.execute(sql`
      SELECT hazard_id, company_id, revoked
      FROM hazard_share_tokens
      WHERE token_hash = ${tokenHash} LIMIT 1
    `) as unknown as [Array<{ hazard_id: number; company_id: number; revoked: number }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });

    const { hazard_id, company_id } = tokenRows[0];

    // Fetch hazard — only safe public fields; no user IDs, no storage keys
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

    const hazard: Record<string, unknown> = { ...hazardRows[0] };

    // Resolve photo to a signed URL (1 hour); never expose the storage key
    if (hazard.photo_path) {
      try {
        hazard.photo_url = await getSignedUrl(String(hazard.photo_path), 'hazard-photos', 3600);
      } catch {
        hazard.photo_url = null;
      }
    } else {
      hazard.photo_url = null;
    }
    delete hazard.photo_path; // storage key must never leave the server

    // Fetch company name only — no other company data
    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${company_id} LIMIT 1
    `) as unknown as [Array<{ name: string }>];

    // Comments are NOT returned to the public recipient.
    // They are visible only through the authenticated
    // GET /api/risk-register/:id/public-comments endpoint.
    return res.json({
      hazard,
      company: companyRows?.[0] ?? null,
    });
  } catch (err) {
    console.error('GET /api/public/hazard/:token error:', err);
    return res.status(500).json({ error: 'Failed to load hazard' });
  }
}
