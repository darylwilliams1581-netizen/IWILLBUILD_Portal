import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  HardHat,
  Truck,
  Bot,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Users,
  Settings,
  FileText,
  FolderOpen,
  Calculator,
  Menu,
  X,
  ShieldCheck,
  Activity,
  CreditCard,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
} from 'lucide-react';
import { signOut, useSession } from '@/lib/auth/auth-client';
import { usePermissions, useMe } from '@/lib/usePermissions';
import NotificationBell from '@/components/NotificationBell';

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

// ── Main nav items ────────────────────────────────────────────────────────────
// Annette lives as a sub-item under Dazza AI — not a top-level item.
const navItems = [
  { label: 'Dashboard',  icon: LayoutDashboard, href: '/dashboard',  permKey: null },
  { label: 'Dazza AI',   icon: Bot,             href: '/dazza-ai',   permKey: 'dazzaAi' },
  { label: 'Jobs',       icon: HardHat,         href: '/jobs',       permKey: 'jobs' },
  { label: 'Scheduler',  icon: CalendarDays,    href: '/scheduler',  permKey: 'jobs' },
  { label: 'Fleet',      icon: Truck,           href: '/fleet',      permKey: 'fleet' },
  { label: 'Forms',      icon: FileText,        href: '/forms',      permKey: 'forms' },
  { label: 'Files',      icon: FolderOpen,      href: '/files',      permKey: 'files' },
  { label: 'Estimating', icon: Calculator,      href: '/estimating', permKey: 'estimating' },
] as const;

// ── Admin group (shown below a divider) ───────────────────────────────────────
const adminItems = [
  { label: 'Team',     icon: Users,      href: '/team',     adminOnly: true  },
  { label: 'Billing',  icon: CreditCard, href: '/billing',  adminOnly: false },
  { label: 'Settings', icon: Settings,   href: '/settings', adminOnly: true  },
] as const;

// ─── Shared nav content ───────────────────────────────────────────────────────
function SidebarContent({
  collapsed,
  onClose,
  onToggle,
}: {
  collapsed: boolean;
  onClose?: () => void;
  onToggle?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: sessionUser } = useSession();
  const { me } = useMe();
  const { isAdmin, loading: permsLoading, can, isOwner } = usePermissions();
  const subInfo = useSubscriptionStatus();

  // Dazza AI sub-menu: auto-open when on /dazza-ai or /annette
  const dazzaActive = location.pathname === '/dazza-ai' || location.pathname === '/annette';
  const [dazzaOpen, setDazzaOpen] = useState(dazzaActive);
  useEffect(() => {
    if (dazzaActive) setDazzaOpen(true);
  }, [dazzaActive]);

  const isActive = (href: string) => location.pathname === href;

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group relative ${
      active ? 'bg-primary text-white' : 'text-white/60 hover:bg-white/8 hover:text-white'
    }`;

  const subLinkClass = (active: boolean) =>
    `flex items-center gap-2.5 pl-9 pr-3 py-2 rounded-lg transition-colors duration-150 group relative ${
      active ? 'bg-primary/80 text-white' : 'text-white/40 hover:bg-white/6 hover:text-white/80'
    }`;

  return (
    <>
      {/* ── Logo / header ── */}
      <div className="flex items-center h-16 px-4 border-b border-white/10 shrink-0 gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-black text-sm">IW</span>
        </div>
        {!collapsed && (
          <span className="font-heading font-black text-sm tracking-widest text-white uppercase truncate flex-1">
            IWILLBUILD
          </span>
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="ml-auto w-7 h-7 bg-primary rounded-full flex items-center justify-center text-white hover:bg-orange-600 transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="ml-auto p-1 text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Main nav ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {navItems.map((item) => {
          if (!permsLoading && item.permKey && !can(item.permKey)) return null;
          const Icon = item.icon;
          const active = isActive(item.href);
          const isDazza = item.href === '/dazza-ai';

          return (
            <div key={item.href}>
              <Link
                to={item.href}
                onClick={() => {
                  if (isDazza) setDazzaOpen(o => !o);
                  onClose?.();
                }}
                title={collapsed ? item.label : undefined}
                className={linkClass(active)}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-sm font-semibold truncate flex-1">{item.label}</span>
                    {isDazza && (
                      <ChevronDown
                        size={13}
                        className={`shrink-0 transition-transform duration-200 ${dazzaOpen ? 'rotate-180' : ''}`}
                      />
                    )}
                  </>
                )}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150">
                    {item.label}
                  </div>
                )}
              </Link>

              {/* Annette — animated sub-item under Dazza AI */}
              {isDazza && !collapsed && (
                <AnimatePresence initial={false}>
                  {dazzaOpen && (
                    <motion.div
                      key="annette"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeInOut' as const }}
                      className="overflow-hidden"
                    >
                      <Link
                        to="/annette"
                        onClick={onClose}
                        className={subLinkClass(isActive('/annette'))}
                      >
                        <Activity size={14} className="shrink-0" />
                        <span className="text-xs font-semibold truncate">Dazza Health Check</span>
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          );
        })}

        {/* ── Admin group ── */}
        <div className="mt-3">
          {!collapsed && (
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-white/25 select-none">
              Admin
            </p>
          )}
          {collapsed && <div className="mx-3 border-t border-white/10 mb-2" />}

          {adminItems.map((item) => {
            if (!permsLoading && item.adminOnly && !isAdmin) return null;
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={linkClass(active)}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span className="text-sm font-semibold truncate flex-1">{item.label}</span>}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}

          {/* Owner Console — owner only */}
          {!permsLoading && isOwner && (() => {
            const active = isActive('/owner-console');
            return (
              <Link
                to="/owner-console"
                onClick={onClose}
                title={collapsed ? 'Owner Console' : undefined}
                className={`${linkClass(active)} border border-orange-500/20`}
              >
                <ShieldCheck size={17} className="shrink-0" />
                {!collapsed && <span className="text-sm font-semibold truncate flex-1">Owner Console</span>}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150">
                    Owner Console
                  </div>
                )}
              </Link>
            );
          })()}
        </div>
      </nav>

      {/* ── Divider ── */}
      <div className="mx-3 border-t border-white/10" />

      {/* ── Bottom strip ── */}
      <div className="py-3 px-2 flex flex-col gap-0.5">
        {/* Log out */}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Log out' : undefined}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/40 hover:bg-white/8 hover:text-red-400 transition-colors duration-150 group relative w-full"
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span className="text-sm font-semibold">Log out</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150">
              Log out
            </div>
          )}
        </button>

        {/* Trial / subscription banner */}
        {subInfo && !isOwner && subInfo.status !== 'active' && (
          <Link
            to="/billing"
            className={`mx-2 mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
              subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due'
                ? 'bg-red-500/20 hover:bg-red-500/30'
                : (subInfo.daysLeft ?? 14) <= 5
                ? 'bg-amber-500/20 hover:bg-amber-500/30'
                : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            {subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due' ? (
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
            ) : (
              <CreditCard size={13} className="text-amber-400 shrink-0" />
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                {subInfo.status === 'trial_expired' ? (
                  <p className="text-xs font-bold text-red-300">Trial expired</p>
                ) : subInfo.status === 'cancelled' ? (
                  <p className="text-xs font-bold text-red-300">Subscription cancelled</p>
                ) : subInfo.status === 'past_due' ? (
                  <p className="text-xs font-bold text-red-300">Payment past due</p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-amber-300">Free trial</p>
                    <p className="text-[10px] text-white/40">
                      {subInfo.daysLeft ?? 0} day{subInfo.daysLeft !== 1 ? 's' : ''} remaining
                    </p>
                  </>
                )}
              </div>
            )}
          </Link>
        )}

        {/* User strip */}
        {!collapsed && (sessionUser || me) && (() => {
          const displayName  = me?.user?.name  ?? sessionUser?.name  ?? '';
          const displayEmail = me?.user?.email ?? sessionUser?.email ?? '';
          const initial = (displayName || displayEmail || '?')[0].toUpperCase();
          return (
            <div className="mt-1 px-3 py-2.5 rounded-lg bg-white/5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white font-black text-xs shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white/80 truncate">{displayName || 'User'}</div>
                <div className="text-[10px] text-white/35 truncate">{displayEmail}</div>
              </div>
              <NotificationBell collapsed={collapsed} />
            </div>
          );
        })()}
        {collapsed && (
          <div className="flex justify-center mt-1">
            <NotificationBell collapsed={collapsed} />
          </div>
        )}
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ duration: 0.2, ease: 'easeInOut' as const }}
        className="relative hidden md:flex flex-col h-screen bg-[#1A1D23] text-white shrink-0 overflow-hidden"
        style={{ minWidth: collapsed ? 72 : 240 }}
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </motion.aside>

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
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
            />
            <motion.aside
              key="drawer"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: 'easeOut' as const }}
              className="fixed top-0 left-0 h-[100dvh] w-72 max-w-[85vw] bg-[#1A1D23] text-white flex flex-col z-50 md:hidden shadow-2xl"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <SidebarContent collapsed={false} onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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
