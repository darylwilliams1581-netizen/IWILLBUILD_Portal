import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  HardHat,
  Truck,
  Camera,
  LogOut,
  Settings,
  FolderOpen,
  Menu,
  X,
  ShieldCheck,
  CreditCard,
  AlertTriangle,
  CalendarDays,
  Users,
  Receipt,
  Bot,
  Layers,
  Map,
  Building2,
  Calculator,
  UserCircle,
  MoreHorizontal,
} from 'lucide-react';
import { signOut } from '@/lib/auth/auth-client';
import { usePermissions, invalidateMeCache } from '@/lib/usePermissions';

import NotificationBell from '@/components/NotificationBell';
import { useTerminology, invalidateTerminologyCache } from '@/lib/useTerminology';
import { invalidateSubscriptionCache } from '@/lib/useSubscriptionGate';
import { invalidateSupportModeCache } from '@/lib/useSupportMode';
import { useSessionTimeout } from '@/lib/auth/useSessionTimeout';
import SessionExpiredBanner from '@/components/auth/SessionExpiredBanner';

// ── Trial/subscription status hook ───────────────────────────────────────────
interface SubInfo {
  status: 'active' | 'trial' | 'trial_expired' | 'cancelled' | 'past_due' | 'no_company';
  plan: string;
  daysLeft: number | null;
}

function useSubscriptionStatus() {
  const [info, setInfo] = useState<SubInfo | null>(null);
  useEffect(() => {
    fetch('/api/subscription/status', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d: SubInfo | null) => { if (d) setInfo(d); })
      .catch(() => {});
  }, []);
  return info;
}

// ── Nav structure ─────────────────────────────────────────────────────────────
// Top-level items render as plain links.
// Items inside a group render under a collapsible dropdown.

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  permKey: string | null;
}

function buildNavEntries(_workPlural: string): NavItem[] {
  return [
    { label: 'Dashboard',    icon: LayoutDashboard, href: '/home',                 permKey: null },
    { label: 'Scheduler',    icon: CalendarDays,    href: '/scheduler',            permKey: 'jobs' },
    { label: 'Fleet Manager',icon: Truck,           href: '/fleet',                permKey: 'fleet' },
    { label: 'Equipment',    icon: Building2,       href: '/studio/asset-manager', permKey: null },
    { label: 'Jobs',         icon: HardHat,         href: '/jobs',                 permKey: 'jobs' },
    { label: 'Plan Manager', icon: Map,             href: '/plan-manager',         permKey: null },
    { label: 'Studio',       icon: Layers,          href: '/studio',               permKey: null },
    { label: 'Files',        icon: FolderOpen,      href: '/files',                permKey: 'files' },
    { label: 'Estimating',   icon: Calculator,      href: '/estimating',           permKey: null },
    { label: 'Invoices',     icon: Receipt,         href: '/invoices',             permKey: 'invoices' },
    { label: 'Customers',    icon: Users,           href: '/customers',            permKey: 'jobs' },
    { label: 'Team',         icon: UserCircle,      href: '/team',                 permKey: null },
  ];
}

// ── Manage group ──────────────────────────────────────────────────────────────
const adminItems = [
  { label: 'Subscription', icon: CreditCard,  href: '/billing',  adminOnly: false, ownerOnly: false, permKey: null as string | null },
  { label: 'Settings',     icon: Settings,    href: '/settings', adminOnly: false, ownerOnly: false, permKey: null as string | null },
  { label: 'Dazza AI',     icon: Bot,         href: '/dazza-ai', adminOnly: false, ownerOnly: true,  permKey: null as string | null },
] as const;

// ─── User strip sub-component ─────────────────────────────────────────────────
function SidebarUserStrip({
  sessionUser,
  me,
}: {
  sessionUser: { name?: string; email?: string } | null;
  me: import('@/lib/usePermissions').MeData | null;
}) {
  const displayName  = me?.user?.name  ?? sessionUser?.name  ?? '';
  const displayEmail = me?.user?.email ?? sessionUser?.email ?? '';
  const initial = (displayName || displayEmail || '?')[0].toUpperCase();

  if (!me && !sessionUser) {
    return (
      <div className="mt-1 px-3 py-2.5 rounded-lg bg-gray-100 flex items-center gap-2.5 opacity-40">
        <div className="w-7 h-7 rounded-lg bg-gray-200 shrink-0" />
        <div className="min-w-0 flex-1"><div className="h-2.5 w-20 bg-gray-200 rounded" /></div>
      </div>
    );
  }

  return (
    <div className="mt-1 px-3 py-2.5 rounded-lg bg-gray-100 flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white font-black text-xs shrink-0">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-gray-800 truncate">{displayName || 'User'}</div>
        <div className="text-[10px] text-gray-400 truncate">{displayEmail}</div>
      </div>
      <NotificationBell collapsed={false} />
    </div>
  );
}

// ─── Shared nav content ───────────────────────────────────────────────────────
function SidebarContent({
  onClose,
}: {
  onClose?: () => void;
}) {
  const location  = useLocation();
  const { isAdmin, loading: permsLoading, can, isOwner, isPlatformOwner, me } = usePermissions();
  const subInfo   = useSubscriptionStatus();
  const { workPlural } = useTerminology();
  const navEntries = buildNavEntries(workPlural);

  const isActive = (href: string) => {
    if (href.includes('?')) {
      const [hPath, hQuery] = href.split('?');
      const hParams = new URLSearchParams(hQuery);
      const locParams = new URLSearchParams(location.search);
      if (location.pathname !== hPath) return false;
      for (const [k, v] of hParams.entries()) {
        if (locParams.get(k) !== v) return false;
      }
      return true;
    }
    if (href === '/studio') {
      return location.pathname === '/studio' && !new URLSearchParams(location.search).get('tab');
    }
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  async function handleLogout() {
    try {
      invalidateMeCache();
      invalidateSubscriptionCache();
      invalidateTerminologyCache();
      invalidateSupportModeCache();
      await signOut();
    } catch {
      // ignore
    } finally {
      window.location.replace('/login');
    }
  }

  // Nav link classes — light sidebar style
  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group relative ${
      active
        ? 'bg-primary text-white'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <>
      {/* ── Logo / header ── */}
      <div className="flex items-center h-16 px-4 border-b border-gray-200 shrink-0 gap-2">
        <img
          src="/assets/logo.png"
          alt="IWILLBUILD"
          className="h-9 w-auto object-contain shrink-0 flex-1 min-w-0"
        />
        {onClose && (
          <button onClick={onClose} className="ml-auto p-1 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Main nav ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5" aria-label="Main navigation">
        {navEntries.map((item) => {
          if (!permsLoading && item.permKey !== null && me?.profile && !can(item.permKey as any)) return null;
          if ((item as { ownerOnly?: boolean }).ownerOnly && (permsLoading || !isPlatformOwner)) return null;
          const Icon  = item.icon;
          const active = isActive(item.href);
          const isDazza = item.href === '/dazza-ai';

          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={
                isDazza
                  ? `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group relative ${active ? 'bg-primary text-white' : 'text-violet-600 hover:bg-violet-50 hover:text-violet-700'}`
                  : linkClass(active)
              }
            >
              <Icon size={17} className="shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold truncate flex-1">{item.label}</span>
            </Link>
          );
        })}

        {/* ── Manage group ── */}
        <div className="mt-3">
          <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 select-none">
            Manage
          </p>

          {adminItems.map((item) => {
            if (!permsLoading && item.adminOnly && !isAdmin) return null;
            if ((item as { ownerOnly?: boolean }).ownerOnly && (permsLoading || !isPlatformOwner)) return null;
            const Icon   = item.icon;
            const active = isActive(item.href);
            const isDazza = item.href === '/dazza-ai';
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={
                  isDazza
                    ? `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group relative ${active ? 'bg-primary text-white' : 'text-violet-600 hover:bg-violet-50 hover:text-violet-700'}`
                    : linkClass(active)
                }
              >
                <Icon size={17} className="shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold truncate flex-1">{item.label}</span>
              </Link>
            );
          })}

          {/* Developer Console */}
          {(permsLoading || isPlatformOwner) && (() => {
            if (!permsLoading && !isPlatformOwner) return null;
            const active = isActive('/owner-console');
            return (
              <Link
                to="/owner-console"
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`${linkClass(active)} border border-orange-300`}
              >
                <ShieldCheck size={17} className="shrink-0 text-orange-500" aria-hidden="true" />
                <span className="text-sm font-semibold truncate flex-1 text-orange-600">Developer Console</span>
              </Link>
            );
          })()}
        </div>
      </nav>

      {/* ── Divider ── */}
      <div className="mx-3 border-t border-gray-200" />

      {/* ── Bottom strip ── */}
      <div className="py-3 px-2 flex flex-col gap-0.5">
        <button
          onClick={handleLogout}
          aria-label="Log out"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors duration-150 w-full"
        >
          <LogOut size={17} className="shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold">Log out</span>
        </button>

        {/* Trial / subscription banner */}
        {subInfo && !isOwner && subInfo.status !== 'active' && (
          <Link
            to="/billing"
            className={`mx-2 mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
              subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due'
                ? 'bg-red-50 hover:bg-red-100 border border-red-200'
                : (subInfo.daysLeft ?? 14) <= 5
                ? 'bg-amber-50 hover:bg-amber-100 border border-amber-200'
                : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due'
              ? <AlertTriangle size={13} className="text-red-500 shrink-0" />
              : <CreditCard size={13} className="text-amber-500 shrink-0" />
            }
            <div className="min-w-0 flex-1">
              {subInfo.status === 'trial_expired' ? (
                <p className="text-xs font-bold text-red-600">Trial expired</p>
              ) : subInfo.status === 'cancelled' ? (
                <p className="text-xs font-bold text-red-600">Subscription cancelled</p>
              ) : subInfo.status === 'past_due' ? (
                <p className="text-xs text-red-600 font-bold">Payment past due</p>
              ) : (
                <>
                  <p className="text-xs font-bold text-amber-600">Free trial</p>
                  <p className="text-[10px] text-gray-500">
                    {subInfo.daysLeft ?? 0} day{subInfo.daysLeft !== 1 ? 's' : ''} remaining
                  </p>
                </>
              )}
            </div>
          </Link>
        )}

        {/* User strip */}
        <SidebarUserStrip sessionUser={me?.user ?? null} me={me} />
      </div>
    </>
  );
}

// ─── Mobile hamburger button (exported for use in page top bars) ──────────────
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
      aria-label="Open menu"
    >
      <Menu size={20} />
    </button>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function PortalSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  // unused ref kept for future pin-open feature
  const _sidebarRef = useRef<HTMLElement>(null);

  // ── Session timeout enforcement ───────────────────────────────────────────
  const { isExpired } = useSessionTimeout();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobileOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* ── Session expired banner ── */}
      {isExpired && <SessionExpiredBanner />}

      {/* ── Desktop sidebar — always expanded ── */}
      <aside
        ref={_sidebarRef}
        className="relative hidden md:flex flex-col h-screen bg-white border-r border-gray-200 shrink-0 overflow-hidden"
        style={{ width: 240, minWidth: 240 }}
        aria-label="Portal navigation"
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
            />
            <motion.aside
              key="drawer"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: 'easeOut' as const }}
              className="fixed top-0 left-0 h-[100dvh] w-72 max-w-[85vw] bg-white flex flex-col z-50 md:hidden shadow-2xl border-r border-gray-200"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Mobile bottom tab bar ── */}
      <MobileBottomNav onMoreClick={() => setMobileOpen(true)} />

      <MobileMenuTrigger onOpen={() => setMobileOpen(true)} />
    </>
  );
}

// Listens for the custom event dispatched by MobileMenuButton in page top bars
function MobileMenuTrigger({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener('portal:open-menu', handler);
    return () => window.removeEventListener('portal:open-menu', handler);
  }, [onOpen]);
  return null;
}

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────
// Shown only on mobile (<768px). Field-first: Home, Jobs, Camera, Sign In, More.
// "More" opens the full sidebar drawer for access to all portal pages.
const MOBILE_TAB_ITEMS = [
  { label: 'Home',  icon: LayoutDashboard, href: '/home' },
  { label: 'Jobs',  icon: HardHat,         href: '/jobs' },
] as const;

function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (href: string) => {
    if (href.includes('?')) {
      const [hPath, hQuery] = href.split('?');
      const hParams = new URLSearchParams(hQuery);
      const locParams = new URLSearchParams(location.search);
      if (location.pathname !== hPath) return false;
      for (const [k, v] of hParams.entries()) {
        if (locParams.get(k) !== v) return false;
      }
      return true;
    }
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 4px)',
        boxShadow: '0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(0,0,0,0.06)',
      }}
      aria-label="Field navigation"
    >
      <div className="flex items-stretch">
        {/* Home + Jobs tabs */}
        {MOBILE_TAB_ITEMS.map((item) => {
          const Icon   = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors duration-150"
              style={{
                color: active ? '#f97316' : 'rgba(0,0,0,0.4)',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.01em', lineHeight: 1 }}>
                {item.label}
              </span>
              {active && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-orange-500" aria-hidden="true" />
              )}
            </Link>
          );
        })}

        {/* Camera — raised orange FAB */}
        <button
          onClick={() => navigate('/jobs')}
          className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]"
          style={{ WebkitTapHighlightColor: 'transparent', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Camera"
        >
          <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center shadow-lg -mt-5 border-4 border-white">
            <Camera size={22} className="text-white" strokeWidth={2} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.01em', lineHeight: 1, color: '#f97316', marginTop: 2 }}>
            Camera
          </span>
        </button>

        {/* Safety */}
        <Link
          to="/safety"
          className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors duration-150"
          style={{
            color: isActive('/safety') ? '#f97316' : 'rgba(0,0,0,0.4)',
            WebkitTapHighlightColor: 'transparent',
          }}
          aria-current={isActive('/safety') ? 'page' : undefined}
        >
          <ShieldCheck size={22} strokeWidth={isActive('/safety') ? 2.2 : 1.8} />
          <span style={{ fontSize: 10, fontWeight: isActive('/safety') ? 700 : 500, letterSpacing: '0.01em', lineHeight: 1 }}>
            Safety
          </span>
          {isActive('/safety') && (
            <span className="absolute bottom-1 w-1 h-1 rounded-full bg-orange-500" aria-hidden="true" />
          )}
        </Link>

        {/* More — opens full sidebar drawer */}
        <button
          onClick={onMoreClick}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors duration-150"
          style={{
            color: 'rgba(0,0,0,0.4)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          } as React.CSSProperties}
          aria-label="More navigation options"
        >
          <MoreHorizontal size={22} strokeWidth={1.8} />
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.01em', lineHeight: 1 }}>More</span>
        </button>
      </div>
    </nav>
  );
}

// ─── Global mobile SOS modal ──────────────────────────────────────────────────
// Shown when the user taps SOS in the bottom nav.

