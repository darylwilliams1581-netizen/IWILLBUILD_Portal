import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';

import { db } from '../../../../../db/client.js';
import { completeLinkedTask } from '../../../../../lib/hazardTaskService.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function requestSource(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() || req.ip || 'unknown';
}

export default async function handler(req: Request, res: Response) {
  const token = String(req.params.token ?? '');
  if (!/^[a-f0-9]{96}$/i.test(token)) return res.status(404).json({ error: 'Link not found' });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const ipHash = createHash('sha256').update(requestSource(req)).digest('hex');
  const rateKey = `${tokenHash}:${ipHash}`;
  const now = Date.now();
  const rate = attempts.get(rateKey);
  if (rate && rate.resetAt > now && rate.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }
  attempts.set(rateKey, rate && rate.resetAt > now
    ? { count: rate.count + 1, resetAt: rate.resetAt }
    : { count: 1, resetAt: now + WINDOW_MS });

  const action = String(req.body?.action ?? '');
  const name = String(req.body?.name ?? '').trim();
  const comment = String(req.body?.comment ?? '').trim();
  if (action !== 'comment' && action !== 'close') return res.status(400).json({ error: 'Invalid action' });
  if (!name || name.length > 200) return res.status(400).json({ error: 'Name is required and must be 200 characters or fewer' });
  if (!comment || comment.length > 2000) return res.status(400).json({ error: 'Comment is required and must be 2000 characters or fewer' });

  const [rows] = await db.execute(sql`
    SELECT st.revoked, r.id, r.company_id, r.status
    FROM hazard_share_tokens st
    INNER JOIN risk_register r ON r.id = st.hazard_id AND r.company_id = st.company_id
    WHERE st.token_hash = ${tokenHash}
    LIMIT 1
  `) as unknown as [Array<{ revoked: number; id: number; company_id: number; status: string }>, unknown];
  const hazard = rows?.[0];
  if (!hazard) return res.status(404).json({ error: 'Link not found' });
  if (Number(hazard.revoked) === 1) return res.status(410).json({ error: 'This link has been revoked' });

  if (action === 'close' && hazard.status === 'closed') {
    return res.json({ ok: true, already_closed: true, status: 'closed' });
  }

  const nextStatus = action === 'close' ? 'closed' : hazard.status;
  await db.execute(sql`
    INSERT INTO hazard_public_comments
      (hazard_id, company_id, commenter_name, comment, action_taken,
       previous_status, new_status, ip_hash, created_at)
    VALUES
      (${hazard.id}, ${hazard.company_id}, ${name}, ${comment}, ${action},
       ${hazard.status}, ${nextStatus}, ${ipHash}, NOW())
  `);

  if (action === 'close') {
    await db.execute(sql`
      UPDATE risk_register
      SET status = 'closed', closed_at = COALESCE(closed_at, NOW()),
          closed_by = COALESCE(closed_by, ${name}), updated_at = NOW()
      WHERE id = ${hazard.id} AND company_id = ${hazard.company_id} AND status <> 'closed'
    `);
    await completeLinkedTask(hazard.company_id, hazard.id);
  }
  return res.json({ ok: true, status: nextStatus });
}
