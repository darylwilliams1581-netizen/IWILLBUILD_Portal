import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
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
} from 'lucide-react';
import { signOut, useSession } from '@/lib/auth/auth-client';

const navItems = [
  { label: 'Dashboard',  icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Jobs',       icon: HardHat,         href: '/jobs' },
  { label: 'Fleet',      icon: Truck,           href: '/fleet' },
  { label: 'Forms',      icon: FileText,        href: '/forms',      soon: true },
  { label: 'Files',      icon: FolderOpen,      href: '/files',      soon: true },
  { label: 'Estimating', icon: Calculator,      href: '/estimating', soon: true },
  { label: 'Downloads',  icon: Download,        href: '/downloads' },
  { label: 'Dazza AI',   icon: Bot,             href: '/dazza-ai' },
];

const bottomItems = [
  { label: 'Team',     icon: Users,    href: '/team' },
  { label: 'Settings', icon: Settings, href: '/settings' },
];

export default function PortalSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useSession();

  const isActive = (href: string) => location.pathname === href;

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.2, ease: 'easeInOut' as const }}
      className="relative flex flex-col h-screen bg-[#1A1D23] text-white shrink-0 overflow-hidden"
      style={{ minWidth: collapsed ? 72 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/10 shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-black text-sm">IW</span>
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="ml-2.5 font-heading font-black text-sm tracking-widest text-white uppercase truncate"
          >
            IWILLBUILD
          </motion.span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group relative ${
                active
                  ? 'bg-primary text-white'
                  : 'text-white/60 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && (
                <span className="text-sm font-semibold truncate flex-1">{item.label}</span>
              )}
              {!collapsed && item.soon && (
                <span className="text-[10px] font-bold bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full shrink-0">
                  Soon
                </span>
              )}
              {/* Tooltip when collapsed */}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150">
                  {item.label}
                  {item.soon && ' (Coming soon)'}
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
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 group relative ${
                active
                  ? 'bg-primary text-white'
                  : 'text-white/60 hover:bg-white/8 hover:text-white'
              }`}
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
        {!collapsed && user && (
          <div className="mt-1 px-3 py-2.5 rounded-lg bg-white/5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white font-black text-xs shrink-0">
              {(user.name || user.email || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white/80 truncate">{user.name || 'User'}</div>
              <div className="text-[10px] text-white/35 truncate">{user.email}</div>
            </div>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute top-[52px] -right-3 w-6 h-6 bg-[#1A1D23] border border-white/20 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:border-white/40 transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  );
}
