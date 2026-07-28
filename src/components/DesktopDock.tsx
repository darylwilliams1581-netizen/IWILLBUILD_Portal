/**
 * DesktopDock — Single-row desktop navigation dock.
 *
 * Desktop-only (md+). Fixed below DesktopTopBar (top: 56px).
 * All nav items in one scrollable row.
 * Team + Billing live in DesktopTopBar.
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
  TableProperties,
  ScrollText,
  Link2,
  FileStack,
  History,
  Truck,
  ShieldAlert,
  UserCircle,
  CreditCard,
  HelpCircle,
} from 'lucide-react';

interface DockItem {
  label: string;
  icon: React.ElementType;
  href: string;
  color: string;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  dividerBefore?: boolean;
}

const ALL_ITEMS: DockItem[] = [
  { label: 'Dashboard',       icon: LayoutDashboard, href: '/dashboard',            color: '#1263d8' },
  { label: 'Jobs',            icon: HardHat,         href: '/jobs',                 color: '#0891b2' },
  { label: 'Job Cards',       icon: Zap,             href: '/job-cards',            color: '#ca8a04' },
  { label: 'Field Docs',      icon: FileStack,       href: '/job-docs',             color: '#7c3aed' },
  { label: 'Scheduler',       icon: CalendarDays,    href: '/scheduler',            color: '#059669' },
  { label: 'Plan Manager',    icon: Map,             href: '/plan-manager',         color: '#16a34a' },
  { label: 'Files',           icon: FolderOpen,      href: '/files',                color: '#d97706' },
  { label: 'Contacts',        icon: Users,           href: '/customers',            color: '#7c3aed' },
  { label: 'Invoices',        icon: Receipt,         href: '/invoices',             color: '#0284c7' },
  { label: 'Fleet',           icon: Truck,           href: '/fleet',                color: '#0891b2' },
  { label: 'Estimating',      icon: Calculator,      href: '/estimating',           color: '#7c3aed' },
  { label: 'Safety',          icon: ShieldCheck,     href: '/safety',               color: '#dc2626' },
  { label: 'Safety Posters',  icon: ShieldAlert,     href: '/safety/posters',       color: '#b91c1c' },
  { label: 'Incidents',       icon: AlertCircle,     href: '/incidents',            color: '#b91c1c' },
  { label: 'App Docs',        icon: FileText,        href: '/studio/documents',     color: '#0891b2' },
  { label: 'Forms',           icon: ClipboardList,   href: '/studio/forms',         color: '#6366f1' },
  { label: 'Library',         icon: BookOpen,        href: '/studio/library',       color: '#b45309' },
  { label: 'Equipment',       icon: Building2,       href: '/studio/asset-manager', color: '#64748b' },
  { label: 'Quick Links',     icon: Link2,           href: '/quick-links',          color: '#6366f1' },
  { label: 'Lists',           icon: TableProperties, href: '/lists',                color: '#0891b2' },
  { label: 'User Logs',       icon: ScrollText,      href: '/user-logs',            color: '#64748b', adminOnly: true },
  { label: 'Sign-in History', icon: History,         href: '/signin-history',       color: '#64748b', adminOnly: true },
  // ── account / help ────────────────────────────────────────────────────────
  { label: 'Team',    icon: UserCircle,  href: '/team',    color: '#7c3aed', adminOnly: true,  dividerBefore: true },
  { label: 'Billing', icon: CreditCard,  href: '/billing', color: '#0284c7', adminOnly: true },
  { label: 'Help',    icon: HelpCircle,  href: '/help',    color: '#059669' },
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
        flexShrink: 0,
        textDecoration: 'none',
        outline: 'none',
      }}
      className="dock-icon-btn"
    >
      <div
        className="dock-tile"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: active ? '#ffffff' : 'rgba(255,255,255,0.92)',
          border: active
            ? `1.5px solid ${item.color}`
            : '1px solid rgba(255,255,255,0.55)',
          display: 'grid',
          placeItems: 'center',
          transition: 'transform 110ms ease, box-shadow 110ms ease, background-color 110ms ease',
          boxShadow: active
            ? `0 0 0 1.5px ${item.color}40, 0 1px 4px ${item.color}30`
            : '0 1px 2px rgba(15,23,42,0.08)',
        }}
      >
        <Icon
          size={15}
          color={item.color}
          strokeWidth={active ? 2.4 : 1.9}
          style={{ display: 'block', flexShrink: 0 }}
          aria-hidden="true"
        />
      </div>
      {/* tooltip — shown via CSS on hover, no JS needed */}
      <span
        className="dock-tooltip"
        style={{
          position: 'absolute',
          bottom: -28,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.88)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          padding: '4px 8px',
          borderRadius: 5,
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 120ms ease',
          zIndex: 9999,
        }}
      >
        {item.label}
      </span>
      {/* invisible spacer — keeps old span structure intact */}
      <span
        style={{
          display: 'none',
          fontSize: 8.5,
          fontWeight: active ? 700 : 500,
          color: active ? '#ffffff' : 'rgba(255,255,255,0.85)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
          textAlign: 'center',
          letterSpacing: '-0.01em',
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        {item.label}
      </span>
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
          transform: scale(1.12);
          box-shadow: 0 2px 8px rgba(15,23,42,0.18) !important;
          background-color: #ffffff !important;
        }
        .dock-icon-btn:hover .dock-tooltip {
          opacity: 1 !important;
        }
        .dock-row::-webkit-scrollbar { display: none; }
        .dock-row { scrollbar-width: none; }
      `}</style>

      <nav
        aria-label="Desktop navigation dock"
        className="hidden lg:flex"
        style={{
          position: 'fixed',
          top: 56,
          left: 0,
          right: 0,
          zIndex: 1050,
          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          borderBottom: '1px solid rgba(109,40,217,0.8)',
          boxShadow: [
            '0 2px 4px rgba(15,23,42,0.08)',
            '0 6px 16px rgba(109,40,217,0.25)',
            '0 1px 0 rgba(255,255,255,0.12) inset',
          ].join(', '),
          padding: '4px 0 4px',
          alignItems: 'center',
        }}
      >
        <div
          className="dock-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            width: '100%',
            paddingLeft: 8,
            paddingRight: 8,
            overflowX: 'auto',
          }}
        >
          {items.map((item) => (
            <React.Fragment key={item.href + item.label}>
              {item.dividerBefore && (
                <div style={{
                  width: 1,
                  height: 22,
                  background: 'rgba(255,255,255,0.25)',
                  flexShrink: 0,
                  marginLeft: 4,
                  marginRight: 4,
                }} aria-hidden="true" />
              )}
              <DockIcon item={item} active={isActive(item.href)} />
            </React.Fragment>
          ))}
        </div>
      </nav>
    </>
  );
}
