/**
 * POST /api/public/hazard/:token/close
 * Public endpoint — no authentication required.
 * Allows a recipient to:
 *   - Add a comment
 *   - Mark the hazard closed (optional — commenter_name + comment required either way)
 *
 * Records: commenter_name, comment, action_taken, previous_status, new_status,
 *          created_at, ip_address.
 *
 * Closing sets risk_register.status = 'closed' and risk_register.closed_at.
 * Does NOT archive or delete the hazard.
 * The authenticated Hazard Register view shows all public comments.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { toMySQLDatetime } from '../../../../../lib/datetime.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token || token.length < 64) return res.status(400).json({ error: 'Invalid token' });

    const { commenter_name, comment, mark_closed } = req.body as {
      commenter_name?: string;
      comment?: string;
      mark_closed?: boolean;
    };

    if (!commenter_name?.trim()) return res.status(400).json({ error: 'Your name is required' });
    if (!comment?.trim()) return res.status(400).json({ error: 'A comment is required' });

    // Resolve token
    const [tokenRows] = await db.execute(sql`
      SELECT hazard_id, company_id, revoked
      FROM hazard_share_tokens
      WHERE token = ${token} LIMIT 1
    `) as unknown as [Array<{ hazard_id: number; company_id: number; revoked: number }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });

    const { hazard_id, company_id } = tokenRows[0];

    // Fetch current status
    const [hazardRows] = await db.execute(sql`
      SELECT id, status FROM risk_register
      WHERE id = ${hazard_id} AND company_id = ${company_id} LIMIT 1
    `) as unknown as [Array<{ id: number; status: string }>];

    if (!hazardRows?.length) return res.status(404).json({ error: 'Hazard not found' });

    const previousStatus = hazardRows[0].status;
    const newStatus = mark_closed ? 'closed' : previousStatus;
    const actionTaken = mark_closed ? 'closed' : 'comment';
    const now = toMySQLDatetime(new Date());
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null;

    // Insert public comment
    await db.execute(sql`
      INSERT INTO hazard_public_comments
        (hazard_id, company_id, commenter_name, comment, action_taken,
         previous_status, new_status, ip_address, created_at)
      VALUES
        (${hazard_id}, ${company_id}, ${commenter_name.trim()}, ${comment.trim()},
         ${actionTaken}, ${previousStatus}, ${newStatus}, ${ip}, ${now})
    `);

    // Update hazard status if closing
    if (mark_closed && previousStatus !== 'closed') {
      await db.execute(sql`
        UPDATE risk_register
        SET status = 'closed', closed_at = ${now}, closed_by = ${commenter_name.trim()}, updated_at = ${now}
        WHERE id = ${hazard_id} AND company_id = ${company_id}
      `);
    }

    return res.status(201).json({ ok: true, new_status: newStatus });
  } catch (err) {
    console.error('POST /api/public/hazard/:token/close error:', err);
    return res.status(500).json({ error: 'Failed to submit' });
  }
}
