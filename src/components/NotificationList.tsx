/**
 * NotificationList
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline notification list for embedding in sheets/panels (no dropdown).
 * Shares the same API + types as NotificationBell.
 */
import { useState, useEffect, useCallback } from 'react';
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

export default function NotificationList() {
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [unreadCount, setUnread]  = useState(0);
  const [loading, setLoading]     = useState(false);
  const [fetching, setFetching]   = useState(true);
  const navigate = useNavigate();

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/alerts', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { alerts: Alert[]; unreadCount: number };
      setAlerts(data.alerts);
      setUnread(data.unreadCount);
    } catch { /* silent */ } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { void fetchAlerts(); }, [fetchAlerts]);

  async function markRead(alertId: string) {
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, read: true } : a));
    setUnread((c) => Math.max(0, c - 1));
    await fetch('/api/notifications/read', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId }),
    });
  }

  async function markAllRead() {
    setLoading(true);
    const allIds = alerts.map((a) => a.id);
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnread(0);
    await fetch('/api/notifications/read', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true, allIds }),
    });
    setLoading(false);
  }

  function handleClick(alert: Alert) {
    if (!alert.read) void markRead(alert.id);
    if (alert.link) navigate(alert.link);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
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
      </div>

      {/* List */}
      <div>
        {fetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-slate-300" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <HardHat size={28} className="mb-2 opacity-30" />
            <p className="text-xs font-semibold">All clear — no alerts</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const Icon       = TYPE_ICON[alert.type]  ?? Bell;
            const colorClass = TYPE_COLOR[alert.type] ?? 'text-slate-500 bg-slate-50';
            return (
              <div
                key={alert.id}
                onClick={() => handleClick(alert)}
                className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0 cursor-pointer transition-colors duration-100 ${
                  alert.read ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50/70'
                }`}
              >
                <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${colorClass}`}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold truncate ${alert.read ? 'text-slate-600' : 'text-slate-900'}`}>
                      {alert.title}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">{formatRelative(alert.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{alert.message}</p>
                </div>
                {!alert.read && (
                  <div className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
