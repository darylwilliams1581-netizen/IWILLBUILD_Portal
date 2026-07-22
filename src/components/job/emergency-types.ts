/**
 * Shared types and constants for the Emergency Beacon flow.
 */

export const EMERGENCY_REASONS = [
  { value: 'snakebite',          label: 'Snakebite',           emoji: '🐍' },
  { value: 'injury',             label: 'Injury',              emoji: '🩹' },
  { value: 'medical',            label: 'Medical Emergency',   emoji: '🚑' },
  { value: 'missing_person',     label: 'Missing Person',      emoji: '🔍' },
  { value: 'evacuation_support', label: 'Evacuation Support',  emoji: '🚨' },
  { value: 'other',              label: 'Other',               emoji: '⚠️' },
] as const;

export type EmergencyReason = typeof EMERGENCY_REASONS[number]['value'];

export interface EmergencyAlert {
  id: number;
  company_id: number;
  job_id: number;
  initiated_by: string;
  initiated_by_name: string;
  reason: EmergencyReason;
  note: string | null;
  status: 'active' | 'resolved';
  lat: number | null;
  lng: number | null;
  location_accuracy_m: number | null;
  location_denied: boolean;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  offline_queued: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmergencyAlertPayload {
  jobId: number;
  reason: EmergencyReason;
  note?: string;
  lat?: number;
  lng?: number;
  locationAccuracyM?: number;
  locationDenied?: boolean;
  offlineQueued?: boolean;
}

export function reasonLabel(reason: string): string {
  return EMERGENCY_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export function reasonEmoji(reason: string): string {
  return EMERGENCY_REASONS.find((r) => r.value === reason)?.emoji ?? '⚠️';
}
