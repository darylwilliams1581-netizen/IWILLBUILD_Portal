/**
 * Owner Console → Form Templates tab
 * Platform developer can view and install/re-install the default form
 * templates for any company.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FileText, CheckCircle2, XCircle, RefreshCw, Loader2,
  ChevronDown, AlertTriangle, Plus, Tag,
} from 'lucide-react';

interface Company {
  id: number;
  name: string;
  totalUsers: number;
}

interface FormTemplate {
  id: number;
  name: string;
  formType: string;
  category: string;
  description: string | null;
  isActive: boolean;
  onJobs: boolean;
  onFleet: boolean;
  onDashboard: boolean;
  createdAt: string;
}

interface Props {
  companies: Company[];
}

const CATEGORY_COLOURS: Record<string, string> = {
  Safety:     'bg-red-50 text-red-700 border-red-200',
  Fleet:      'bg-blue-50 text-blue-700 border-blue-200',
  Commercial: 'bg-amber-50 text-amber-700 border-amber-200',
  General:    'bg-slate-50 text-slate-600 border-slate-200',
};

function categoryBadge(cat: string) {
  return CATEGORY_COLOURS[cat] ?? 'bg-slate-50 text-slate-600 border-slate-200';
}

export default function FormTemplatesTab({ companies }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [force, setForce] = useState(false);

  const selectedCompany = companies.find(c => c.id === selectedId);

  const fetchTemplates = useCallback(async (companyId: number) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/owner-console/form-templates?companyId=${companyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setTemplates(data.templates ?? []);
    } catch (e) {
      setError(String(e));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchTemplates(selectedId);
  }, [selectedId, fetchTemplates]);

  async function handleInstall() {
    if (!selectedId) return;
    setInstalling(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/owner-console/form-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Install failed');
      setSuccessMsg(`Done — ${data.result}`);
      await fetchTemplates(selectedId);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  // Group by category
  const grouped = templates.reduce<Record<string, FormTemplate[]>>((acc, t) => {
    const cat = t.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl space-y-5">

      {/* Company selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Form Templates</h2>
            <p className="text-xs text-slate-400">View and install default form templates for any company</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(v => !v)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors min-w-[220px] justify-between"
            >
              <span>{selectedCompany ? selectedCompany.name : 'Select a company…'}</span>
              <ChevronDown size={14} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showDropdown && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-64 overflow-y-auto">
                {companies.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-3">No companies</p>
                ) : (
                  companies.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setShowDropdown(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${selectedId === c.id ? 'bg-violet-50 text-primary font-semibold' : 'text-slate-700'}`}
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-slate-400">{c.totalUsers} user{c.totalUsers !== 1 ? 's' : ''}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedId && (
            <>
              {/* Force re-install toggle */}
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={e => setForce(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                Force re-install (deletes existing)
              </label>

              {/* Install button */}
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
              >
                {installing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {installing ? 'Installing…' : 'Install Templates'}
              </button>

              {/* Refresh */}
              <button
                onClick={() => fetchTemplates(selectedId)}
                disabled={loading}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </>
          )}
        </div>

        {/* Feedback */}
        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <XCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            <CheckCircle2 size={14} className="shrink-0" />
            {successMsg}
          </div>
        )}
      </div>

      {/* Template list */}
      {selectedId && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800">
                {selectedCompany?.name} — Form Templates
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {loading ? 'Loading…' : `${templates.length} template${templates.length !== 1 ? 's' : ''} installed`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading templates…</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <AlertTriangle size={28} className="text-amber-400" />
              <p className="text-sm font-medium">No form templates installed</p>
              <p className="text-xs">Click "Install Templates" above to seed the defaults.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-5 py-2 bg-slate-50 flex items-center gap-2">
                    <Tag size={11} className="text-slate-400" />
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{category}</span>
                    <span className="text-[11px] text-slate-400">({items.length})</span>
                  </div>
                  {items.map(t => (
                    <div key={t.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <FileText size={13} className="text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-800">{t.name}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${categoryBadge(t.category)}`}>
                            {t.category}
                          </span>
                          {t.formType && t.formType !== t.category && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {t.formType}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
                          {t.onJobs && <span>Jobs</span>}
                          {t.onFleet && <span>Fleet</span>}
                          {t.onDashboard && <span>Dashboard</span>}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {t.isActive ? (
                          <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold">
                            <CheckCircle2 size={12} /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400">
                            <XCircle size={12} /> Inactive
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
