/**
 * DesktopDock — Bottom-centre floating navigation dock.
 *
 * Desktop-only (md+). Two-row pill, fixed bottom-centre.
 * Icons match the AppLauncher exactly — same colour + background tile per module.
 *
 * Design:
 *   - White pill, thin border, soft layered shadow
 *   - 36×36 coloured icon tiles (same palette as AppLauncher)
 *   - Active: ring highlight + dot indicator
 *   - Hover: slight scale + shadow lift on the tile
 *   - Native title tooltip
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
  Building2,
  Users,
  UserCircle,
  TableProperties,
  ScrollText,
  Link2,
  FileStack,
  History,
} from 'lucide-react';

// ── Item definition — mirrors AppLauncher LAUNCHER_MODULES exactly ────────────
interface DockItem {
  label: string;
  icon: React.ElementType;
  href: string;
  color: string;   // icon colour
  bg: string;      // tile background
  adminOnly?: boolean;
  ownerOnly?: boolean;
}

// Row 1 — 11 items
const ROW_1: DockItem[] = [
  { label: 'Dashboard',    icon: LayoutDashboard, href: '/home',               color: '#1263d8', bg: '#eff6ff' },
  { label: 'Jobs',         icon: HardHat,         href: '/jobs',               color: '#0891b2', bg: '#ecfeff' },
  { label: 'Job Cards',    icon: Zap,             href: '/job-cards',          color: '#ca8a04', bg: '#fefce8' },
  { label: 'Estimating',   icon: Calculator,      href: '/estimating',         color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Invoices',     icon: Receipt,         href: '/invoices',           color: '#0284c7', bg: '#f0f9ff' },
  { label: 'Scheduler',    icon: CalendarDays,    href: '/scheduler',          color: '#059669', bg: '#ecfdf5' },
  { label: 'App Docs',     icon: FileText,        href: '/studio/documents',   color: '#0891b2', bg: '#ecfeff' },
  { label: 'Forms',        icon: ClipboardList,   href: '/studio/forms',       color: '#6366f1', bg: '#eef2ff' },
  { label: 'Library',      icon: BookOpen,        href: '/studio/library',     color: '#b45309', bg: '#fffbeb' },
  { label: 'Files',        icon: FolderOpen,      href: '/files',              color: '#f97316', bg: '#fff7ed' },
  { label: 'Fleet',        icon: Truck,           href: '/fleet',              color: '#059669', bg: '#ecfdf5' },
];

// Row 2 — 11 items
const ROW_2: DockItem[] = [
  { label: 'Plan Manager',     icon: Map,             href: '/plan-manager',         color: '#16a34a', bg: '#f0fdf4' },
  { label: 'Safety',           icon: ShieldCheck,     href: '/safety',               color: '#dc2626', bg: '#fef2f2' },
  { label: 'Incidents',        icon: AlertCircle,     href: '/incidents',            color: '#b91c1c', bg: '#fff1f2' },
  { label: 'Equipment',        icon: Building2,       href: '/studio/asset-manager', color: '#64748b', bg: '#f1f5f9' },
  { label: 'Contacts',         icon: Users,           href: '/customers',            color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Team',             icon: UserCircle,      href: '/team',                 color: '#0f172a', bg: '#f1f5f9', adminOnly: true },
  { label: 'Lists',            icon: TableProperties, href: '/lists',                color: '#0891b2', bg: '#ecfeff' },
  { label: 'User Logs',        icon: ScrollText,      href: '/user-logs',            color: '#64748b', bg: '#f8fafc', adminOnly: true },
  { label: 'Quick Links',      icon: Link2,           href: '/quick-links',          color: '#6366f1', bg: '#eef2ff' },
  { label: 'Job Field Docs',   icon: FileStack,       href: '/job-docs',             color: '#0891b2', bg: '#ecfeff' },
  { label: 'Sign-in History',  icon: History,         href: '/signin-history',       color: '#64748b', bg: '#f8fafc', adminOnly: true },
];

// ── Single dock icon ──────────────────────────────────────────────────────────
function DockIcon({ item, active }: { item: DockItem; active: boolean }) {
  const Icon = item.icon;

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
        width: 38,
        height: 38,
        borderRadius: 10,
        flexShrink: 0,
        textDecoration: 'none',
        outline: 'none',
        // Active: ring around the tile
        boxShadow: active
          ? `0 0 0 2px ${item.color}40`
          : 'none',
        transition: 'box-shadow 120ms ease',
      }}
      className="dock-icon-btn"
    >
      {/* Coloured tile */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: item.bg,
          border: `1px solid ${item.color}22`,
          display: 'grid',
          placeItems: 'center',
          transition: 'transform 110ms ease, box-shadow 110ms ease',
          flexShrink: 0,
        }}
        className="dock-tile"
      >
        <Icon
          size={16}
          color={item.color}
          strokeWidth={active ? 2.2 : 1.8}
          aria-hidden="true"
        />
      </div>

      {/* Active dot */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 1,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: item.color,
          }}
        />
      )}
    </Link>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
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

// ── Row divider ───────────────────────────────────────────────────────────────
function DockRowDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 1,
        background: 'rgba(226,232,240,0.75)',
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
    <>
      {/* Hover styles injected once */}
      <style>{`
        .dock-icon-btn:hover .dock-tile {
          transform: scale(1.08);
          box-shadow: 0 2px 8px rgba(15,23,42,0.10);
        }
      `}</style>

      <nav
        aria-label="Desktop navigation dock"
        className="hidden md:block"
        style={{
          position: 'fixed',
          bottom: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1050,
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
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <DockRow items={row1} pathname={location.pathname} />
        <DockRowDivider />
        <DockRow items={row2} pathname={location.pathname} />
      </nav>
    </>
  );
}
