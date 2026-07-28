/**
 * email-log.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Helper for writing to email_delivery_log.
 * Fire-and-forget safe — errors are swallowed so they never break the main flow.
 *
 * Email types:
 *   invite              – new user invite
 *   invite_resend       – resent invite
 *   password_reset      – forgot password link
 *   verification        – email verification link
 *   billing             – billing/subscription notification
 *   welcome             – welcome after signup
 *   temp_password       – temporary password set by developer
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export interface EmailLogParams {
  emailType: string;
  recipientEmail: string;
  recipientUserId?: string | null;
  subject?: string | null;
  status: 'sent' | 'failed' | 'queued';
  providerMessageId?: string | null;
  errorMessage?: string | null;
  companyId?: number | null;
}

export async function logEmail(params: EmailLogParams): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO email_delivery_log
        (email_type, recipient_email, recipient_user_id, subject, status,
         provider_message_id, error_message, company_id, created_at)
      VALUES (
        ${params.emailType},
        ${params.recipientEmail},
        ${params.recipientUserId ?? null},
        ${params.subject ?? null},
        ${params.status},
        ${params.providerMessageId ?? null},
        ${params.errorMessage ?? null},
        ${params.companyId ?? null},
        NOW()
      )
    `);
  } catch (err) {
    console.warn('[email-log] insert failed:', (err as Error)?.message?.slice(0, 120));
  }
}
