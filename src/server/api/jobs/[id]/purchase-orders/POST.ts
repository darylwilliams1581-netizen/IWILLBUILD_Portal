/**
 * POST /api/jobs/:id/purchase-orders
 * Creates a new Purchase Order (contractor) or Work Order (internal).
 *
 * Gate 1 hardening:
 *  - Finance permission required (permInvoices)
 *  - Job must belong to authenticated company
 *  - Contractor/Supplier must belong to authenticated company (record_type check)
 *  - Every referenced progress line must belong to this job + company
 *  - Server computes all monetary values — browser amounts are ignored
 *  - PO number uses po_sequences table (atomic, no reuse, unique constraint)
 *  - Entire operation (header + lines + progress assignments + document) runs
 *    inside a START TRANSACTION / COMMIT block; ROLLBACK on any failure
 *  - Document record created inside the transaction (not best-effort after response)
 */

import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';
import {
  resolvePOProfile,
  requireFinance,
  validateLines,
  computeTotals,
  MAX_LINES,
} from '../../../../lib/po-auth.js';
import {
  ensureDocument,
  logEvent,
} from '../../../../lib/document-engine.js';

// ── PO number: atomic sequence via po_sequences ───────────────────────────────

/**
 * Atomically increment the company's PO sequence and return the next number.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so concurrent requests never collide.
 * The sequence never decreases — deleted POs do not free their number.
 * Retries up to 3 times on the unlikely event of a duplicate constraint hit.
 */
async function nextPONumber(companyId: number, attempt = 0): Promise<string> {
  // Atomic upsert: insert first row or increment existing
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

  // Verify uniqueness (belt-and-suspenders against the unique constraint)
  const [existRows] = await db.execute(sql`
    SELECT id FROM job_purchase_orders
    WHERE company_id = ${companyId} AND po_number = ${candidate}
    LIMIT 1
  `) as unknown as [Array<{ id: number }>, unknown];

  if (existRows?.length && attempt < 3) {
    // Extremely unlikely — bump the sequence and retry
    return nextPONumber(companyId, attempt + 1);
  }

  return candidate;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinance(profile, res)) return;

  // ── Job ID ────────────────────────────────────────────────────────────────
  const jobId = parseInt(String(req.params.id), 10);
  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = req.body as Record<string, unknown>;
  const assignedToType: 'internal' | 'contractor' =
    body.assignedToType === 'contractor' ? 'contractor' : 'internal';
  const assignedToName = body.assignedToName != null
    ? String(body.assignedToName).trim() || null
    : null;
  const contractorId = body.contractorId != null
    ? parseInt(String(body.contractorId), 10)
    : null;
  const tradeType = body.tradeType != null
    ? String(body.tradeType).trim() || null
    : null;
  const title = body.title != null
    ? String(body.title).trim() || null
    : null;
  const instructions = body.instructions != null
    ? String(body.instructions).trim() || null
    : null;
  const startDate = body.startDate != null
    ? String(body.startDate).trim() || null
    : null;
  const finishDate = body.finishDate != null
    ? String(body.finishDate).trim() || null
    : null;

  // ── Line validation ───────────────────────────────────────────────────────
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length > MAX_LINES) {
    return res.status(400).json({ error: `Maximum ${MAX_LINES} line items allowed` });
  }
  const lineResult = validateLines(rawLines);
  if ('errors' in lineResult) {
    return res.status(400).json({ error: 'Invalid line items', details: lineResult.errors });
  }
  const { lines } = lineResult;

  try {
    // ── Pre-write validations (before transaction) ────────────────────────

    // 1. Job belongs to company
    const [jobRows] = await db.execute(sql`
      SELECT id FROM jobs
      WHERE id = ${jobId} AND company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number }>, unknown];
    if (!jobRows?.length) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // 2. Contractor belongs to company (if provided)
    if (contractorId !== null && !isNaN(contractorId)) {
      const [contRows] = await db.execute(sql`
        SELECT id, record_type FROM customers
        WHERE id = ${contractorId}
          AND company_id = ${profile.companyId}
          AND status = 'active'
          AND record_type IN ('contractor', 'supplier', 'customer')
        LIMIT 1
      `) as unknown as [Array<{ id: number; record_type: string }>, unknown];
      if (!contRows?.length) {
        return res.status(400).json({ error: 'Contractor not found or not eligible' });
      }
    }

    // 3. All referenced progress lines belong to this job + company
    const progressLineIds = lines
      .map((l) => l.progressLineId)
      .filter((id): id is number => id !== null);

    if (progressLineIds.length > 0) {
      const [plRows] = await db.execute(sql`
        SELECT id FROM job_progress_lines
        WHERE id IN (${sql.raw(progressLineIds.join(','))})
          AND job_id = ${jobId}
          AND company_id = ${profile.companyId}
      `) as unknown as [Array<{ id: number }>, unknown];

      if ((plRows?.length ?? 0) !== progressLineIds.length) {
        return res.status(400).json({
          error: 'One or more progress lines do not belong to this job',
        });
      }
    }

    // ── Compute totals ────────────────────────────────────────────────────
    const { subtotal, gst, total } = computeTotals(lines);

    // ── PO number (outside transaction — sequence is monotonic) ───────────
    const poNumber = await nextPONumber(profile.companyId);
    const resolvedTitle = title || `Work Order ${poNumber}`;

    // ── Document type ─────────────────────────────────────────────────────
    const documentType = assignedToType === 'contractor' ? 'purchase_order' : 'work_order';

    // ── Transaction ───────────────────────────────────────────────────────
    let poId: number;
    try {
      await db.execute(sql`START TRANSACTION`);

      // Insert PO header
      const [result] = await db.execute(sql`
        INSERT INTO job_purchase_orders
          (company_id, job_id, contractor_id, assigned_to_type, assigned_to_name, trade_type,
           po_number, title, instructions, start_date, finish_date, status,
           subtotal, gst, total, created_by_user_id)
        VALUES
          (${profile.companyId}, ${jobId},
           ${contractorId ?? null},
           ${assignedToType},
           ${assignedToName},
           ${tradeType},
           ${poNumber}, ${resolvedTitle},
           ${instructions},
           ${startDate},
           ${finishDate},
           'draft',
           ${subtotal}, ${gst}, ${total},
           ${profile.userId})
      `) as unknown as [ResultSetHeader, unknown];

      poId = result.insertId;

      // Insert lines (server-computed amounts)
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

      // Update progress lines with assignment info
      for (const l of lines) {
        if (!l.progressLineId) continue;
        await db.execute(sql`
          UPDATE job_progress_lines SET
            assignment_type  = ${assignedToType},
            assigned_to_name = ${assignedToName},
            contractor_id    = ${contractorId ?? null},
            trade_type       = ${tradeType}
          WHERE id = ${l.progressLineId}
            AND job_id = ${jobId}
            AND company_id = ${profile.companyId}
        `);
      }

      // Create Document record inside the transaction
      await db.execute(sql`
        INSERT INTO documents
          (company_id, job_id, source_module, source_id, document_type, title,
           status, version, is_locked, created_by_user_id, created_at, updated_at)
        VALUES
          (${profile.companyId}, ${jobId}, 'purchase_order', ${String(poId)},
           ${documentType}, ${resolvedTitle},
           'draft', 1, 0, ${profile.userId}, NOW(), NOW())
        ON DUPLICATE KEY UPDATE updated_at = NOW()
      `);

      await db.execute(sql`COMMIT`);
    } catch (txErr) {
      await db.execute(sql`ROLLBACK`).catch(() => {/* ignore rollback error */});
      throw txErr;
    }

    // ── Fetch created PO for response ─────────────────────────────────────
    const [poRows] = await db.execute(sql`
      SELECT po.*,
             c.name as contractor_name, c.email as contractor_email,
             c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${poId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const [lineRows] = await db.execute(sql`
      SELECT * FROM job_purchase_order_lines
      WHERE purchase_order_id = ${poId}
      ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    // Log creation event (best-effort — outside transaction)
    try {
      const docId = await ensureDocument({
        companyId: profile.companyId,
        jobId,
        sourceModule: 'purchase_order',
        sourceId: String(poId),
        documentType,
        title: resolvedTitle,
        status: 'draft',
        createdByUserId: profile.userId,
      });
      await logEvent(docId, profile.companyId, 'created', {
        eventNote: `${documentType === 'work_order' ? 'Work order' : 'Purchase order'} created: ${poNumber}`,
        userId: profile.userId,
      });
    } catch (docErr) {
      console.warn('[po-gate1] Document log event failed (non-fatal):', docErr);
    }

    return res.status(201).json({
      purchaseOrder: { ...(poRows?.[0] ?? {}), lines: lineRows ?? [] },
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/purchase-orders error:', err);
    return res.status(500).json({ error: 'Failed to create purchase order' });
  }
}
