/**
 * DesktopDock — Single-row desktop navigation dock.
 *
 * Desktop-only (md+). Fixed below DesktopTopBar (top: 56px).
 * All nav items in one scrollable row.
 * Team + Billing live in DesktopTopBar.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { usePermissions } from '@/lib/usePermissions';
import {
  Camera,
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
  // Finance flyout
  DollarSign,
  ChevronUp,
  ArrowRight,
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
  { label: 'Lens',            icon: Camera,          href: '/lens',                 color: 'hsl(var(--primary))' },
  { label: 'Fleet',           icon: Truck,           href: '/fleet',                color: '#475569' },
  { label: 'Equipment',       icon: Building2,       href: '/studio/asset-manager', color: '#64748b' },
  // ── Finance ───────────────────────────────────────────────────────────────
  { label: 'Invoices',        icon: Receipt,         href: '/invoices',             color: '#0ea5e9' },
  // Estimating (Costing) is accessible via Settings → Costing
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
  { label: 'My Billing', icon: CreditCard, href: '/billing', color: '#0ea5e9', adminOnly: true },
  { label: 'Help',    icon: HelpCircle, href: '/help',    color: '#10b981' },
];

// ── Finance flyout ────────────────────────────────────────────────────────────

interface FinanceItem {
  label: string;
  desc: string;
  href: string;
  icon: React.ElementType;
  colorHref: string; // borrow color from this ALL_ITEMS href
}

// Colors are sourced from ALL_ITEMS to avoid introducing new hex literals.
const FINANCE_ITEMS: FinanceItem[] = [
  { label: 'Customers',          desc: 'Contacts and client records',       href: '/customers',     icon: Users,           colorHref: '/customers'        },
  { label: 'Invoices',           desc: 'Create and send invoices',          href: '/invoices',      icon: Receipt,         colorHref: '/invoices'         },
  { label: 'Estimates',          desc: 'Quotes and cost guides',            href: '/estimating',    icon: FileText,        colorHref: '/studio/forms'     },
  { label: 'Job Costs / Ledger', desc: 'Cost entries by job',               href: '/ledger',        icon: BookOpen,        colorHref: '/scheduler'        },
  { label: 'Builders Calc',      desc: 'Quick construction calculator',     href: '/builders-calc', icon: Calculator,      colorHref: '/job-cards'        },
  { label: 'Takeoff Pad',        desc: 'Quantity takeoff and measurements', href: '/takeoff-pad',   icon: TableProperties, colorHref: '/studio/documents' },
];

function getItemColor(colorHref: string): string {
  return ALL_ITEMS.find(i => i.href === colorHref)?.color ?? 'hsl(var(--primary))';
}

function FinanceFlyout({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  function go(href: string) {
    onClose();
    navigate(href);
  }

  return (
    <div
      className="finance-flyout-panel"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        borderRadius: 14,
        padding: 8,
        minWidth: 240,
        zIndex: 2000,
      }}
    >
      {/* Caret pointing down toward dock */}
      <div className="finance-flyout-caret" style={{
        position: 'absolute',
        bottom: -6,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 12,
        height: 12,
      }} />

      <p className="finance-flyout-heading" style={{ padding: '4px 8px 6px' }}>
        Finance
      </p>

      {FINANCE_ITEMS.map((item) => {
        const Icon = item.icon;
        const color = getItemColor(item.colorHref);
        const active = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
        return (
          <button
            key={item.href}
            onClick={() => go(item.href)}
            className={`finance-flyout-row${active ? ' finance-flyout-row--active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: color,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}>
              <Icon size={14} color="#fff" strokeWidth={2} aria-hidden="true" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className={`finance-flyout-label${active ? ' finance-flyout-label--active' : ''}`}>
                {item.label}
              </p>
              <p className="finance-flyout-desc">
                {item.desc}
              </p>
            </div>
            {active && <ArrowRight size={12} className="finance-flyout-arrow" style={{ flexShrink: 0 }} />}
          </button>
        );
      })}
    </div>
  );
}

function FinanceDockIcon() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const isFinanceActive = FINANCE_ITEMS.some(
    (item) => location.pathname === item.href || location.pathname.startsWith(item.href + '/'),
  );

  const invoicesColor = getItemColor('/invoices');

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Finance menu"
        aria-expanded={open}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          minWidth: 44,
          maxWidth: 52,
          outline: 'none',
        }}
        className="dock-icon-btn"
      >
        <div
          className="dock-tile"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            backgroundColor: invoicesColor,
            border: isFinanceActive
              ? '2px solid #ffffff'
              : open
              ? '2px solid rgba(255,255,255,0.5)'
              : '2px solid transparent',
            display: 'grid',
            placeItems: 'center',
            transition: 'transform 150ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 150ms ease, border-color 110ms ease',
            boxShadow: isFinanceActive
              ? `0 0 0 2px ${invoicesColor}, 0 2px 8px ${invoicesColor}60`
              : '0 1px 3px rgba(15,23,42,0.25)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <DollarSign
            size={15}
            color="#ffffff"
            strokeWidth={isFinanceActive ? 2.4 : 2.0}
            style={{ display: 'block', flexShrink: 0 }}
            aria-hidden="true"
          />
          <ChevronUp
            size={8}
            color="rgba(255,255,255,0.7)"
            style={{
              position: 'absolute',
              bottom: 1,
              right: 1,
              transition: 'transform 0.15s',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: isFinanceActive ? 700 : 500,
            color: isFinanceActive ? '#ffffff' : 'rgba(255,255,255,0.75)',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            textAlign: 'center',
            letterSpacing: '0.01em',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          Finance
        </span>
      </button>

      {open && <FinanceFlyout onClose={() => setOpen(false)} />}
    </div>
  );
}

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
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        flexShrink: 0,
        textDecoration: 'none',
        outline: 'none',
        minWidth: 44,
        maxWidth: 52,
      }}
      className="dock-icon-btn"
    >
      <div
        className="dock-tile"
        style={{
          width: 34,
          height: 34,
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
      {/* Permanent label below icon */}
      <span
        style={{
          fontSize: 9,
          fontWeight: active ? 700 : 500,
          color: active ? '#ffffff' : 'rgba(255,255,255,0.75)',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 50,
          textAlign: 'center',
          letterSpacing: '0.01em',
          pointerEvents: 'none',
          userSelect: 'none',
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
          transform: scale(1.12) translateY(-1px);
          box-shadow: 0 4px 12px rgba(15,23,42,0.35) !important;
          filter: brightness(1.12);
          z-index: 10;
        }
        .dock-icon-btn {
          overflow: visible !important;
        }
        .dock-row::-webkit-scrollbar { display: none; }
        .dock-row { scrollbar-width: none; overflow: visible; }
        .dock-divider {
          width: 1px;
          height: 22px;
          background: rgba(255,255,255,0.15);
          flex-shrink: 0;
          margin-left: 4px;
          margin-right: 4px;
        }

        /* Finance flyout panel */
        .finance-flyout-panel {
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 -8px 32px rgba(15,23,42,0.6);
        }
        .finance-flyout-caret {
          background: #1e293b;
          border-right: 1px solid rgba(255,255,255,0.12);
          border-bottom: 1px solid rgba(255,255,255,0.12);
        }
        .finance-flyout-heading {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.4);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .finance-flyout-row {
          background: transparent;
          transition: background 0.12s;
        }
        .finance-flyout-row:hover { background: rgba(255,255,255,0.08); }
        .finance-flyout-row--active { background: rgba(255,255,255,0.1); }
        .finance-flyout-label {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
          line-height: 1.2;
        }
        .finance-flyout-label--active { font-weight: 700; color: #fff; }
        .finance-flyout-desc {
          font-size: 10px;
          color: rgba(255,255,255,0.4);
          line-height: 1.2;
          margin-top: 1px;
        }
        .finance-flyout-arrow { color: rgba(255,255,255,0.5); }
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
          padding: '5px 0 6px',
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
                <div className="dock-divider" aria-hidden="true" />
              )}
              <DockIcon item={item} active={isActive(item.href)} />
            </React.Fragment>
          ))}

          {/* ── Finance grouped icon ── */}
          <div className="dock-divider" aria-hidden="true" />
          <FinanceDockIcon />
        </div>
      </nav>
    </>
  );
}
