/**
 * NotificationBell
 * ─────────────────────────────────────────────────────────────────────────────
 * In-app notification bell. Shows unread count badge, opens a dropdown panel
 * listing real alerts from the database. Supports mark-as-read and mark-all.
 *
 * Polls every 60 seconds while the panel is closed.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Clock,
  Truck,
  FileText,
  DollarSign,
  HardHat,
  X,
  Loader2,
} from 'lucide-react';

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  createdAt: string;
  read: boolean;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  todo_overdue:      AlertTriangle,
  todo_due_today:    Clock,
  fleet_service_due: Truck,
  fleet_rego_due:    Truck,
  fleet_flag:        AlertTriangle,
  form_completed:    FileText,
  estimate_approved: DollarSign,
};

const TYPE_COLOR: Record<string, string> = {
  todo_overdue:      'text-red-500 bg-red-50',
  todo_due_today:    'text-amber-500 bg-amber-50',
  fleet_service_due: 'text-orange-500 bg-orange-50',
  fleet_rego_due:    'text-orange-500 bg-orange-50',
  fleet_flag:        'text-red-500 bg-red-50',
  form_completed:    'text-blue-500 bg-blue-50',
  estimate_approved: 'text-emerald-500 bg-emerald-50',
};

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/alerts', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { alerts: Alert[]; unreadCount: number };
      setAlerts(data.alerts);
      setUnreadCount(data.unreadCount);
    } catch { /* silent */ }
  }, []);

  // Initial load + poll every 60s
  useEffect(() => {
    void fetchAlerts();
    const interval = setInterval(() => { if (!open) void fetchAlerts(); }, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts, open]);

  // Reload when panel opens
  useEffect(() => {
    if (open) void fetchAlerts();
  }, [open, fetchAlerts]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function markRead(alertId: string) {
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, read: true } : a));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch('/api/notifications/read', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId }),
    });
  }

  async function markAllRead() {
    setLoading(true);
    const allIds = alerts.map((a) => a.id);
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnreadCount(0);
    await fetch('/api/notifications/read', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true, allIds }),
    });
    setLoading(false);
  }

  function handleAlertClick(alert: Alert) {
    if (!alert.read) void markRead(alert.id);
    if (alert.link) {
      setOpen(false);
      navigate(alert.link);
    }
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 ${
          open ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute left-0 top-10 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-[200] overflow-hidden"
            style={{ maxHeight: '480px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-slate-500" />
                <span className="font-heading font-bold text-sm text-slate-800">Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={loading}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 transition-colors px-2 py-1 rounded hover:bg-slate-100"
                  >
                    {loading ? <Loader2 size={10} className="animate-spin" /> : <CheckCheck size={10} />}
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors rounded">
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Alert list */}
            <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <HardHat size={28} className="mb-2 opacity-30" />
                  <p className="text-xs font-semibold">All clear — no alerts</p>
                </div>
              ) : (
                alerts.map((alert) => {
                  const Icon = TYPE_ICON[alert.type] ?? Bell;
                  const colorClass = TYPE_COLOR[alert.type] ?? 'text-slate-500 bg-slate-50';
                  return (
                    <div
                      key={alert.id}
                      onClick={() => handleAlertClick(alert)}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors duration-100 ${
                        alert.read ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50/70'
                      }`}
                    >
                      {/* Icon */}
                      <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${colorClass}`}>
                        <Icon size={13} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold truncate ${alert.read ? 'text-slate-600' : 'text-slate-900'}`}>
                            {alert.title}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">{formatRelative(alert.createdAt)}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{alert.message}</p>
                      </div>
                      {/* Unread dot */}
                      {!alert.read && (
                        <div className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
