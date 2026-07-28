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
  TriangleAlert,
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
  // ── Field / Jobs ──────────────────────────────────────────────────────────
  { label: 'Dashboard',       icon: LayoutDashboard, href: '/dashboard',            color: '#1d6fe8' },
  { label: 'Jobs',            icon: HardHat,         href: '/jobs',                 color: '#0891b2' },
  { label: 'Job Cards',       icon: Zap,             href: '/job-cards',            color: '#f59e0b' },
  { label: 'Field Docs',      icon: FileStack,       href: '/job-docs',             color: '#8b5cf6' },
  { label: 'Scheduler',       icon: CalendarDays,    href: '/scheduler',            color: '#10b981' },
  { label: 'Plan Manager',    icon: Map,             href: '/plan-manager',         color: '#06b6d4' },
  // ── Assets / Files ────────────────────────────────────────────────────────
  { label: 'Files',           icon: FolderOpen,      href: '/files',                color: '#f97316' },
  { label: 'Fleet',           icon: Truck,           href: '/fleet',                color: '#475569' },
  { label: 'Equipment',       icon: Building2,       href: '/studio/asset-manager', color: '#64748b' },
  // ── Finance ───────────────────────────────────────────────────────────────
  { label: 'Invoices',        icon: Receipt,         href: '/invoices',             color: '#0ea5e9' },
  { label: 'Estimating',      icon: Calculator,      href: '/estimating',           color: '#e11d48' },
  // ── People ────────────────────────────────────────────────────────────────
  { label: 'Contacts',        icon: Users,           href: '/customers',            color: '#ec4899' },
  // ── Safety ────────────────────────────────────────────────────────────────
  { label: 'Safety',          icon: ShieldCheck,     href: '/safety',               color: '#dc2626' },
  { label: 'Safety Posters',  icon: ShieldAlert,     href: '/safety/posters',       color: '#b91c1c' },
  { label: 'Incidents',       icon: AlertCircle,     href: '/incidents',            color: '#ef4444' },
  { label: 'Risk Register',   icon: TriangleAlert,   href: '/risk-register',        color: '#ea580c' },
  // ── Studio / Tools ────────────────────────────────────────────────────────
  { label: 'App Docs',        icon: FileText,        href: '/studio/documents',     color: '#6366f1' },
  { label: 'Forms',           icon: ClipboardList,   href: '/studio/forms',         color: '#7c3aed' },
  { label: 'Library',         icon: BookOpen,        href: '/studio/library',       color: '#b45309' },
  { label: 'Quick Links',     icon: Link2,           href: '/quick-links',          color: '#0284c7' },
  { label: 'Lists',           icon: TableProperties, href: '/lists',                color: '#0891b2' },
  // ── Admin ─────────────────────────────────────────────────────────────────
  { label: 'User Logs',       icon: ScrollText,      href: '/user-logs',            color: '#64748b', adminOnly: true },
  { label: 'Sign-in History', icon: History,         href: '/signin-history',       color: '#475569', adminOnly: true },
  // ── Account / Help ────────────────────────────────────────────────────────
  { label: 'Team',    icon: UserCircle, href: '/team',    color: '#8b5cf6', adminOnly: true, dividerBefore: true },
  { label: 'Billing', icon: CreditCard, href: '/billing', color: '#0ea5e9', adminOnly: true },
  { label: 'Help',    icon: HelpCircle, href: '/help',    color: '#10b981' },
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
          width: 36,
          height: 36,
          borderRadius: 9,
          backgroundColor: item.color,
          border: active
            ? '2px solid #ffffff'
            : '2px solid transparent',
          display: 'grid',
          placeItems: 'center',
          transition: 'transform 150ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 150ms ease, border-color 110ms ease',
          boxShadow: active
            ? `0 0 0 2px ${item.color}, 0 2px 8px ${item.color}60`
            : '0 1px 3px rgba(15,23,42,0.25)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Icon
          size={15}
          color="#ffffff"
          strokeWidth={active ? 2.4 : 2.0}
          style={{ display: 'block', flexShrink: 0 }}
          aria-hidden="true"
        />
      </div>
      {/* tooltip — shown via CSS on hover, no JS needed */}
      <span
        className="dock-tooltip"
        style={{
          position: 'absolute',
          bottom: -32,
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
          transform: scale(1.18) translateY(-1px);
          box-shadow: 0 4px 12px rgba(15,23,42,0.35) !important;
          filter: brightness(1.12);
          z-index: 10;
        }
        .dock-icon-btn:hover .dock-tooltip {
          opacity: 1 !important;
        }
        .dock-icon-btn {
          overflow: visible !important;
        }
        .dock-row::-webkit-scrollbar { display: none; }
        .dock-row { scrollbar-width: none; overflow: visible; }
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
          background: '#1e293b',
          borderBottom: '1px solid #0f172a',
          boxShadow: '0 2px 8px rgba(15,23,42,0.35)',
          padding: '6px 0 6px',
          alignItems: 'center',
          overflow: 'visible',
        }}
      >
        <div
          className="dock-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            paddingLeft: 12,
            paddingRight: 12,
            overflowX: 'auto',
          }}
        >
          {items.map((item) => (
            <React.Fragment key={item.href + item.label}>
              {item.dividerBefore && (
                <div style={{
                  width: 1,
                  height: 22,
                  background: 'rgba(255,255,255,0.15)',
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
