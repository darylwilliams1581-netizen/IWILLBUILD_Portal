/**
 * jobFeatureRegistry.ts — Single source of truth for all job-scoped features.
 *
 * Both navigation paths (Path A — inside an open Job, Path B — Work & Field
 * launcher) derive their icon, label, route and permission data from this
 * registry.  Nothing else should maintain a parallel feature list.
 *
 * Key rules:
 *  - `tabKey`       matches the ?tab= query param used in job-detail.tsx
 *  - `standaloneRoute(jobId)` returns the canonical standalone URL
 *  - `launcherRoute` is the Work & Field launcher entry point (Path B)
 *  - `inDropdown`   controls whether the feature appears in the job-detail
 *                   section dropdown (Path A)
 *  - `inLauncher`   controls whether the feature appears on the Work & Field
 *                   launcher page (Path B)
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
  /** Work & Field launcher URL (Path B entry point) */
  launcherRoute: string;
  /** Show in job-detail section dropdown (Path A) */
  inDropdown: boolean;
  /** Show on Work & Field launcher page (Path B) */
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
    bg: 'bg-blue-100',
    fg: 'text-blue-600',
    standaloneRoute: (id) => `/jobs/${id}/tasks`,
    launcherRoute: '/work-field/tasks',
    inDropdown: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'notes',
    tabKey: 'notes',
    label: 'Notes',
    description: 'Job notes and observations',
    icon: StickyNote,
    bg: 'bg-yellow-100',
    fg: 'text-yellow-600',
    standaloneRoute: (id) => `/jobs/${id}/notes`,
    launcherRoute: '/work-field/notes',
    inDropdown: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'delays',
    tabKey: 'delays',
    label: 'Delays',
    description: 'Log and track delays',
    icon: Clock,
    bg: 'bg-orange-100',
    fg: 'text-orange-600',
    standaloneRoute: (id) => `/jobs/${id}/delays`,
    launcherRoute: '/work-field/delays',
    inDropdown: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'progress',
    tabKey: 'progress',
    label: 'Progress',
    description: 'Program of works and Gantt',
    icon: TrendingUp,
    bg: 'bg-cyan-100',
    fg: 'text-cyan-600',
    standaloneRoute: (id) => `/jobs/${id}/progress`,
    launcherRoute: '/work-field/progress',
    inDropdown: true,
    inLauncher: true,
    group: 'Work',
  },
  {
    key: 'attendance',
    tabKey: 'attendance',
    label: 'Attendance',
    description: 'Site sign-ins and attendance',
    icon: UserCheck,
    bg: 'bg-green-100',
    fg: 'text-green-600',
    standaloneRoute: (id) => `/jobs/${id}/attendance`,
    launcherRoute: '/work-field/attendance',
    inDropdown: true,
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
    bg: 'bg-violet-100',
    fg: 'text-violet-600',
    standaloneRoute: (id) => `/jobs/${id}/photos`,
    launcherRoute: '/work-field/photos',
    inDropdown: true,
    inLauncher: true,
    group: 'Field & Files',
  },
  {
    key: 'drawings',
    tabKey: 'drawings',
    label: 'Drawings',
    description: 'Plans and drawings',
    icon: Layers,
    bg: 'bg-blue-100',
    fg: 'text-blue-700',
    standaloneRoute: (id) => `/jobs/${id}/drawings`,
    launcherRoute: '/work-field/drawings',
    inDropdown: true,
    inLauncher: true,
    group: 'Field & Files',
  },
  {
    key: 'files',
    tabKey: 'files',
    label: 'Files',
    description: 'Documents and attachments',
    icon: FolderOpen,
    bg: 'bg-violet-100',
    fg: 'text-violet-700',
    standaloneRoute: (id) => `/jobs/${id}/files`,
    launcherRoute: '/work-field/files',
    inDropdown: true,
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
    bg: 'bg-violet-100',
    fg: 'text-violet-600',
    standaloneRoute: (id) => `/jobs/${id}/quotes`,
    launcherRoute: '/work-field/estimates',
    inDropdown: true,
    inLauncher: true,
    group: 'Finance',
  },
  {
    key: 'purchase-orders',
    tabKey: 'purchase-orders',
    label: 'Purchase Orders',
    description: 'POs and supplier orders',
    icon: Receipt,
    bg: 'bg-teal-100',
    fg: 'text-teal-600',
    standaloneRoute: (id) => `/jobs/${id}/purchase-orders`,
    launcherRoute: '/work-field/purchase-orders',
    inDropdown: true,
    inLauncher: true,
    group: 'Finance',
  },
  {
    key: 'invoices',
    tabKey: 'invoices',
    label: 'Invoices',
    description: 'Job invoices and billing',
    icon: DollarSign,
    bg: 'bg-emerald-100',
    fg: 'text-emerald-600',
    standaloneRoute: (id) => `/jobs/${id}/invoices`,
    launcherRoute: '/work-field/invoices',
    inDropdown: true,
    inLauncher: true,
    group: 'Finance',
  },
  {
    key: 'costs',
    tabKey: 'costs',
    label: 'Job Ledger',
    description: 'Cost ledger and entries',
    icon: BookOpen,
    bg: 'bg-emerald-100',
    fg: 'text-emerald-700',
    standaloneRoute: (id) => `/jobs/${id}/costs`,
    launcherRoute: '/work-field/ledger',
    inDropdown: true,
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
    bg: 'bg-fuchsia-100',
    fg: 'text-fuchsia-600',
    standaloneRoute: (id) => `/jobs/${id}/forms`,
    launcherRoute: '/work-field/forms',
    inDropdown: true,
    inLauncher: true,
    group: 'Safety',
  },
  {
    key: 'safety',
    tabKey: 'safety',
    label: 'Safety',
    description: 'SWMS, plans and sign-ons',
    icon: ShieldAlert,
    bg: 'bg-rose-100',
    fg: 'text-rose-600',
    standaloneRoute: (id) => `/jobs/${id}/safety`,
    launcherRoute: '/work-field/safety',
    inDropdown: true,
    inLauncher: true,
    group: 'Safety',
  },
];

/** All features that appear in the job-detail section dropdown */
export const DROPDOWN_FEATURES = JOB_FEATURES.filter(f => f.inDropdown);

/** All features that appear on the Work & Field launcher */
export const LAUNCHER_FEATURES = JOB_FEATURES.filter(f => f.inLauncher);

/** Look up a feature by its key */
export function getFeatureByKey(key: string): JobFeature | undefined {
  return JOB_FEATURES.find(f => f.key === key);
}

/** Look up a feature by its launcher route segment (the last path segment) */
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
