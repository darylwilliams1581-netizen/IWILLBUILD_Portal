/**
 * Shared types and utilities for the form runner system.
 * Kept in a separate file so FormRunner.tsx can be a pure default-export
 * React component (required for Vite Fast Refresh).
 */
import type { FormField } from '../FormFieldBuilder';

// ── Submission ────────────────────────────────────────────────────────────────

export interface FormSubmission {
  id: number;
  jobId: number;
  templateId: number;
  status: string;
  answersJson: string | null;
  completedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ── GPS structured answer ─────────────────────────────────────────────────────

export interface GpsAnswer {
  lat: number;
  lng: number;
  accuracy: number; // metres
  timestamp: string; // ISO
  address?: string;  // manual override
}

export function isGpsAnswer(v: unknown): v is GpsAnswer {
  return typeof v === 'object' && v !== null && 'lat' in v && 'lng' in v;
}

export function formatGps(g: GpsAnswer): string {
  if (g.address) return `${g.address} (${g.lat.toFixed(5)}, ${g.lng.toFixed(5)})`;
  return `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)} ±${Math.round(g.accuracy)}m`;
}

// ── Page-splitting utility ────────────────────────────────────────────────────

export function splitIntoPages(fields: FormField[]): FormField[][] {
  const pages: FormField[][] = [[]];
  for (const field of fields) {
    if (field.fieldType === 'page_break') {
      pages.push([]);
    } else {
      pages[pages.length - 1].push(field);
    }
  }
  while (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  return pages;
}
