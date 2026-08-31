/**
 * jobFeatureRegistry.ts — Single source of truth for all job-scoped features.
 *
 * Three navigation paths derive their icon, label, route and permission data
 * from this registry.  Nothing else should maintain a parallel feature list.
 *
 * Key rules:
 *  - `tabKey`         matches the ?tab= query param used in job-detail.tsx
 *  - `standaloneRoute(jobId)` returns the canonical standalone URL
 *  - `pickerRoute`    canonical URL that opens the home screen and immediately
 *                     launches the job picker for this feature.
 *                     Format: `/?picker=<key>`
 *  - `launcherRoute`  kept for backward-compat redirects from /work-field/*
 *                     Alias: same value as pickerRoute for new code.
 *  - `inDropdown`     controls whether the feature appears in the job-detail
 *                     section dropdown (Path A — inside an open Job)
 *  - `inOpeningPage`  controls whether the feature appears on the home screen
 *                     opening-page icon grid (Path B — direct from home)
 *
 * The `tabKey` for Job Ledger is intentionally kept as 'costs' to preserve
 * backward-compatible deep links (/jobs/:id?tab=costs).
 */

import type { ComponentType } from 'react';
import {
  CheckSquare,
  StickyNote,
  Clock,
  TrendingUp,
  UserCheck,
  Image,
  Layers,
  FolderOpen,
  Calculator,
  Receipt,
  DollarSign,
  BookOpen,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react';

export interface JobFeature {
  /** Stable key — never rename once deployed */
  key: string;
  /** ?tab= value used in job-detail.tsx (Path A) */
  tabKey: string;
  /** Human-readable label */
  label: string;
  /** Short description shown on launcher cards */
  description: string;
  /** Lucide icon component */
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Tailwind bg class for launcher card */
  bg: string;
  /** Tailwind text class for launcher card icon */
  fg: string;
  /** Canonical standalone route for this feature + job */
  standaloneRoute: (jobId: number | string) => string;
  /**
   * Canonical picker entry point — opens home screen and immediately launches
   * the job picker for this feature.  Format: `/?picker=<key>`
   */
  pickerRoute: string;
  /**
   * @deprecated Use pickerRoute.  Kept for backward-compat redirects from
   * /work-field/* routes.  Value is identical to pickerRoute.
   */
  launcherRoute: string;
  /** Show in job-detail section dropdown (Path A) */
  inDropdown: boolean;
  /** Show on home screen opening-page icon grid (Path B) */
  inOpeningPage: boolean;
  /**
   * @deprecated Use inOpeningPage.  Kept so existing code that reads
   * inLauncher still compiles without changes.
   */
  inLauncher: boolean;
  /** Nav group in the job-detail dropdown */
  group: 'Work' | 'Field & Files' | 'Finance' | 'Safety';
}

export const JOB_FEATURES: JobFeature[] = [
  // ── Work ──────────────────────────────────────────────────────────────────
  {
    key: 'tasks',
    tabKey: 'tasks',
    label: 'Tasks',
    description: 'To-do items and checklists',
    icon: CheckSquare,
    bg: 'bg-blue-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/tasks`,
    pickerRoute: '/home?picker=tasks',
    launcherRoute: '/work-field/tasks',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'notes',
    tabKey: 'notes',
    label: 'Notes',
    description: 'Job notes and observations',
    icon: StickyNote,
    bg: 'bg-amber-500',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/notes`,
    pickerRoute: '/home?picker=notes',
    launcherRoute: '/work-field/notes',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'delays',
    tabKey: 'delays',
    label: 'Delays',
    description: 'Log and track delays',
    icon: Clock,
    bg: 'bg-orange-500',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/delays`,
    pickerRoute: '/home?picker=delays',
    launcherRoute: '/work-field/delays',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'progress',
    tabKey: 'progress',
    label: 'Progress',
    description: 'Program of works and Gantt',
    icon: TrendingUp,
    bg: 'bg-cyan-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/progress`,
    pickerRoute: '/home?picker=progress',
    launcherRoute: '/work-field/progress',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'attendance',
    tabKey: 'attendance',
    label: 'Attendance',
    description: 'Site sign-ins and attendance',
    icon: UserCheck,
    bg: 'bg-green-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/attendance`,
    pickerRoute: '/home?picker=attendance',
    launcherRoute: '/work-field/attendance',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Work',
  },

  // ── Field & Files ──────────────────────────────────────────────────────────
  {
    key: 'photos',
    tabKey: 'photos',
    label: 'Photos',
    description: 'Site photos and images',
    icon: Image,
    bg: 'bg-violet-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/photos`,
    pickerRoute: '/home?picker=photos',
    launcherRoute: '/work-field/photos',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Field & Files',
  },
  {
    key: 'drawings',
    tabKey: 'drawings',
    label: 'Drawings',
    description: 'Plans and drawings',
    icon: Layers,
    bg: 'bg-indigo-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/drawings`,
    pickerRoute: '/home?picker=drawings',
    launcherRoute: '/work-field/drawings',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Field & Files',
  },
  {
    key: 'files',
    tabKey: 'files',
    label: 'Files',
    description: 'Documents and attachments',
    icon: FolderOpen,
    bg: 'bg-purple-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/files`,
    pickerRoute: '/home?picker=files',
    launcherRoute: '/work-field/files',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Field & Files',
  },

  // ── Finance ────────────────────────────────────────────────────────────────
  {
    key: 'estimates',
    tabKey: 'estimates',
    label: 'Estimates',
    description: 'Quotes and estimates',
    icon: Calculator,
    bg: 'bg-violet-700',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/quotes`,
    pickerRoute: '/home?picker=estimates',
    launcherRoute: '/work-field/estimates',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Finance',
  },
  {
    key: 'purchase-orders',
    tabKey: 'purchase-orders',
    label: 'Purchase Orders',
    description: 'POs and supplier orders',
    icon: Receipt,
    bg: 'bg-teal-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/purchase-orders`,
    pickerRoute: '/home?picker=purchase-orders',
    launcherRoute: '/work-field/purchase-orders',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Finance',
  },
  {
    key: 'invoices',
    tabKey: 'invoices',
    label: 'Invoices',
    description: 'Job invoices and billing',
    icon: DollarSign,
    bg: 'bg-emerald-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/invoices`,
    pickerRoute: '/home?picker=invoices',
    launcherRoute: '/work-field/invoices',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Finance',
  },
  {
    key: 'costs',
    tabKey: 'costs',
    label: 'Job Ledger',
    description: 'Cost ledger and entries',
    icon: BookOpen,
    bg: 'bg-emerald-700',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/costs`,
    pickerRoute: '/home?picker=costs',
    launcherRoute: '/work-field/ledger',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Finance',
  },

  // ── Safety ─────────────────────────────────────────────────────────────────
  {
    key: 'forms',
    tabKey: 'forms',
    label: 'Forms',
    description: 'Safety forms and SWMS',
    icon: ClipboardList,
    bg: 'bg-fuchsia-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/forms`,
    pickerRoute: '/home?picker=forms',
    launcherRoute: '/work-field/forms',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Safety',
  },
  {
    key: 'safety',
    tabKey: 'safety',
    label: 'Safety',
    description: 'SWMS, plans and sign-ons',
    icon: ShieldAlert,
    bg: 'bg-rose-600',
    fg: 'text-white',
    standaloneRoute: (id) => `/jobs/${id}/safety`,
    pickerRoute: '/home?picker=safety',
    launcherRoute: '/work-field/safety',
    inDropdown: true,
    inOpeningPage: true,
    inLauncher: true,
    group: 'Safety',
  },
];

/** All features that appear in the job-detail section dropdown */
export const DROPDOWN_FEATURES = JOB_FEATURES.filter(f => f.inDropdown);

/** All features that appear on the home screen opening-page icon grid */
export const OPENING_PAGE_FEATURES = JOB_FEATURES.filter(f => f.inOpeningPage);

/** @deprecated Use OPENING_PAGE_FEATURES */
export const LAUNCHER_FEATURES = OPENING_PAGE_FEATURES;

/** Look up a feature by its key */
export function getFeatureByKey(key: string): JobFeature | undefined {
  return JOB_FEATURES.find(f => f.key === key);
}

/** Look up a feature by its legacy launcher route slug (e.g. "tasks", "ledger") */
export function getFeatureByLauncherSlug(slug: string): JobFeature | undefined {
  return JOB_FEATURES.find(f => f.launcherRoute === `/work-field/${slug}`);
}

/** Grouped features for the job-detail dropdown and desktop side nav */
export const FEATURE_GROUPS: Array<{ label: string; features: JobFeature[] }> = [
  { label: 'Work',         features: JOB_FEATURES.filter(f => f.group === 'Work') },
  { label: 'Field & Files', features: JOB_FEATURES.filter(f => f.group === 'Field & Files') },
  { label: 'Finance',      features: JOB_FEATURES.filter(f => f.group === 'Finance') },
  { label: 'Safety',       features: JOB_FEATURES.filter(f => f.group === 'Safety') },
];
