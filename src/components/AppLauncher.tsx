/**
 * AppLauncher — Microsoft 365-style 9-dot portal launcher.
 *
 * Desktop-only. Renders a 3×3 dot grid button that opens a floating panel
 * containing all portal module tiles. Clicking a tile navigates to that
 * module and closes the panel.
 *
 * Designed to be placed in the PortalSidebar header (desktop rail only).
 * Mobile: renders nothing — the mobile home grid is the equivalent pattern.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from "react-router";
import { createPortal } from 'react-dom';
import { HardHat, Zap, Calculator, Receipt, CalendarDays, FileText, ClipboardList, BookOpen, Truck, Map, ShieldCheck, Users, UserCircle, TableProperties, ScrollText, Link2, Building2, FolderOpen, LayoutDashboard, AlertCircle, FileStack, History } from 'lucide-react';

// ── Module definitions ────────────────────────────────────────────────────────
interface LauncherModule {
  label: string;
  icon: React.ElementType;
  href: string;
  color: string; // icon colour
  bg: string; // icon background
}
const LAUNCHER_MODULES: LauncherModule[] = [
// Row 1 — Core ops
{
  label: 'Dashboard',
  icon: LayoutDashboard,
  href: '/home',
  color: '#1263d8',
  bg: '#eff6ff'
}, {
  label: 'Jobs',
  icon: HardHat,
  href: '/jobs',
  color: '#0891b2',
  bg: '#ecfeff'
}, {
  label: 'Job Cards',
  icon: Zap,
  href: '/job-cards',
  color: '#ca8a04',
  bg: '#fefce8'
},
// Row 2
{
  label: 'Estimating',
  icon: Calculator,
  href: '/estimating',
  color: '#7c3aed',
  bg: '#f5f3ff'
}, {
  label: 'Invoices',
  icon: Receipt,
  href: '/invoices',
  color: '#0284c7',
  bg: '#f0f9ff'
}, {
  label: 'Scheduler',
  icon: CalendarDays,
  href: '/scheduler',
  color: '#059669',
  bg: '#ecfdf5'
},
// Row 3 — Docs & content
{
  label: 'App Docs',
  icon: FileText,
  href: '/studio/documents',
  color: '#0891b2',
  bg: '#ecfeff'
}, {
  label: 'Forms',
  icon: ClipboardList,
  href: '/studio/forms',
  color: '#6366f1',
  bg: '#eef2ff'
}, {
  label: 'Library',
  icon: BookOpen,
  href: '/studio/library',
  color: '#b45309',
  bg: '#fffbeb'
},
// Row 4 — Assets & field
{
  label: 'Files',
  icon: FolderOpen,
  href: '/files',
  color: '#7c3aed',
  bg: '#fff7ed'
}, {
  label: 'Fleet',
  icon: Truck,
  href: '/fleet',
  color: '#059669',
  bg: '#ecfdf5'
}, {
  label: 'Plan Manager',
  icon: Map,
  href: '/plan-manager',
  color: '#16a34a',
  bg: '#f0fdf4'
},
// Row 5 — Safety & compliance
{
  label: 'Safety',
  icon: ShieldCheck,
  href: '/safety',
  color: '#dc2626',
  bg: '#fef2f2'
}, {
  label: 'Incidents',
  icon: AlertCircle,
  href: '/incidents',
  color: '#b91c1c',
  bg: '#fff1f2'
}, {
  label: 'Equipment',
  icon: Building2,
  href: '/studio/asset-manager',
  color: '#64748b',
  bg: '#f1f5f9'
},
// Row 6 — People
{
  label: 'Contacts',
  icon: Users,
  href: '/customers',
  color: '#7c3aed',
  bg: '#f5f3ff'
}, {
  label: 'Team',
  icon: UserCircle,
  href: '/team',
  color: '#0f172a',
  bg: '#f1f5f9'
}, {
  label: 'Lists',
  icon: TableProperties,
  href: '/lists',
  color: '#0891b2',
  bg: '#ecfeff'
},
// Row 7 — Admin & tools
{
  label: 'User Logs',
  icon: ScrollText,
  href: '/user-logs',
  color: '#64748b',
  bg: '#f8fafc'
}, {
  label: 'Quick Links',
  icon: Link2,
  href: '/quick-links',
  color: '#6366f1',
  bg: '#eef2ff'
}, {
  label: 'Job Field Docs',
  icon: FileStack,
  href: '/job-docs',
  color: '#0891b2',
  bg: '#ecfeff'
}, {
  label: 'Sign-in History',
  icon: History,
  href: '/signin-history',
  color: '#64748b',
  bg: '#f8fafc'
}];

// ── 9-dot icon ────────────────────────────────────────────────────────────────
function NineDotIcon({
  size = 16,
  color = 'currentColor'
}: {
  size?: number;
  color?: string;
}) {
  const gap = size * 0.28;
  const dot = size * 0.22;
  const step = dot + gap;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true">
      {[0, 1, 2].map(row => [0, 1, 2].map(col => <rect key={`${row}-${col}`} x={col * step + gap / 2} y={row * step + gap / 2} width={dot} height={dot} rx={dot * 0.3} fill={color} />))}
    </svg>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [panelPos, setPanelPos] = useState({
    top: 60,
    left: 248
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Compute panel position from button's real DOM rect
  const updatePos = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 6,
      // Anchor panel right-edge to button right-edge so it doesn't overflow viewport
      left: Math.min(rect.left, window.innerWidth - 348)
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Focus search when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);
  const handleToggle = useCallback(() => {
    updatePos();
    setOpen(v => !v);
    if (open) setSearch('');
  }, [open, updatePos]);
  const handleNavigate = useCallback((href: string) => {
    setOpen(false);
    setSearch('');
    navigate(href);
  }, [navigate]);
  const filtered = search.trim() ? LAUNCHER_MODULES.filter(m => m.label.toLowerCase().includes(search.trim().toLowerCase())) : LAUNCHER_MODULES;

  // Panel rendered via portal — escapes sidebar stacking context so clicks work
  const panel = open ? createPortal(<div ref={panelRef} role="dialog" aria-label="App launcher" style={{
    position: 'fixed',
    top: panelPos.top,
    left: panelPos.left,
    zIndex: 99999,
    width: 340,
    maxHeight: 'calc(100dvh - 80px)',
    overflowY: 'auto',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    boxShadow: '0 8px 40px rgba(15,23,42,.14), 0 2px 8px rgba(15,23,42,.06)',
    display: 'flex',
    flexDirection: 'column'
  }}>
      {/* Panel header */}
      <div style={{
      padding: '14px 16px 10px',
      borderBottom: '1px solid #f1f5f9',
      flexShrink: 0
    }}>
        <p style={{
        margin: '0 0 10px',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: '#94a3b8'
      }}>
          IWILLBUILD Portal
        </p>

        {/* Search */}
        <div style={{
        position: 'relative'
      }}>
          <svg style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none'
        }} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input ref={searchRef} type="text" placeholder="Search modules…" value={search} onChange={e => setSearch(e.target.value)} style={{
          width: '100%',
          padding: '7px 10px 7px 30px',
          borderRadius: 8,
          border: '1.5px solid #e2e8f0',
          fontSize: 13,
          color: '#0f172a',
          background: '#f8fafc',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s'
        }} onFocus={e => {
          e.currentTarget.style.borderColor = '#1263d8';
        }} onBlur={e => {
          e.currentTarget.style.borderColor = '#e2e8f0';
        }} />
        </div>
      </div>

      {/* Module grid */}
      <div style={{
      padding: '12px 12px 16px',
      flex: 1
    }}>
        {filtered.length === 0 ? <p style={{
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: 13,
        padding: '24px 0'
      }}>
            No modules match "{search}"
          </p> : <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 4
      }}>
            {filtered.map(mod => {
          const Icon = mod.icon;
          return <button key={mod.href + mod.label} onClick={() => handleNavigate(mod.href)} title={mod.label} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '10px 4px 8px',
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'background 0.12s'
          }} className="hover:bg-slate-50 group">
                  {/* Icon tile */}
                  <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: mod.bg,
              border: `1px solid ${mod.color}18`,
              display: 'grid',
              placeItems: 'center',
              transition: 'transform 0.12s, box-shadow 0.12s',
              flexShrink: 0
            }} className="group-hover:shadow-sm group-hover:scale-105">
                    <Icon size={20} color={mod.color} strokeWidth={1.8} />
                  </div>

                  {/* Label */}
                  <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#374151',
              textAlign: 'center',
              lineHeight: 1.2,
              maxWidth: 64,
              wordBreak: 'break-word'
            }}>
                    {mod.label}
                  </span>
                </button>;
        })}
          </div>}
      </div>
    </div>, document.body) : null;
  return (
    // Desktop-only wrapper — mobile uses the home grid
    <div className="hidden md:block relative" style={{
      flexShrink: 0
    }}>
      {/* ── 9-dot trigger button ── */}
      <button ref={buttonRef} onClick={handleToggle} aria-label="Open app launcher" aria-expanded={open} aria-haspopup="dialog" title="All apps" style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        background: open ? '#fff7ed' : 'transparent',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        transition: 'background 0.12s',
        flexShrink: 0
      }} className="hover:bg-violet-50">
        <NineDotIcon size={16} color={open ? '#ea580c' : '#7c3aed'} />
      </button>

      {panel}
    </div>
  );
}
