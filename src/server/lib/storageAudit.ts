/**
 * storageAudit.ts — Storage deletion audit events (CP10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Records a structured audit event for every storage deletion attempt.
 *
 * WHAT IS RECORDED:
 *   actor (userId), company, category, object identifier (storageKey), outcome
 *
 * WHAT IS NEVER RECORDED:
 *   presigned URLs, query parameters, credentials, access keys, signatures,
 *   raw error messages that may contain credential fragments
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export interface StorageDeletionAuditEvent {
  /** User who triggered the deletion */
  actorUserId: string | null;
  /** Company that owns the object */
  companyId: number;
  /** Logical bucket / category (e.g. 'job-photos', 'company-files') */
  category: string;
  /** Storage key (object identifier) — safe to log, not a URL */
  storageKey: string;
  /** Whether the deletion succeeded */
  success: boolean;
  /** Sanitized error category — never a raw error message */
  errorCategory?: string;
}

/**
 * Record a storage deletion audit event.
 * Best-effort — never throws; failures are logged to stderr only.
 */
export async function recordStorageDeletion(event: StorageDeletionAuditEvent): Promise<void> {
  try {
    const metadata = JSON.stringify({
      category:    event.category,
      storageKey:  event.storageKey,
      errorCategory: event.errorCategory ?? null,
    });

    await db.execute(sql`
      INSERT INTO platform_activity_log
        (event_type, success, user_id, company_id, metadata_json)
      VALUES
        ('storage.delete', ${event.success ? 1 : 0}, ${event.actorUserId}, ${event.companyId}, ${metadata})
    `);
  } catch (err) {
    // Audit failure must never break the main flow
    console.error('[storageAudit] Failed to record deletion event:', err instanceof Error ? err.constructor.name : 'UnknownError');
  }
}
