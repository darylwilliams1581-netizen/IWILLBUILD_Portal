// Shared types and API helpers for Invoices

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void';

export interface InvoiceLine {
  id: number;
  invoice_id: number;
  description: string;
  quantity: string;
  unit: string | null;
  rate: string;
  amount: string;
  sort_order: number;
}

export interface InvoicePayment {
  id: number;
  invoice_id: number;
  payment_date: string;
  amount: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface Invoice {
  id: number;
  company_id: number;
  job_id: number | null;
  customer_id: number | null;
  invoice_number: string;
  title: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  subtotal: string;
  gst_amount: string;
  total: string;
  amount_paid: string;
  balance_due: string;
  notes: string | null;
  terms: string | null;
  accounting_provider: string | null;
  accounting_invoice_id: string | null;
  accounting_sync_status: string | null;
  accounting_sync_error: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  job_name?: string | null;
  job_number?: string | null;
  customer_name?: string | null;
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
}

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Part Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

export const STATUS_COLORS: Record<InvoiceStatus, { bg: string; text: string; border: string; dot: string }> = {
  draft:          { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200', dot: 'bg-slate-400' },
  sent:           { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',  dot: 'bg-blue-500' },
  partially_paid: { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200', dot: 'bg-amber-500' },
  paid:           { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  overdue:        { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',   dot: 'bg-red-500' },
  void:           { bg: 'bg-slate-100',   text: 'text-slate-400',   border: 'border-slate-200', dot: 'bg-slate-300' },
};

export function fmtMoney(val: string | number | null | undefined): string {
  const n = parseFloat(String(val ?? '0')) || 0;
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

export async function fetchInvoices(params?: { jobId?: number; status?: string }): Promise<Invoice[]> {
  const q = new URLSearchParams();
  if (params?.jobId) q.set('jobId', String(params.jobId));
  if (params?.status) q.set('status', params.status);
  const res = await fetch(`/api/invoices?${q}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch invoices');
  const d = await res.json() as { invoices: Invoice[] };
  return d.invoices;
}

export async function fetchInvoice(id: number): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch invoice');
  const d = await res.json() as { invoice: Invoice };
  return d.invoice;
}

export async function createInvoice(payload: Partial<Invoice> & { lines?: Partial<InvoiceLine>[] }): Promise<Invoice> {
  const res = await fetch('/api/invoices', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to create invoice');
  return d.invoice;
}

export async function updateInvoice(id: number, payload: Partial<Invoice> & { lines?: Partial<InvoiceLine>[] }): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to update invoice');
  return d.invoice;
}

export async function deleteInvoice(id: number): Promise<void> {
  const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(d.error ?? 'Failed to delete invoice');
  }
}

export async function duplicateInvoice(id: number): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}/duplicate`, { method: 'POST', credentials: 'include' });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to duplicate');
  return d.invoice;
}

export async function markInvoiceSent(id: number): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}/mark-sent`, { method: 'POST', credentials: 'include' });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to mark sent');
  return d.invoice;
}

export async function recordPayment(id: number, payload: {
  payment_date: string; amount: number; method?: string; reference?: string; notes?: string;
}): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}/record-payment`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to record payment');
  return d.invoice;
}

export async function voidInvoice(id: number): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}/void`, { method: 'POST', credentials: 'include' });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to void invoice');
  return d.invoice;
}
