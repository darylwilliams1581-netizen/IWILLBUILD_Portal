/**
 * POST /api/jobs/:id/purchase-orders
 * Creates a new Purchase Order / Work Order from selected progress lines.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobs, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import type { ResultSetHeader } from 'mysql2';
import { ensureDocument, logEvent } from '../../../../lib/document-engine.js';

interface POLine {
  progressLineId?: number | null;
  description: string;
  qty: number;
  unit?: string | null;
  rate: number;
  amount: number;
  sortOrder?: number;
}

interface POBody {
  assignedToType: 'internal' | 'contractor';
  assignedToName?: string;
  contractorId?: number | null;
  tradeType?: string;
  title?: string;
  instructions?: string;
  startDate?: string;
  finishDate?: string;
  lines: POLine[];
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)) });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const body = req.body as POBody;
    if (!body.lines?.length) return res.status(400).json({ error: 'At least one line item is required' });

    // Generate PO number: PO-JOBNUM-NNN
    const [countRows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM job_purchase_orders WHERE company_id = ${profile.companyId}
    `) as unknown as [Array<{ cnt: number }>, unknown];
    const seq = (Number(countRows?.[0]?.cnt ?? 0) + 1).toString().padStart(4, '0');
    const poNumber = `PO-${seq}`;

    // Calculate totals
    const subtotal = body.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const gst = Math.round(subtotal * 0.1 * 100) / 100;
    const total = subtotal + gst;

    const assignedToType = body.assignedToType === 'contractor' ? 'contractor' : 'internal';
    const title = body.title?.trim() || `Work Order ${poNumber}`;

    const [result] = await db.execute(sql`
      INSERT INTO job_purchase_orders
        (company_id, job_id, contractor_id, assigned_to_type, assigned_to_name, trade_type,
         po_number, title, instructions, start_date, finish_date, status,
         subtotal, gst, total, created_by_user_id)
      VALUES
        (${profile.companyId}, ${jobId},
         ${body.contractorId ?? null},
         ${assignedToType},
         ${body.assignedToName?.trim() || null},
         ${body.tradeType?.trim() || null},
         ${poNumber}, ${title},
         ${body.instructions?.trim() || null},
         ${body.startDate || null},
         ${body.finishDate || null},
         'draft',
         ${subtotal}, ${gst}, ${total},
         ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const poId = result.insertId;

    // Insert lines
    for (let i = 0; i < body.lines.length; i++) {
      const l = body.lines[i];
      await db.execute(sql`
        INSERT INTO job_purchase_order_lines
          (purchase_order_id, progress_line_id, description, qty, unit, rate, amount, sort_order)
        VALUES
          (${poId}, ${l.progressLineId ?? null}, ${l.description}, ${l.qty}, ${l.unit ?? null}, ${l.rate}, ${l.amount}, ${i})
      `);
    }

    // Update progress lines with assignment info
    if (body.lines.some((l) => l.progressLineId)) {
      for (const l of body.lines) {
        if (!l.progressLineId) continue;
        await db.execute(sql`
          UPDATE job_progress_lines SET
            assignment_type  = ${assignedToType},
            assigned_to_name = ${body.assignedToName?.trim() || null},
            contractor_id    = ${body.contractorId ?? null},
            trade_type       = ${body.tradeType?.trim() || null}
          WHERE id = ${l.progressLineId} AND company_id = ${profile.companyId}
        `);
      }
    }

    // Return the created PO with lines
    const [poRows] = await db.execute(sql`
      SELECT po.*, c.name as contractor_name, c.email as contractor_email, c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${poId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const [lineRows] = await db.execute(sql`
      SELECT * FROM job_purchase_order_lines WHERE purchase_order_id = ${poId} ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({
      purchaseOrder: { ...(poRows?.[0] ?? {}), lines: lineRows ?? [] },
    });

    // ── Document Engine: create a document record for this PO (best-effort) ──
    try {
      const po = poRows?.[0] as Record<string, unknown> | undefined;
      const docId = await ensureDocument({
        companyId: profile.companyId,
        jobId,
        sourceModule: 'purchase_order',
        sourceId: String(poId),
        documentType: 'purchase_order',
        title: `${po?.po_number ?? 'PO'} — ${po?.title ?? 'Purchase Order'}`,
        status: 'draft',
        createdByUserId: session.user.id,
      });
      await logEvent(docId, profile.companyId, 'created', {
        eventNote: `Purchase order created: ${po?.po_number ?? poId}`,
        userId: session.user.id,
      });
    } catch (docErr) {
      console.warn('[document-engine] Failed to create document for PO:', docErr);
    }
  } catch (err) {
    console.error('POST /api/jobs/:id/purchase-orders error:', err);
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
}
