// ── Types ─────────────────────────────────────────────────────────────────────

export const ASSET_TYPES = ['Vehicle', 'Truck', 'Plant', 'Trailer', 'Tool', 'Other'] as const;
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
  vin: string | null;
  rego: string | null;
  regoNotApplicable: boolean;
  serviceDate: string | null;
  regoExpiry: string | null;
  status: string;
  notes: string | null;
  archived: boolean;
  logbookActive: boolean;
  logbookStartedAt: string | null;
  /** Odometer reading at the start of the 12-week logbook period (ATO requirement). */
  logbookOdometerStart: string | null;
  /** Odometer reading at the end of the 12-week logbook period (ATO requirement). */
  logbookOdometerEnd: string | null;
  /** Date the recording period ended (when logbook was deactivated). Null until first deactivation. */
  logbookEndedAt: string | null;
  /** Engine capacity in litres (e.g. "2.0"). Required for ATO logbook export. */
  engineCapacity: string | null;
  createdAt: string;
  updatedAt: string;
}

export const TRIP_PURPOSES = [
  'Site travel',
  'Client meeting',
  'Materials / equipment pickup',
  'Delivery',
  'Office / depot',
  'Vehicle servicing / repairs',
  'Other — specify reason',
] as const;
export type TripPurpose = (typeof TRIP_PURPOSES)[number];

export interface FleetTripLog {
  id: number;
  companyId: number;
  vehicleId: number;
  userId: string;
  startDatetime: string;
  endDatetime: string;
  startLat: string | null;
  startLng: string | null;
  startAddress: string | null;
  endLat: string | null;
  endLng: string | null;
  endAddress: string | null;
  km: string;
  /** Odometer reading at trip start. Null on legacy records. */
  odometerStart: string | null;
  /** Odometer reading at trip end. Null on legacy records. */
  odometerEnd: string | null;
  /** Stable client-generated UUID for idempotent POST. Null on legacy records. */
  clientTripId: string | null;
  purpose: string;
  reason: string | null;
  /** ATO-required: free-text destination / journey description for business trips. */
  destination: string | null;
  businessOrPrivate: 'business' | 'private';
  prestartAtHome: boolean;
  createdAt: string;
  /** Set to true when the trip was auto-inserted after a 12-hour session auto-close. */
  autoClosed?: boolean;
  /** Free-text note recorded when the trip was amended. */
  amendedNote?: string | null;
  /** ISO timestamp of the last amendment. */
  amendedAt?: string | null;
  /** User ID of the person who last amended the trip. */
  amendedBy?: string | null;
}

export interface AmendTripPayload {
  businessOrPrivate?: 'business' | 'private';
  purpose?: string;
  reason?: string | null;
  destination?: string | null;
  odometerStart?: string;
  odometerEnd?: string;
  endDatetime?: string;
  amendedNote?: string;
}

export async function amendTrip(
  vehicleId: number,
  tripId: number,
  payload: AmendTripPayload,
): Promise<FleetTripLog> {
  const data = await apiFetch<{ trip: FleetTripLog }>(
    `/api/fleet/${vehicleId}/trip-logs/${tripId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return data.trip;
}

export interface CreateTripPayload {
  startDatetime: string;
  endDatetime: string;
  startLat?: string | null;
  startLng?: string | null;
  startAddress?: string;
  endLat?: string | null;
  endLng?: string | null;
  endAddress?: string;
  km: string;
  /** Odometer reading at trip start (required for new web entries). */
  odometerStart?: string | null;
  /** Odometer reading at trip end (required for new web entries). */
  odometerEnd?: string | null;
  /** Stable client-generated UUID for idempotent POST. */
  clientTripId?: string | null;
  purpose: string;
  reason?: string | null;
  /** ATO-required: free-text destination / journey description for business trips. */
  destination?: string | null;
  businessOrPrivate: 'business' | 'private';
  prestartAtHome: boolean;
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
  vin?: string;
  rego?: string;
  regoNotApplicable?: boolean;
  serviceDate?: string;
  regoExpiry?: string;
  status?: string;
  notes?: string;
  engineCapacity?: string;
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

export async function deleteAsset(id: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/fleet/${id}`, { method: 'DELETE' });
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

export interface TripLogParams {
  periodId?:         number | null;
  search?:           string;
  bop?:              'business' | 'private' | '';
  needsCompletion?:  boolean;
  dateFrom?:         string;
  dateTo?:           string;
  page?:             number;
  perPage?:          number;
}

export interface TripLogPage {
  trips:         FleetTripLog[];
  total:         number;
  totalKm:       number;
  totalBusiness: number;
  totalPrivate:  number;
  page:          number;
  perPage:       number;
}

export async function fetchTripLogs(
  vehicleId: number,
  params?: TripLogParams,
): Promise<TripLogPage> {
  const q = new URLSearchParams();
  if (params?.periodId)        q.set('periodId',        String(params.periodId));
  if (params?.search)          q.set('search',          params.search);
  if (params?.bop)             q.set('bop',             params.bop);
  if (params?.needsCompletion) q.set('needsCompletion', '1');
  if (params?.dateFrom)        q.set('dateFrom',        params.dateFrom);
  if (params?.dateTo)          q.set('dateTo',          params.dateTo);
  if (params?.page)            q.set('page',            String(params.page));
  if (params?.perPage)         q.set('perPage',         String(params.perPage));
  const qs = q.toString();
  const url = `/api/fleet/${vehicleId}/trip-logs${qs ? `?${qs}` : ''}`;
  return apiFetch<TripLogPage>(url);
}

export async function createTripLog(vehicleId: number, payload: CreateTripPayload): Promise<FleetTripLog> {
  const data = await apiFetch<{ trip: FleetTripLog }>(`/api/fleet/${vehicleId}/trip-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data.trip;
}

export function getTripLogExportUrl(vehicleId: number): string {
  return `/api/fleet/${vehicleId}/trip-logs/export`;
}

/** Haversine distance in km between two lat/lng pairs */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Weeks elapsed since logbook started (capped at 12) */
export function logbookWeeksElapsed(logbookStartedAt: string | null): number {
  if (!logbookStartedAt) return 0;
  const ms = Date.now() - new Date(logbookStartedAt).getTime();
  return Math.min(12, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}
