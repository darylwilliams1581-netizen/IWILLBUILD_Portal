/**
 * POST /api/dazza/v3/communications
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner-only. Create a new communication draft (or approve immediately).
 * Dazza can create drafts; only the Owner can approve them for display.
 *
 * Body: IncidentCommunicationInput
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const body = req.body as {
      incidentId?: string;
      bugReportId?: number;
      commType?: string;
      channel?: string;
      title: string;
      message: string;
      workaround?: string;
      actionLabel?: string;
      actionUrl?: string;
      targetScope?: string;
      targetCompanyId?: number;
      targetUserId?: string;
      targetBuild?: string;
      targetRoute?: string;
      isDismissible?: boolean;
      isCritical?: boolean;
      displayFrom?: string;
      displayUntil?: string;
      approveImmediately?: boolean;
    };

    if (!body.title?.trim() || !body.message?.trim()) {
      return res.status(400).json({ error: 'title and message are required.' });
    }

    const VALID_TYPES = ['banner', 'popup', 'modal', 'resolved', 'acknowledgement'];
    const VALID_SCOPES = ['all', 'affected_users', 'company', 'user', 'build'];
    const commType = VALID_TYPES.includes(body.commType ?? '') ? body.commType! : 'banner';
    const targetScope = VALID_SCOPES.includes(body.targetScope ?? '') ? body.targetScope! : 'affected_users';

    const id = randomUUID();
    const status = body.approveImmediately ? 'approved' : 'draft';
    const approvedAt = body.approveImmediately ? 'NOW()' : 'NULL';
    const approvedBy = body.approveImmediately ? `'${esc(ownerInfo.userId)}'` : 'NULL';

    await db.execute(sql.raw(`
      INSERT INTO incident_communications (
        id, incident_id, bug_report_id, comm_type, channel, status,
        title, message, workaround, action_label, action_url,
        target_scope, target_company_id, target_user_id, target_build, target_route,
        is_dismissible, is_critical,
        approved_by_user_id, approved_at,
        display_from, display_until,
        created_at, updated_at
      ) VALUES (
        '${id}',
        ${body.incidentId ? `'${esc(body.incidentId)}'` : 'NULL'},
        ${body.bugReportId ? Number(body.bugReportId) : 'NULL'},
        '${esc(commType)}',
        '${esc(body.channel ?? 'dashboard')}',
        '${esc(status)}',
        '${esc(body.title.slice(0, 300))}',
        '${esc(body.message.slice(0, 2000))}',
        ${body.workaround ? `'${esc(body.workaround.slice(0, 1000))}'` : 'NULL'},
        ${body.actionLabel ? `'${esc(body.actionLabel.slice(0, 100))}'` : 'NULL'},
        ${body.actionUrl ? `'${esc(body.actionUrl.slice(0, 500))}'` : 'NULL'},
        '${esc(targetScope)}',
        ${body.targetCompanyId ? Number(body.targetCompanyId) : 'NULL'},
        ${body.targetUserId ? `'${esc(body.targetUserId)}'` : 'NULL'},
        ${body.targetBuild ? `'${esc(body.targetBuild.slice(0, 50))}'` : 'NULL'},
        ${body.targetRoute ? `'${esc(body.targetRoute.slice(0, 300))}'` : 'NULL'},
        ${body.isDismissible !== false ? 1 : 0},
        ${body.isCritical ? 1 : 0},
        ${approvedBy},
        ${approvedAt},
        ${body.displayFrom ? `'${esc(body.displayFrom)}'` : 'NULL'},
        ${body.displayUntil ? `'${esc(body.displayUntil)}'` : 'NULL'},
        NOW(), NOW()
      )
    `));

    return res.status(201).json({ ok: true, id, status });
  } catch (err) {
    console.error('[dazza/v3/communications POST]', err);
    return res.status(500).json({ error: 'Failed to create communication.' });
  }
}
