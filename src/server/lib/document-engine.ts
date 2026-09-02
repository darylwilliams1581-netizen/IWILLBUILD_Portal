/**
 * document-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core library for the IWIIlBUILD Document Engine.
 *
 * Every important output (form, estimate, PO, SWMS, invoice, report) becomes a
 * document record with its own internal URL, optional external share link,
 * print/PDF output, status, version, and audit history.
 *
 * This module provides:
 *   - createDocument()      — create or upsert a document record
 *   - getDocument()         — fetch by id (company-scoped)
 *   - getDocumentBySource() — fetch by source_module + source_id
 *   - updateDocument()      — update status/title/lock
 *   - snapshotVersion()     — save a version snapshot
 *   - logEvent()            — append to document_events
 *   - createShare()         — generate a document_shares token
 *   - resolveShare()        — validate + return share + document
 *   - revokeShare()         — revoke a share token
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { generateShareToken, hashToken } from './share-tokens.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocumentType =
  | 'job_form'
  | 'completed_form'
  | 'estimate'
  | 'purchase_order'
  | 'work_order'
  | 'swms'
  | 'safety_plan'
  | 'incident_report'
  | 'invoice'
  | 'general_report';

export type ShareMode = 'view' | 'download' | 'complete' | 'sign';

export interface DocumentRecord {
  id: number;
  companyId: number;
  jobId: number | null;
  fleetAssetId: number | null;
  customerId: number | null;
  sourceModule: string;
  sourceId: string;
  documentType: DocumentType;
  title: string;
  status: string;
  version: number;
  isLocked: boolean;
  lockedAt: string | null;
  completedAt: string | null;
  pdfFileId: number | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentShare {
  id: number;
  documentId: number;
  companyId: number;
  tokenHash: string;
  shareMode: ShareMode;
  expiresAt: string | null;
  revokedAt: string | null;
  submittedAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdByUserId: string;
  createdAt: string;
}

// ── Document CRUD ─────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  companyId: number;
  jobId?: number | null;
  fleetAssetId?: number | null;
  customerId?: number | null;
  sourceModule: string;
  sourceId: string;
  documentType: DocumentType;
  title: string;
  status?: string;
  createdByUserId: string;
}

/**
 * Create a new document record.
 * Returns the new document id.
 */
export async function createDocument(input: CreateDocumentInput): Promise<number> {
  await db.execute(
    sql`INSERT INTO documents
          (company_id, job_id, fleet_asset_id, customer_id, source_module, source_id,
           document_type, title, status, version, is_locked, created_by_user_id, created_at, updated_at)
        VALUES
          (${input.companyId}, ${input.jobId ?? null}, ${input.fleetAssetId ?? null},
           ${input.customerId ?? null}, ${input.sourceModule}, ${input.sourceId},
           ${input.documentType}, ${input.title}, ${input.status ?? 'draft'},
           1, 0, ${input.createdByUserId}, NOW(), NOW())`
  );

  const [rows] = await db.execute(
    sql`SELECT id FROM documents
        WHERE company_id = ${input.companyId}
          AND source_module = ${input.sourceModule}
          AND source_id = ${input.sourceId}
        ORDER BY id DESC LIMIT 1`
  ) as unknown as [Array<{ id: number }>, unknown];

  return rows[0].id;
}

/**
 * Get or create a document for a given source_module + source_id.
 * Idempotent — safe to call on every form open/estimate load.
 */
export async function ensureDocument(input: CreateDocumentInput): Promise<number> {
  const existing = await getDocumentBySource(input.companyId, input.sourceModule, input.sourceId);
  if (existing) return existing.id;
  return createDocument(input);
}

export async function getDocument(companyId: number, documentId: number): Promise<DocumentRecord | null> {
  const [rows] = await db.execute(
    sql`SELECT id, company_id, job_id, fleet_asset_id, customer_id, source_module, source_id,
               document_type, title, status, version, is_locked, locked_at, completed_at,
               pdf_file_id, created_by_user_id, updated_by_user_id, created_at, updated_at
        FROM documents
        WHERE id = ${documentId} AND company_id = ${companyId}
        LIMIT 1`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  const row = rows?.[0];
  if (!row) return null;
  return mapDocumentRow(row);
}

export async function getDocumentBySource(
  companyId: number,
  sourceModule: string,
  sourceId: string,
): Promise<DocumentRecord | null> {
  const [rows] = await db.execute(
    sql`SELECT id, company_id, job_id, fleet_asset_id, customer_id, source_module, source_id,
               document_type, title, status, version, is_locked, locked_at, completed_at,
               pdf_file_id, created_by_user_id, updated_by_user_id, created_at, updated_at
        FROM documents
        WHERE company_id = ${companyId}
          AND source_module = ${sourceModule}
          AND source_id = ${sourceId}
        ORDER BY id DESC LIMIT 1`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  const row = rows?.[0];
  if (!row) return null;
  return mapDocumentRow(row);
}

export async function listDocumentsByJob(companyId: number, jobId: number): Promise<DocumentRecord[]> {
  const [rows] = await db.execute(
    sql`SELECT id, company_id, job_id, fleet_asset_id, customer_id, source_module, source_id,
               document_type, title, status, version, is_locked, locked_at, completed_at,
               pdf_file_id, created_by_user_id, updated_by_user_id, created_at, updated_at
        FROM documents
        WHERE company_id = ${companyId} AND job_id = ${jobId}
        ORDER BY created_at DESC`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  return (rows ?? []).map(mapDocumentRow);
}

export interface UpdateDocumentInput {
  title?: string;
  status?: string;
  isLocked?: boolean;
  lockedAt?: Date | null;
  completedAt?: Date | null;
  pdfFileId?: number | null;
  updatedByUserId?: string;
  version?: number;
}

export async function updateDocument(
  companyId: number,
  documentId: number,
  input: UpdateDocumentInput,
): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  if (input.title !== undefined) sets.push(`title = ${JSON.stringify(input.title)}`);
  if (input.status !== undefined) sets.push(`status = ${JSON.stringify(input.status)}`);
  if (input.isLocked !== undefined) sets.push(`is_locked = ${input.isLocked ? 1 : 0}`);
  if (input.lockedAt !== undefined) sets.push(`locked_at = ${input.lockedAt ? `'${input.lockedAt.toISOString().slice(0, 19).replace('T', ' ')}'` : 'NULL'}`);
  if (input.completedAt !== undefined) sets.push(`completed_at = ${input.completedAt ? `'${input.completedAt.toISOString().slice(0, 19).replace('T', ' ')}'` : 'NULL'}`);
  if (input.pdfFileId !== undefined) sets.push(`pdf_file_id = ${input.pdfFileId ?? 'NULL'}`);
  if (input.updatedByUserId !== undefined) sets.push(`updated_by_user_id = ${JSON.stringify(input.updatedByUserId)}`);
  if (input.version !== undefined) sets.push(`version = ${input.version}`);

  if (sets.length === 1) return; // nothing to update

  await db.execute(
    sql.raw(`UPDATE documents SET ${sets.join(', ')} WHERE id = ${documentId} AND company_id = ${companyId}`)
  );
}

// ── Version snapshots ─────────────────────────────────────────────────────────

export async function snapshotVersion(
  documentId: number,
  versionNumber: number,
  snapshotJson: unknown,
  createdByUserId: string,
  pdfFileId?: number | null,
): Promise<void> {
  const json = JSON.stringify(snapshotJson);
  await db.execute(
    sql`INSERT INTO document_versions (document_id, version_number, snapshot_json, pdf_file_id, created_by_user_id, created_at)
        VALUES (${documentId}, ${versionNumber}, ${json}, ${pdfFileId ?? null}, ${createdByUserId}, NOW())`
  );
}

export async function getVersions(documentId: number): Promise<Array<{
  id: number;
  versionNumber: number;
  createdByUserId: string;
  createdAt: string;
}>> {
  const [rows] = await db.execute(
    sql`SELECT id, version_number, created_by_user_id, created_at
        FROM document_versions
        WHERE document_id = ${documentId}
        ORDER BY version_number DESC`
  ) as unknown as [Array<{
    id: number;
    version_number: number;
    created_by_user_id: string;
    created_at: string;
  }>, unknown];

  return (rows ?? []).map((r) => ({
    id: r.id,
    versionNumber: r.version_number,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at,
  }));
}

// ── Audit events ──────────────────────────────────────────────────────────────

export type DocumentEventType =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'locked'
  | 'unlocked'
  | 'completed'
  | 'share_created'
  | 'share_revoked'
  | 'viewed'
  | 'downloaded'
  | 'submitted'
  | 'reset'
  | 'pdf_generated'
  | 'printed';

export async function logEvent(
  documentId: number,
  companyId: number,
  eventType: DocumentEventType,
  opts?: {
    eventNote?: string;
    userId?: string | null;
    externalName?: string | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  try {
    await db.execute(
      sql`INSERT INTO document_events (document_id, company_id, event_type, event_note, user_id, external_name, ip_address, created_at)
          VALUES (${documentId}, ${companyId}, ${eventType},
                  ${opts?.eventNote ?? null}, ${opts?.userId ?? null},
                  ${opts?.externalName ?? null}, ${opts?.ipAddress ?? null}, NOW())`
    );
  } catch {
    // Non-fatal — event logging must never break the main flow
  }
}

export async function getEvents(documentId: number, companyId: number): Promise<Array<{
  id: number;
  eventType: string;
  eventNote: string | null;
  userId: string | null;
  externalName: string | null;
  ipAddress: string | null;
  createdAt: string;
}>> {
  const [rows] = await db.execute(
    sql`SELECT id, event_type, event_note, user_id, external_name, ip_address, created_at
        FROM document_events
        WHERE document_id = ${documentId} AND company_id = ${companyId}
        ORDER BY created_at DESC
        LIMIT 100`
  ) as unknown as [Array<{
    id: number;
    event_type: string;
    event_note: string | null;
    user_id: string | null;
    external_name: string | null;
    ip_address: string | null;
    created_at: string;
  }>, unknown];

  return (rows ?? []).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    eventNote: r.event_note,
    userId: r.user_id,
    externalName: r.external_name,
    ipAddress: r.ip_address,
    createdAt: r.created_at,
  }));
}

// ── Share tokens ──────────────────────────────────────────────────────────────

export interface CreateShareInput {
  documentId: number;
  companyId: number;
  shareMode: ShareMode;
  expiryDays?: number | null;
  maxUses?: number | null;
  createdByUserId: string;
}

/**
 * Create a new share token for a document.
 * Revokes any existing active shares of the same mode first.
 * Returns the raw token (shown once — never stored).
 */
export async function createShare(input: CreateShareInput): Promise<{
  rawToken: string;
  expiresAt: Date | null;
}> {
  // Revoke existing active shares of same mode
  await db.execute(
    sql`UPDATE document_shares
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE document_id = ${input.documentId}
          AND company_id = ${input.companyId}
          AND share_mode = ${input.shareMode}
          AND revoked_at IS NULL`
  );

  const rawToken = generateShareToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = input.expiryDays != null
    ? new Date(Date.now() + input.expiryDays * 86400000)
    : null;

  await db.execute(
    sql`INSERT INTO document_shares
          (document_id, company_id, token_hash, share_mode, expires_at, max_uses, use_count, created_by_user_id, created_at, updated_at)
        VALUES
          (${input.documentId}, ${input.companyId}, ${tokenHash}, ${input.shareMode},
           ${expiresAt ? expiresAt.toISOString().slice(0, 19).replace('T', ' ') : null},
           ${input.maxUses ?? null}, 0, ${input.createdByUserId}, NOW(), NOW())`
  );

  return { rawToken, expiresAt };
}

export interface ResolvedShare {
  share: DocumentShare;
  document: DocumentRecord;
}

/**
 * Validate a raw share token and return the share + document.
 * Increments use_count. Returns null if invalid/expired/revoked.
 */
export async function resolveShare(rawToken: string): Promise<ResolvedShare | { error: string } | null> {
  const tokenHash = hashToken(rawToken);

  const [rows] = await db.execute(
    sql`SELECT ds.id, ds.document_id, ds.company_id, ds.token_hash, ds.share_mode,
               ds.expires_at, ds.revoked_at, ds.submitted_at, ds.max_uses, ds.use_count,
               ds.created_by_user_id, ds.created_at
        FROM document_shares ds
        WHERE ds.token_hash = ${tokenHash}
        LIMIT 1`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  const shareRow = rows?.[0];
  if (!shareRow) return null;

  const share = mapShareRow(shareRow);

  if (share.revokedAt) return { error: 'This link has been revoked.' };
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return { error: 'This link has expired.' };
  if (share.maxUses !== null && share.useCount >= share.maxUses) return { error: 'This link has reached its maximum number of uses.' };

  // Increment use count
  await db.execute(
    sql`UPDATE document_shares SET use_count = use_count + 1, updated_at = NOW() WHERE id = ${share.id}`
  );

  const document = await getDocument(share.companyId, share.documentId);
  if (!document) return { error: 'Document not found.' };

  return { share, document };
}

export async function revokeShare(
  documentId: number,
  companyId: number,
  shareMode?: ShareMode,
): Promise<void> {
  if (shareMode) {
    await db.execute(
      sql`UPDATE document_shares
          SET revoked_at = NOW(), updated_at = NOW()
          WHERE document_id = ${documentId} AND company_id = ${companyId}
            AND share_mode = ${shareMode} AND revoked_at IS NULL`
    );
  } else {
    await db.execute(
      sql`UPDATE document_shares
          SET revoked_at = NOW(), updated_at = NOW()
          WHERE document_id = ${documentId} AND company_id = ${companyId}
            AND revoked_at IS NULL`
    );
  }
}

export async function getActiveShares(documentId: number, companyId: number): Promise<DocumentShare[]> {
  const [rows] = await db.execute(
    sql`SELECT id, document_id, company_id, token_hash, share_mode, expires_at, revoked_at,
               submitted_at, max_uses, use_count, created_by_user_id, created_at
        FROM document_shares
        WHERE document_id = ${documentId} AND company_id = ${companyId}
        ORDER BY created_at DESC
        LIMIT 20`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  return (rows ?? []).map(mapShareRow);
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapDocumentRow(r: Record<string, unknown>): DocumentRecord {
  return {
    id: r.id as number,
    companyId: r.company_id as number,
    jobId: (r.job_id as number | null) ?? null,
    fleetAssetId: (r.fleet_asset_id as number | null) ?? null,
    customerId: (r.customer_id as number | null) ?? null,
    sourceModule: r.source_module as string,
    sourceId: r.source_id as string,
    documentType: r.document_type as DocumentType,
    title: r.title as string,
    status: r.status as string,
    version: r.version as number,
    isLocked: Boolean(r.is_locked),
    lockedAt: (r.locked_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    pdfFileId: (r.pdf_file_id as number | null) ?? null,
    createdByUserId: r.created_by_user_id as string,
    updatedByUserId: (r.updated_by_user_id as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapShareRow(r: Record<string, unknown>): DocumentShare {
  return {
    id: r.id as number,
    documentId: r.document_id as number,
    companyId: r.company_id as number,
    tokenHash: r.token_hash as string,
    shareMode: r.share_mode as ShareMode,
    expiresAt: (r.expires_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
    submittedAt: (r.submitted_at as string | null) ?? null,
    maxUses: (r.max_uses as number | null) ?? null,
    useCount: r.use_count as number,
    createdByUserId: r.created_by_user_id as string,
    createdAt: r.created_at as string,
  };
}
