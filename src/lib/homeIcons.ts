/**
 * homeIcons.ts — Single source of truth for all home screen icons.
 *
 * Every icon has a stable `key` string used in the DB permission column.
 * Icons with `comingSoon: true` are shown greyed in the permission grid
 * but are NEVER rendered on the home screen until the flag is removed.
 *
 * Groups:
 *   field       — day-to-day field worker tools
 *   safety      — safety posters
 *   tools       — calculation / estimation tools
 *   management  — admin / management section
 *   comingSoon  — placeholder slots for future features (10 reserved)
 */

import type { ComponentType } from 'react';
import {
  Camera, LogIn, Car, ClipboardCheck, FileText, StickyNote,
  DollarSign, Clock, TrendingUp, Layers, Ruler, ClipboardList,
  Wrench, Image, FileCheck, BookOpen, LayoutDashboard,
  Calculator, Receipt, Users,
  HardHat, CalendarDays, Truck, FolderOpen, UserCircle,
  CreditCard, Settings,
  BarChart2, FileSpreadsheet, CloudRain, Clipboard,
  MessageSquare, ClipboardSignature, Wallet, ShieldAlert, AlertTriangle,
  Gamepad2, BookMarked, Zap,
} from 'lucide-react';

export type IconGroup = 'field' | 'safety' | 'tools' | 'management' | 'comingSoon';

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
  /** Optional badge count to display on the tile */
  badge?: number;
}

// ── FIELD ─────────────────────────────────────────────────────────────────────
// Palette: orange (primary actions), blue (navigation/drive), green (money/progress)
// Rule: each tile has a unique hue so icons are instantly distinguishable at a glance.
export const FIELD_ICON_DEFS: HomeIconDef[] = [
  { key: 'camera',        label: 'Camera',          icon: Camera,           href: '?panel=camera',               bg: 'bg-violet-500',  fg: 'text-white', group: 'field' },
  { key: 'sign_in',       label: 'Sign In',          icon: LogIn,            href: '?panel=signin',               bg: 'bg-blue-600',    fg: 'text-white', group: 'field' },
  { key: 'drive',         label: 'Drive',            icon: Car,              href: '?panel=drive-picker',         bg: 'bg-sky-500',     fg: 'text-white', group: 'field' },
  { key: 'log_cost',      label: 'Log Cost',         icon: DollarSign,       href: '?panel=log-cost',             bg: 'bg-emerald-500', fg: 'text-white', group: 'field' },
  { key: 'delays',        label: 'Delays',           icon: Clock,            href: '?panel=delays-picker',        bg: 'bg-amber-500',   fg: 'text-white', group: 'field' },
  { key: 'progress',      label: 'Progress',         icon: TrendingUp,       href: '?panel=progress-picker',      bg: 'bg-green-600',   fg: 'text-white', group: 'field' },
  { key: 'drawings',      label: 'Drawings',         icon: Layers,           href: '?panel=drawings-picker',      bg: 'bg-blue-500',    fg: 'text-white', group: 'field' },
  { key: 'equipment',     label: 'Equipment',        icon: Wrench,           href: '/studio/asset-manager',       bg: 'bg-violet-500',  fg: 'text-white', group: 'field' },
  { key: 'job_card',      label: 'Job Card',         icon: Zap,              href: '?panel=job-card',             bg: 'bg-yellow-500',  fg: 'text-white', group: 'field' },
];

// ── SAFETY ────────────────────────────────────────────────────────────────────
// Palette: red family for danger/hazard; amber for inspection; rose for permits.
// Avoid duplicating exact shades — each tile reads as a distinct signal colour.
export const SAFETY_ICON_DEFS: HomeIconDef[] = [
  { key: 'poster',        label: 'Safety Posters',   icon: Image,            href: '/safety/posters',             bg: 'bg-pink-500',    fg: 'text-white', group: 'safety' },
  { key: 'site_prestart', label: 'Site Prestart',    icon: HardHat,          href: '?panel=site-prestart-picker', bg: 'bg-red-500',     fg: 'text-white', group: 'safety' },
  { key: 'risky',         label: 'Risk & Permits',   icon: ShieldAlert,      href: '?panel=risky-picker',         bg: 'bg-rose-600',    fg: 'text-white', group: 'safety' },
  { key: 'forms',         label: 'Forms',            icon: FileText,         href: '?panel=forms-picker',         bg: 'bg-fuchsia-600', fg: 'text-white', group: 'safety' },
  { key: 'field_docs',    label: 'Docs',             icon: FileCheck,        href: '/job-docs',                   bg: 'bg-rose-500',    fg: 'text-white', group: 'safety' },
  { key: 'prestart',      label: 'Vehicle Prestart', icon: ClipboardCheck,   href: '?panel=prestart-picker',      bg: 'bg-amber-600',   fg: 'text-white', group: 'safety' },
  { key: 'incidents',     label: 'Incidents',        icon: AlertTriangle,    href: '/incidents',                  bg: 'bg-red-700',     fg: 'text-white', group: 'safety' },
];

// ── TOOLS ─────────────────────────────────────────────────────────────────────
// Palette: purple / violet (calculation), cyan / sky (data/view), indigo (scheduling).
// Each tool tile uses a distinct shade — no two adjacent tiles share the same hue.
export const TOOLS_ICON_DEFS: HomeIconDef[] = [
  { key: 'dashboard',     label: 'Dashboard',        icon: LayoutDashboard,  href: '?panel=dashboard',            bg: 'bg-violet-600',  fg: 'text-white', group: 'tools' },
  { key: 'notes',         label: 'Notes',            icon: StickyNote,       href: '?panel=notes-picker',         bg: 'bg-cyan-500',    fg: 'text-white', group: 'tools' },
  { key: 'builders_calc', label: 'Builders Calc',    icon: Ruler,            href: '/builders-calc',              bg: 'bg-purple-600',  fg: 'text-white', group: 'tools' },
  { key: 'takeoff_pad',   label: 'Takeoff Pad',      icon: ClipboardList,    href: '/takeoff-pad',                bg: 'bg-sky-600',     fg: 'text-white', group: 'tools' },
  { key: 'estimating',    label: 'Estimating',       icon: Calculator,       href: '/estimating',                 bg: 'bg-indigo-600',  fg: 'text-white', group: 'tools' },
  { key: 'scheduler',     label: 'Scheduler',        icon: CalendarDays,     href: '/scheduler',                  bg: 'bg-indigo-500',  fg: 'text-white', group: 'tools' },
  { key: 'studio_docs',   label: 'Doc Studio',       icon: FileText,         href: '/studio/documents',           bg: 'bg-cyan-600',    fg: 'text-white', group: 'tools' },
  { key: 'studio_forms',  label: 'Form Studio',      icon: ClipboardList,    href: '/studio/forms',               bg: 'bg-violet-500',  fg: 'text-white', group: 'tools' },
  { key: 'site_escape',   label: 'Site Escape',      icon: Gamepad2,         href: '/site-escape',                bg: 'bg-teal-500',    fg: 'text-white', group: 'tools' },
];

// ── MANAGEMENT ────────────────────────────────────────────────────────────────
// Palette: orange (primary business), teal (finance), slate (admin/settings).
// Avoid repeating the same shade — use the 400/500/600/700 steps to differentiate.
export const MANAGEMENT_ICON_DEFS: HomeIconDef[] = [
  { key: 'jobs',          label: 'Jobs',           icon: HardHat,          href: '/jobs',                   bg: 'bg-violet-500',  fg: 'text-white', group: 'management' },
  { key: 'quotes',        label: 'Quotes',         icon: FileText,         href: '?panel=quotes-picker',    bg: 'bg-violet-500',  fg: 'text-white', group: 'management' },
  { key: 'invoices_mgmt', label: 'Invoices',       icon: Receipt,          href: '/invoices',               bg: 'bg-teal-500',    fg: 'text-white', group: 'management' },
  { key: 'stakeholders',  label: 'Stakeholders',   icon: Users,            href: '/customers',              bg: 'bg-teal-600',    fg: 'text-white', group: 'management' },
  { key: 'ledger',        label: 'Ledger',         icon: BookOpen,         href: '?panel=costs-picker',     bg: 'bg-emerald-600', fg: 'text-white', group: 'management' },
  { key: 'fleet',         label: 'Fleet',          icon: Truck,            href: '/fleet',                  bg: 'bg-slate-500',   fg: 'text-white', group: 'management' },
  { key: 'files',         label: 'Files',          icon: FolderOpen,       href: '/files',                  bg: 'bg-violet-700',  fg: 'text-white', group: 'management' },
  { key: 'team',          label: 'Team',           icon: UserCircle,       href: '/team',                   bg: 'bg-slate-600',   fg: 'text-white', group: 'management' },
  { key: 'billing',       label: 'Billing',        icon: CreditCard,       href: '/billing',                bg: 'bg-teal-700',    fg: 'text-white', group: 'management' },
  { key: 'settings',      label: 'Settings',       icon: Settings,         href: '/settings',               bg: 'bg-slate-400',   fg: 'text-white', group: 'management' },
  { key: 'help',          label: 'Help',           icon: BookMarked,       href: '/help',                   bg: 'bg-gray-900',    fg: 'text-white', group: 'management' },
];

// ── COMING SOON — 10 reserved placeholder slots ───────────────────────────────
export const COMING_SOON_ICON_DEFS: HomeIconDef[] = [
  { key: 'report',        label: 'Report',         icon: BarChart2,        href: '/report',                 bg: 'bg-blue-500',    fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'timesheet',     label: 'Timesheets',     icon: FileSpreadsheet,  href: '/timesheets',             bg: 'bg-indigo-400',  fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'site_diary',    label: 'Site Diary',     icon: ClipboardSignature, href: '/site-diary',           bg: 'bg-amber-600',   fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'rainfall',      label: 'Rainfall',       icon: CloudRain,        href: '/rainfall',               bg: 'bg-sky-600',     fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'checklist',     label: 'Checklist',      icon: Clipboard,        href: '/checklist',              bg: 'bg-lime-600',    fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'messages',      label: 'Messages',       icon: MessageSquare,    href: '/messages',               bg: 'bg-green-500',   fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'invoices_field',label: 'Invoices',       icon: Wallet,           href: '/invoices',               bg: 'bg-teal-500',    fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'daily_log',     label: 'Daily Log',      icon: ClipboardList,    href: '/daily-log',              bg: 'bg-violet-500',  fg: 'text-white', group: 'comingSoon', comingSoon: true },
  { key: 'weather',       label: 'Weather',        icon: CloudRain,        href: '/weather',                bg: 'bg-cyan-400',    fg: 'text-white', group: 'comingSoon', comingSoon: true },
];

// ── Flat list of ALL icons (used for permission grid) ─────────────────────────
export const ALL_HOME_ICONS: HomeIconDef[] = [
  ...FIELD_ICON_DEFS,
  ...SAFETY_ICON_DEFS,
  ...TOOLS_ICON_DEFS,
  ...MANAGEMENT_ICON_DEFS,
  ...COMING_SOON_ICON_DEFS,
];

// ── Default icon sets ─────────────────────────────────────────────────────────

/** Minimal set given to new invited employees */
export const DEFAULT_FIELD_KEYS: string[] = [
  'camera', 'sign_in', 'drive', 'prestart',
];

/** Full set given to solo users (only person in company) */
export const ALL_LIVE_KEYS: string[] = ALL_HOME_ICONS
  .filter(i => !i.comingSoon)
  .map(i => i.key);

/** Keys that owners/admins always have — not restrictable */
export const OWNER_ADMIN_ALWAYS_ON: string[] = ALL_LIVE_KEYS;

// ── Helper: resolve allowed icons for a user ──────────────────────────────────
/**
 * Given a user's stored permission array (or null) and their role,
 * returns the filtered, ordered list of live icons to render on the home screen.
 */
export function resolveHomeIcons(
  allowedKeys: string[] | null,
  role: string,
  isSolo: boolean,
): HomeIconDef[] {
  const live = ALL_HOME_ICONS.filter(i => !i.comingSoon);

  // Owners, admins, and solo users always see everything
  if (isSolo || role === 'owner' || role === 'admin' || role === 'platform_owner') {
    return live;
  }

  // No permissions set yet → use default field set
  if (!allowedKeys || allowedKeys.length === 0) {
    return live.filter(i => DEFAULT_FIELD_KEYS.includes(i.key));
  }

  return live.filter(i => allowedKeys.includes(i.key));
}

// ── Group labels for the permission grid UI ───────────────────────────────────
export const GROUP_LABELS: Record<IconGroup, string> = {
  field:       'Field',
  safety:      'Safety',
  tools:       'Tools',
  management:  'Management',
  comingSoon:  'Coming Soon',
};
