import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  HardHat,
  Truck,
  Download,
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
} from 'lucide-react';
import { signOut, useSession } from '@/lib/auth/auth-client';
import { usePermissions, useMe } from '@/lib/usePermissions';
import NotificationBell from '@/components/NotificationBell';

const navItems = [
  { label: 'Dashboard',  icon: LayoutDashboard, href: '/dashboard',  permKey: null },
  { label: 'Dazza AI',   icon: Bot,             href: '/dazza-ai',   permKey: 'dazzaAi' },
  { label: 'Jobs',       icon: HardHat,         href: '/jobs',       permKey: 'jobs' },
  { label: 'Fleet',      icon: Truck,           href: '/fleet',      permKey: 'fleet' },
  { label: 'Forms',      icon: FileText,        href: '/forms',      permKey: 'forms' },
  { label: 'Files',      icon: FolderOpen,      href: '/files',      permKey: 'files' },
  { label: 'Estimating', icon: Calculator,      href: '/estimating', permKey: 'estimating' },
  { label: 'Downloads',  icon: Download,        href: '/downloads',  permKey: null },
] as const;

const bottomItems = [
  { label: 'Team',     icon: Users,    href: '/team' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

// ─── Shared nav content ───────────────────────────────────────────────────────
function SidebarContent({
  collapsed,
  onClose,
}: {
  collapsed: boolean;
  onClose?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: sessionUser } = useSession();
  const { me } = useMe();
  const { isAdmin, loading: permsLoading, can, isOwner } = usePermissions();

  const isActive = (href: string) => location.pathname === href;

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group relative ${
      active ? 'bg-primary text-white' : 'text-white/60 hover:bg-white/8 hover:text-white'
    }`;

  return (
    <>
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/10 shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-black text-sm">IW</span>
        </div>
        {!collapsed && (
          <span className="ml-2.5 font-heading font-black text-sm tracking-widest text-white uppercase truncate">
            IWILLBUILD
          </span>
        )}
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 text-white/40 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {navItems.map((item) => {
          // Hide module while loading to avoid flicker, then gate by permission
          if (!permsLoading && item.permKey && !can(item.permKey)) return null;
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
              {!collapsed && (
                <span className="text-sm font-semibold truncate flex-1">{item.label}</span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-white/10" />

      {/* Bottom nav */}
      <div className="py-3 px-2 flex flex-col gap-0.5">
        {bottomItems.map((item) => {
          // Hide Team and Settings for non-admin users (show while loading to avoid flicker)
          if (!permsLoading && !isAdmin && (item.href === '/team' || item.href === '/settings')) {
            return null;
          }
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
              {!collapsed && (
                <span className="text-sm font-semibold truncate">{item.label}</span>
              )}
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
              {!collapsed && (
                <span className="text-sm font-semibold truncate flex-1">Owner Console</span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150">
                  Owner Console
                </div>
              )}
            </Link>
          );
        })()}

        {/* Logout */}
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
        {/* Collapsed bell */}
        {collapsed && (
          <div className="flex justify-center mt-1">
            <NotificationBell collapsed={collapsed} />
          </div>
        )}
      </div>
    </>
  );
}

// ─── Mobile hamburger button (exported for use in top bar) ───────────────────
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
      {/* ── Desktop sidebar (md+) ── */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ duration: 0.2, ease: 'easeInOut' as const }}
        className="relative hidden md:flex flex-col h-screen bg-[#1A1D23] text-white shrink-0 overflow-hidden"
        style={{ minWidth: collapsed ? 72 : 240 }}
      >
        <SidebarContent collapsed={collapsed} />

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-[52px] -right-4 w-8 h-8 bg-primary border-2 border-white/20 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-orange-600 transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </motion.aside>

      {/* ── Mobile: hamburger button lives in top bar via MobileMenuButton ── */}
      {/* ── Mobile: overlay drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
            />
            {/* Drawer */}
            <motion.aside
              key="drawer"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: 'easeOut' as const }}
              className="fixed top-0 left-0 h-full w-64 bg-[#1A1D23] text-white flex flex-col z-50 md:hidden"
            >
              <SidebarContent collapsed={false} onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Expose open handler via a hidden trigger — consumed by MobileMenuButton in top bar */}
      {/* We use a global custom event so the top bar can open the drawer without prop drilling */}
      <MobileMenuTrigger onOpen={() => setMobileOpen(true)} />
    </>
  );
}

// Listens for a custom event dispatched by MobileMenuButton in the top bar
function MobileMenuTrigger({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener('portal:open-menu', handler);
    return () => window.removeEventListener('portal:open-menu', handler);
  }, [onOpen]);
  return null;
}
