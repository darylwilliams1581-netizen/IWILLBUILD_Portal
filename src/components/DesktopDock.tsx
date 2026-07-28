/**
 * DesktopDock — Two-row desktop navigation dock.
 *
 * Desktop-only (md+). Fixed below DesktopTopBar (top: 56px).
 * Row 1 — Field & Job tools (worker-facing)
 * Row 2 — Tools, Safety, Management, Admin
 *
 * Total height: ~90px (two 36px rows + gap + padding).
 * Portal pages must use padding-top: 146px on desktop.
 */

import React from 'react';
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
  Truck,
  ShieldAlert,
  ClipboardCheck,
  Ruler,
  Car,
  FileSpreadsheet,
  StickyNote,
  Camera,
} from 'lucide-react';

interface DockItem {
  label: string;
  icon: React.ElementType;
  href: string;
  color: string;
  bg: string;
  adminOnly?: boolean;
  ownerOnly?: boolean;
}

// ── Row 1: Field & Job tools ──────────────────────────────────────────────────
const ROW1: DockItem[] = [
  { label: 'Dashboard',       icon: LayoutDashboard, href: '/home',                 color: '#1263d8', bg: '#eff6ff' },
  { label: 'Jobs',            icon: HardHat,         href: '/jobs',                 color: '#0891b2', bg: '#ecfeff' },
  { label: 'Job Cards',       icon: Zap,             href: '/job-cards',            color: '#ca8a04', bg: '#fefce8' },
  { label: 'Job Field Docs',  icon: FileStack,       href: '/job-docs',             color: '#0891b2', bg: '#ecfeff' },
  { label: 'Scheduler',       icon: CalendarDays,    href: '/scheduler',            color: '#059669', bg: '#ecfdf5' },
  { label: 'Files',           icon: FolderOpen,      href: '/files',                color: '#7c3aed', bg: '#fff7ed' },
  { label: 'Plan Manager',    icon: Map,             href: '/plan-manager',         color: '#16a34a', bg: '#f0fdf4' },
  { label: 'Photos',          icon: Camera,          href: '/jobs',                 color: '#db2777', bg: '#fdf2f8' },
  { label: 'Notes',           icon: StickyNote,      href: '/jobs',                 color: '#d97706', bg: '#fffbeb' },
  { label: 'Drive',           icon: Car,             href: '/driver',               color: '#0284c7', bg: '#f0f9ff' },
  { label: 'Vehicle Prestart',icon: Truck,           href: '/prestart',             color: '#16a34a', bg: '#f0fdf4' },
  { label: 'Fleet',           icon: Truck,           href: '/fleet',                color: '#0891b2', bg: '#ecfeff' },
  { label: 'Contacts',        icon: Users,           href: '/customers',            color: '#7c3aed', bg: '#f5f3ff' },
];

// ── Row 2: Tools, Safety, Management ─────────────────────────────────────────
const ROW2: DockItem[] = [
  { label: 'Estimating',      icon: Calculator,      href: '/estimating',           color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Takeoff Pad',     icon: Ruler,           href: '/takeoff-pad',          color: '#6366f1', bg: '#eef2ff' },
  { label: 'Builders Calc',   icon: FileSpreadsheet, href: '/builders-calc',        color: '#0891b2', bg: '#ecfeff' },
  { label: 'Invoices',        icon: Receipt,         href: '/invoices',             color: '#0284c7', bg: '#f0f9ff' },
  { label: 'Safety',          icon: ShieldCheck,     href: '/safety',               color: '#dc2626', bg: '#fef2f2' },
  { label: 'Safety Posters',  icon: ShieldAlert,     href: '/safety/posters',       color: '#b91c1c', bg: '#fff1f2' },
  { label: 'Incidents',       icon: AlertCircle,     href: '/incidents',            color: '#b91c1c', bg: '#fff1f2' },
  { label: 'App Docs',        icon: FileText,        href: '/studio/documents',     color: '#0891b2', bg: '#ecfeff' },
  { label: 'Forms',           icon: ClipboardList,   href: '/studio/forms',         color: '#6366f1', bg: '#eef2ff' },
  { label: 'Library',         icon: BookOpen,        href: '/studio/library',       color: '#b45309', bg: '#fffbeb' },
  { label: 'Equipment',       icon: Building2,       href: '/studio/asset-manager', color: '#64748b', bg: '#f1f5f9' },
  { label: 'Quick Links',     icon: Link2,           href: '/quick-links',          color: '#6366f1', bg: '#eef2ff' },
  { label: 'Lists',           icon: TableProperties, href: '/lists',                color: '#0891b2', bg: '#ecfeff' },
  { label: 'Team',            icon: UserCircle,      href: '/team',                 color: '#0f172a', bg: '#f1f5f9', adminOnly: true },
  { label: 'User Logs',       icon: ScrollText,      href: '/user-logs',            color: '#64748b', bg: '#f8fafc', adminOnly: true },
  { label: 'Sign-in History', icon: History,         href: '/signin-history',       color: '#64748b', bg: '#f8fafc', adminOnly: true },
];

// ── Single icon tile ──────────────────────────────────────────────────────────
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
        flex: '1 1 0',
        minWidth: 0,
        height: 34,
        borderRadius: 9,
        textDecoration: 'none',
        outline: 'none',
        transition: 'box-shadow 120ms ease',
        boxShadow: active
          ? `0 0 0 2px rgba(255,255,255,0.9), 0 0 0 3.5px ${item.color}`
          : 'none',
      }}
      className="dock-icon-btn"
    >
      <div
        className="dock-tile"
        style={{
          width: '100%',
          height: 30,
          borderRadius: 7,
          backgroundColor: active ? '#ffffff' : 'rgba(255,255,255,0.92)',
          border: active
            ? `1.5px solid ${item.color}`
            : '1px solid rgba(255,255,255,0.55)',
          display: 'grid',
          placeItems: 'center',
          transition: 'transform 110ms ease, box-shadow 110ms ease, background-color 110ms ease',
          boxShadow: active
            ? `0 1px 4px ${item.color}30`
            : '0 1px 2px rgba(15,23,42,0.08)',
        }}
      >
        <Icon
          size={16}
          color={item.color}
          strokeWidth={active ? 2.4 : 1.9}
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

// ── Main dock ─────────────────────────────────────────────────────────────────
export default function DesktopDock() {
  const location = useLocation();
  const { isAdmin, isOwner, isPlatformOwner, loading: permsLoading } = usePermissions();

  const canSeeAdmin = !permsLoading && (isAdmin || isOwner || isPlatformOwner);

  function filterItems(items: DockItem[]) {
    return items.filter((item) => {
      if (item.ownerOnly && !isPlatformOwner) return false;
      if (item.adminOnly && !canSeeAdmin) return false;
      return true;
    });
  }

  const row1 = filterItems(ROW1);
  const row2 = filterItems(ROW2);

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    width: '100%',
    overflowX: 'auto',
  };

  return (
    <>
      <style>{`
        .dock-icon-btn:hover .dock-tile {
          transform: scale(1.08);
          box-shadow: 0 2px 8px rgba(15,23,42,0.15);
          background-color: #ffffff !important;
        }
        .dock-row::-webkit-scrollbar { display: none; }
        .dock-row { scrollbar-width: none; }
      `}</style>

      <nav
        aria-label="Desktop navigation dock"
        className="hidden md:flex"
        style={{
          position: 'fixed',
          top: 56,
          left: 10,
          right: 10,
          zIndex: 1050,
          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          border: '1px solid rgba(109,40,217,0.8)',
          borderRadius: 14,
          boxShadow: [
            '0 2px 4px rgba(15,23,42,0.08)',
            '0 6px 16px rgba(109,40,217,0.25)',
            '0 1px 0 rgba(255,255,255,0.12) inset',
          ].join(', '),
          padding: '5px 6px',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* Row 1 — Field & Job tools */}
        <div className="dock-row" style={rowStyle}>
          {row1.map((item) => (
            <DockIcon key={item.href + item.label} item={item} active={isActive(item.href)} />
          ))}
        </div>

        {/* Thin separator */}
        <div style={{
          width: '100%',
          height: 1,
          background: 'rgba(255,255,255,0.18)',
          borderRadius: 1,
          flexShrink: 0,
        }} />

        {/* Row 2 — Tools, Safety, Management */}
        <div className="dock-row" style={rowStyle}>
          {row2.map((item) => (
            <DockIcon key={item.href + item.label} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>
    </>
  );
}
