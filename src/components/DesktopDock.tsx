/**
 * DesktopDock — Bottom-centre floating navigation dock.
 *
 * Desktop-only (md+). Fixed bottom-centre pill with two rows of icons.
 * 22 nav items from the screenshot, split into two rows of 11.
 *
 * Design:
 *   - White pill, thin border, soft layered shadow
 *   - 36×36 icon buttons, 10px border-radius
 *   - Active: faint orange fill + orange icon + 4px dot indicator
 *   - Hover: very light grey tint
 *   - Native title tooltip (no custom tooltip needed — clean)
 *   - Divider between the two rows
 */

import { useLocation, Link } from 'react-router-dom';
import { usePermissions } from '@/lib/usePermissions';
import {
  LayoutDashboard,
  HardHat,
  Zap,
  Calculator,
  Receipt,
  CalendarDays,
  FileText,
  ClipboardList,
  BookOpen,
  FolderOpen,
  Truck,
  Map,
  ShieldCheck,
  AlertCircle,
  Wrench,
  Users,
  UserCircle,
  List,
  ScrollText,
  Link2,
  BookMarked,
  History,
} from 'lucide-react';

// ── Item definition ───────────────────────────────────────────────────────────
interface DockItem {
  label: string;
  icon: React.ElementType;
  href: string;
  adminOnly?: boolean;
  ownerOnly?: boolean;
}

// Row 1 — 11 items
const ROW_1: DockItem[] = [
  { label: 'Dashboard',    icon: LayoutDashboard, href: '/home' },
  { label: 'Jobs',         icon: HardHat,         href: '/jobs' },
  { label: 'Job Cards',    icon: Zap,             href: '/job-cards' },
  { label: 'Estimating',   icon: Calculator,      href: '/estimating' },
  { label: 'Invoices',     icon: Receipt,         href: '/invoices' },
  { label: 'Scheduler',    icon: CalendarDays,    href: '/scheduler' },
  { label: 'App Docs',     icon: FileText,        href: '/job-docs' },
  { label: 'Forms',        icon: ClipboardList,   href: '/studio/forms' },
  { label: 'Library',      icon: BookOpen,        href: '/studio/library' },
  { label: 'Files',        icon: FolderOpen,      href: '/files' },
  { label: 'Fleet',        icon: Truck,           href: '/fleet' },
];

// Row 2 — 11 items
const ROW_2: DockItem[] = [
  { label: 'Plan Manager', icon: Map,             href: '/plan-manager' },
  { label: 'Safety',       icon: ShieldCheck,     href: '/safety' },
  { label: 'Incidents',    icon: AlertCircle,     href: '/incidents' },
  { label: 'Equipment',    icon: Wrench,          href: '/studio/asset-manager' },
  { label: 'Contacts',     icon: Users,           href: '/customers' },
  { label: 'Team',         icon: UserCircle,      href: '/team',         adminOnly: true },
  { label: 'Lists',        icon: List,            href: '/lists' },
  { label: 'User Logs',    icon: ScrollText,      href: '/user-logs',    adminOnly: true },
  { label: 'Quick Links',  icon: Link2,           href: '/quick-links' },
  { label: 'Job Field Docs', icon: BookMarked,    href: '/job-docs' },
  { label: 'Sign-in History', icon: History,      href: '/signin-history', adminOnly: true },
];

// ── Single icon button ────────────────────────────────────────────────────────
function DockIcon({ item, active }: { item: DockItem; active: boolean }) {
  const Icon = item.icon;
  const ORANGE = '#f97316';

  return (
    <Link
      to={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 9,
        flexShrink: 0,
        transition: 'background 110ms ease, color 110ms ease',
        background: active ? `${ORANGE}1a` : 'transparent',
        color: active ? ORANGE : 'rgba(71,85,105,0.72)',
        textDecoration: 'none',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)';
          (e.currentTarget as HTMLElement).style.color = 'rgba(15,23,42,0.82)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'rgba(71,85,105,0.72)';
        }
      }}
    >
      <Icon size={17} strokeWidth={active ? 2.2 : 1.75} aria-hidden="true" />

      {/* Active dot */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: ORANGE,
          }}
        />
      )}
    </Link>
  );
}

// ── Row of icons ──────────────────────────────────────────────────────────────
function DockRow({ items, pathname }: { items: DockItem[]; pathname: string }) {
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {items.map((item) => (
        <DockIcon key={item.href + item.label} item={item} active={isActive(item.href)} />
      ))}
    </div>
  );
}

// ── Horizontal rule between rows ──────────────────────────────────────────────
function DockRowDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 1,
        background: 'rgba(226,232,240,0.8)',
        margin: '2px 0',
      }}
    />
  );
}

// ── Main dock ─────────────────────────────────────────────────────────────────
export default function DesktopDock() {
  const location = useLocation();
  const { isAdmin, isOwner, isPlatformOwner, loading: permsLoading } = usePermissions();

  const canSeeAdmin = !permsLoading && (isAdmin || isOwner || isPlatformOwner);

  const filterRow = (items: DockItem[]) =>
    items.filter((item) => {
      if (item.ownerOnly && !isPlatformOwner) return false;
      if (item.adminOnly && !canSeeAdmin) return false;
      return true;
    });

  const row1 = filterRow(ROW_1);
  const row2 = filterRow(ROW_2);

  return (
    <nav
      aria-label="Desktop navigation dock"
      className="hidden md:block"
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1050,
        // Pill surface
        background: 'rgba(255,255,255,0.98)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(226,232,240,0.9)',
        borderRadius: 16,
        boxShadow: [
          '0 1px 2px rgba(15,23,42,0.04)',
          '0 4px 12px rgba(15,23,42,0.07)',
          '0 12px 32px rgba(15,23,42,0.06)',
          '0 0 0 0.5px rgba(15,23,42,0.03)',
        ].join(', '),
        padding: '6px 8px',
        // Prevent overflow on narrow viewports
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
      <DockRow items={row1} pathname={location.pathname} />
      <DockRowDivider />
      <DockRow items={row2} pathname={location.pathname} />
    </nav>
  );
}
