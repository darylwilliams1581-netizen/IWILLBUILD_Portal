/**
 * Program of Works — shared types, status calculations, and duration helpers.
 * Used by all three Progress entry points:
 *   - JobProgress.tsx (job tab)
 *   - job-progress-page.tsx (standalone page)
 *   - WorkProgressTab.tsx (company-wide register)
 * and by all server-side handlers.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProgressSection {
  id: number;
  jobId: number;
  companyId: number;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProgressActivity {
  id: number;
  jobId: number;
  companyId: number;
  sectionId: number | null;
  description: string;
  percentComplete: number;
  progressNote: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  // Assignment (existing columns — preserved)
  assignmentType?: string | null;
  assignedToName?: string | null;
  tradeType?: string | null;
  contractorId?: number | null;
  // Financial fields — preserved internally, NOT shown in PoW UI
  quantity?: string;
  unit?: string | null;
  rate?: string;
  estimateLineId?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PowPayload {
  sections: ProgressSection[];
  activities: ProgressActivity[];
}

// ── Status ────────────────────────────────────────────────────────────────────

export type ActivityStatus = 'Complete' | 'Overdue' | 'In Progress' | 'Not Started';

/**
 * Canonical status function — single source of truth for all PoW consumers.
 * Complete  → percentComplete === 100
 * Overdue   → pct < 100 AND endDate is before today
 * In Progress → pct > 0
 * Not Started → otherwise
 */
export function calcStatus(
  percentComplete: number,
  endDate: string | null | undefined,
  today: string = todayISO(),
): ActivityStatus {
  if (percentComplete >= 100) return 'Complete';
  if (endDate && endDate < today) return 'Overdue';
  if (percentComplete > 0) return 'In Progress';
  return 'Not Started';
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Duration ──────────────────────────────────────────────────────────────────

/**
 * Inclusive calendar-day duration.
 * Same start and end = 1 day. Returns null when either date is missing.
 * No timezone shifting — treats dates as plain calendar values.
 */
export function calcDuration(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number | null {
  if (!startDate || !endDate) return null;
  const s = parseDateLocal(startDate);
  const e = parseDateLocal(endDate);
  if (!s || !e) return null;
  const diffMs = e.getTime() - s.getTime();
  if (diffMs < 0) return null; // end before start
  return Math.floor(diffMs / 86_400_000) + 1;
}

function parseDateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function fmtDuration(days: number | null): string {
  if (days === null) return '';
  if (days === 1) return '1 day';
  return `${days} days`;
}

// ── Progress calculations ─────────────────────────────────────────────────────

/**
 * Overall job progress = simple arithmetic mean of all activity percentages.
 * Section headings are excluded. Returns 0 for an empty program.
 */
export function calcOverallPct(activities: Pick<ProgressActivity, 'percentComplete'>[]): number {
  if (activities.length === 0) return 0;
  const sum = activities.reduce((s, a) => s + a.percentComplete, 0);
  return Math.round(sum / activities.length);
}

/**
 * Section progress = simple arithmetic mean of activities in that section.
 * Returns null for an empty section.
 */
export function calcSectionPct(
  activities: Pick<ProgressActivity, 'percentComplete' | 'sectionId'>[],
  sectionId: number,
): number | null {
  const mine = activities.filter((a) => a.sectionId === sectionId);
  if (mine.length === 0) return null;
  const sum = mine.reduce((s, a) => s + a.percentComplete, 0);
  return Math.round(sum / mine.length);
}

// ── Status badge colours ──────────────────────────────────────────────────────

export const STATUS_CLASSES: Record<ActivityStatus, string> = {
  Complete:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  Overdue:      'bg-red-100 text-red-700 border-red-200',
  'In Progress':'bg-blue-100 text-blue-700 border-blue-200',
  'Not Started':'bg-muted text-muted-foreground border-border',
};

// ── CSV injection guard ───────────────────────────────────────────────────────

export function csvEsc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Guard against formula injection
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  if (guarded.includes(',') || guarded.includes('"') || guarded.includes('\n')) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}
