/**
 * homeIcons.ts — Single source of truth for all home screen icons.
 *
 * RULE: Every icon here must map to a real desktop sidebar route or a
 * confirmed panel handler in home.tsx. Nothing invented, nothing that
 * doesn't exist on desktop.
 *
 * Groups mirror the desktop sidebar headings:
 *   field       — Work section (Jobs, Work, Job Cards, Scheduler)
 *   files       — Field & Files section (Lens, Plan Manager, Files)
 *   fleet       — Fleet section
 *   finance     — Finance section
 *   safety      — Safety section
 *   management  — Administration section (Team, Billing, Settings, Help)
 *   comingSoon  — placeholder slots (never rendered on home screen)
 */

import type { ComponentType } from 'react';
import {
  HardHat, Briefcase, Zap, CalendarDays,
  Camera, Map, FolderOpen,
  Truck,
  FileText, Receipt, BookOpen, ClipboardList,
  ClipboardCheck, Image, AlertTriangle, ShieldAlert,
  UserCircle, CreditCard, Settings, BookMarked,
  DollarSign,
  BarChart2, FileSpreadsheet, CloudRain, Clipboard,
  MessageSquare, ClipboardSignature, Wallet,
} from 'lucide-react';

export type IconGroup = 'field' | 'files' | 'fleet' | 'finance' | 'safety' | 'management' | 'comingSoon';

export interface HomeIconDef {
  /** Stable DB key — never rename once deployed */
  key: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  /** Tailwind bg class for the tile */
  bg: string;
  /** Tailwind text class for the icon */
  fg: string;
  /** Route or ?panel= query string */
  href: string;
  group: IconGroup;
  /** If true: shown greyed in permission grid, never rendered on home screen */
  comingSoon?: boolean;
}

// ── FIELD (mirrors desktop sidebar "Work" heading) ────────────────────────────
export const FIELD_ICON_DEFS: HomeIconDef[] = [
  { key: 'jobs',        label: 'Jobs',        icon: HardHat,      href: '/jobs',                        bg: 'bg-violet-500',  fg: 'text-white', group: 'field' },
  { key: 'work',        label: 'Work',        icon: Briefcase,    href: '/work',                        bg: 'bg-blue-600',    fg: 'text-white', group: 'field' },
  { key: 'job_card',    label: 'Job Cards',   icon: Zap,          href: '/job-cards',                   bg: 'bg-yellow-500',  fg: 'text-white', group: 'field' },
  { key: 'scheduler',   label: 'Scheduler',   icon: CalendarDays, href: '/scheduler',                   bg: 'bg-indigo-500',  fg: 'text-white', group: 'field' },
  { key: 'log_cost',    label: 'Log Cost',    icon: DollarSign,   href: '?panel=log-cost',              bg: 'bg-emerald-500', fg: 'text-white', group: 'field' },
];

// ── FILES (mirrors desktop sidebar "Field & Files" heading) ───────────────────
export const FILES_ICON_DEFS: HomeIconDef[] = [
  { key: 'lens',        label: 'Lens',        icon: Camera,       href: '/lens',                        bg: 'bg-violet-600',  fg: 'text-white', group: 'files' },
  { key: 'plan_mgr',   label: 'Plan Manager',icon: Map,          href: '/plan-manager',                bg: 'bg-blue-500',    fg: 'text-white', group: 'files' },
  { key: 'files',       label: 'Files',       icon: FolderOpen,   href: '/files',                       bg: 'bg-violet-700',  fg: 'text-white', group: 'files' },
];

// ── FLEET (mirrors desktop sidebar "Fleet" heading) ───────────────────────────
export const FLEET_ICON_DEFS: HomeIconDef[] = [
  { key: 'fleet',       label: 'Fleet',       icon: Truck,        href: '/fleet',                       bg: 'bg-sky-500',     fg: 'text-white', group: 'fleet' },
];

// ── FINANCE (mirrors desktop sidebar "Finance" heading) ───────────────────────
export const FINANCE_ICON_DEFS: HomeIconDef[] = [
  { key: 'quotes',      label: 'Estimates',   icon: FileText,     href: '/finance?financeTab=estimates', bg: 'bg-violet-500',  fg: 'text-white', group: 'finance' },
  { key: 'invoices_mgmt', label: 'Invoices',  icon: Receipt,      href: '/invoices',                    bg: 'bg-teal-500',    fg: 'text-white', group: 'finance' },
  { key: 'ledger',      label: 'Job Ledger',  icon: BookOpen,     href: '/finance?financeTab=ledger',   bg: 'bg-emerald-600', fg: 'text-white', group: 'finance' },
  { key: 'purchase_orders', label: 'Purchase Orders', icon: ClipboardList, href: '/finance?financeTab=purchase-orders', bg: 'bg-teal-700', fg: 'text-white', group: 'finance' },
];

// ── SAFETY (mirrors desktop sidebar "Safety" heading) ─────────────────────────
export const SAFETY_ICON_DEFS: HomeIconDef[] = [
  { key: 'forms',       label: 'Forms',       icon: ClipboardCheck, href: '/studio/forms',              bg: 'bg-fuchsia-600', fg: 'text-white', group: 'safety' },
  { key: 'safety',      label: 'Safety',      icon: ClipboardCheck, href: '/safety?safetyTab=documents', bg: 'bg-rose-600',   fg: 'text-white', group: 'safety' },
  { key: 'poster',      label: 'Safety Posters', icon: Image,      href: '/safety/posters',             bg: 'bg-pink-500',    fg: 'text-white', group: 'safety' },
  { key: 'incidents',   label: 'Incidents',   icon: AlertTriangle, href: '/incidents',                  bg: 'bg-red-700',     fg: 'text-white', group: 'safety' },
  { key: 'risky',       label: 'Risk & Permits', icon: ShieldAlert, href: '?panel=risky-picker',        bg: 'bg-rose-600',    fg: 'text-white', group: 'safety' },
];

// ── MANAGEMENT (mirrors desktop sidebar "Administration" heading) ──────────────
export const MANAGEMENT_ICON_DEFS: HomeIconDef[] = [
  { key: 'stakeholders', label: 'Contacts',   icon: UserCircle,   href: '/customers',                   bg: 'bg-teal-600',    fg: 'text-white', group: 'management' },
  { key: 'team',        label: 'Team',        icon: UserCircle,   href: '/team',                        bg: 'bg-slate-600',   fg: 'text-white', group: 'management' },
  { key: 'billing',     label: 'My Billing',  icon: CreditCard,   href: '/billing',                     bg: 'bg-teal-700',    fg: 'text-white', group: 'management' },
  { key: 'settings',    label: 'Settings',    icon: Settings,     href: '/settings',                    bg: 'bg-slate-400',   fg: 'text-white', group: 'management' },
  { key: 'help',        label: 'Help',        icon: BookMarked,   href: '/help',                        bg: 'bg-gray-900',    fg: 'text-white', group: 'management' },
];

// ── COMING SOON — reserved placeholder slots ──────────────────────────────────
export const COMING_SOON_ICON_DEFS: HomeIconDef[] = [
  { key: 'report',         label: 'Report',      icon: BarChart2,          href: '/report',      bg: 'bg-blue-500',   fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'timesheet',      label: 'Timesheets',  icon: FileSpreadsheet,    href: '/finance?financeTab=timesheets',  bg: 'bg-indigo-400', fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'site_diary',     label: 'Site Diary',  icon: ClipboardSignature, href: '/site-diary',  bg: 'bg-amber-600',  fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'rainfall',       label: 'Rainfall',    icon: CloudRain,          href: '/rainfall',    bg: 'bg-sky-600',    fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'checklist',      label: 'Checklist',   icon: Clipboard,          href: '/checklist',   bg: 'bg-lime-600',   fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'messages',       label: 'Messages',    icon: MessageSquare,      href: '/messages',    bg: 'bg-green-500',  fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'invoices_field', label: 'Invoices',    icon: Wallet,             href: '/invoices',    bg: 'bg-teal-500',   fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'daily_log',      label: 'Daily Log',   icon: ClipboardList,      href: '/daily-log',   bg: 'bg-violet-500', fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'weather',        label: 'Weather',     icon: CloudRain,          href: '/weather',     bg: 'bg-cyan-400',   fg: 'text-white', group: 'comingSoon', comingSoon: true },
];

// ── Flat list of ALL icons (used for permission grid) ─────────────────────────
export const ALL_HOME_ICONS: HomeIconDef[] = [
  ...FIELD_ICON_DEFS,
  ...FILES_ICON_DEFS,
  ...FLEET_ICON_DEFS,
  ...FINANCE_ICON_DEFS,
  ...SAFETY_ICON_DEFS,
  ...MANAGEMENT_ICON_DEFS,
  ...COMING_SOON_ICON_DEFS,
];

// ── Default icon sets ─────────────────────────────────────────────────────────

/** Minimal set given to new invited employees */
export const DEFAULT_FIELD_KEYS: string[] = [
  'lens', 'work', 'safety', 'risky',
];

/** Full set given to solo users (only person in company) */
export const ALL_LIVE_KEYS: string[] = ALL_HOME_ICONS
  .filter(i => !i.comingSoon)
  .map(i => i.key);

/** Keys that owners/admins always have — not restrictable */
export const OWNER_ADMIN_ALWAYS_ON: string[] = ALL_LIVE_KEYS;

// ── Helper: resolve allowed icons for a user ──────────────────────────────────
export function resolveHomeIcons(
  allowedKeys: string[] | null,
  role: string,
  isSolo: boolean,
): HomeIconDef[] {
  const live = ALL_HOME_ICONS.filter(i => !i.comingSoon);

  if (isSolo || role === 'owner' || role === 'admin' || role === 'platform_owner') {
    return live;
  }

  if (!allowedKeys || allowedKeys.length === 0) {
    return live.filter(i => DEFAULT_FIELD_KEYS.includes(i.key));
  }

  return live.filter(i => allowedKeys.includes(i.key));
}

// ── Group labels for the permission grid UI ───────────────────────────────────
export const GROUP_LABELS: Record<IconGroup, string> = {
  field:       'Work',
  files:       'Field & Files',
  fleet:       'Fleet',
  finance:     'Finance',
  safety:      'Safety',
  management:  'Administration',
  comingSoon:  'Coming Soon',
};
