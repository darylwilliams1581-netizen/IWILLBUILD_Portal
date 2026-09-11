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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';
import JobPickerSheet from '@/components/JobPickerSheet';
import { goBack } from '@/lib/navigation';
import { ShieldAlert, Plus, Filter, X, ChevronRight, Loader2, Search, Home, AlertTriangle, CheckCircle2, Clock, User, CalendarDays, Briefcase, ChevronDown, ChevronUp, Archive, ArchiveRestore, Inbox, Camera, Trash2, Share2, Copy, Link2, Mail, Phone } from 'lucide-react';

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
  /** Legacy free-text field — still stored and displayed as fallback when no task is linked */
  responsible_person: string | null;
  due_date: string | null;
  identified_date: string;
  status: string;
  review_date: string | null;
  notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
  // ── Phase 2 task-based assignment fields ──────────────────────────────────
  /** FK to job_todos.id — NULL on legacy hazards */
  task_id: number | null;
  /** Status of the linked task, e.g. 'Open' | 'In Progress' | 'Completed' */
  task_status: string | null;
  /** user_id of the assigned team member (from job_todos.assigned_user_id) */
  task_assigned_user_id: string | null;
  /** Display name of the assigned team member (from job_todos.assigned_name) */
  task_assigned_name: string | null;
  /** Due date from the linked task */
  task_due_date: string | null;
  /** Title of the linked task */
  task_title: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const LIKELIHOOD_OPTIONS = [{
  value: 'rare',
  label: 'Rare',
  desc: 'May occur only in exceptional circumstances'
}, {
  value: 'unlikely',
  label: 'Unlikely',
  desc: 'Could occur at some time'
}, {
  value: 'possible',
  label: 'Possible',
  desc: 'Might occur at some time'
}, {
  value: 'likely',
  label: 'Likely',
  desc: 'Will probably occur in most circumstances'
}, {
  value: 'almost_certain',
  label: 'Almost certain',
  desc: 'Is expected to occur in most circumstances'
}];
export const CONSEQUENCE_OPTIONS = [{
  value: 'insignificant',
  label: 'Insignificant',
  desc: 'No injuries, low financial loss'
}, {
  value: 'minor',
  label: 'Minor',
  desc: 'First aid treatment, medium financial loss'
}, {
  value: 'moderate',
  label: 'Moderate',
  desc: 'Medical treatment required, high financial loss'
}, {
  value: 'major',
  label: 'Major',
  desc: 'Extensive injuries, major financial loss'
}, {
  value: 'catastrophic',
  label: 'Catastrophic',
  desc: 'Death or permanent disability, huge financial loss'
}];
export const RISK_LEVEL_OPTIONS = [{
  value: 'low',
  label: 'Low',
  color: 'bg-emerald-100 text-emerald-700 border-emerald-200'
}, {
  value: 'medium',
  label: 'Medium',
  color: 'bg-amber-100 text-amber-700 border-amber-200'
}, {
  value: 'high',
  label: 'High',
  color: 'bg-orange-100 text-orange-700 border-orange-200'
}, {
  value: 'extreme',
  label: 'Extreme',
  color: 'bg-red-100 text-red-700 border-red-200'
}];
export const STATUS_OPTIONS = [{
  value: 'open',
  label: 'Open',
  color: 'bg-blue-100 text-blue-700'
}, {
  value: 'in_progress',
  label: 'In progress',
  color: 'bg-amber-100 text-amber-700'
}, {
  value: 'controlled',
  label: 'Controlled',
  color: 'bg-violet-100 text-violet-700'
}, {
  value: 'closed',
  label: 'Closed',
  color: 'bg-slate-100 text-slate-500'
}];
export const RISK_CATEGORIES = ['Physical / manual handling', 'Working at heights', 'Electrical', 'Hazardous chemicals / substances', 'Plant & equipment', 'Vehicles & traffic', 'Environmental', 'Fire & explosion', 'Psychological / fatigue', 'Biological', 'Structural / excavation', 'Public / third party', 'Other'];

/** Derive risk level from likelihood × consequence using a 5×5 matrix */
export function deriveRiskLevel(likelihood: string, consequence: string): string {
  const L: Record<string, number> = {
    rare: 1,
    unlikely: 2,
    possible: 3,
    likely: 4,
    almost_certain: 5
  };
  const C: Record<string, number> = {
    insignificant: 1,
    minor: 2,
    moderate: 3,
    major: 4,
    catastrophic: 5
  };
  const score = (L[likelihood] ?? 3) * (C[consequence] ?? 3);
  if (score <= 3) return 'low';
  if (score <= 8) return 'medium';
  if (score <= 15) return 'high';
  return 'extreme';
}
export function riskLevelStyle(level: string) {
  return RISK_LEVEL_OPTIONS.find(r => r.value === level)?.color ?? 'bg-slate-100 text-slate-500 border-slate-200';
}
export function statusStyle(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color ?? 'bg-slate-100 text-slate-500';
}

// ── Team Member Picker ────────────────────────────────────────────────────────

interface TeamMember {
  userId: string;
  name: string;
  role: string;
}

interface TeamMemberPickerProps {
  value: { userId: string; name: string } | null;
  onChange: (member: { userId: string; name: string } | null) => void;
  placeholder?: string;
}
function TeamMemberPicker({ value, onChange, placeholder = 'Select team member…' }: TeamMemberPickerProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || members.length) return;
    setLoading(true);
    void fetch('/api/team/members')
      .then(r => r.ok ? r.json() as Promise<{ members: TeamMember[] }> : Promise.reject())
      .then(d => setMembers(d.members ?? []))
      .catch(() => {/* non-fatal */})
      .finally(() => setLoading(false));
  }, [open, members.length]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = search.trim()
    ? members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : members;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-left flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
      >
        <User size={13} className="text-slate-400 shrink-0" />
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value?.name ?? placeholder}</span>
        {value && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(null); }}
            className="ml-auto text-slate-300 hover:text-slate-500"
          >
            <X size={12} />
          </button>
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No members found</p>
            ) : filtered.map(m => (
              <button
                key={m.userId}
                type="button"
                onClick={() => { onChange({ userId: m.userId, name: m.name }); setOpen(false); setSearch(''); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-orange-50 flex items-center gap-2"
              >
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold shrink-0">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-slate-800">{m.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{m.role}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── New Entry Modal ───────────────────────────────────────────────────────────

interface NewRiskModalProps {
  onClose: () => void;
  onSaved: (entry: RiskEntry) => void;
  preselectedJob?: {
    id: number;
    name: string;
    jobNumber?: string | null;
  } | null;
}
function NewRiskModal({
  onClose,
  onSaved,
  preselectedJob
}: NewRiskModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Job linkage — pre-filled from picker, can be cleared
  const [linkedJob, setLinkedJob] = useState<{
    id: number;
    name: string;
    jobNumber?: string | null;
  } | null>(preselectedJob ?? null);
  const [responsibleMember, setResponsibleMember] = useState<{ userId: string; name: string } | null>(null);
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
    notes: ''
  });
  const riskLevel = deriveRiskLevel(form.likelihood, form.consequence);
  function set(field: string, value: string) {
    setForm(f => ({
      ...f,
      [field]: value
    }));
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/risk-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...form,
          risk_level: riskLevel,
          job_id: linkedJob?.id ?? null,
          // Phase 2: send assigned_user_id to create a linked task via hazardTaskService
          assigned_user_id: responsibleMember?.userId ?? null,
          responsible_person: responsibleMember?.name ?? form.responsible_person,
        })
      });
      if (!r.ok) {
        const d = (await r.json()) as {
          error?: string;
        };
        throw new Error(d.error ?? 'Save failed');
      }
      const entry = (await r.json()) as RiskEntry;
      onSaved(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-orange-500" />
            <h2 className="font-bold text-slate-800 text-base">New Hazard Entry</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">{error}</div>}

          {/* Linked job */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Linked job</label>
            {linkedJob ? <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                <Briefcase size={13} className="text-orange-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{linkedJob.name}</p>
                  {linkedJob.jobNumber && <p className="text-xs text-slate-500 font-mono">{linkedJob.jobNumber}</p>}
                </div>
                <button type="button" onClick={() => setLinkedJob(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
                  <X size={14} />
                </button>
              </div> : <p className="text-xs text-slate-400 italic px-1">No job linked — company-wide risk</p>}
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Risk / Hazard title <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Working at heights — roof edge" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" required />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
              <option value="">Select category…</option>
              {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Describe the hazard or risk situation…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>

          {/* Hazard source + who is at risk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Hazard source</label>
              <input type="text" value={form.hazard_source} onChange={e => set('hazard_source', e.target.value)} placeholder="e.g. Scaffold, power tools" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Who is at risk</label>
              <input type="text" value={form.who_is_at_risk} onChange={e => set('who_is_at_risk', e.target.value)} placeholder="e.g. All workers on site" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
          </div>

          {/* Existing controls */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Existing controls</label>
            <textarea value={form.existing_controls} onChange={e => set('existing_controls', e.target.value)} rows={2} placeholder="Controls already in place…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>

          {/* Risk matrix */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Risk assessment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Likelihood <span className="text-red-500">*</span></label>
                <select value={form.likelihood} onChange={e => set('likelihood', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  {LIKELIHOOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Consequence <span className="text-red-500">*</span></label>
                <select value={form.consequence} onChange={e => set('consequence', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  {CONSEQUENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            <textarea value={form.additional_controls} onChange={e => set('additional_controls', e.target.value)} rows={2} placeholder="Further controls needed to reduce risk…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>

          {/* Responsible person + due date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Responsible person</label>
              <TeamMemberPicker
                value={responsibleMember}
                onChange={m => {
                  setResponsibleMember(m);
                  if (m) set('responsible_person', m.name);
                }}
                placeholder="Select team member…"
              />
              {!responsibleMember && (
                <input
                  type="text"
                  value={form.responsible_person}
                  onChange={e => set('responsible_person', e.target.value)}
                  placeholder="Or type a name / role"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 mt-1.5"
                />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Due date</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
          </div>

          {/* Identified date + status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Date identified</label>
              <input type="date" value={form.identified_date} onChange={e => set('identified_date', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Any additional notes…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" form="" onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? 'Saving…' : 'Save hazard'}
          </button>
        </div>
      </div>
    </div>;
}

// ── Risk Entry Card ───────────────────────────────────────────────────────────

interface RiskCardProps {
  entry: RiskEntry;
  onStatusChange: (id: number, status: string) => void;
  onArchived: (id: number) => void;
  onRestored: (id: number) => void;
  onUpdated: (entry: RiskEntry) => void;
  isArchiveView?: boolean;
}
function RiskCard({
  entry,
  onStatusChange,
  onArchived,
  onRestored,
  onUpdated,
  isArchiveView
}: RiskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Photo state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Share state
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [generatingShare, setGeneratingShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokingShare, setRevokingShare] = useState(false);

  // Public comments
  const [publicComments, setPublicComments] = useState<Array<{
    id: number; commenter_name: string; comment: string;
    action_taken: string; new_status: string | null; created_at: string;
  }> | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

  const isOverdue = entry.due_date && entry.status !== 'closed' && new Date(entry.due_date) < new Date();
  const hasPhoto = !!entry.photo_path;
  // Phase 2: prefer task_assigned_name; fall back to legacy responsible_person for old records
  const responsibleDisplay = entry.task_assigned_name ?? entry.responsible_person;

  // Load photo URL when card is expanded and has a photo
  useEffect(() => {
    if (!expanded || !hasPhoto || photoUrl) return;
    setPhotoLoading(true);
    void fetch(`/api/risk-register/${entry.id}/photo-url`)
      .then(r => r.ok ? r.json() as Promise<{ url: string | null }> : Promise.reject())
      .then(d => setPhotoUrl(d.url))
      .catch(() => {/* non-fatal */})
      .finally(() => setPhotoLoading(false));
  }, [expanded, hasPhoto, photoUrl, entry.id]);

  // Load public comments when expanded
  useEffect(() => {
    if (!expanded || publicComments !== null) return;
    setLoadingComments(true);
    void fetch(`/api/risk-register/${entry.id}/public-comments`)
      .then(r => r.ok ? r.json() as Promise<{ comments: typeof publicComments }> : Promise.resolve({ comments: [] }))
      .then(d => setPublicComments(d.comments ?? []))
      .catch(() => setPublicComments([]))
      .finally(() => setLoadingComments(false));
  }, [expanded, publicComments, entry.id]);

  async function handleStatusChange(newStatus: string) {
    setUpdatingStatus(true);
    try {
      const r = await fetch(`/api/risk-register/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === 'closed' ? { closed_at: new Date().toISOString() } : {})
        })
      });
      if (r.ok) {
        const updated = await r.json() as RiskEntry;
        onStatusChange(entry.id, newStatus);
        onUpdated(updated);
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      const r = await fetch(`/api/risk-register/${entry.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason })
      });
      if (r.ok) {
        setShowArchiveModal(false);
        onArchived(entry.id);
      }
    } finally {
      setArchiving(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const r = await fetch(`/api/risk-register/${entry.id}/unarchive`, { method: 'POST' });
      if (r.ok) onRestored(entry.id);
    } finally {
      setRestoring(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/risk-register/${entry.id}/photo`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error('Upload failed');
      const d = await r.json() as { photo_path: string; url: string };
      setPhotoUrl(d.url);
      onUpdated({ ...entry, photo_path: d.photo_path });
    } catch {/* non-fatal */}
    finally { setUploadingPhoto(false); }
  }

  async function handleRemovePhoto() {
    setRemovingPhoto(true);
    try {
      await fetch(`/api/risk-register/${entry.id}/photo`, { method: 'DELETE' });
      setPhotoUrl(null);
      onUpdated({ ...entry, photo_path: null });
    } finally { setRemovingPhoto(false); }
  }

  async function handleShare() {
    setShowShareSheet(true);
    if (shareUrl) return;
    setGeneratingShare(true);
    try {
      const r = await fetch(`/api/risk-register/${entry.id}/share-token`, { method: 'POST' });
      if (r.ok) {
        const d = await r.json() as { url: string };
        setShareUrl(d.url);
      }
    } finally { setGeneratingShare(false); }
  }

  async function handleRevokeShare() {
    setRevokingShare(true);
    try {
      await fetch(`/api/risk-register/${entry.id}/share-token`, { method: 'DELETE' });
      setShareUrl(null);
      setShowShareSheet(false);
    } finally { setRevokingShare(false); }
  }

  function copyLink() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function openSms() {
    if (!shareUrl) return;
    const body = encodeURIComponent(`Hazard: ${entry.title}\n${shareUrl}`);
    window.open(`sms:?body=${body}`, '_self');
  }

  function openEmail() {
    if (!shareUrl) return;
    const subject = encodeURIComponent(`Hazard Register: ${entry.title}`);
    const body = encodeURIComponent(`Please review this hazard:\n\n${entry.title}\nRisk level: ${entry.risk_level}\n\n${shareUrl}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  }

  return <div className={`bg-white rounded-2xl shadow-sm border transition-colors ${entry.risk_level === 'extreme' ? 'border-red-200' : entry.risk_level === 'high' ? 'border-orange-200' : 'border-slate-100'}`}>
      {/* Main row */}
      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          {/* Risk level indicator */}
          <div className={`w-1.5 self-stretch rounded-full shrink-0 ${entry.risk_level === 'extreme' ? 'bg-red-500' : entry.risk_level === 'high' ? 'bg-orange-500' : entry.risk_level === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 leading-snug">{entry.title}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                {hasPhoto && <Camera size={11} className="text-slate-300" />}
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riskLevelStyle(entry.risk_level)}`}>
                  {entry.risk_level.charAt(0).toUpperCase() + entry.risk_level.slice(1)}
                </span>
                {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
              </div>
            </div>

            {entry.category && <p className="text-xs text-slate-400 mt-0.5">{entry.category}</p>}

            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle(entry.status)}`}>
                {STATUS_OPTIONS.find(s => s.value === entry.status)?.label ?? entry.status}
              </span>
              {entry.job_name && <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Briefcase size={10} /> {entry.job_name}
                </span>}
              {responsibleDisplay && <span className="flex items-center gap-1 text-xs text-slate-400">
                  <User size={10} /> {responsibleDisplay}
                </span>}
              {entry.due_date && <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                  <CalendarDays size={10} />
                  {isOverdue ? 'Overdue · ' : ''}
                  {new Date(entry.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>}
            </div>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && <div className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">

          {/* Snapshot photo */}
          <div>
            {photoLoading ? (
              <div className="h-32 bg-slate-50 rounded-xl flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-slate-300" />
              </div>
            ) : photoUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={photoUrl} alt="Hazard photo" className="w-full max-h-56 object-cover" loading="lazy" />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="bg-white/90 hover:bg-white text-slate-600 rounded-lg p-1.5 shadow text-xs flex items-center gap-1 transition-colors"
                  >
                    <Camera size={12} /> Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemovePhoto()}
                    disabled={removingPhoto}
                    className="bg-white/90 hover:bg-red-50 text-red-500 rounded-lg p-1.5 shadow transition-colors"
                  >
                    {removingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="w-full h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:border-orange-300 hover:text-orange-500 transition-colors text-sm"
              >
                {uploadingPhoto ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                {uploadingPhoto ? 'Uploading…' : 'Add photo'}
              </button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handlePhotoUpload(file);
                e.target.value = '';
              }}
            />
          </div>

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

          {entry.description && <div>
              <p className="text-xs text-slate-400 mb-0.5">Description</p>
              <p className="text-sm text-slate-700">{entry.description}</p>
            </div>}
          {entry.hazard_source && <div>
              <p className="text-xs text-slate-400 mb-0.5">Hazard source</p>
              <p className="text-sm text-slate-700">{entry.hazard_source}</p>
            </div>}
          {entry.who_is_at_risk && <div>
              <p className="text-xs text-slate-400 mb-0.5">Who is at risk</p>
              <p className="text-sm text-slate-700">{entry.who_is_at_risk}</p>
            </div>}
          {entry.existing_controls && <div>
              <p className="text-xs text-slate-400 mb-0.5">Existing controls</p>
              <p className="text-sm text-slate-700">{entry.existing_controls}</p>
            </div>}
          {entry.additional_controls && <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 mb-0.5">Additional controls required</p>
              <p className="text-sm text-amber-800">{entry.additional_controls}</p>
            </div>}
          {entry.notes && <div>
              <p className="text-xs text-slate-400 mb-0.5">Notes</p>
              <p className="text-sm text-slate-700">{entry.notes}</p>
            </div>}

          {/* Public comments */}
          {loadingComments && <div className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 size={10} className="animate-spin" /> Loading comments…</div>}
          {publicComments && publicComments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Public comments</p>
              {publicComments.map(c => (
                <div key={c.id} className={`rounded-xl px-3 py-2.5 text-sm ${c.action_taken === 'closed' ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800 text-xs">{c.commenter_name}</p>
                    {c.action_taken === 'closed' && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={10} /> Closed</span>
                    )}
                  </div>
                  <p className="text-slate-600 mt-0.5">{c.comment}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(c.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Action row: status + share + archive */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {/* Status change buttons */}
            {!isArchiveView && entry.status !== 'closed' && STATUS_OPTIONS.filter(s => s.value !== entry.status && s.value !== 'open').map(s => (
              <button key={s.value} type="button" disabled={updatingStatus} onClick={() => void handleStatusChange(s.value)} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors disabled:opacity-50 ${s.color} border-current/20`}>
                {updatingStatus ? <Loader2 size={10} className="animate-spin" /> : s.value === 'closed' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                Mark {s.label.toLowerCase()}
              </button>
            ))}

            {/* Share button */}
            {!isArchiveView && (
              <button type="button" onClick={() => void handleShare()} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors ml-auto">
                <Share2 size={10} /> Share
              </button>
            )}
          </div>

          {/* Archive / Restore */}
          <div className="pt-1 border-t border-slate-50">
            {isArchiveView ? <div className="space-y-2">
                {entry.archive_reason && <p className="text-xs text-slate-400 italic">Archived reason: {entry.archive_reason}</p>}
                {entry.archived_by && <p className="text-xs text-slate-400">
                    Archived by {entry.archived_by}
                    {entry.archived_at ? ` · ${new Date(entry.archived_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </p>}
                <button type="button" disabled={restoring} onClick={() => void handleRestore()} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors disabled:opacity-50">
                  {restoring ? <Loader2 size={10} className="animate-spin" /> : <ArchiveRestore size={10} />}
                  Restore to register
                </button>
              </div> : <button type="button" onClick={() => setShowArchiveModal(true)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                <Archive size={10} /> Archive
              </button>}
          </div>
        </div>}

      {/* Archive reason modal */}
      {showArchiveModal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowArchiveModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Archive size={16} className="text-slate-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Archive hazard</h3>
                <p className="text-xs text-slate-400">Moves to archive — never deleted</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Reason (optional)</label>
              <textarea value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="e.g. Risk resolved, controls in place, no longer applicable…" rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowArchiveModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={archiving} onClick={() => void handleArchive()} className="flex-1 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
                {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                Archive
              </button>
            </div>
          </div>
        </div>}

      {/* Share sheet */}
      {showShareSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 size={16} className="text-violet-500" />
                <p className="font-bold text-slate-800 text-sm">Share hazard</p>
              </div>
              <button type="button" onClick={() => setShowShareSheet(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            {generatingShare ? (
              <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-violet-400" /></div>
            ) : shareUrl ? (
              <>
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
                  <Link2 size={12} className="text-slate-400 shrink-0" />
                  <p className="text-xs text-slate-600 truncate flex-1">{shareUrl}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={copyLink} className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-colors ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <Copy size={16} />
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <button type="button" onClick={openSms} className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    <Phone size={16} />
                    SMS
                  </button>
                  <button type="button" onClick={openEmail} className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    <Mail size={16} />
                    Email
                  </button>
                </div>
                <div className="pt-1 border-t border-slate-100">
                  <button type="button" disabled={revokingShare} onClick={() => void handleRevokeShare()} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50">
                    {revokingShare ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                    Revoke link
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">Failed to generate share link</p>
            )}
          </div>
        </div>
      )}
    </div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RiskRegisterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<RiskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [pendingJob, setPendingJob] = useState<{
    id: number;
    name: string;
    jobNumber?: string | null;
  } | null | 'none'>('none');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');

  // Filters
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') ?? '');
  const [filterRiskLevel, setFilterRiskLevel] = useState(searchParams.get('riskLevel') ?? '');
  const [filterCategory, setFilterCategory] = useState(searchParams.get('category') ?? '');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === 'archive') {
        params.set('archived', '1');
      } else {
        if (filterStatus) params.set('status', filterStatus);
        if (filterRiskLevel) params.set('risk_level', filterRiskLevel);
        if (filterCategory) params.set('category', filterCategory);
        if (filterDateFrom) params.set('dateFrom', filterDateFrom);
        if (filterDateTo) params.set('dateTo', filterDateTo);
      }
      const r = await fetch(`/api/risk-register?${params.toString()}`);
      if (r.ok) setEntries((await r.json()) as RiskEntry[]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterStatus, filterRiskLevel, filterCategory, filterDateFrom, filterDateTo]);
  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);
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
  const filtered = search.trim() ? entries.filter(e => e.title.toLowerCase().includes(search.toLowerCase()) || (e.description ?? '').toLowerCase().includes(search.toLowerCase()) || (e.category ?? '').toLowerCase().includes(search.toLowerCase()) || (e.responsible_person ?? '').toLowerCase().includes(search.toLowerCase()) || (e.job_name ?? '').toLowerCase().includes(search.toLowerCase())) : entries;

  // Stats
  const extremeCount = entries.filter(e => e.risk_level === 'extreme' && e.status !== 'closed').length;
  const highCount = entries.filter(e => e.risk_level === 'high' && e.status !== 'closed').length;
  const openCount = entries.filter(e => e.status === 'open').length;
  const overdueCount = entries.filter(e => e.due_date && e.status !== 'closed' && new Date(e.due_date) < new Date()).length;
  function handleStatusChange(id: number, newStatus: string) {
    setEntries(prev => prev.map(e => e.id === id ? {
      ...e,
      status: newStatus
    } : e));
  }
  function handleArchived(id: number) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }
  function handleRestored(id: number) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }
  function handleUpdated(updated: RiskEntry) {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
  }
  return <div className="flex-1 bg-[#f5f6f8] flex flex-col lg-portal">
      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Hazard Register — IWIllBUIlD</title>
        <meta name="description" content="Company hazard register — identify, assess, and control workplace hazards and risks." />
        <link rel="canonical" href="https://iwillbuild.com/risk-register" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex flex-col flex-1 bg-slate-50 overflow-hidden">
        {/* Header */}
        <div className="bg-orange-600 text-white px-4 safe-top pb-3">
          <div className="flex items-center gap-1.5 text-xs text-orange-300 mb-2 pt-1">
            <button type="button" onClick={() => goBack(navigate, '/home')} className="flex items-center gap-1 hover:text-white transition-colors">
              <Home size={11} /> Home
            </button>
            <ChevronRight size={10} className="text-orange-400" />
            <span className="text-orange-100 font-medium">Hazard Register</span>
          </div>

          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={20} className="text-orange-200" />
              <h1 className="font-bold text-base">Hazard Register</h1>
            </div>
            <button type="button" onClick={() => {
            setPendingJob('none');
            setShowJobPicker(true);
          }} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors">
              <Plus size={14} /> New hazard
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-300" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hazards…" className="w-full bg-white/15 border border-white/20 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-orange-300 focus:outline-none focus:bg-white/25" />
          </div>
        </div>

        {/* Active / Archive tab switcher */}
        <div className="bg-white border-b border-slate-100 px-4 flex gap-1 pt-2">
          <button type="button" onClick={() => setActiveTab('active')} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg border-b-2 transition-colors ${activeTab === 'active' ? 'border-orange-500 text-orange-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <ShieldAlert size={12} /> Active hazards
          </button>
          <button type="button" onClick={() => setActiveTab('archive')} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg border-b-2 transition-colors ${activeTab === 'archive' ? 'border-slate-500 text-slate-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <Archive size={12} /> Archive
          </button>
        </div>

        {/* KPI strip — active tab only */}
        {activeTab === 'active' && !loading && entries.length > 0 && <div className="bg-white border-b border-slate-100 px-4 py-2.5 flex gap-4 overflow-x-auto">
            {extremeCount > 0 && <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs font-semibold text-red-600">{extremeCount} extreme</span>
              </div>}
            {highCount > 0 && <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-xs font-semibold text-orange-600">{highCount} high</span>
              </div>}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-xs text-slate-500">{openCount} open</span>
            </div>
            {overdueCount > 0 && <div className="flex items-center gap-1.5 shrink-0">
                <AlertTriangle size={12} className="text-red-500" />
                <span className="text-xs font-semibold text-red-600">{overdueCount} overdue</span>
              </div>}
          </div>}

        {/* Filter bar — active tab only */}
        {activeTab === 'active' && <>
            <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-2">
              <button type="button" onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${activeFilterCount > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'border-slate-200 text-slate-600'}`}>
                <Filter size={12} />
                Filters
                {activeFilterCount > 0 && <span className="bg-orange-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {activeFilterCount}
                  </span>}
              </button>
              {activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="text-xs text-slate-400 flex items-center gap-1">
                  <X size={11} /> Clear
                </button>}
              <span className="ml-auto text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Filter panel */}
            {showFilters && <div className="bg-white border-b border-slate-100 px-4 py-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Status</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Risk level</label>
                  <select value={filterRiskLevel} onChange={e => setFilterRiskLevel(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                    <option value="">All levels</option>
                    {RISK_LEVEL_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">Category</label>
                  <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                    <option value="">All categories</option>
                    {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Date from</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Date to</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                </div>
              </div>}
          </>}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-orange-400" />
            </div> : filtered.length === 0 ? <div className="text-center py-16">
              {activeTab === 'archive' ? <>
                  <Inbox size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm font-medium">Archive is empty</p>
                  <p className="text-slate-300 text-xs mt-1">Archived hazards appear here — they are never deleted</p>
                </> : <>
                  <ShieldAlert size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm font-medium">
                    {activeFilterCount > 0 || search ? 'No hazards match your filters' : 'No hazards recorded'}
                  </p>
                  {!activeFilterCount && !search && <>
                      <p className="text-slate-300 text-xs mt-1">Tap New hazard to add the first entry</p>
                      <button type="button" onClick={() => setShowNewModal(true)} className="mt-4 flex items-center gap-2 mx-auto bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                        <Plus size={14} /> Add first hazard
                      </button>
                    </>}
                </>}
            </div> : <div className="space-y-3">
              {filtered.map(entry => <RiskCard key={entry.id} entry={entry} onStatusChange={handleStatusChange} onArchived={handleArchived} onRestored={handleRestored} onUpdated={handleUpdated} isArchiveView={activeTab === 'archive'} />)}
            </div>}
        </div>
      </div>

      {/* Job picker — shown before new entry modal */}
      <JobPickerSheet open={showJobPicker} onClose={() => setShowJobPicker(false)} title="Link to a job?" subtitle="Select a job or skip to log a company-wide hazard" iconBg="bg-orange-100" iconFg="text-orange-600" Icon={Briefcase} onSelect={job => {
      setPendingJob({
        id: job.id,
        name: job.name,
        jobNumber: job.jobNumber
      });
      setShowJobPicker(false);
      setShowNewModal(true);
    }} />
      {/* No-job option rendered below the picker via a footer — handled by skip button */}
      {showJobPicker && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]">
          <button type="button" onClick={() => {
        setPendingJob(null);
        setShowJobPicker(false);
        setShowNewModal(true);
      }} className="bg-white border border-slate-200 shadow-lg rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            No job — company-wide hazard
          </button>
        </div>}

      {/* New risk modal */}
      {showNewModal && <NewRiskModal onClose={() => setShowNewModal(false)} preselectedJob={pendingJob === 'none' ? null : pendingJob} onSaved={entry => {
      setEntries(prev => [entry, ...prev]);
      setShowNewModal(false);
    }} />}
    </div>;
}
