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
  { label: 'Files',           icon: FolderOpen,      href: '/files',              color: '#f97316', bg: '#fff7ed' },
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
        height: 22,
        background: 'rgba(255,255,255,0.25)',
        flexShrink: 0,
        margin: '0 4px',
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
        flex: '1 1 0',          // fill available width evenly
        minWidth: 0,
        height: 36,
        borderRadius: 10,
        textDecoration: 'none',
        outline: 'none',
        boxShadow: active ? `0 0 0 2px ${item.color}38` : 'none',
        transition: 'box-shadow 120ms ease',
      }}
      className="dock-icon-btn"
    >
      {/* Coloured tile */}
      <div
        className="dock-tile"
        style={{
          width: '100%',
          height: 32,
          borderRadius: 8,
          backgroundColor: item.bg,
          border: `1px solid ${item.color}22`,
          display: 'grid',
          placeItems: 'center',
          transition: 'transform 110ms ease, box-shadow 110ms ease',
        }}
      >
        <Icon
          size={16}
          color={item.color}
          strokeWidth={active ? 2.2 : 1.8}
          aria-hidden="true"
        />
      </div>

      {/* Active dot — sits below the tile */}
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
          transform: scale(1.1);
          box-shadow: 0 2px 8px rgba(15,23,42,0.12);
        }
      `}</style>

      <nav
        aria-label="Desktop navigation dock"
        className="hidden md:flex"
        style={{
          position: 'fixed',
          top: 22,
          left: 12,
          right: 12,
          transform: 'translateY(-50%)',
          zIndex: 1050,
          background: 'rgba(124,58,237,0.97)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(139,92,246,0.6)',
          borderRadius: 16,
          boxShadow: [
            '0 1px 2px rgba(15,23,42,0.04)',
            '0 4px 12px rgba(15,23,42,0.07)',
            '0 12px 32px rgba(15,23,42,0.06)',
            '0 0 0 0.5px rgba(15,23,42,0.03)',
          ].join(', '),
          padding: '4px 6px',
          alignItems: 'center',
          gap: 2,
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
