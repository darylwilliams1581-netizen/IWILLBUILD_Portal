/**
 * POST /api/jobs/:id/ledger/sync
 * Populates the ledger from existing data sources:
 *   - Approved estimate lines → MATERIAL/LABOUR (event_type from description heuristic)
 *   - Invoice lines → INVOICE_LINE
 *   - Job costs (receipts) → RECEIPT
 * Only inserts rows that don't already exist (idempotent via source_module + source_id).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobs, profiles, estimates, estimateLines } from '../../../../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

// Heuristic: guess event_type from description keywords
function guessEventType(description: string): string {
  const d = description.toLowerCase();
  if (/labour|labor|worker|carpenter|plumber|electrician|concreter|painter|tiler|roofer|hr |hours/.test(d)) return 'LABOUR';
  if (/plant|excavat|bobcat|crane|hire|equipment|machinery/.test(d)) return 'PLANT';
  if (/subcontract|sub-contract|contractor/.test(d)) return 'SUBCONTRACTOR';
  return 'MATERIAL';
}

// Default account codes by event type (standard Australian chart of accounts)
const DEFAULT_ACCOUNT: Record<string, string> = {
  LABOUR: '4000',
  MATERIAL: '5000',
  PLANT: '5100',
  SUBCONTRACTOR: '5200',
  RECEIPT: '5000',
  PURCHASE: '5000',
  VARIATION: '4100',
  INVOICE_LINE: '4000',
  CREDIT: '4900',
  ADJUSTMENT: '9000',
};

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

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Load existing ledger source_ids to avoid duplicates
    const [existingRows] = await db.execute(sql`
      SELECT source_module, source_id FROM job_cost_ledger
      WHERE company_id = ${profile.companyId} AND job_id = ${jobId}
        AND source_id IS NOT NULL
    `) as unknown as [Array<{ source_module: string; source_id: string }>, unknown];
    const existingKeys = new Set((existingRows ?? []).map((r) => `${r.source_module}:${r.source_id}`));

    let inserted = 0;
    const today = new Date().toISOString().slice(0, 10);

    // ── 1. Approved estimate lines ──────────────────────────────────────────
    const jobEstimates = await db.select().from(estimates)
      .where(and(eq(estimates.jobId, jobId), eq(estimates.companyId, profile.companyId)));

    const approvedEstimates = jobEstimates.filter((e) =>
      ['Approved', 'approved', 'Accepted', 'accepted'].includes(e.status)
    );

    if (approvedEstimates.length > 0) {
      const estIds = approvedEstimates.map((e) => e.id);
      const lines = await db.select().from(estimateLines)
        .where(inArray(estimateLines.estimateId, estIds));

      for (const line of lines) {
        const key = `estimate_line:${line.id}`;
        if (existingKeys.has(key)) continue;

        const qty = parseFloat(line.quantity) || 1;
        const rate = parseFloat(line.rate) || 0;
        const subtotal = Math.round(qty * rate * 100) / 100;
        const gst = Math.round(subtotal * 0.1 * 100) / 100;
        const total = subtotal + gst;
        const evType = guessEventType(line.description);
        const est = approvedEstimates.find((e) => e.id === line.estimateId);
        const entryDate = est?.createdAt
          ? new Date(est.createdAt).toISOString().slice(0, 10)
          : today;

        await db.execute(sql`
          INSERT INTO job_cost_ledger
            (company_id, job_id, job_number, job_title, entry_date, event_type, source_module, source_id,
             description, qty, unit, rate, subtotal, gst, total, gst_inclusive,
             account_code, tax_code, contact_name, contact_type, reference, status,
             created_by_user_id, created_by_name)
          VALUES
            (${profile.companyId}, ${jobId}, ${job.jobNumber ?? null}, ${job.name ?? null},
             ${entryDate}, ${evType}, 'estimate_line', ${String(line.id)},
             ${line.description}, ${qty}, ${line.unit ?? null}, ${rate},
             ${subtotal}, ${gst}, ${total}, 0,
             ${DEFAULT_ACCOUNT[evType] ?? '5000'}, 'GST',
             NULL, NULL, ${est?.title ?? null}, 'approved',
             ${session.user.id}, ${session.user.name ?? null})
        `);
        existingKeys.add(key);
        inserted++;
      }
    }

    // ── 2. Invoice lines ────────────────────────────────────────────────────
    const [jobInvoiceRows] = await db.execute(sql`
      SELECT * FROM invoices
      WHERE job_id = ${jobId} AND company_id = ${profile.companyId}
        AND status NOT IN ('void', 'deleted')
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    for (const inv of (jobInvoiceRows ?? [])) {

      const [invLines] = await db.execute(sql`
        SELECT * FROM invoice_lines WHERE invoice_id = ${inv.id} ORDER BY sort_order ASC
      `) as unknown as [Array<Record<string, unknown>>, unknown];

      for (const line of (invLines ?? [])) {
        const key = `invoice_line:${line.id}`;
        if (existingKeys.has(key)) continue;

        const qty = parseFloat(String(line.quantity ?? 1)) || 1;
        const rate = parseFloat(String(line.rate ?? 0)) || 0;
        const subtotal = parseFloat(String(line.amount ?? qty * rate)) || 0;
        const gst = Math.round(subtotal * 0.1 * 100) / 100;
        const total = subtotal + gst;
        const entryDate = inv.issue_date
          ? new Date(String(inv.issue_date)).toISOString().slice(0, 10)
          : today;

        // Load customer name
        let contactName: string | null = null;
        if (inv.customer_id) {
          const [custRows] = await db.execute(sql`SELECT name FROM customers WHERE id = ${inv.customer_id} LIMIT 1`) as unknown as [Array<{ name: string }>, unknown];
          contactName = custRows?.[0]?.name ?? null;
        }

        await db.execute(sql`
          INSERT INTO job_cost_ledger
            (company_id, job_id, job_number, job_title, entry_date, event_type, source_module, source_id,
             description, qty, unit, rate, subtotal, gst, total, gst_inclusive,
             account_code, tax_code, contact_name, contact_type, reference, status,
             created_by_user_id, created_by_name)
          VALUES
            (${profile.companyId}, ${jobId}, ${job.jobNumber ?? null}, ${job.name ?? null},
             ${entryDate}, 'INVOICE_LINE', 'invoice_line', ${String(line.id)},
             ${String(line.description ?? '')}, ${qty}, ${line.unit ? String(line.unit) : null}, ${rate},
             ${subtotal}, ${gst}, ${total}, 0,
             ${DEFAULT_ACCOUNT['INVOICE_LINE']}, 'GST',
             ${contactName}, 'customer', ${inv.invoice_number ?? null}, 'approved',
             ${session.user.id}, ${session.user.name ?? null})
        `);
        existingKeys.add(key);
        inserted++;
      }
    }

    // ── 3. Job costs (receipts / purchases) ────────────────────────────────
    const [costRows] = await db.execute(sql`
      SELECT jc.*, u.name as user_name
      FROM job_costs jc
      LEFT JOIN user u ON u.id = jc.user_id
      WHERE jc.company_id = ${profile.companyId} AND jc.job_id = ${jobId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    for (const cost of (costRows ?? [])) {
      const key = `job_cost:${cost.id}`;
      if (existingKeys.has(key)) continue;

      const subtotal = parseFloat(String(cost.amount_ex_gst ?? cost.amount ?? 0));
      const gst = parseFloat(String(cost.gst_amount ?? 0));
      const total = subtotal + gst;
      const entryDate = cost.purchase_date
        ? new Date(String(cost.purchase_date)).toISOString().slice(0, 10)
        : today;

      await db.execute(sql`
        INSERT INTO job_cost_ledger
          (company_id, job_id, job_number, job_title, entry_date, event_type, source_module, source_id,
           description, qty, unit, rate, subtotal, gst, total, gst_inclusive,
           account_code, tax_code, contact_name, contact_type, reference, status,
           created_by_user_id, created_by_name)
        VALUES
          (${profile.companyId}, ${jobId}, ${job.jobNumber ?? null}, ${job.name ?? null},
           ${entryDate}, 'RECEIPT', 'job_cost', ${String(cost.id)},
           ${String(cost.description ?? '')}, 1, null, ${subtotal},
           ${subtotal}, ${gst}, ${total}, ${cost.gst_included ? 1 : 0},
           ${DEFAULT_ACCOUNT['RECEIPT']}, 'GST',
           ${cost.merchant ? String(cost.merchant) : null}, 'supplier',
           ${cost.notes ? String(cost.notes) : null}, 'approved',
           ${session.user.id}, ${session.user.name ?? null})
      `);
      existingKeys.add(key);
      inserted++;
    }

    res.json({ ok: true, inserted, message: `${inserted} entries imported into the ledger.` });
  } catch (err) {
    console.error('POST /api/jobs/:id/ledger/sync error:', err);
    res.status(500).json({ error: 'Failed to sync ledger' });
  }
}
