// ── Types ─────────────────────────────────────────────────────────────────────

export const ASSET_TYPES = ['Vehicle', 'Plant', 'Trailer', 'Tool', 'Other'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ['Active', 'Maintenance', 'Out of Service', 'Archived'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export interface FleetAsset {
  id: number;
  companyId: number;
  name: string;
  assetNumber: string | null;
  type: string;
  makeModel: string | null;
  rego: string | null;
  regoNotApplicable: boolean;
  serviceDate: string | null;
  regoExpiry: string | null;
  status: string;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FleetPrestart {
  id: number;
  assetId: number;
  companyId: number;
  userId: string;
  operatorName: string | null;
  kmHours: string | null;
  safeToOperate: boolean;
  issueNeedsAttention: boolean;
  issueComment: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FleetFlags {
  totalFlags: number;
  attentionFlags: Array<{ assetId: number; assetName: string; comment: string | null; date: string | null }>;
  dueDateFlags: Array<{ assetId: number; assetName: string; type: 'service' | 'rego'; dueDate: string }>;
  activeAssetCount: number;
}

// ── Status helpers ────────────────────────────────────────────────────────────

export function getAssetStatusStyle(status: string) {
  switch (status) {
    case 'Active':         return { bg: 'bg-emerald-50 border-emerald-200', color: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'Maintenance':    return { bg: 'bg-blue-50 border-blue-200',       color: 'text-blue-700',    dot: 'bg-blue-500' };
    case 'Out of Service': return { bg: 'bg-red-50 border-red-200',         color: 'text-red-700',     dot: 'bg-red-500' };
    case 'Archived':       return { bg: 'bg-slate-100 border-slate-200',    color: 'text-slate-500',   dot: 'bg-slate-400' };
    default:               return { bg: 'bg-slate-100 border-slate-200',    color: 'text-slate-600',   dot: 'bg-slate-400' };
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

export async function fetchFleet(includeArchived = false): Promise<FleetAsset[]> {
  const url = includeArchived ? '/api/fleet?archived=true' : '/api/fleet';
  const data = await apiFetch<{ assets: FleetAsset[] }>(url);
  return data.assets;
}

export async function fetchAsset(id: number): Promise<FleetAsset> {
  const data = await apiFetch<{ asset: FleetAsset }>(`/api/fleet/${id}`);
  return data.asset;
}

export interface CreateAssetPayload {
  name: string;
  assetNumber?: string;
  type: string;
  makeModel?: string;
  rego?: string;
  regoNotApplicable?: boolean;
  serviceDate?: string;
  regoExpiry?: string;
  status?: string;
  notes?: string;
}

export async function createAsset(payload: CreateAssetPayload): Promise<FleetAsset> {
  const data = await apiFetch<{ asset: FleetAsset }>('/api/fleet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.asset;
}

export async function updateAsset(id: number, payload: Partial<CreateAssetPayload & { archived: boolean }>): Promise<FleetAsset> {
  const data = await apiFetch<{ asset: FleetAsset }>(`/api/fleet/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.asset;
}

export interface CreatePrestartPayload {
  kmHours?: string;
  safeToOperate: boolean;
  issueNeedsAttention: boolean;
  issueComment?: string;
  notes?: string;
}

export async function submitPrestart(assetId: number, payload: CreatePrestartPayload): Promise<FleetPrestart> {
  const data = await apiFetch<{ prestart: FleetPrestart }>(`/api/fleet/${assetId}/prestarts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.prestart;
}

export async function fetchPrestarts(assetId: number): Promise<FleetPrestart[]> {
  const data = await apiFetch<{ prestarts: FleetPrestart[] }>(`/api/fleet/${assetId}/prestarts`);
  return data.prestarts;
}

export async function fetchFleetFlags(): Promise<FleetFlags> {
  return apiFetch<FleetFlags>('/api/fleet/flags');
}
