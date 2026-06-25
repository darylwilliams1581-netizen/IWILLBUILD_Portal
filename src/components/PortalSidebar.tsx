import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Jobs', icon: HardHat, href: '/jobs' },
  { label: 'Fleet', icon: Truck, href: '/fleet' },
  { label: 'Downloads', icon: Download, href: '/downloads' },
  { label: 'Dazza AI', icon: Bot, href: '/dazza-ai' },
];

export default function PortalSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.2, ease: 'easeInOut' as const }}
      className="relative flex flex-col h-screen bg-[#1A1D23] text-white shrink-0 overflow-hidden"
      style={{ minWidth: collapsed ? 72 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-white/10">
        <img
          src="/airo-assets/images/logo/horizontal"
          alt="IWILLBUILD"
          className="h-8 w-auto object-contain shrink-0"
        />
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="ml-2 font-heading font-bold text-sm tracking-widest text-white uppercase truncate"
          >
            Portal
          </motion.span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-md transition-all duration-150 group ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-white/10 p-3">
        <button
          className="flex items-center gap-3 w-full px-2 py-2 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150"
          onClick={() => {}}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span className="text-sm">Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-[#1A1D23] border border-white/20 text-white/60 hover:text-white transition-colors duration-150"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  );
}
