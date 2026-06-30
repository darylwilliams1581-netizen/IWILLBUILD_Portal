/**
 * GET /api/jobs/:id/ledger/export?format=standard|myob|xero|excel
 * Exports the job cost ledger as a CSV in the requested format.
 * Only approved entries are exported by default (?status=all to include pending).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobs, profiles } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

type LedgerRow = Record<string, unknown>;

function esc(v: unknown): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: unknown[]): string {
  return cells.map(esc).join(',');
}

function fmtDate(d: unknown): string {
  if (!d) return '';
  try { return new Date(String(d)).toLocaleDateString('en-AU'); } catch { return String(d); }
}

function num(v: unknown, dp = 2): string {
  return (parseFloat(String(v ?? 0)) || 0).toFixed(dp);
}

// ── Standard IWILLBUILD ledger CSV ──────────────────────────────────────────
function buildStandard(entries: LedgerRow[], jobNum: string, jobTitle: string): string {
  const header = row([
    'entry_id', 'date', 'job_id', 'job_number', 'job_title',
    'event_type', 'source_module', 'source_id',
    'description', 'qty', 'unit', 'rate',
    'subtotal', 'gst', 'total', 'gst_inclusive',
    'account_code', 'tax_code',
    'contact', 'contact_type', 'reference',
    'status', 'approved_by', 'approved_at', 'created_by', 'created_at',
  ]);
  const lines = entries.map((e) => row([
    e.id, e.entry_date, e.job_id, e.job_number ?? jobNum, e.job_title ?? jobTitle,
    e.event_type, e.source_module, e.source_id ?? '',
    e.description, e.qty, e.unit ?? '', e.rate,
    e.subtotal, e.gst, e.total, e.gst_inclusive ? 'Y' : 'N',
    e.account_code ?? '', e.tax_code ?? 'GST',
    e.contact_name ?? '', e.contact_type ?? '', e.reference ?? '',
    e.status, e.approved_by ?? '', fmtDate(e.approved_at), e.created_by_name ?? '', fmtDate(e.created_at),
  ]));
  return [header, ...lines].join('\r\n');
}

// ── MYOB AccountRight / Essentials import format ────────────────────────────
// Matches MYOB "Spend Money" import template
function buildMYOB(entries: LedgerRow[]): string {
  const header = row([
    'Date', 'Account Number', 'Amount', 'Tax Code', 'Tax Amount',
    'Memo', 'Supplier Card', 'Cheque No', 'Job',
  ]);
  const lines = entries.map((e) => row([
    fmtDate(e.entry_date),
    e.account_code ?? '5000',
    num(e.subtotal),
    e.tax_code ?? 'GST',
    num(e.gst),
    e.description,
    e.contact_name ?? '',
    e.reference ?? '',
    e.job_number ?? '',
  ]));
  return [header, ...lines].join('\r\n');
}

// ── Xero CSV import format (Bills / Purchases) ───────────────────────────────
// Matches Xero "Purchases" CSV import
function buildXero(entries: LedgerRow[]): string {
  const header = row([
    '*ContactName', 'EmailAddress', 'POAddressLine1', 'POCity', 'PORegion', 'POPostalCode', 'POCountry',
    '*InvoiceNumber', '*InvoiceDate', '*DueDate', 'Total',
    '*AccountCode', '*Description', '*Quantity', '*UnitAmount', 'Discount', '*TaxType', 'TaxAmount',
    'TrackingName1', 'TrackingOption1', 'Currency',
  ]);
  const lines = entries.map((e) => row([
    e.contact_name ?? 'Unknown Supplier',
    '', '', '', '', '', '',
    e.reference ?? `LDG-${e.id}`,
    fmtDate(e.entry_date),
    fmtDate(e.entry_date),
    num(e.total),
    e.account_code ?? '5000',
    e.description,
    num(e.qty, 3),
    num(e.rate),
    '0',
    'GST on Expenses',
    num(e.gst),
    'Job', e.job_number ?? '',
    'AUD',
  ]));
  return [header, ...lines].join('\r\n');
}

// ── Excel-friendly (tab-separated, UTF-8 BOM) ────────────────────────────────
function buildExcel(entries: LedgerRow[], jobNum: string, jobTitle: string): string {
  const BOM = '\uFEFF';
  const sep = '\t';
  const headers = [
    'ID', 'Date', 'Job Number', 'Job Title', 'Event Type', 'Source',
    'Description', 'Qty', 'Unit', 'Rate', 'Subtotal', 'GST', 'Total',
    'Account Code', 'Tax Code', 'Contact', 'Reference', 'Status', 'Approved By',
  ];
  const lines = entries.map((e) => [
    e.id, e.entry_date, e.job_number ?? jobNum, e.job_title ?? jobTitle,
    e.event_type, e.source_module,
    e.description, e.qty, e.unit ?? '', e.rate, e.subtotal, e.gst, e.total,
    e.account_code ?? '', e.tax_code ?? 'GST',
    e.contact_name ?? '', e.reference ?? '', e.status, e.approved_by ?? '',
  ].join(sep));
  return BOM + [headers.join(sep), ...lines].join('\r\n');
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

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const format = String(req.query.format ?? 'standard').toLowerCase();
    const statusFilter = String(req.query.status ?? 'approved');

    let query = sql`
      SELECT * FROM job_cost_ledger
      WHERE company_id = ${profile.companyId} AND job_id = ${jobId}
    `;
    if (statusFilter !== 'all') query = sql`${query} AND status = ${statusFilter}`;
    query = sql`${query} ORDER BY entry_date ASC, id ASC`;

    const [rows] = await db.execute(query) as unknown as [LedgerRow[], unknown];
    const entries = rows ?? [];

    const jobNum = job.jobNumber ?? String(jobId);
    const jobTitle = job.name ?? '';
    const safeTitle = jobNum.replace(/[^a-zA-Z0-9-_]/g, '_');

    let content: string;
    let filename: string;
    let contentType: string;

    if (format === 'myob') {
      content = buildMYOB(entries);
      filename = `${safeTitle}_MYOB_import.csv`;
      contentType = 'text/csv; charset=utf-8';
    } else if (format === 'xero') {
      content = buildXero(entries);
      filename = `${safeTitle}_Xero_import.csv`;
      contentType = 'text/csv; charset=utf-8';
    } else if (format === 'excel') {
      content = buildExcel(entries, jobNum, jobTitle);
      filename = `${safeTitle}_ledger.tsv`;
      contentType = 'text/tab-separated-values; charset=utf-8';
    } else {
      content = buildStandard(entries, jobNum, jobTitle);
      filename = `${safeTitle}_ledger.csv`;
      contentType = 'text/csv; charset=utf-8';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err) {
    console.error('GET /api/jobs/:id/ledger/export error:', err);
    res.status(500).json({ error: 'Failed to export ledger' });
  }
}
