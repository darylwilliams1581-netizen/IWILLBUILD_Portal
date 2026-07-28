/**
 * DesktopDock — Bottom-centre floating navigation dock.
 *
 * Desktop-only (md+). Single row of 22 coloured icon tiles, fixed bottom-centre.
 * Icons + colours match the AppLauncher exactly.
 *
 * Sizing: 34×34 tile, 15px icon, 1px gap → ~790px total width.
 * Fits comfortably on 1280px+ viewports. Scrollable on narrower screens.
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
  Settings,
  CreditCard,
} from 'lucide-react';

interface DockItem {
  label: string;
  icon: React.ElementType;
  href: string;
  color: string;
  bg: string;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  dividerBefore?: boolean; // render a thin separator before this item
}

const ALL_ITEMS: DockItem[] = [
  { label: 'Dashboard',       icon: LayoutDashboard, href: '/home',               color: '#1263d8', bg: '#eff6ff' },
  { label: 'Jobs',            icon: HardHat,         href: '/jobs',               color: '#0891b2', bg: '#ecfeff' },
  { label: 'Job Cards',       icon: Zap,             href: '/job-cards',          color: '#ca8a04', bg: '#fefce8' },
  { label: 'Estimating',      icon: Calculator,      href: '/estimating',         color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Invoices',        icon: Receipt,         href: '/invoices',           color: '#0284c7', bg: '#f0f9ff' },
  { label: 'Scheduler',       icon: CalendarDays,    href: '/scheduler',          color: '#059669', bg: '#ecfdf5' },
  { label: 'App Docs',        icon: FileText,        href: '/studio/documents',   color: '#0891b2', bg: '#ecfeff' },
  { label: 'Forms',           icon: ClipboardList,   href: '/studio/forms',       color: '#6366f1', bg: '#eef2ff' },
  { label: 'Library',         icon: BookOpen,        href: '/studio/library',     color: '#b45309', bg: '#fffbeb' },
  { label: 'Files',           icon: FolderOpen,      href: '/files',              color: '#7c3aed', bg: '#fff7ed' },
  { label: 'Fleet',           icon: Truck,           href: '/fleet',              color: '#059669', bg: '#ecfdf5' },
  { label: 'Plan Manager',    icon: Map,             href: '/plan-manager',       color: '#16a34a', bg: '#f0fdf4' },
  { label: 'Safety',          icon: ShieldCheck,     href: '/safety',             color: '#dc2626', bg: '#fef2f2' },
  { label: 'Incidents',       icon: AlertCircle,     href: '/incidents',          color: '#b91c1c', bg: '#fff1f2' },
  { label: 'Equipment',       icon: Building2,       href: '/studio/asset-manager', color: '#64748b', bg: '#f1f5f9' },
  { label: 'Contacts',        icon: Users,           href: '/customers',          color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Team',            icon: UserCircle,      href: '/team',               color: '#0f172a', bg: '#f1f5f9', adminOnly: true },
  { label: 'Lists',           icon: TableProperties, href: '/lists',              color: '#0891b2', bg: '#ecfeff' },
  { label: 'User Logs',       icon: ScrollText,      href: '/user-logs',          color: '#64748b', bg: '#f8fafc', adminOnly: true },
  { label: 'Quick Links',     icon: Link2,           href: '/quick-links',        color: '#6366f1', bg: '#eef2ff' },
  { label: 'Job Field Docs',  icon: FileStack,       href: '/job-docs',           color: '#0891b2', bg: '#ecfeff' },
  { label: 'Sign-in History', icon: History,         href: '/signin-history',     color: '#64748b', bg: '#f8fafc', adminOnly: true },
  // ── Utility ──
  { label: 'Settings',        icon: Settings,        href: '/settings',           color: '#475569', bg: '#f8fafc', adminOnly: true, dividerBefore: true },
  { label: 'Billing',         icon: CreditCard,      href: '/billing',            color: '#475569', bg: '#f8fafc', adminOnly: true },
];

// ── Vertical divider between icon groups ─────────────────────────────────────
function DockDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 1,
        height: 20,
        background: 'rgba(255,255,255,0.3)',
        flexShrink: 0,
        margin: '0 3px',
        borderRadius: 1,
      }}
    />
  );
}

// ── Single icon ───────────────────────────────────────────────────────────────
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
        height: 36,
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
      {/* Coloured tile */}
      <div
        className="dock-tile"
        style={{
          width: '100%',
          height: 32,
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
          size={18}
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

  const items = ALL_ITEMS.filter((item) => {
    if (item.ownerOnly && !isPlatformOwner) return false;
    if (item.adminOnly && !canSeeAdmin) return false;
    return true;
  });

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <>
      <style>{`
        .dock-icon-btn:hover .dock-tile {
          transform: scale(1.08);
          box-shadow: 0 2px 8px rgba(15,23,42,0.15);
          background-color: #ffffff !important;
        }
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
          alignItems: 'center',
          gap: 3,
          overflowX: 'auto',
        }}
      >
        {items.map((item) => (
          <React.Fragment key={item.href + item.label}>
            {item.dividerBefore && <DockDivider />}
            <DockIcon item={item} active={isActive(item.href)} />
          </React.Fragment>
        ))}
      </nav>
    </>
  );
}
