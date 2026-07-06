/**
 * POST /api/portal/estimates/:id/approve
 * Customer approves or declines an estimate via portal token.
 * Body: { token: string, action: 'approve' | 'decline', notes?: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

async function resolveToken(token: string) {
  const [rows] = await db.execute(sql`
    SELECT company_id, customer_id FROM customer_portal_tokens
    WHERE token = ${token} AND expires_at > NOW()
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>];
  return rows?.[0] ?? null;
}

export default async function handler(req: Request, res: Response) {
  try {
    const { token, action, notes } = req.body;
    if (!token) return res.status(401).json({ error: 'token required' });
    if (!['approve', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be approve or decline' });

    const ctx = await resolveToken(token);
    if (!ctx) return res.status(401).json({ error: 'Invalid or expired token' });

    const estId = parseInt(String(req.params.id), 10);

    // Verify estimate belongs to this customer's job
    const [estRows] = await db.execute(sql`
      SELECT e.id, e.status, e.job_id
      FROM estimates e
      JOIN jobs j ON j.id = e.job_id
      WHERE e.id = ${estId}
        AND e.company_id = ${ctx.company_id}
        AND j.customer_id = ${ctx.customer_id}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!estRows?.length) return res.status(404).json({ error: 'Estimate not found' });

    const newStatus = action === 'approve' ? 'approved' : 'declined';
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(sql`
      UPDATE estimates SET
        status = ${newStatus},
        approved_at = ${action === 'approve' ? now : null},
        notes = CASE WHEN ${notes ?? null} IS NOT NULL THEN ${notes ?? null} ELSE notes END
      WHERE id = ${estId}
    `);

    res.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error('POST /api/portal/estimates/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to update estimate' });
  }
}
