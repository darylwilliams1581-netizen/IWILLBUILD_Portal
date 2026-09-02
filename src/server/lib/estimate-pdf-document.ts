import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { estimateLines, estimates } from '../db/schema.js';
import { generateEstimatePdf } from './pdf-generator.js';

export interface EstimatePdfDocument {
  pdfBytes: Uint8Array;
  filename: string;
  estimateId: number;
  estimateTitle: string;
  estimateStatus: string;
  companyName: string;
  customerName: string;
  customerEmail: string;
  total: number;
}

/** Build the canonical quote PDF used by both download and email. */
export async function buildEstimatePdfDocument(companyId: number, estimateId: number): Promise<EstimatePdfDocument | null> {
  const estimate = await db.query.estimates.findFirst({
    where: and(eq(estimates.id, estimateId), eq(estimates.companyId, companyId)),
  });
  if (!estimate) return null;

  const lines = await db.select().from(estimateLines)
    .where(eq(estimateLines.estimateId, estimateId))
    .orderBy(asc(estimateLines.lineOrder), asc(estimateLines.id));

  const [companyRows] = await db.execute(sql`
    SELECT name, abn, phone, email, website, address
    FROM companies WHERE id = ${companyId} LIMIT 1
  `) as unknown as [Array<Record<string, string>>, unknown];
  const company = companyRows?.[0] ?? {};

  let pdfSettings: Record<string, string> = {};
  try {
    const [settingsRows] = await db.execute(sql`
      SELECT pdf_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1
    `) as unknown as [Array<{ pdf_json?: string }>, unknown];
    const raw = settingsRows?.[0]?.pdf_json;
    if (raw) pdfSettings = JSON.parse(raw) as Record<string, string>;
  } catch { /* settings are optional */ }

  let jobName = '';
  let jobNumber = '';
  let jobAddress = '';
  let clientName = '';
  let customerName = '';
  let customerEmail = '';
  if (estimate.jobId) {
    try {
      const [jobRows] = await db.execute(sql`
        SELECT j.name, j.job_number, j.address, j.client,
               c.name AS customer_name, c.email AS customer_email
        FROM jobs j
        LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = j.company_id
        WHERE j.id = ${estimate.jobId} AND j.company_id = ${companyId}
        LIMIT 1
      `) as unknown as [Array<Record<string, string>>, unknown];
      const job = jobRows?.[0];
      if (job) {
        jobName = String(job.name ?? '');
        jobNumber = String(job.job_number ?? '');
        jobAddress = String(job.address ?? '');
        clientName = String(job.customer_name ?? job.client ?? '');
        customerName = clientName;
        customerEmail = String(job.customer_email ?? '');
      }
    } catch {
      const [jobRows] = await db.execute(sql`
        SELECT name, job_number, address, client FROM jobs
        WHERE id = ${estimate.jobId} AND company_id = ${companyId} LIMIT 1
      `) as unknown as [Array<Record<string, string>>, unknown];
      const job = jobRows?.[0];
      if (job) {
        jobName = String(job.name ?? '');
        jobNumber = String(job.job_number ?? '');
        jobAddress = String(job.address ?? '');
        clientName = String(job.client ?? '');
        customerName = clientName;
      }
    }
  }

  const markup = Number(estimate.markupPercent ?? 0) || 0;
  const subtotal = lines.reduce((sum, line) => {
    return sum + (Number(line.quantity ?? 0) || 0) * (Number(line.rate ?? 0) || 0);
  }, 0);
  const afterMarkup = subtotal * (1 + markup / 100);
  const total = estimate.gstMode === 'Add 10% GST' ? afterMarkup * 1.1 : afterMarkup;

  const pdfBytes = await generateEstimatePdf({
    id: estimate.id,
    title: estimate.title,
    status: estimate.status ?? 'Draft',
    markup_percent: estimate.markupPercent ?? 0,
    gst_mode: estimate.gstMode ?? 'No GST',
    notes: estimate.notes ?? '',
    valid_until: String((estimate as Record<string, unknown>).valid_until ?? ''),
    company_name: String(company.name ?? ''),
    company_abn: String(company.abn ?? ''),
    company_phone: String(company.phone ?? ''),
    company_email: String(company.email ?? ''),
    company_address: String(company.address ?? ''),
    job_name: jobName,
    job_number: jobNumber,
    job_address: jobAddress,
    client_name: clientName,
    header_text: pdfSettings.headerText ?? '',
    footer_text: pdfSettings.footerText ?? '',
    disclaimer: pdfSettings.estimateDisclaimer ?? '',
    payment_terms: pdfSettings.paymentTerms ?? '',
    acceptance_note: pdfSettings.acceptanceNote ?? '',
    lines: lines.map((line) => ({
      category: String((line as Record<string, unknown>).category ?? ''),
      description: line.description,
      quantity: line.quantity,
      unit: line.unit ?? '',
      rate: line.rate,
      lineOrder: line.lineOrder,
    })),
  });

  const safeTitle = estimate.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'quote';
  return {
    pdfBytes,
    filename: `quote-${estimate.id}-${safeTitle}.pdf`,
    estimateId: estimate.id,
    estimateTitle: estimate.title,
    estimateStatus: estimate.status ?? 'Draft',
    companyName: String(company.name ?? 'IWIIlBUILD'),
    customerName,
    customerEmail,
    total,
  };
}
