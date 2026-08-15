/**
 * Canonical invoice PDF builder.
 *
 * Used by both the authenticated export endpoint and the public
 * token-scoped share content endpoint so both produce identical output.
 */
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { generateInvoicePdf } from './pdf-generator.js';

export interface InvoicePdfDocument {
  pdfBytes: Uint8Array;
  filename: string;
  invoiceId: number;
  invoiceNumber: string;
  invoiceStatus: string;
  companyName: string;
  customerName: string;
  customerEmail: string;
  total: number;
}

/** Build the canonical invoice PDF used by both download and share. */
export async function buildInvoicePdfDocument(
  companyId: number,
  invoiceId: number,
): Promise<InvoicePdfDocument | null> {
  const [rows] = await db.execute(sql`
    SELECT i.*,
           j.name as job_name, j.job_number, j.address as job_address,
           c.name as customer_name, c.contact_person as customer_contact,
           c.email as customer_email, c.phone as customer_phone,
           c.address as customer_address, c.abn as customer_abn
    FROM invoices i
    LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
    LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
    WHERE i.id = ${invoiceId} AND i.company_id = ${companyId}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.length) return null;
  const inv = rows[0];

  const [lineRows] = await db.execute(
    sql`SELECT * FROM invoice_lines WHERE invoice_id = ${invoiceId} ORDER BY sort_order ASC, id ASC`,
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  const [paymentRows] = await db.execute(
    sql`SELECT SUM(amount) as total_paid FROM invoice_payments WHERE invoice_id = ${invoiceId}`,
  ) as unknown as [Array<{ total_paid?: number }>, unknown];
  const amtPaid = Number(paymentRows?.[0]?.total_paid ?? 0);

  const [companyRows] = await db.execute(
    sql`SELECT name, abn, phone, email, address FROM companies WHERE id = ${companyId} LIMIT 1`,
  ) as unknown as [Array<Record<string, string>>, unknown];
  const company = companyRows?.[0] ?? {};

  let pdfSettings: Record<string, string> = {};
  try {
    const [settingsRows] = await db.execute(
      sql`SELECT pdf_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1`,
    ) as unknown as [Array<{ pdf_json?: string }>, unknown];
    const raw = settingsRows?.[0]?.pdf_json;
    if (raw) pdfSettings = JSON.parse(raw) as Record<string, string>;
  } catch { /* settings are optional */ }

  const pdfBytes = await generateInvoicePdf({
    id:                   invoiceId,
    invoice_number:       String(inv.invoice_number ?? ''),
    status:               String(inv.status ?? 'draft'),
    issue_date:           String(inv.issue_date ?? ''),
    due_date:             String(inv.due_date ?? ''),
    notes:                String(inv.notes ?? ''),
    payment_terms:        pdfSettings.paymentTerms ?? '',
    stripe_payment_link:  String(inv.stripe_payment_link ?? ''),
    company_name:         String(company.name ?? ''),
    company_abn:          String(company.abn ?? ''),
    company_phone:        String(company.phone ?? ''),
    company_email:        String(company.email ?? ''),
    company_address:      String(company.address ?? ''),
    customer_name:        String(inv.customer_name ?? ''),
    customer_email:       String(inv.customer_email ?? ''),
    customer_phone:       String(inv.customer_phone ?? ''),
    customer_address:     String(inv.customer_address ?? ''),
    customer_abn:         String(inv.customer_abn ?? ''),
    job_name:             String(inv.job_name ?? ''),
    job_number:           String(inv.job_number ?? ''),
    job_address:          String(inv.job_address ?? ''),
    subtotal:             Number(inv.subtotal ?? 0),
    gst_total:            Number(inv.gst_amount ?? 0),
    total:                Number(inv.total ?? 0),
    amount_paid:          amtPaid,
    amount_due:           Math.max(0, Number(inv.total ?? 0) - amtPaid),
    lines: (lineRows ?? []).map((l) => ({
      description: String(l.description ?? ''),
      quantity:    Number(l.quantity ?? 1),
      unit_price:  Number(l.rate ?? l.unit_price ?? 0),
      amount:      Number(l.amount ?? 0),
      gst_amount:  Number(l.gst_amount ?? 0),
      sort_order:  Number(l.sort_order ?? 0),
    })),
  });

  const invNum = inv.invoice_number ? String(inv.invoice_number) : String(invoiceId);
  const filename = `invoice-${invNum}.pdf`;

  return {
    pdfBytes,
    filename,
    invoiceId,
    invoiceNumber: invNum,
    invoiceStatus: String(inv.status ?? 'draft'),
    companyName: String(company.name ?? 'IWILLBUILD'),
    customerName: String(inv.customer_name ?? ''),
    customerEmail: String(inv.customer_email ?? ''),
    total: Number(inv.total ?? 0),
  };
}
