/**
 * PATCH /api/dazza/v3/communications/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner-only. Approve, reject, remove, or resolve a communication.
 * Body: { action: 'approve' | 'reject' | 'remove' | 'resolve', message?: string, displayUntil?: string }
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };
    const { action, message, displayUntil, title, workaround, isCritical, isDismissible, targetScope, targetCompanyId } = req.body as {
      action?: string;
      message?: string;
      displayUntil?: string;
      title?: string;
      workaround?: string;
      isCritical?: boolean;
      isDismissible?: boolean;
      targetScope?: string;
      targetCompanyId?: number;
    };

    const VALID_ACTIONS = ['approve', 'reject', 'remove', 'resolve', 'edit'];
    if (!action || !VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    let setClauses = 'updated_at = NOW()';

    if (action === 'approve') {
      setClauses += `, status = 'approved', approved_by_user_id = '${esc(ownerInfo.userId)}', approved_at = NOW()`;
      if (displayUntil) setClauses += `, display_until = '${esc(displayUntil)}'`;
    } else if (action === 'reject') {
      setClauses += `, status = 'rejected'`;
    } else if (action === 'remove') {
      setClauses += `, removed_at = NOW(), removed_by_user_id = '${esc(ownerInfo.userId)}'`;
    } else if (action === 'resolve') {
      setClauses += `, status = 'resolved', removed_at = NOW(), removed_by_user_id = '${esc(ownerInfo.userId)}'`;
    } else if (action === 'edit') {
      if (message) setClauses += `, message = '${esc(message.slice(0, 2000))}'`;
      if (title) setClauses += `, title = '${esc(title.slice(0, 300))}'`;
      if (workaround !== undefined) setClauses += `, workaround = ${workaround ? `'${esc(workaround.slice(0, 1000))}'` : 'NULL'}`;
      if (isCritical !== undefined) setClauses += `, is_critical = ${isCritical ? 1 : 0}`;
      if (isDismissible !== undefined) setClauses += `, is_dismissible = ${isDismissible ? 1 : 0}`;
      if (targetScope) setClauses += `, target_scope = '${esc(targetScope)}'`;
      if (targetCompanyId !== undefined) setClauses += `, target_company_id = ${targetCompanyId ? Number(targetCompanyId) : 'NULL'}`;
    }

    await db.execute(sql.raw(`
      UPDATE incident_communications SET ${setClauses} WHERE id = '${esc(id)}'
    `));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[dazza/v3/communications/:id PATCH]', err);
    return res.status(500).json({ error: 'Failed to update communication.' });
  }
}
