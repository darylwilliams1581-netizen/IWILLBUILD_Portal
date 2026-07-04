/**
 * GET /api/public/swms/:token
 * Public endpoint — no auth required.
 * Returns SWMS content + existing signoffs for the sign-off page.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) return res.status(400).json({ error: 'Invalid token' });

    // Resolve token → job_swms
    const [tokenRows] = await db.execute(sql`
      SELECT t.job_swms_id, t.company_id, t.revoked
      FROM swms_share_tokens t
      WHERE t.token = ${token} LIMIT 1
    `) as unknown as [Array<{ job_swms_id: number; company_id: number; revoked: number }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });

    const { job_swms_id, company_id } = tokenRows[0];

    // Fetch SWMS
    const [swmsRows] = await db.execute(sql`
      SELECT js.*, j.name AS job_name, j.address AS job_address
      FROM job_swms js
      LEFT JOIN jobs j ON j.id = js.job_id
      WHERE js.id = ${job_swms_id} AND js.company_id = ${company_id} LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!swmsRows?.length) return res.status(404).json({ error: 'SWMS not found' });

    // Fetch existing signoffs
    const [signoffRows] = await db.execute(sql`
      SELECT id, worker_name, company_name, role, white_card_number, signed_at
      FROM swms_signoffs
      WHERE job_swms_id = ${job_swms_id}
      ORDER BY signed_at ASC
    `) as unknown as [Array<Record<string, unknown>>];

    // Fetch company branding
    const [companyRows] = await db.execute(sql`
      SELECT name, logo_url FROM companies WHERE id = ${company_id} LIMIT 1
    `) as unknown as [Array<{ name: string; logo_url?: string }>];

    res.json({
      swms: swmsRows[0],
      signoffs: signoffRows ?? [],
      company: companyRows?.[0] ?? null,
    });
  } catch (err) {
    console.error('GET /api/public/swms/:token error:', err);
    res.status(500).json({ error: 'Failed to load SWMS' });
  }
}
