/**
 * /risk-register — Company Risk Register
 *
 * Top-level register of all identified hazards and risks across the company.
 * Each entry captures: hazard, likelihood × consequence → risk level,
 * controls, responsible person, due date, and status.
 *
 * Risk matrix (AS/NZS ISO 31000 inspired):
 *   Likelihood:  rare | unlikely | possible | likely | almost_certain
 *   Consequence: insignificant | minor | moderate | major | catastrophic
 *   Risk level:  low | medium | high | extreme
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import {
  ShieldAlert, Plus, Filter, X, ChevronRight, Loader2,
  Search, Home, AlertTriangle, CheckCircle2, Clock,
  User, CalendarDays, Briefcase, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RiskEntry {
  id: number;
  company_id: number;
  job_id: number | null;
  job_number: string | null;
  job_name: string | null;
  site_address: string | null;
  title: string;
  description: string | null;
  category: string | null;
  hazard_source: string | null;
  who_is_at_risk: string | null;
  existing_controls: string | null;
  likelihood: string;
  consequence: string;
  risk_level: string;
  additional_controls: string | null;
  responsible_person: string | null;
  due_date: string | null;
  identified_date: string;
  status: string;
  review_date: string | null;
  notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const LIKELIHOOD_OPTIONS = [
  { value: 'rare',           label: 'Rare',           desc: 'May occur only in exceptional circumstances' },
  { value: 'unlikely',       label: 'Unlikely',       desc: 'Could occur at some time' },
  { value: 'possible',       label: 'Possible',       desc: 'Might occur at some time' },
  { value: 'likely',         label: 'Likely',         desc: 'Will probably occur in most circumstances' },
  { value: 'almost_certain', label: 'Almost certain', desc: 'Is expected to occur in most circumstances' },
];

export const CONSEQUENCE_OPTIONS = [
  { value: 'insignificant', label: 'Insignificant', desc: 'No injuries, low financial loss' },
  { value: 'minor',         label: 'Minor',         desc: 'First aid treatment, medium financial loss' },
  { value: 'moderate',      label: 'Moderate',      desc: 'Medical treatment required, high financial loss' },
  { value: 'major',         label: 'Major',         desc: 'Extensive injuries, major financial loss' },
  { value: 'catastrophic',  label: 'Catastrophic',  desc: 'Death or permanent disability, huge financial loss' },
];

export const RISK_LEVEL_OPTIONS = [
  { value: 'low',     label: 'Low',     color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'medium',  label: 'Medium',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'high',    label: 'High',    color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'extreme', label: 'Extreme', color: 'bg-red-100 text-red-700 border-red-200' },
];

export const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: 'bg-blue-100 text-blue-700' },
  { value: 'in_progress', label: 'In progress', color: 'bg-amber-100 text-amber-700' },
  { value: 'controlled',  label: 'Controlled',  color: 'bg-violet-100 text-violet-700' },
  { value: 'closed',      label: 'Closed',      color: 'bg-slate-100 text-slate-500' },
];

export const RISK_CATEGORIES = [
  'Physical / manual handling',
  'Working at heights',
  'Electrical',
  'Hazardous chemicals / substances',
  'Plant & equipment',
  'Vehicles & traffic',
  'Environmental',
  'Fire & explosion',
  'Psychological / fatigue',
  'Biological',
  'Structural / excavation',
  'Public / third party',
  'Other',
];

/** Derive risk level from likelihood × consequence using a 5×5 matrix */
export function deriveRiskLevel(likelihood: string, consequence: string): string {
  const L: Record<string, number> = { rare: 1, unlikely: 2, possible: 3, likely: 4, almost_certain: 5 };
  const C: Record<string, number> = { insignificant: 1, minor: 2, moderate: 3, major: 4, catastrophic: 5 };
  const score = (L[likelihood] ?? 3) * (C[consequence] ?? 3);
  if (score <= 3)  return 'low';
  if (score <= 8)  return 'medium';
  if (score <= 15) return 'high';
  return 'extreme';
}

export function riskLevelStyle(level: string) {
  return RISK_LEVEL_OPTIONS.find(r => r.value === level)?.color ?? 'bg-slate-100 text-slate-500 border-slate-200';
}

export function statusStyle(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color ?? 'bg-slate-100 text-slate-500';
}

// ── New Entry Modal ───────────────────────────────────────────────────────────

interface NewRiskModalProps {
  onClose: () => void;
  onSaved: (entry: RiskEntry) => void;
}

function NewRiskModal({ onClose, onSaved }: NewRiskModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    hazard_source: '',
    who_is_at_risk: '',
    existing_controls: '',
    likelihood: 'possible',
    consequence: 'moderate',
    additional_controls: '',
    responsible_person: '',
    due_date: '',
    identified_date: new Date().toISOString().slice(0, 10),
    status: 'open',
    notes: '',
  });

  const riskLevel = deriveRiskLevel(form.likelihood, form.consequence);

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/risk-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, risk_level: riskLevel }),
      });
      if (!r.ok) {
        const d = await r.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      const entry = await r.json() as RiskEntry;
      onSaved(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-orange-500" />
            <h2 className="font-bold text-slate-800 text-base">New Risk Entry</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Risk / Hazard title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Working at heights — roof edge"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Category</label>
            <select
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">Select category…</option>
              {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              placeholder="Describe the hazard or risk situation…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          {/* Hazard source + who is at risk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Hazard source</label>
              <input
                type="text"
                value={form.hazard_source}
                onChange={e => set('hazard_source', e.target.value)}
                placeholder="e.g. Scaffold, power tools"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Who is at risk</label>
              <input
                type="text"
                value={form.who_is_at_risk}
                onChange={e => set('who_is_at_risk', e.target.value)}
                placeholder="e.g. All workers on site"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* Existing controls */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Existing controls</label>
            <textarea
              value={form.existing_controls}
              onChange={e => set('existing_controls', e.target.value)}
              rows={2}
              placeholder="Controls already in place…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          {/* Risk matrix */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Risk assessment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Likelihood <span className="text-red-500">*</span></label>
                <select
                  value={form.likelihood}
                  onChange={e => set('likelihood', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  {risk_register.LIKELIHOOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Consequence <span className="text-red-500">*</span></label>
                <select
                  value={form.consequence}
                  onChange={e => set('consequence', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  {risk_register.CONSEQUENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {/* Derived risk level badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Risk level:</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${riskLevelStyle(riskLevel)}`}>
                {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
              </span>
            </div>
          </div>

          {/* Additional controls */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Additional controls required</label>
            <textarea
              value={form.additional_controls}
              onChange={e => set('additional_controls', e.target.value)}
              rows={2}
              placeholder="Further controls needed to reduce risk…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          {/* Responsible person + due date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Responsible person</label>
              <input
                type="text"
                value={form.responsible_person}
                onChange={e => set('responsible_person', e.target.value)}
                placeholder="Name or role"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* Identified date + status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Date identified</label>
              <input
                type="date"
                value={form.identified_date}
                onChange={e => set('identified_date', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Any additional notes…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? 'Saving…' : 'Save risk'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Risk Entry Card ───────────────────────────────────────────────────────────

interface RiskCardProps {
  entry: RiskEntry;
  onStatusChange: (id: number, status: string) => void;
}

function RiskCard({ entry, onStatusChange }: RiskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const isOverdue = entry.due_date && entry.status !== 'closed' &&
    new Date(entry.due_date) < new Date();

  async function handleStatusChange(newStatus: string) {
    setUpdatingStatus(true);
    try {
      const r = await fetch(`/api/risk-register/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, ...(newStatus === 'closed' ? { closed_at: new Date().toISOString() } : {}) }),
      });
      if (r.ok) onStatusChange(entry.id, newStatus);
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border transition-colors ${
      entry.risk_level === 'extreme' ? 'border-red-200' :
      entry.risk_level === 'high'    ? 'border-orange-200' :
      'border-slate-100'
    }`}>
      {/* Main row */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start gap-3">
          {/* Risk level indicator */}
          <div className={`w-1.5 self-stretch rounded-full shrink-0 ${
            entry.risk_level === 'extreme' ? 'bg-red-500' :
            entry.risk_level === 'high'    ? 'bg-orange-500' :
            entry.risk_level === 'medium'  ? 'bg-amber-400' :
            'bg-emerald-400'
          }`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 leading-snug">{entry.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riskLevelStyle(entry.risk_level)}`}>
                  {entry.risk_level.charAt(0).toUpperCase() + entry.risk_level.slice(1)}
                </span>
                {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
              </div>
            </div>

            {entry.category && (
              <p className="text-xs text-slate-400 mt-0.5">{entry.category}</p>
            )}

            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle(entry.status)}`}>
                {STATUS_OPTIONS.find(s => s.value === entry.status)?.label ?? entry.status}
              </span>
              {entry.job_name && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Briefcase size={10} /> {entry.job_name}
                </span>
              )}
              {entry.responsible_person && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <User size={10} /> {entry.responsible_person}
                </span>
              )}
              {entry.due_date && (
                <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                  <CalendarDays size={10} />
                  {isOverdue ? 'Overdue · ' : ''}
                  {new Date(entry.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
          {/* Assessment row */}
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-slate-400">Likelihood</span>
              <p className="font-semibold text-slate-700 capitalize">{entry.likelihood.replace('_', ' ')}</p>
            </div>
            <div>
              <span className="text-slate-400">Consequence</span>
              <p className="font-semibold text-slate-700 capitalize">{entry.consequence}</p>
            </div>
            <div>
              <span className="text-slate-400">Identified</span>
              <p className="font-semibold text-slate-700">
                {new Date(entry.identified_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {entry.description && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Description</p>
              <p className="text-sm text-slate-700">{entry.description}</p>
            </div>
          )}
          {entry.hazard_source && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Hazard source</p>
              <p className="text-sm text-slate-700">{entry.hazard_source}</p>
            </div>
          )}
          {entry.who_is_at_risk && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Who is at risk</p>
              <p className="text-sm text-slate-700">{entry.who_is_at_risk}</p>
            </div>
          )}
          {entry.existing_controls && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Existing controls</p>
              <p className="text-sm text-slate-700">{entry.existing_controls}</p>
            </div>
          )}
          {entry.additional_controls && (
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-0.5">Additional controls required</p>
              <p className="text-sm text-amber-800">{entry.additional_controls}</p>
            </div>
          )}
          {entry.notes && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Notes</p>
              <p className="text-sm text-slate-700">{entry.notes}</p>
            </div>
          )}

          {/* Status change buttons */}
          {entry.status !== 'closed' && (
            <div className="flex gap-2 pt-1">
              {STATUS_OPTIONS.filter(s => s.value !== entry.status && s.value !== 'open').map(s => (
                <button
                  key={s.value}
                  type="button"
                  disabled={updatingStatus}
                  onClick={() => void handleStatusChange(s.value)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors disabled:opacity-50 ${s.color} border-current/20`}
                >
                  {updatingStatus ? <Loader2 size={10} className="animate-spin" /> :
                    s.value === 'closed' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                  Mark {s.label.toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RiskRegisterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [entries, setEntries] = useState<RiskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [search, setSearch] = useState('');

  // Filters
  const [filterStatus,    setFilterStatus]    = useState(searchParams.get('status') ?? '');
  const [filterRiskLevel, setFilterRiskLevel] = useState(searchParams.get('riskLevel') ?? '');
  const [filterCategory,  setFilterCategory]  = useState(searchParams.get('category') ?? '');
  const [filterDateFrom,  setFilterDateFrom]  = useState('');
  const [filterDateTo,    setFilterDateTo]    = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus)    params.set('status', filterStatus);
      if (filterRiskLevel) params.set('risk_level', filterRiskLevel);
      if (filterCategory)  params.set('category', filterCategory);
      if (filterDateFrom)  params.set('dateFrom', filterDateFrom);
      if (filterDateTo)    params.set('dateTo', filterDateTo);
      const r = await fetch(`/api/risk-register?${params.toString()}`);
      if (r.ok) setEntries(await r.json() as RiskEntry[]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterRiskLevel, filterCategory, filterDateFrom, filterDateTo]);

  useEffect(() => { void loadEntries(); }, [loadEntries]);

  const activeFilterCount = [filterStatus, filterRiskLevel, filterCategory, filterDateFrom, filterDateTo].filter(Boolean).length;

  function clearFilters() {
    setFilterStatus('');
    setFilterRiskLevel('');
    setFilterCategory('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchParams({});
  }

  // Client-side search
  const filtered = search.trim()
    ? entries.filter(e =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        (e.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (e.category ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (e.responsible_person ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (e.job_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  // Stats
  const extremeCount = entries.filter(e => e.risk_level === 'extreme' && e.status !== 'closed').length;
  const highCount    = entries.filter(e => e.risk_level === 'high'    && e.status !== 'closed').length;
  const openCount    = entries.filter(e => e.status === 'open').length;
  const overdueCount = entries.filter(e =>
    e.due_date && e.status !== 'closed' && new Date(e.due_date) < new Date()
  ).length;

  function handleStatusChange(id: number, newStatus: string) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col lg:pt-[96px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Risk Register — IWILLBUILD</title>
        <meta name="description" content="Company risk register — identify, assess, and control workplace hazards and risks." />
        <link rel="canonical" href="https://iwillbuild.com/risk-register" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex flex-col min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-orange-600 text-white px-4 safe-top pb-3">
          <div className="flex items-center gap-1.5 text-xs text-orange-300 mb-2 pt-1">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <Home size={11} /> Home
            </button>
            <ChevronRight size={10} className="text-orange-400" />
            <span className="text-orange-100 font-medium">Risk Register</span>
          </div>

          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={20} className="text-orange-200" />
              <h1 className="font-bold text-base">Risk Register</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={14} /> New risk
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-300" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search risks…"
              className="w-full bg-white/15 border border-white/20 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-orange-300 focus:outline-none focus:bg-white/25"
            />
          </div>
        </div>

        {/* KPI strip */}
        {!loading && entries.length > 0 && (
          <div className="bg-white border-b border-slate-100 px-4 py-2.5 flex gap-4 overflow-x-auto">
            {extremeCount > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs font-semibold text-red-600">{extremeCount} extreme</span>
              </div>
            )}
            {highCount > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-xs font-semibold text-orange-600">{highCount} high</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-xs text-slate-500">{openCount} open</span>
            </div>
            {overdueCount > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <AlertTriangle size={12} className="text-red-500" />
                <span className="text-xs font-semibold text-red-600">{overdueCount} overdue</span>
              </div>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              activeFilterCount > 0
                ? 'bg-orange-50 border-orange-200 text-orange-700'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <Filter size={12} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-orange-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="text-xs text-slate-400 flex items-center gap-1">
              <X size={11} /> Clear
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border-b border-slate-100 px-4 py-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Risk level</label>
              <select
                value={filterRiskLevel}
                onChange={e => setFilterRiskLevel(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">All levels</option>
                {RISK_LEVEL_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 mb-1 block">Category</label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">All categories</option>
                {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Date from</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Date to</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-orange-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <ShieldAlert size={36} className="text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">
                {activeFilterCount > 0 || search ? 'No risks match your filters' : 'No risks recorded'}
              </p>
              {!activeFilterCount && !search && (
                <>
                  <p className="text-slate-300 text-xs mt-1">Tap New risk to add the first entry</p>
                  <button
                    type="button"
                    onClick={() => setShowNewModal(true)}
                    className="mt-4 flex items-center gap-2 mx-auto bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                  >
                    <Plus size={14} /> Add first risk
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(entry => (
                <RiskCard
                  key={entry.id}
                  entry={entry}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New risk modal */}
      {showNewModal && (
        <NewRiskModal
          onClose={() => setShowNewModal(false)}
          onSaved={entry => {
            setEntries(prev => [entry, ...prev]);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}
