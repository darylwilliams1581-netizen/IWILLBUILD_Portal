/**
 * POST /api/public/swms/:token/signoff
 * Public endpoint — no auth required.
 * Records a worker sign-off via the public share link.
 * Body: { workerName, companyName?, role?, whiteCardNumber?, signatureData? }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) return res.status(400).json({ error: 'Invalid token' });

    // Resolve token
    const [tokenRows] = await db.execute(sql`
      SELECT job_swms_id, company_id, revoked
      FROM swms_share_tokens
      WHERE token = ${token} LIMIT 1
    `) as unknown as [Array<{ job_swms_id: number; company_id: number; revoked: number }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });

    const { job_swms_id, company_id } = tokenRows[0];

    const { workerName, companyName, role, whiteCardNumber, signatureData } = req.body as {
      workerName: string;
      companyName?: string;
      role?: string;
      whiteCardNumber?: string;
      signatureData?: string;
    };

    if (!workerName?.trim()) return res.status(400).json({ error: 'Worker name is required' });

    // Prevent duplicate sign-off from same worker on same SWMS
    const [dupCheck] = await db.execute(sql`
      SELECT id FROM swms_signoffs
      WHERE job_swms_id = ${job_swms_id} AND worker_name = ${workerName.trim()}
      LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (dupCheck?.length) {
      return res.status(409).json({ error: `${workerName.trim()} has already signed this SWMS` });
    }

    const [result] = await db.execute(sql`
      INSERT INTO swms_signoffs
        (job_swms_id, company_id, worker_name, company_name, role, white_card_number, signature_data, signed_at)
      VALUES
        (${job_swms_id}, ${company_id}, ${workerName.trim()},
         ${companyName?.trim() ?? null}, ${role?.trim() ?? null},
         ${whiteCardNumber?.trim() ?? null}, ${signatureData ?? null}, NOW())
    `) as unknown as [ResultSetHeader];

    const [rows] = await db.execute(
      sql`SELECT id, worker_name, company_name, role, white_card_number, signed_at FROM swms_signoffs WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>];

    res.status(201).json({ signoff: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/public/swms/:token/signoff error:', err);
    res.status(500).json({ error: 'Failed to record sign-off' });
  }
}
