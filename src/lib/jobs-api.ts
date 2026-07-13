// Shared types and API helpers for Jobs

export const JOB_STATUSES = [
  'New',
  'Quoting',
  'Tender Request',
  'Tender Awarded',
  'Submitted',
  'Awaiting Approval',
  'Works Approved',
  'Ready to Start',
  'Works in Progress',
  'On Hold',
  'Completed',
  'Rectification Required',
  'Closed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface Job {
  id: number;
  companyId: number;
  jobNumber: string | null;
  name: string;
  client: string | null;
  address: string | null;
  status: string;
  notes: string | null;
  customerId: number | null;
  assetId: number | null;
  // Scheduler v2 fields
  scheduledStartDate: string | null;
  expectedCompletionDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  assignedSupervisorUserId: string | null;
  assignedTeamLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_STYLE: Record<string, { color: string; bg: string; dot: string }> = {
  'New':                   { color: 'text-slate-700',   bg: 'bg-slate-100 border-slate-200',     dot: 'bg-slate-400' },
  'Quoting':               { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',      dot: 'bg-amber-400' },
  'Tender Request':        { color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',    dot: 'bg-violet-400' },
  'Tender Awarded':        { color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',    dot: 'bg-indigo-500' },
  'Submitted':             { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',        dot: 'bg-blue-400' },
  'Awaiting Approval':     { color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',    dot: 'bg-purple-400' },
  'Works Approved':        { color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',        dot: 'bg-teal-400' },
  'Ready to Start':        { color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',        dot: 'bg-cyan-400' },
  'Works in Progress':     { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',  dot: 'bg-emerald-500' },
  'On Hold':               { color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',    dot: 'bg-orange-400' },
  'Completed':             { color: 'text-green-700',   bg: 'bg-green-50 border-green-200',      dot: 'bg-green-500' },
  'Rectification Required':{ color: 'text-red-700',     bg: 'bg-red-50 border-red-200',          dot: 'bg-red-500' },
  'Closed':                { color: 'text-gray-500',    bg: 'bg-gray-100 border-gray-200',       dot: 'bg-gray-400' },
};

export function getStatusStyle(status: string) {
  return STATUS_STYLE[status] ?? { color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
}

// ── Date normalisation ────────────────────────────────────────────────────────
// Drizzle's date() column returns a JS Date serialised as a full ISO timestamp
// (e.g. "2026-06-29T00:00:00.000Z"). <input type="date"> requires "YYYY-MM-DD".
// This helper strips any value to just the date portion, or returns null.
function toDateString(val: string | null | undefined): string | null {
  if (!val) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // ISO timestamp — take the date part
  const iso = val.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return null;
}

function normaliseJob(job: Job): Job {
  return {
    ...job,
    scheduledStartDate: toDateString(job.scheduledStartDate),
    expectedCompletionDate: toDateString(job.expectedCompletionDate),
    actualStartDate: toDateString(job.actualStartDate),
    actualCompletionDate: toDateString(job.actualCompletionDate),
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch('/api/jobs', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch jobs');
  const data = await res.json() as { jobs: Job[] };
  return (data.jobs ?? []).map(normaliseJob);
}

export async function fetchJob(id: number): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch job');
  const data = await res.json() as { job: Job };
  return normaliseJob(data.job);
}

export async function createJob(payload: {
  name: string;
  client?: string;
  address?: string;
  status?: string;
  notes?: string;
  jobNumber?: string;
  customerId?: number | null;
}): Promise<Job> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Failed to create job');
  }
  const data = await res.json() as { job: Job };
  return data.job;
}

export async function updateJob(id: number, payload: Partial<{
  name: string;
  client: string;
  address: string;
  status: string;
  notes: string;
  jobNumber: string;
  customerId: number | null;
  assetId: number | null;
  scheduledStartDate: string | null;
  expectedCompletionDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  assignedSupervisorUserId: string | null;
  assignedTeamLabel: string | null;
}>): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Failed to update job');
  }
  const data = await res.json() as { job: Job };
  return normaliseJob(data.job);
}
