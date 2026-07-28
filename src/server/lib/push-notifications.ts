/**
 * Push Notification Helper
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps web-push to send notifications to all active subscriptions for a
 * given company or specific user.
 *
 * Usage:
 *   await sendPushToCompany(companyId, { title: 'Job Assigned', body: '...', url: '/jobs/123' });
 *   await sendPushToUser(userId, { title: 'Invoice Paid', body: '...', url: '/invoices/456' });
 */
import webpush from 'web-push';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

let _configured = false;

function ensureConfigured() {
  if (_configured) return;
  const publicKey = getSecret('VAPID_PUBLIC_KEY');
  const privateKey = getSecret('VAPID_PRIVATE_KEY');
  const subject = getSecret('VAPID_SUBJECT') ?? 'mailto:admin@iwillbuild.com';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  _configured = true;
}

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a push notification to all active subscriptions for a company.
 */
export async function sendPushToCompany(
  companyId: number,
  payload: PushPayload,
): Promise<void> {
  try {
    ensureConfigured();
    const rows = await db.execute(sql`
      SELECT id, endpoint, p256dh, auth
      FROM push_subscriptions
      WHERE company_id = ${companyId}
        AND revoked = 0
    `) as unknown as PushSubscriptionRow[];

    await _sendToRows(rows, payload);
  } catch (err) {
    console.error('[push] sendPushToCompany error:', err);
  }
}

/**
 * Send a push notification to all active subscriptions for a specific user.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    ensureConfigured();
    const rows = await db.execute(sql`
      SELECT id, endpoint, p256dh, auth
      FROM push_subscriptions
      WHERE user_id = ${userId}
        AND revoked = 0
    `) as unknown as PushSubscriptionRow[];

    await _sendToRows(rows, payload);
  } catch (err) {
    console.error('[push] sendPushToUser error:', err);
  }
}

async function _sendToRows(rows: PushSubscriptionRow[], payload: PushPayload) {
  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    icon: payload.icon ?? '/icon-192.svg',
    badge: payload.badge ?? '/icon-192.svg',
    tag: payload.tag,
  });

  const staleIds: number[] = [];

  await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          data,
          { TTL: 86400 },
        );
      } catch (err: unknown) {
        // 410 Gone or 404 = subscription expired — mark revoked
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          staleIds.push(row.id);
        } else {
          console.warn('[push] send error for sub', row.id, err);
        }
      }
    }),
  );

  if (staleIds.length > 0) {
    await db.execute(sql`
      UPDATE push_subscriptions
      SET revoked = 1, updated_at = NOW()
      WHERE id IN (${sql.join(staleIds.map((id) => sql`${id}`), sql`, `)})
    `);
  }
}
