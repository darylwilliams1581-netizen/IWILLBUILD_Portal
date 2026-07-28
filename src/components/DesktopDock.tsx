/**
 * DesktopDock — Bottom-centre floating navigation dock.
 *
 * Desktop-only (md+). Replaces the left sidebar rail for primary navigation.
 * Renders as a white pill fixed at the bottom-centre of the viewport.
 *
 * Design intent:
 *   - Clean, icon-only pill with tooltip labels on hover
 *   - Soft shadow + thin border — elevation without gimmick
 *   - Active icon: orange fill background, primary colour icon
 *   - Hover: very light grey tint
 *   - Divider separates core nav from utility items
 */

import { useLocation, Link } from 'react-router-dom';
import { usePermissions } from '@/lib/usePermissions';
import {
  LayoutDashboard,
  HardHat,
  Zap,
  CalendarDays,
  Truck,
  Receipt,
  FolderOpen,
  ShieldCheck,
  AlertCircle,
  Users,
  Settings,
  CreditCard,
  Bot,
  ShieldAlert,
} from 'lucide-react';
import { useTerminology } from '@/lib/useTerminology';

// ── Dock item definition ──────────────────────────────────────────────────────
interface DockItem {
  label: string;
  icon: React.ElementType;
  href: string;
  permKey?: string | null;
  ownerOnly?: boolean;
  color?: string; // optional accent override
}

const CORE_ITEMS: DockItem[] = [
  { label: 'Dashboard',  icon: LayoutDashboard, href: '/home',       permKey: null },
  { label: 'Jobs',       icon: HardHat,         href: '/jobs',       permKey: 'jobs' },
  { label: 'Job Cards',  icon: Zap,             href: '/job-cards',  permKey: 'jobs' },
  { label: 'Scheduler',  icon: CalendarDays,    href: '/scheduler',  permKey: 'jobs' },
  { label: 'Fleet',      icon: Truck,           href: '/fleet',      permKey: 'fleet' },
  { label: 'Invoices',   icon: Receipt,         href: '/invoices',   permKey: 'invoices' },
  { label: 'Files',      icon: FolderOpen,      href: '/files',      permKey: 'files' },
  { label: 'Safety',     icon: ShieldCheck,     href: '/safety',     permKey: null },
  { label: 'Incidents',  icon: AlertCircle,     href: '/incidents',  permKey: null },
  { label: 'Contacts',   icon: Users,           href: '/customers',  permKey: 'jobs' },
];

const UTILITY_ITEMS: DockItem[] = [
  { label: 'Settings',     icon: Settings,    href: '/settings',  permKey: null },
  { label: 'Subscription', icon: CreditCard,  href: '/billing',   permKey: null },
  { label: 'Dazza AI',     icon: Bot,         href: '/dazza-ai',  permKey: null, ownerOnly: true, color: '#7c3aed' },
  { label: 'Dev Console',  icon: ShieldAlert, href: '/owner-console', permKey: null, ownerOnly: true, color: '#f97316' },
];

// ── Single dock icon button ───────────────────────────────────────────────────
function DockIcon({
  item,
  active,
}: {
  item: DockItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const accentColor = item.color ?? '#f97316';

  return (
    <Link
      to={item.href}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        borderRadius: 10,
        flexShrink: 0,
        transition: 'background 120ms ease, color 120ms ease',
        background: active ? `${accentColor}18` : 'transparent',
        color: active ? accentColor : 'rgba(71,85,105,0.75)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)';
          (e.currentTarget as HTMLElement).style.color = 'rgba(15,23,42,0.85)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'rgba(71,85,105,0.75)';
        }
      }}
    >
      <Icon
        size={18}
        strokeWidth={active ? 2.2 : 1.8}
        aria-hidden="true"
      />
      {/* Active dot indicator */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 3,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: accentColor,
          }}
        />
      )}
    </Link>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
function DockDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 1,
        height: 24,
        background: 'rgba(226,232,240,0.9)',
        flexShrink: 0,
        margin: '0 2px',
      }}
    />
  );
}

// ── Main dock ─────────────────────────────────────────────────────────────────
export default function DesktopDock() {
  const location = useLocation();
  const { can, isAdmin, isOwner, isPlatformOwner, loading: permsLoading, me } = usePermissions();
  const { workPlural: _workPlural } = useTerminology();

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  // Filter items by permission
  const visibleCore = CORE_ITEMS.filter((item) => {
    if (permsLoading) return true;
    if (item.permKey !== null && item.permKey !== undefined && me?.profile && !can(item.permKey as any)) return false;
    return true;
  });

  const visibleUtility = UTILITY_ITEMS.filter((item) => {
    if (item.ownerOnly && (permsLoading || !isPlatformOwner)) return false;
    if (!permsLoading && item.permKey !== null && item.permKey !== undefined && me?.profile && !can(item.permKey as any)) return false;
    // Show Settings/Billing to admins/owners
    if (item.href === '/settings' && !permsLoading && !isAdmin && !isOwner) return false;
    if (item.href === '/billing' && !permsLoading && !isAdmin && !isOwner) return false;
    return true;
  });

  return (
    <nav
      aria-label="Desktop dock navigation"
      className="hidden md:flex"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1050,
        // Dock pill surface
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(226,232,240,0.85)',
        borderRadius: 16,
        boxShadow:
          '0 2px 8px rgba(15,23,42,0.07), 0 8px 24px rgba(15,23,42,0.06), 0 0 0 0.5px rgba(15,23,42,0.04)',
        padding: '6px 8px',
        alignItems: 'center',
        gap: 2,
        // Prevent dock from being wider than viewport
        maxWidth: 'calc(100vw - 32px)',
        flexWrap: 'nowrap',
      }}
    >
      {visibleCore.map((item) => (
        <DockIcon key={item.href} item={item} active={isActive(item.href)} />
      ))}

      {visibleUtility.length > 0 && (
        <>
          <DockDivider />
          {visibleUtility.map((item) => (
            <DockIcon key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </>
      )}
    </nav>
  );
}
