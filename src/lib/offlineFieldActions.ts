import { OfflineQueueSyncError } from './useOfflineQueue';

export interface AttendanceOfflineAction {
  clientId: string;
  jobId: number;
  action: 'signin' | 'signout';
  occurredAt: string;
  actorType?: string;
  notes?: string;
}

export interface SitePrestartOfflineAction {
  clientId: string;
  jobId: number;
  prestartId: number;
  action: 'save' | 'finalise';
  occurredAt: string;
  body: Record<string, unknown>;
}

export interface FormOfflineAction {
  clientId: string;
  submissionId: number;
  occurredAt: string;
  answersJson: string;
  status: 'in_progress' | 'completed';
}

export interface CachedAttendanceStatus {
  signedIn: boolean;
  lastAction: 'signin' | 'signout' | null;
  lastActionAt: string | null;
}

function attendanceStatusKey(jobId: number): string {
  return `iwb_attendance_status_${jobId}`;
}

export function readCachedAttendanceStatus(jobId: number): CachedAttendanceStatus | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(attendanceStatusKey(jobId)) ?? 'null') as CachedAttendanceStatus | null;
    return value && typeof value.signedIn === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedAttendanceStatus(jobId: number, status: CachedAttendanceStatus): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(attendanceStatusKey(jobId), JSON.stringify(status));
}

export function createOfflineClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `iwb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.clone().json() as { error?: string; message?: string };
    return body.error ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function sendJson(url: string, method: 'POST' | 'PUT', body: Record<string, unknown>): Promise<void> {
  if (!url.startsWith('/api/') || url.startsWith('//')) {
    throw new OfflineQueueSyncError('Blocked invalid offline sync destination', false);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': String(body.clientId ?? ''),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OfflineQueueSyncError('No connection. Saved on this device.', true);
  }

  if (response.ok) return;
  const message = await responseMessage(response);
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  if (response.status === 401 || response.status === 403) {
    throw new OfflineQueueSyncError('Sign in again to sync saved field work.', false);
  }
  throw new OfflineQueueSyncError(message, retryable);
}

export async function syncAttendanceAction(item: AttendanceOfflineAction): Promise<void> {
  if (!Number.isInteger(item.jobId) || item.jobId <= 0) {
    throw new OfflineQueueSyncError('Invalid job for attendance sync.', false);
  }
  await sendJson(`/api/jobs/${item.jobId}/${item.action}`, 'POST', {
    clientId: item.clientId,
    occurredAt: item.occurredAt,
    actorType: item.actorType ?? 'employee',
    notes: item.notes,
  });
}

export async function syncSitePrestartAction(item: SitePrestartOfflineAction): Promise<void> {
  if (!Number.isInteger(item.jobId) || item.jobId <= 0 || !Number.isInteger(item.prestartId) || item.prestartId <= 0) {
    throw new OfflineQueueSyncError('Invalid prestart for offline sync.', false);
  }
  const suffix = item.action === 'finalise' ? '/finalise' : '';
  await sendJson(`/api/jobs/${item.jobId}/site-prestarts/${item.prestartId}${suffix}`, item.action === 'save' ? 'PUT' : 'POST', {
    ...item.body,
    clientId: item.clientId,
    occurredAt: item.occurredAt,
  });
}

export async function syncFormAction(item: FormOfflineAction): Promise<void> {
  if (!Number.isInteger(item.submissionId) || item.submissionId <= 0) {
    throw new OfflineQueueSyncError('Invalid form submission for offline sync.', false);
  }
  await sendJson(`/api/job-forms/${item.submissionId}`, 'PUT', {
    clientId: item.clientId,
    occurredAt: item.occurredAt,
    answersJson: item.answersJson,
    status: item.status,
  });
}
