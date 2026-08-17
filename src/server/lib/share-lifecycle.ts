/**
 * share-lifecycle.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for Secure Share revocation when a source record is
 * deleted.
 *
 * RULE: Source deletion and share revocation are ONE reliable operation.
 * Every delete route for a Secure Share-capable target MUST call
 * revokeSharesForSource() before (or as part of) deleting the source row.
 * The function is idempotent — calling it on an already-revoked target is safe.
 *
 * ── What this covers ─────────────────────────────────────────────────────────
 * Three share tables exist in the system:
 *
 *   1. secure_share_links  — new system; used by ShareLinkModal for all
 *                            target types (estimate, invoice, swms, completed_form,
 *                            job_form, file, document, safety_plan, job_swms)
 *
 *   2. document_shares     — document-engine.ts share system (DocumentBuilder)
 *                            target type: document
 *
 *   3. shared_links        — legacy form share system
 *                            target type: job_form / completed_form
 *
 * revokeSharesForSource() revokes across ALL three tables for the given target.
 * Each table uses a different revocation mechanism:
 *   - secure_share_links: SET revoked = 1, token_encrypted = NULL
 *   - document_shares:    SET revoked_at = NOW()
 *   - shared_links:       SET revoked_at = NOW()
 *
 * ── token_encrypted cleared on permanent deletion ────────────────────────────
 * Per the lifecycle contract: "Never retain or expose encrypted tokens after
 * permanent deletion; clear token_encrypted."
 * revokeSharesForSource() always NULLs token_encrypted on the revoked rows.
 * The token_hash is retained for audit trail (it is a one-way hash — the raw
 * token cannot be recovered from it).
 *
 * ── Restore safety ───────────────────────────────────────────────────────────
 * Revoked rows have revoked = 1 (secure_share_links) or revoked_at IS NOT NULL
 * (document_shares / shared_links). The active-link queries in POST and
 * active/GET already filter these out. A restored source therefore cannot
 * reactivate previous links — a new link must be explicitly created.
 *
 * ── Audit events ─────────────────────────────────────────────────────────────
 * One secure_share_events row is written per revoked secure_share_links row
 * with event_type = 'source_deleted'. This preserves the security audit trail
 * without retaining the encrypted token.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   import { revokeSharesForSource } from '../../lib/share-lifecycle.js';
 *
 *   // Before deleting the source row:
 *   await revokeSharesForSource({
 *     companyId: profile.companyId,
 *     targetType: 'estimate',   // see TargetType below
 *     targetId: String(id),
 *     req,                      // for IP / user-agent audit logging
 *   });
 *   // Now delete the source row.
 *
 * ── Target type reference ─────────────────────────────────────────────────────
 *   estimate        → estimates table
 *   invoice         → invoices table
 *   completed_form  → jobFormSubmissions (status = completed)
 *   job_form        → jobFormSubmissions (any status)
 *   swms            → job_swms table
 *   safety_plan     → safety_plans table
 *   file            → company_files table
 *   document        → documents table (DocumentBuilder)
 */
import type { Request } from 'express';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export type TargetType =
  | 'estimate'
  | 'invoice'
  | 'completed_form'
  | 'job_form'
  | 'swms'
  | 'safety_plan'
  | 'file'
  | 'document';

export interface RevokeSharesOptions {
  companyId: number;
  targetType: TargetType;
  targetId: string;
  /** Express request — used for IP / user-agent in audit events. Pass null for background jobs. */
  req: Request | null;
}

/**
 * Revoke all active share links for a source record across all three share
 * tables.  Must be called before (or atomically with) deleting the source row.
 *
 * Returns the number of secure_share_links rows revoked (for logging).
 */
export async function revokeSharesForSource(opts: RevokeSharesOptions): Promise<number> {
  const { companyId, targetType, targetId, req } = opts;
  const ip = req?.ip ?? null;
  const ua = ((req?.headers['user-agent'] ?? '') as string).slice(0, 500);

  // ── 1. secure_share_links ─────────────────────────────────────────────────
  // Fetch IDs of active rows first so we can write per-row audit events.
  const [activeRows] = await db.execute(sql`
    SELECT id
    FROM secure_share_links
    WHERE company_id = ${companyId}
      AND target_type = ${targetType}
      AND target_id   = ${targetId}
      AND revoked     = 0
  `) as unknown as [Array<{ id: number }>, unknown];

  const activeIds = (activeRows ?? []).map((r) => r.id);

  if (activeIds.length > 0) {
    // Revoke all + clear token_encrypted in one UPDATE
    await db.execute(sql`
      UPDATE secure_share_links
      SET revoked           = 1,
          token_encrypted   = NULL,
          updated_at        = NOW()
      WHERE company_id = ${companyId}
        AND target_type = ${targetType}
        AND target_id   = ${targetId}
        AND revoked     = 0
    `);

    // Write one audit event per revoked row
    for (const linkId of activeIds) {
      await db.execute(sql`
        INSERT INTO secure_share_events
          (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
        VALUES
          (${linkId}, ${companyId}, 'source_deleted', ${ip}, ${ua}, NOW())
      `).catch(() => {/* non-fatal — audit failure must not block deletion */});
    }
  }

  // ── 2. document_shares (DocumentBuilder share system) ────────────────────
  // Only relevant for target_type = 'document', but safe to run for all types.
  // document_shares uses document_id (integer), not target_id (string).
  const docId = parseInt(targetId, 10);
  if (!isNaN(docId) && targetType === 'document') {
    await db.execute(sql`
      UPDATE document_shares
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE document_id = ${docId}
        AND company_id  = ${companyId}
        AND revoked_at IS NULL
    `).catch(() => {/* table may not exist in all environments */});
  }

  // ── 3. shared_links (legacy form share system) ───────────────────────────
  // Used by the old job-forms share system. target_id is stored as a string.
  if (targetType === 'completed_form' || targetType === 'job_form') {
    await db.execute(sql`
      UPDATE shared_links
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE company_id = ${companyId}
        AND target_id  = ${targetId}
        AND revoked_at IS NULL
    `).catch(() => {/* table may not exist in all environments */});
  }

  return activeIds.length;
}
