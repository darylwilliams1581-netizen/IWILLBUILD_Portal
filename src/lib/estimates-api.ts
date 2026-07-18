// ── Types ─────────────────────────────────────────────────────────────────────

export const ESTIMATE_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Archived'] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const GST_MODES = ['No GST', 'Add 10% GST'] as const;
export type GstMode = (typeof GST_MODES)[number];

export interface Estimate {
  id: number;
  jobId: number;
  companyId: number;
  title: string;
  status: EstimateStatus;
  markupPercent: string;
  gstMode: GstMode;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Computed total returned by the list endpoint (not present on single-estimate fetch) */
  total?: number;
  /** Lock fields — set when estimate has been converted to an invoice */
  locked?: number | boolean | null;
  locked_at?: string | null;
  locked_invoice_id?: number | null;
  invoice_exists?: boolean | null;
}

export interface EstimateLine {
  id: number;
  estimateId: number;
  description: string;
  quantity: string;
  unit: string | null;
  rate: string;
  lineOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Calc helpers ──────────────────────────────────────────────────────────────

export function lineCalc(line: Pick<EstimateLine, 'quantity' | 'rate'>): number {
  const qty = parseFloat(line.quantity) || 0;
  const rate = parseFloat(line.rate) || 0;
  return qty * rate;
}

export function estimateTotals(
  lines: Pick<EstimateLine, 'quantity' | 'rate'>[],
  markupPercent: string,
  gstMode: GstMode,
) {
  const subtotal = lines.reduce((sum, l) => sum + lineCalc(l), 0);
  const markup = (parseFloat(markupPercent) || 0) / 100;
  const afterMarkup = subtotal * (1 + markup);
  const gst = gstMode === 'Add 10% GST' ? afterMarkup * 0.1 : 0;
  const total = afterMarkup + gst;
  return { subtotal, markupAmount: afterMarkup - subtotal, afterMarkup, gst, total };
}

export function getEstimateStatusStyle(status: string) {
  switch (status) {
    case 'Draft':     return { bg: 'bg-slate-100 border-slate-200',    color: 'text-slate-600',   dot: 'bg-slate-400' };
    case 'Submitted': return { bg: 'bg-blue-50 border-blue-200',       color: 'text-blue-700',    dot: 'bg-blue-500' };
    case 'Approved':  return { bg: 'bg-emerald-50 border-emerald-200', color: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'Rejected':  return { bg: 'bg-red-50 border-red-200',         color: 'text-red-700',     dot: 'bg-red-500' };
    case 'Archived':  return { bg: 'bg-slate-100 border-slate-200',    color: 'text-slate-400',   dot: 'bg-slate-300' };
    default:          return { bg: 'bg-slate-100 border-slate-200',    color: 'text-slate-600',   dot: 'bg-slate-400' };
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

export async function fetchEstimates(jobId: number): Promise<Estimate[]> {
  const data = await apiFetch<{ estimates: Estimate[] }>(`/api/estimates?jobId=${jobId}`);
  return data.estimates;
}

export async function fetchEstimate(id: number): Promise<{ estimate: Estimate; lines: EstimateLine[] }> {
  return apiFetch<{ estimate: Estimate; lines: EstimateLine[] }>(`/api/estimates/${id}`);
}

export interface CreateEstimatePayload {
  jobId: number;
  title: string;
  status?: string;
  markupPercent?: string;
  gstMode?: string;
  notes?: string;
  lines?: Array<{ description: string; quantity?: string; unit?: string; rate?: string; lineOrder?: number }>;
}

export async function createEstimate(payload: CreateEstimatePayload): Promise<Estimate> {
  const data = await apiFetch<{ estimate: Estimate }>('/api/estimates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.estimate;
}

export interface UpdateEstimatePayload {
  title?: string;
  status?: string;
  markupPercent?: string;
  gstMode?: string;
  notes?: string;
  lines?: Array<{ id?: number; description: string; quantity?: string; unit?: string; rate?: string; lineOrder?: number }>;
}

export async function updateEstimate(id: number, payload: UpdateEstimatePayload): Promise<{ estimate: Estimate; lines: EstimateLine[] }> {
  return apiFetch<{ estimate: Estimate; lines: EstimateLine[] }>(`/api/estimates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteEstimate(id: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/estimates/${id}`, { method: 'DELETE' });
}

/** Quick status-only patch — used from the job estimates list */
export async function patchEstimateStatus(id: number, status: string): Promise<Estimate> {
  const data = await apiFetch<{ estimate: Estimate }>(`/api/estimates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return data.estimate;
}
