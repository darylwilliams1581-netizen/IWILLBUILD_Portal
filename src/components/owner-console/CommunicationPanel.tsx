/**
 * CommunicationPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner Console panel for drafting, approving, and managing customer-facing
 * communications for a specific incident.
 *
 * Dazza can create drafts; only the Owner can approve them for display.
 * Embedded inside IncidentQueueTab when an incident is selected.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Plus, CheckCircle2, X, Eye, EyeOff,
  Loader2, AlertTriangle, Send, Edit3, Trash2, RefreshCw,
  Users, Building2, Globe, Smartphone,
} from 'lucide-react';

interface Communication {
  id: string;
  incident_id: string | null;
  comm_type: string;
  channel: string;
  status: string;
  title: string;
  message: string;
  workaround: string | null;
  action_label: string | null;
  action_url: string | null;
  target_scope: string;
  target_company_id: number | null;
  is_dismissible: boolean;
  is_critical: boolean;
  approved_at: string | null;
  display_from: string | null;
  display_until: string | null;
  removed_at: string | null;
  view_count: number;
  dismiss_count: number;
  still_trouble_count: number;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  banner: 'Dashboard Banner',
  popup: 'Temporary Popup',
  modal: 'Critical Modal',
  resolved: 'Resolved Notification',
  acknowledgement: 'Acknowledgement',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-300',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  rejected: 'bg-red-100 text-red-600 border-red-300',
  resolved: 'bg-blue-100 text-blue-600 border-blue-300',
};

interface Props {
  incidentId: string;
  incidentTitle: string;
}

export default function CommunicationPanel({ incidentId, incidentTitle }: Props) {
  const [comms, setComms] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state
  const [formType, setFormType] = useState('banner');
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formWorkaround, setFormWorkaround] = useState('');
  const [formScope, setFormScope] = useState('affected_users');
  const [formCompanyId, setFormCompanyId] = useState('');
  const [formCritical, setFormCritical] = useState(false);
  const [formDismissible, setFormDismissible] = useState(true);
  const [formApproveNow, setFormApproveNow] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dazza/v3/communications/owner?incidentId=${incidentId}&limit=20`, {
        credentials: 'include',
      });
      const d = await res.json() as { communications?: Communication[] };
      setComms(d.communications ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [incidentId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formMessage.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/dazza/v3/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          incidentId,
          commType: formType,
          title: formTitle,
          message: formMessage,
          workaround: formWorkaround || undefined,
          targetScope: formScope,
          targetCompanyId: formCompanyId ? parseInt(formCompanyId, 10) : undefined,
          isCritical: formCritical,
          isDismissible: formDismissible,
          approveImmediately: formApproveNow,
        }),
      });
      setShowForm(false);
      setFormTitle('');
      setFormMessage('');
      setFormWorkaround('');
      setFormCompanyId('');
      setFormCritical(false);
      setFormDismissible(true);
      setFormApproveNow(false);
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleAction(id: string, action: string) {
    setActionLoading(id + action);
    try {
      await fetch(`/api/dazza/v3/communications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      await load();
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  const SCOPE_ICONS: Record<string, React.ReactNode> = {
    all: <Globe size={11} />,
    affected_users: <Users size={11} />,
    company: <Building2 size={11} />,
    user: <Users size={11} />,
    build: <Smartphone size={11} />,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-violet-500" />
          <span className="text-xs font-bold text-slate-700">Customer Communications</span>
          <span className="text-[10px] text-slate-400">— {incidentTitle.slice(0, 40)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors"
          >
            <Plus size={11} /> Draft message
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={(e) => void handleCreate(e)} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-xs font-bold text-slate-600">New communication draft</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Type</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Audience</label>
              <select
                value={formScope}
                onChange={e => setFormScope(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <option value="affected_users">Affected users</option>
                <option value="company">Specific company</option>
                <option value="all">All users</option>
                <option value="build">Specific build</option>
              </select>
            </div>
          </div>

          {formScope === 'company' && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Company ID</label>
              <input
                type="number"
                value={formCompanyId}
                onChange={e => setFormCompanyId(e.target.value)}
                placeholder="e.g. 42"
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Title</label>
            <input
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="e.g. We noticed an issue affecting Quote Email"
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Message</label>
            <textarea
              value={formMessage}
              onChange={e => setFormMessage(e.target.value)}
              placeholder="Customer-facing message. Do not include internal details, stack traces, or speculative diagnoses."
              rows={3}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Workaround (optional)</label>
            <input
              value={formWorkaround}
              onChange={e => setFormWorkaround(e.target.value)}
              placeholder="Safe workaround to show the user"
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={formCritical} onChange={e => setFormCritical(e.target.checked)} className="rounded" />
              Critical (blocking modal)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={formDismissible} onChange={e => setFormDismissible(e.target.checked)} className="rounded" />
              Dismissible
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={formApproveNow} onChange={e => setFormApproveNow(e.target.checked)} className="rounded" />
              Approve &amp; display now
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {formApproveNow ? 'Approve & Display' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Communications list */}
      {loading && <div className="flex items-center justify-center py-4 text-slate-400"><Loader2 size={14} className="animate-spin" /></div>}

      {!loading && comms.length === 0 && (
        <div className="text-center py-4 text-slate-400 text-xs">
          No communications yet. Draft a message to inform affected users.
        </div>
      )}

      {comms.map(comm => {
        const statusInfo = STATUS_COLORS[comm.status] ?? STATUS_COLORS.draft;
        const isActive = comm.status === 'approved' && !comm.removed_at;

        return (
          <div key={comm.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusInfo}`}>
                    {comm.status.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-500">{TYPE_LABELS[comm.comm_type] ?? comm.comm_type}</span>
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                    {SCOPE_ICONS[comm.target_scope]} {comm.target_scope}
                    {comm.target_company_id ? ` (co. ${comm.target_company_id})` : ''}
                  </span>
                  {comm.is_critical && (
                    <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">CRITICAL</span>
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-800">{comm.title}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{comm.message}</p>
                {comm.workaround && (
                  <p className="text-[10px] text-slate-500 mt-1 italic">Workaround: {comm.workaround}</p>
                )}
                {isActive && (
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                    <span>{comm.view_count} views</span>
                    <span>{comm.dismiss_count} dismissed</span>
                    {comm.still_trouble_count > 0 && (
                      <span className="text-red-500 font-semibold">{comm.still_trouble_count} still having trouble</span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                {comm.status === 'draft' && (
                  <>
                    <button
                      onClick={() => void handleAction(comm.id, 'approve')}
                      disabled={actionLoading === comm.id + 'approve'}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-colors disabled:opacity-60"
                    >
                      {actionLoading === comm.id + 'approve' ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle2 size={9} />}
                      Approve
                    </button>
                    <button
                      onClick={() => void handleAction(comm.id, 'reject')}
                      disabled={actionLoading === comm.id + 'reject'}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-[10px] font-semibold transition-colors disabled:opacity-60"
                    >
                      <X size={9} /> Reject
                    </button>
                  </>
                )}
                {isActive && (
                  <>
                    <button
                      onClick={() => void handleAction(comm.id, 'resolve')}
                      disabled={actionLoading === comm.id + 'resolve'}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold transition-colors disabled:opacity-60"
                    >
                      {actionLoading === comm.id + 'resolve' ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle2 size={9} />}
                      Resolve
                    </button>
                    <button
                      onClick={() => void handleAction(comm.id, 'remove')}
                      disabled={actionLoading === comm.id + 'remove'}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 text-[10px] font-semibold transition-colors disabled:opacity-60"
                    >
                      <EyeOff size={9} /> Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
