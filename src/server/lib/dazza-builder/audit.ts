/**
 * dazza-builder/audit.ts
 * Audit logging for Dazza Builder operations.
 * All writes are non-fatal — a failed audit never blocks the main operation.
 */
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function auditBuilder(
  ownerUserId: string,
  eventType: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO dazza_builder_audit
        (id, owner_user_id, event_type, details_json, created_at)
      VALUES
        (${randomUUID()}, ${ownerUserId}, ${eventType}, ${JSON.stringify(details)}, NOW())
    `);
  } catch {
    // Non-fatal — audit failure must never block the main operation
  }
}
