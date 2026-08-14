/**
 * Shared helper: fetch all data for an estimate, generate the PDF, and return
 * a structured result that both the export-pdf (GET) and send-email (POST)
 * handlers can consume without duplicating the DB queries.
 */
import { db } from '../db/client.js';
import { estimates, estimateLines, profiles } from '../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import { generateEstimatePdf } from './pdf-generator.js';

export interface EstimatePdfDocument {
  /** Numeric estimate ID */
  estimateId: number;
  /** Human-readable title */
  estimateTitle: string;
  /** Computed grand total (inc. GST where applicable) */
  total: number;
  /** Company name from the companies table */
  companyName: string;
  /** Customer / client name from the linked job (may be empty) */
  customerName: string;
  /** Customer email from the linked job (may be empty) */
  customerEmail: string;
  /** Suggested attachment filename */
  filename: string;
  /** Raw PDF bytes */
  pdfBytes: Uint8Array;
}

/**
 * Build the canonical estimate PDF for `estimateId` belonging to `companyId`.
 * Returns `null` when the estimate does not exist or belongs to a different company.
 */
export async function buildEstimatePdfDocument(
  companyId: number,
  estimateId: number,
): Promise<EstimatePdfDocument | null> {
  // ── Estimate ──────────────────────────────────────────────────────────────
  const estimate = await db.query.estimates.findFirst({
    where: and(eq(estimates.id, estimateId), eq(estimates.companyId, companyId)),
  });
  if (!estimate) return null;

  // ── Lines ─────────────────────────────────────────────────────────────────
  const lines = await db
    .select()
    .from(estimateLines)
    .where(eq(estimateLines.estimateId, estimateId))
    .orderBy(asc(estimateLines.lineOrder), asc(estimateLines.id));

  // ── Company ───────────────────────────────────────────────────────────────
  const [companyRows] = await db.execute(
    sql`SELECT name, abn, phone, email, website, address FROM companies WHERE id = ${companyId} LIMIT 1`,
  ) as unknown as [Array<Record<string, string>>, unknown];
  const company = companyRows?.[0] ?? {};

  // ── PDF branding settings ─────────────────────────────────────────────────
  let pdfSettings: Record<string, string> = {};
  try {
    const [settingsRows] = await db.execute(
      sql`SELECT pdf_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1`,
    ) as unknown as [Array<{ pdf_json?: string }>, unknown];
    const raw = settingsRows?.[0]?.pdf_json;
    if (raw) pdfSettings = JSON.parse(raw) as Record<string, string>;
  } catch { /* column missing or no settings row — proceed without branding */ }

  // ── Job details (for client name, address, email) ─────────────────────────
  let jobName = '';
  let jobNumber = '';
  let jobAddress = '';
  let clientName = '';
  let clientEmail = '';
  if (estimate.jobId) {
    const [jobRows] = await db.execute(
      sql`SELECT name, job_number, address, client, client_email FROM jobs WHERE id = ${estimate.jobId} AND company_id = ${companyId} LIMIT 1`,
    ) as unknown as [Array<Record<string, string>>, unknown];
    const job = jobRows?.[0];
    if (job) {
      jobName     = String(job.name ?? '');
      jobNumber   = String(job.job_number ?? '');
      jobAddress  = String(job.address ?? '');
      clientName  = String(job.client ?? '');
      clientEmail = String(job.client_email ?? '');
    }
  }

  // ── Generate PDF ──────────────────────────────────────────────────────────
  const pdfBytes = await generateEstimatePdf({
    id:              estimate.id,
    title:           estimate.title,
    status:          estimate.status ?? 'draft',
    markup_percent:  estimate.markupPercent ?? 0,
    gst_mode:        estimate.gstMode ?? 'inclusive',
    notes:           (estimate as Record<string, unknown>).notes as string ?? '',
    valid_until:     (estimate as Record<string, unknown>).valid_until as string ?? '',
    company_name:    String(company.name ?? ''),
    company_abn:     String(company.abn ?? ''),
    company_phone:   String(company.phone ?? ''),
    company_email:   String(company.email ?? ''),
    company_address: String(company.address ?? ''),
    job_name:        jobName,
    job_number:      jobNumber,
    job_address:     jobAddress,
    client_name:     clientName,
    header_text:     pdfSettings.headerText ?? '',
    footer_text:     pdfSettings.footerText ?? '',
    disclaimer:      pdfSettings.estimateDisclaimer ?? '',
    payment_terms:   pdfSettings.paymentTerms ?? '',
    acceptance_note: pdfSettings.acceptanceNote ?? '',
    lines: lines.map((l) => ({
      category:    (l as Record<string, unknown>).category as string ?? '',
      description: l.description,
      quantity:    l.quantity,
      unit:        l.unit ?? '',
      rate:        l.rate,
      lineOrder:   l.lineOrder,
    })),
  });

  // ── Compute grand total for email body ────────────────────────────────────
  // GST modes stored in DB: 'No GST' | 'Add 10% GST'
  const markup = Number(estimate.markupPercent ?? 0);
  const gstMode = (estimate.gstMode ?? 'No GST').toLowerCase();
  // 'add 10% gst' → exclusive (add GST on top); 'no gst' → no GST
  const hasGst = gstMode === 'add 10% gst';
  let subtotalEx = 0;
  for (const l of lines) {
    subtotalEx += Number(l.quantity ?? 0) * Number(l.rate ?? 0);
  }
  if (markup > 0) subtotalEx = subtotalEx * (1 + markup / 100);
  const gstAmount = hasGst ? subtotalEx * 0.1 : 0;
  const total = subtotalEx + gstAmount;

  const slug = estimate.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const filename = `estimate-${estimate.id}-${slug}.pdf`;

  return {
    estimateId:    estimate.id,
    estimateTitle: estimate.title,
    total,
    companyName:   String(company.name ?? ''),
    customerName:  clientName,
    customerEmail: clientEmail,
    filename,
    pdfBytes,
  };
}
