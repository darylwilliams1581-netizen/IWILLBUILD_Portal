/**
 * po-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical PO service — single source of truth for all Purchase Order
 * business logic. Both the Finance-scoped routes and the legacy job-scoped
 * routes call this service; no SQL or business rules are duplicated elsewhere.
 *
 * Responsibilities:
 *  - Tenant-scoped PO lookup (company isolation)
 *  - Job validation (job belongs to company)
 *  - Vendor validation (contractor/supplier belongs to company, is active)
 *  - PO number generation (atomic, race-safe via po_sequences)
 *  - Line validation (delegates to po-auth.validateLines)
 *  - Server-side total calculation (delegates to po-auth.computeTotals)
 *  - Create transaction (header + lines + progress assignments + document)
 *  - Update transaction (fields + lines + status transition + document sync)
 *  - Status transitions (delegates to po-auth.validateTransition)
 *  - Draft deletion (lines → header, document revoke)
 *  - Company-wide list with filters, counts, cursor pagination
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';
import {
  validateLines,
  computeTotals,
  validateTransition,
  MAX_LINES,
  type ValidatedLine,
} from './po-auth.js';
import {
  ensureDocument,
  logEvent,
  getDocumentBySource,
  updateDocument,
  revokeShare,
} from './document-engine.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface POServiceError {
  code: 400 | 403 | 404 | 409 | 413 | 422 | 500;
  message: string;
  details?: unknown;
}

export type POServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: POServiceError };

export interface CreatePOInput {
  companyId: number;
  userId: string;
  jobId: number;
  contractorId?: number | null;
  assignedToType?: 'internal' | 'contractor';
  assignedToName?: string | null;
  tradeType?: string | null;
  title?: string | null;
  instructions?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  lines: unknown[];
}

export interface UpdatePOInput {
  companyId: number;
  userId: string;
  /** For job-scoped routes: also scope by jobId */
  jobId?: number | null;
  poId: number;
  status?: string;
  title?: string | null;
  instructions?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  cancelledNote?: string | null;
  assignedToName?: string | null;
  tradeType?: string | null;
  contractorId?: number | null;
  /** If provided, replace all lines (draft only) */
  lines?: unknown[];
}

export interface DeletePOInput {
  companyId: number;
  userId: string;
  /** For job-scoped routes: also scope by jobId */
  jobId?: number | null;
  poId: number;
}

export interface ListPOsInput {
  companyId: number;
  canSeeDollars: boolean;
  /** Filter by status tab */
  status?: string;
  /** Free-text search: PO number, title, job, contractor */
  search?: string;
  /** Filter by job ID */
  jobId?: number;
  /** Filter by contractor/supplier ID */
  contractorId?: number;
  /** Filter by date range (ISO date strings) */
  dateFrom?: string;
  dateTo?: string;
  /** Cursor-based pagination */
  cursor?: number;
  limit?: number;
}

export interface PORow {
  id: number;
  company_id: number;
  job_id: number;
  contractor_id: number | null;
  assigned_to_type: string;
  assigned_to_name: string | null;
  trade_type: string | null;
  po_number: string;
  title: string;
  instructions: string | null;
  start_date: string | null;
  finish_date: string | null;
  status: string;
  subtotal: number;
  gst: number;
  total: number;
  cancelled_note: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  // joined
  contractor_name: string | null;
  contractor_email: string | null;
  contractor_phone: string | null;
  contractor_abn: string | null;
  job_number: string | null;
  job_name: string | null;
}

export interface POLineRow {
  id: number;
  purchase_order_id: number;
  progress_line_id: number | null;
  description: string;
  qty: number;
  unit: string | null;
  rate: number;
  amount: number;
  sort_order: number;
}

export interface PODetail extends PORow {
  lines: POLineRow[];
}

export interface POListResult {
  purchaseOrders: PORow[];
  hasMore: boolean;
  nextCursor: number | null;
  counts: {
    all: number;
    draft: number;
    sent: number;
    completed: number;
    cancelled: number;
  };
}

// ── PO number generation ──────────────────────────────────────────────────────

export async function nextPONumber(companyId: number, attempt = 0): Promise<string> {
  await db.execute(sql`
    INSERT INTO po_sequences (company_id, last_seq)
    VALUES (${companyId}, 1)
    ON DUPLICATE KEY UPDATE last_seq = last_seq + 1
  `);

  const [seqRows] = await db.execute(sql`
    SELECT last_seq FROM po_sequences WHERE company_id = ${companyId}
  `) as unknown as [Array<{ last_seq: number }>, unknown];

  const seq = seqRows?.[0]?.last_seq ?? 1;
  const candidate = `PO-${String(seq).padStart(4, '0')}`;

  const [existRows] = await db.execute(sql`
    SELECT id FROM job_purchase_orders
    WHERE company_id = ${companyId} AND po_number = ${candidate}
    LIMIT 1
  `) as unknown as [Array<{ id: number }>, unknown];

  if (existRows?.length && attempt < 3) {
    return nextPONumber(companyId, attempt + 1);
  }

  return candidate;
}

// ── Vendor validation ─────────────────────────────────────────────────────────

export async function validateVendor(
  companyId: number,
  contractorId: number,
): Promise<{ ok: true } | { ok: false; error: POServiceError }> {
  const [rows] = await db.execute(sql`
    SELECT id FROM customers
    WHERE id = ${contractorId}
      AND company_id = ${companyId}
      AND status = 'active'
      AND record_type IN ('contractor', 'supplier', 'customer')
    LIMIT 1
  `) as unknown as [Array<{ id: number }>, unknown];

  if (!rows?.length) {
    return { ok: false, error: { code: 400, message: 'Contractor/supplier not found or not eligible' } };
  }
  return { ok: true };
}

// ── Job validation ────────────────────────────────────────────────────────────

export async function validateJob(
  companyId: number,
  jobId: number,
): Promise<{ ok: true } | { ok: false; error: POServiceError }> {
  const [rows] = await db.execute(sql`
    SELECT id FROM jobs
    WHERE id = ${jobId} AND company_id = ${companyId}
    LIMIT 1
  `) as unknown as [Array<{ id: number }>, unknown];

  if (!rows?.length) {
    return { ok: false, error: { code: 404, message: 'Job not found' } };
  }
  return { ok: true };
}

// ── Progress line validation ──────────────────────────────────────────────────

async function validateProgressLines(
  companyId: number,
  jobId: number,
  progressLineIds: number[],
): Promise<{ ok: true } | { ok: false; error: POServiceError }> {
  if (progressLineIds.length === 0) return { ok: true };

  const [rows] = await db.execute(sql`
    SELECT id FROM job_progress_lines
    WHERE id IN (${sql.raw(progressLineIds.join(','))})
      AND job_id = ${jobId}
      AND company_id = ${companyId}
  `) as unknown as [Array<{ id: number }>, unknown];

  if ((rows?.length ?? 0) !== progressLineIds.length) {
    return { ok: false, error: { code: 400, message: 'One or more progress lines do not belong to this job' } };
  }
  return { ok: true };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

export async function fetchPODetail(
  companyId: number,
  poId: number,
  jobId?: number | null,
): Promise<PODetail | null> {
  const jobClause = jobId != null ? sql` AND po.job_id = ${jobId}` : sql``;

  const [poRows] = await db.execute(sql`
    SELECT po.*,
           c.name  AS contractor_name,
           c.email AS contractor_email,
           c.phone AS contractor_phone,
           c.abn   AS contractor_abn,
           j.job_number,
           j.name  AS job_name
    FROM job_purchase_orders po
    LEFT JOIN customers c ON c.id = po.contractor_id
    LEFT JOIN jobs j ON j.id = po.job_id
    WHERE po.id = ${poId}
      AND po.company_id = ${companyId}
    ${jobClause}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!poRows?.length) return null;

  const [lineRows] = await db.execute(sql`
    SELECT * FROM job_purchase_order_lines
    WHERE purchase_order_id = ${poId}
    ORDER BY sort_order ASC, id ASC
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  return { ...(poRows[0] as PORow), lines: (lineRows ?? []) as POLineRow[] };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createPO(
  input: CreatePOInput,
): Promise<POServiceResult<PODetail>> {
  const {
    companyId, userId, jobId,
    contractorId, assignedToType = 'contractor', assignedToName,
    tradeType, title, instructions, startDate, finishDate, lines: rawLines,
  } = input;

  // Validate lines
  if (!Array.isArray(rawLines) || rawLines.length > MAX_LINES) {
    return { ok: false, error: { code: 400, message: `Maximum ${MAX_LINES} line items allowed` } };
  }
  const lineResult = validateLines(rawLines);
  if ('errors' in lineResult) {
    return { ok: false, error: { code: 400, message: 'Invalid line items', details: lineResult.errors } };
  }
  const { lines } = lineResult;

  // Validate job
  const jobCheck = await validateJob(companyId, jobId);
  if (!jobCheck.ok) return { ok: false, error: jobCheck.error };

  // Validate vendor
  if (contractorId != null && !isNaN(contractorId)) {
    const vendorCheck = await validateVendor(companyId, contractorId);
    if (!vendorCheck.ok) return { ok: false, error: vendorCheck.error };
  }

  // Validate progress lines
  const progressLineIds = lines.map((l) => l.progressLineId).filter((id): id is number => id !== null);
  const plCheck = await validateProgressLines(companyId, jobId, progressLineIds);
  if (!plCheck.ok) return { ok: false, error: plCheck.error };

  const { subtotal, gst, total } = computeTotals(lines);
  const poNumber = await nextPONumber(companyId);
  const resolvedTitle = (title?.trim()) || `Work Order ${poNumber}`;
  const documentType = assignedToType === 'contractor' ? 'purchase_order' : 'work_order';

  let poId: number;
  try {
    await db.execute(sql`START TRANSACTION`);

    const [result] = await db.execute(sql`
      INSERT INTO job_purchase_orders
        (company_id, job_id, contractor_id, assigned_to_type, assigned_to_name, trade_type,
         po_number, title, instructions, start_date, finish_date, status,
         subtotal, gst, total, created_by_user_id)
      VALUES
        (${companyId}, ${jobId},
         ${contractorId ?? null}, ${assignedToType}, ${assignedToName ?? null},
         ${tradeType ?? null}, ${poNumber}, ${resolvedTitle},
         ${instructions ?? null}, ${startDate ?? null}, ${finishDate ?? null},
         'draft', ${subtotal}, ${gst}, ${total}, ${userId})
    `) as unknown as [ResultSetHeader, unknown];

    poId = result.insertId;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await db.execute(sql`
        INSERT INTO job_purchase_order_lines
          (purchase_order_id, progress_line_id, description, qty, unit, rate, amount, sort_order)
        VALUES
          (${poId}, ${l.progressLineId ?? null}, ${l.description},
           ${l.qty}, ${l.unit ?? null}, ${l.rate}, ${l.amount}, ${i})
      `);
    }

    // Update progress line assignments
    for (const l of lines) {
      if (!l.progressLineId) continue;
      await db.execute(sql`
        UPDATE job_progress_lines SET
          assignment_type  = ${assignedToType},
          assigned_to_name = ${assignedToName ?? null},
          contractor_id    = ${contractorId ?? null},
          trade_type       = ${tradeType ?? null}
        WHERE id = ${l.progressLineId}
          AND job_id = ${jobId}
          AND company_id = ${companyId}
      `);
    }

    // Document record
    await db.execute(sql`
      INSERT INTO documents
        (company_id, job_id, source_module, source_id, document_type, title,
         status, version, is_locked, created_by_user_id, created_at, updated_at)
      VALUES
        (${companyId}, ${jobId}, 'purchase_order', ${String(poId)},
         ${documentType}, ${resolvedTitle},
         'draft', 1, 0, ${userId}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE updated_at = NOW()
    `);

    await db.execute(sql`COMMIT`);
  } catch (txErr) {
    await db.execute(sql`ROLLBACK`).catch(() => {});
    console.error('[po-service] createPO transaction failed:', txErr);
    return { ok: false, error: { code: 500, message: 'Failed to create purchase order' } };
  }

  // Best-effort document event log
  try {
    const docId = await ensureDocument({
      companyId, jobId, sourceModule: 'purchase_order', sourceId: String(poId),
      documentType, title: resolvedTitle, status: 'draft', createdByUserId: userId,
    });
    await logEvent(docId, companyId, 'created', {
      eventNote: `${documentType === 'work_order' ? 'Work order' : 'Purchase order'} created: ${poNumber}`,
      userId,
    });
  } catch (docErr) {
    console.warn('[po-service] Document log event failed (non-fatal):', docErr);
  }

  const detail = await fetchPODetail(companyId, poId!);
  if (!detail) return { ok: false, error: { code: 500, message: 'Created but could not fetch PO' } };
  return { ok: true, data: detail };
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updatePO(
  input: UpdatePOInput,
): Promise<POServiceResult<PODetail>> {
  const { companyId, userId, poId, jobId } = input;

  const existing = await fetchPODetail(companyId, poId, jobId);
  if (!existing) return { ok: false, error: { code: 404, message: 'Purchase order not found' } };

  const currentStatus = existing.status;

  // Status transition
  let newStatus = currentStatus;
  if (input.status !== undefined) {
    const err = validateTransition(currentStatus, input.status);
    if (err) return { ok: false, error: { code: err.code, message: err.message } };
    newStatus = input.status;
  }

  // If lines are being replaced, only allowed on draft
  if (input.lines !== undefined && currentStatus !== 'draft') {
    return { ok: false, error: { code: 409, message: 'Lines can only be edited on draft POs' } };
  }

  let validatedLines: ValidatedLine[] | undefined;
  if (input.lines !== undefined) {
    if (!Array.isArray(input.lines) || input.lines.length > MAX_LINES) {
      return { ok: false, error: { code: 400, message: `Maximum ${MAX_LINES} line items allowed` } };
    }
    const lineResult = validateLines(input.lines);
    if ('errors' in lineResult) {
      return { ok: false, error: { code: 400, message: 'Invalid line items', details: lineResult.errors } };
    }
    validatedLines = lineResult.lines;
  }

  try {
    await db.execute(sql`START TRANSACTION`);

    if (validatedLines !== undefined) {
      const { subtotal, gst, total } = computeTotals(validatedLines);

      await db.execute(sql`
        DELETE FROM job_purchase_order_lines WHERE purchase_order_id = ${poId}
      `);

      for (let i = 0; i < validatedLines.length; i++) {
        const l = validatedLines[i];
        await db.execute(sql`
          INSERT INTO job_purchase_order_lines
            (purchase_order_id, progress_line_id, description, qty, unit, rate, amount, sort_order)
          VALUES
            (${poId}, ${l.progressLineId ?? null}, ${l.description},
             ${l.qty}, ${l.unit ?? null}, ${l.rate}, ${l.amount}, ${i})
        `);
      }

      await db.execute(sql`
        UPDATE job_purchase_orders SET
          status         = ${newStatus},
          title          = ${input.title !== undefined ? (input.title ?? existing.title) : existing.title},
          instructions   = ${input.instructions !== undefined ? input.instructions : existing.instructions},
          start_date     = ${input.startDate !== undefined ? input.startDate : existing.start_date},
          finish_date    = ${input.finishDate !== undefined ? input.finishDate : existing.finish_date},
          cancelled_note = ${input.cancelledNote !== undefined ? input.cancelledNote : existing.cancelled_note},
          assigned_to_name = ${input.assignedToName !== undefined ? input.assignedToName : existing.assigned_to_name},
          trade_type     = ${input.tradeType !== undefined ? input.tradeType : existing.trade_type},
          contractor_id  = ${input.contractorId !== undefined ? input.contractorId : existing.contractor_id},
          subtotal       = ${subtotal},
          gst            = ${gst},
          total          = ${total},
          updated_at     = NOW()
        WHERE id = ${poId} AND company_id = ${companyId}
      `);
    } else {
      await db.execute(sql`
        UPDATE job_purchase_orders SET
          status         = ${newStatus},
          title          = ${input.title !== undefined ? (input.title ?? existing.title) : existing.title},
          instructions   = ${input.instructions !== undefined ? input.instructions : existing.instructions},
          start_date     = ${input.startDate !== undefined ? input.startDate : existing.start_date},
          finish_date    = ${input.finishDate !== undefined ? input.finishDate : existing.finish_date},
          cancelled_note = ${input.cancelledNote !== undefined ? input.cancelledNote : existing.cancelled_note},
          assigned_to_name = ${input.assignedToName !== undefined ? input.assignedToName : existing.assigned_to_name},
          trade_type     = ${input.tradeType !== undefined ? input.tradeType : existing.trade_type},
          contractor_id  = ${input.contractorId !== undefined ? input.contractorId : existing.contractor_id},
          updated_at     = NOW()
        WHERE id = ${poId} AND company_id = ${companyId}
      `);
    }

    await db.execute(sql`COMMIT`);
  } catch (txErr) {
    await db.execute(sql`ROLLBACK`).catch(() => {});
    console.error('[po-service] updatePO transaction failed:', txErr);
    return { ok: false, error: { code: 500, message: 'Failed to update purchase order' } };
  }

  // Document Engine sync (best-effort)
  if (newStatus !== currentStatus) {
    try {
      const doc = await getDocumentBySource(companyId, 'purchase_order', String(poId));
      if (doc) {
        await updateDocument(companyId, doc.id, { status: newStatus, updatedByUserId: userId });
        await logEvent(doc.id, companyId, 'status_changed', {
          eventNote: `Status changed from '${currentStatus}' to '${newStatus}'`,
          userId,
        });
      }
    } catch (docErr) {
      console.warn('[po-service] Document status sync failed (non-fatal):', docErr);
    }
  }

  const updated = await fetchPODetail(companyId, poId, jobId);
  if (!updated) return { ok: false, error: { code: 500, message: 'Updated but could not fetch PO' } };
  return { ok: true, data: updated };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deletePO(
  input: DeletePOInput,
): Promise<POServiceResult<{ ok: true }>> {
  const { companyId, userId, poId, jobId } = input;

  const existing = await fetchPODetail(companyId, poId, jobId);
  if (!existing) return { ok: false, error: { code: 404, message: 'Purchase order not found' } };

  if (existing.status !== 'draft') {
    return {
      ok: false,
      error: { code: 409, message: `Cannot delete a PO with status '${existing.status}'. Only draft POs can be deleted.` },
    };
  }

  // Revoke share links + mark document deleted (best-effort)
  try {
    const doc = await getDocumentBySource(companyId, 'purchase_order', String(poId));
    if (doc) {
      await revokeShare(doc.id, companyId);
      await updateDocument(companyId, doc.id, { status: 'deleted', updatedByUserId: userId });
      await logEvent(doc.id, companyId, 'status_changed', {
        eventNote: 'Purchase order deleted — all share links revoked',
        userId,
      });
    }
  } catch (docErr) {
    console.warn('[po-service] Document revoke/delete failed (non-fatal):', docErr);
  }

  await db.execute(sql`DELETE FROM job_purchase_order_lines WHERE purchase_order_id = ${poId}`);

  const jobClause = jobId != null ? sql` AND job_id = ${jobId}` : sql``;
  await db.execute(sql`
    DELETE FROM job_purchase_orders
    WHERE id = ${poId} AND company_id = ${companyId}
    ${jobClause}
  `);

  return { ok: true, data: { ok: true } };
}

// ── Company-wide list ─────────────────────────────────────────────────────────

export async function listPOs(input: ListPOsInput): Promise<POListResult> {
  const {
    companyId, status, search, jobId, contractorId,
    dateFrom, dateTo, cursor, limit: rawLimit = 25,
  } = input;

  const limit = Math.min(Math.max(1, rawLimit), 100);

  // Status counts (always company-wide, ignoring other filters for the tab counts)
  const [countRows] = await db.execute(sql`
    SELECT status, COUNT(*) AS cnt
    FROM job_purchase_orders
    WHERE company_id = ${companyId}
    GROUP BY status
  `) as unknown as [Array<{ status: string; cnt: number }>, unknown];

  const counts = { all: 0, draft: 0, sent: 0, completed: 0, cancelled: 0 };
  for (const row of (countRows ?? [])) {
    const s = row.status as keyof typeof counts;
    const n = Number(row.cnt);
    counts.all += n;
    if (s in counts) counts[s] += n;
  }

  // Build WHERE clauses
  const conditions: ReturnType<typeof sql>[] = [sql`po.company_id = ${companyId}`];

  if (status && status !== 'all') {
    conditions.push(sql`po.status = ${status}`);
  }

  if (jobId) {
    conditions.push(sql`po.job_id = ${jobId}`);
  }

  if (contractorId) {
    conditions.push(sql`po.contractor_id = ${contractorId}`);
  }

  if (dateFrom) {
    conditions.push(sql`DATE(po.created_at) >= ${dateFrom}`);
  }

  if (dateTo) {
    conditions.push(sql`DATE(po.created_at) <= ${dateTo}`);
  }

  if (search) {
    const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(sql`(
      po.po_number LIKE ${like}
      OR po.title LIKE ${like}
      OR j.name LIKE ${like}
      OR j.job_number LIKE ${like}
      OR c.name LIKE ${like}
    )`);
  }

  if (cursor) {
    conditions.push(sql`po.id < ${cursor}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const [rows] = await db.execute(sql`
    SELECT po.*,
           c.name  AS contractor_name,
           c.email AS contractor_email,
           c.phone AS contractor_phone,
           c.abn   AS contractor_abn,
           j.job_number,
           j.name  AS job_name
    FROM job_purchase_orders po
    LEFT JOIN customers c ON c.id = po.contractor_id
    LEFT JOIN jobs j ON j.id = po.job_id
    WHERE ${whereClause}
    ORDER BY po.id DESC
    LIMIT ${limit + 1}
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  const all = rows ?? [];
  const hasMore = all.length > limit;
  const page = hasMore ? all.slice(0, limit) : all;
  const nextCursor = hasMore ? Number(page[page.length - 1].id) : null;

  return {
    purchaseOrders: page as PORow[],
    hasMore,
    nextCursor,
    counts,
  };
}

// ── PDF data fetch ────────────────────────────────────────────────────────────

export interface POPdfData {
  po: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  company: Record<string, unknown>;
  pdfSettings: Record<string, string>;
}

export async function fetchPOForPdf(
  companyId: number,
  poId: number,
  jobId?: number | null,
): Promise<POPdfData | null> {
  const jobClause = jobId != null ? sql` AND po.job_id = ${jobId}` : sql``;

  const [poRows] = await db.execute(sql`
    SELECT po.*,
           c.name  AS contractor_name,
           c.email AS contractor_email,
           c.phone AS contractor_phone,
           c.abn   AS contractor_abn,
           j.job_number,
           j.name  AS job_name,
           j.address AS job_address,
           cust.name AS customer_name
    FROM job_purchase_orders po
    LEFT JOIN customers c ON c.id = po.contractor_id
    LEFT JOIN jobs j ON j.id = po.job_id
    LEFT JOIN customers cust ON cust.id = j.customer_id
    WHERE po.id = ${poId}
      AND po.company_id = ${companyId}
    ${jobClause}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!poRows?.length) return null;

  const [lineRows] = await db.execute(sql`
    SELECT * FROM job_purchase_order_lines
    WHERE purchase_order_id = ${poId}
    ORDER BY sort_order ASC
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  const [compRows] = await db.execute(sql`
    SELECT co.name AS company_name, co.logo_url,
           cs.pdf_json
    FROM companies co
    LEFT JOIN company_settings cs ON cs.company_id = co.id
    WHERE co.id = ${companyId}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  const comp = compRows?.[0] ?? {};
  let pdfSettings: Record<string, string> = {};
  try { pdfSettings = JSON.parse(String(comp.pdf_json ?? '{}')); } catch { /* ignore */ }

  return { po: poRows[0], lines: lineRows ?? [], company: comp, pdfSettings };
}
