/**
 * BuildRepairPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza Build & Repair mode — Stage 1.
 *
 * Sections:
 *   1. Request        — problem, expected result, linked bug, source version
 *   2. Diagnosis      — symptom, root cause, evidence, files, risk
 *   3. Proposed       — files, summary, patch, db/route impact, security, rollback
 *   4. Verification   — test plan, runtime checks, verification notes
 *   5. Airo Handoff   — generate/copy patch, generate/copy Airo prompt, download, mark sent, verify
 *
 * SECURITY:
 *   - Platform owner only (enforced server-side; UI hides for non-owners)
 *   - No secrets, credentials, or API keys are stored or displayed
 *   - Marking sent_to_airo does NOT resolve the linked bug
 *   - A case may only be verified after Airo applies the change
 *
 * STAGE 1 BOUNDARY:
 *   Dazza proposes. Airo applies. Daryl verifies.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wrench, Plus, RefreshCw, ChevronDown, ChevronUp,
  Copy, Check, Download, Send, ShieldCheck, AlertTriangle,
  FileCode, Loader2, X, Bug, GitBranch, ClipboardCheck,
  BookOpen, Zap, CheckCircle2, Circle, ArrowRight,
  Info, Lock,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BuilderCaseStatus =
  | 'draft'
  | 'analysing'
  | 'diagnosis_ready'
  | 'patch_ready'
  | 'awaiting_daryl_review'
  | 'sent_to_airo'
  | 'awaiting_verification'
  | 'verified'
  | 'failed'
  | 'closed';

export interface BuilderCase {
  id: string;
  title: string;
  requested_result: string | null;
  linked_bug_id: string | null;
  conversation_id: string | null;
  anatomy_snapshot_id: string | null;
  anatomy_commit_sha: string | null;
  anatomy_snapshot_name: string | null;
  source_version: string | null;
  repo_name: string | null;
  status: BuilderCaseStatus;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  confirmed_symptom: string | null;
  root_cause: string | null;
  evidence: string | null;
  files_inspected: string | null;
  assumptions: string | null;
  unknowns: string | null;
  proposed_files: string | null;
  change_summary: string | null;
  db_route_impact: string | null;
  security_considerations: string | null;
  rollback_instructions: string | null;
  proposed_patch: string | null;
  airo_prompt: string | null;
  test_plan: string | null;
  runtime_checks: string | null;
  verification_notes: string | null;
  resolution_note: string | null;
  sent_to_airo_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  /** Current Dazza conversation ID — used to link cases to conversations */
  conversationId: string | null;
  /** Called when the user wants to send a message in Build & Repair mode */
  onSendMessage: (text: string, mode: 'build_repair', builderCaseId?: string) => void;
  /** Whether Dazza is currently typing */
  isTyping: boolean;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BuilderCaseStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  draft:                  { label: 'Draft',                color: 'text-slate-500',   bg: 'bg-slate-100',   icon: Circle },
  analysing:              { label: 'Analysing',            color: 'text-blue-600',    bg: 'bg-blue-50',     icon: Loader2 },
  diagnosis_ready:        { label: 'Diagnosis ready',      color: 'text-violet-600',  bg: 'bg-violet-50',   icon: BookOpen },
  patch_ready:            { label: 'Patch ready',          color: 'text-amber-600',   bg: 'bg-amber-50',    icon: FileCode },
  awaiting_daryl_review:  { label: 'Awaiting your review', color: 'text-orange-600',  bg: 'bg-orange-50',   icon: AlertTriangle },
  sent_to_airo:           { label: 'Sent to Airo',         color: 'text-indigo-600',  bg: 'bg-indigo-50',   icon: Send },
  awaiting_verification:  { label: 'Awaiting verification',color: 'text-cyan-600',    bg: 'bg-cyan-50',     icon: ShieldCheck },
  verified:               { label: 'Verified',             color: 'text-emerald-600', bg: 'bg-emerald-50',  icon: CheckCircle2 },
  failed:                 { label: 'Failed',               color: 'text-red-600',     bg: 'bg-red-50',      icon: X },
  closed:                 { label: 'Closed',               color: 'text-slate-400',   bg: 'bg-slate-50',    icon: Lock },
};

const RISK_CONFIG = {
  low:      { label: 'Low',      color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  medium:   { label: 'Medium',   color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
  high:     { label: 'High',     color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200' },
  critical: { label: 'Critical', color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const iso = d.includes('T') ? d : d.replace(' ', 'T');
  const withZ = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(withZ).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-primary bg-white border border-slate-200 hover:border-primary/40 rounded-lg px-2.5 py-1.5 transition-all"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function Section({
  title, icon: Icon, children, defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-primary shrink-0" />
          <span className="text-sm font-bold text-slate-700">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm text-slate-700 leading-relaxed whitespace-pre-wrap ${mono ? 'font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto' : ''}`}>
        {value}
      </div>
    </div>
  );
}

// ── New case form ─────────────────────────────────────────────────────────────

function NewCaseForm({ onCreated, conversationId }: {
  onCreated: (c: BuilderCase) => void;
  conversationId: string | null;
}) {
  const [title, setTitle] = useState('');
  const [requestedResult, setRequestedResult] = useState('');
  const [linkedBugId, setLinkedBugId] = useState('');
  const [sourceVersion, setSourceVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dazza/builder-cases', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          requestedResult: requestedResult.trim() || null,
          linkedBugId: linkedBugId.trim() || null,
          conversationId,
          sourceVersion: sourceVersion.trim() || null,
        }),
      });
      const data = await res.json() as { ok?: boolean; case?: BuilderCase; error?: string };
      if (!res.ok || !data.case) throw new Error(data.error ?? 'Failed to create case');
      onCreated(data.case);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Case title *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Fix fleet asset save 500 error"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Expected result</label>
        <textarea
          value={requestedResult}
          onChange={e => setRequestedResult(e.target.value)}
          placeholder="What should work after this repair?"
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Linked bug ID</label>
          <input
            type="text"
            value={linkedBugId}
            onChange={e => setLinkedBugId(e.target.value)}
            placeholder="Optional"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Source version</label>
          <input
            type="text"
            value={sourceVersion}
            onChange={e => setSourceVersion(e.target.value)}
            placeholder="Optional"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          />
        </div>
      </div>
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      <button
        onClick={() => void create()}
        disabled={!title.trim() || loading}
        className="w-full bg-primary hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        {loading ? 'Creating…' : 'Create Builder Case'}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BuildRepairPanel({ conversationId, onSendMessage, isTyping }: Props) {
  const [cases, setCases] = useState<BuilderCase[]>([]);
  const [activeCase, setActiveCase] = useState<BuilderCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [dazzaInput, setDazzaInput] = useState('');
  const dazzaInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load cases ─────────────────────────────────────────────────────────────

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dazza/builder-cases', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { cases?: BuilderCase[] };
      setCases(data.cases ?? []);
      // If we have an active case, refresh it
      if (activeCase) {
        const fresh = (data.cases ?? []).find(c => c.id === activeCase.id);
        if (fresh) setActiveCase(fresh);
      }
    } finally {
      setLoading(false);
    }
  }, [activeCase]);

  useEffect(() => { void loadCases(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh active case ────────────────────────────────────────────────────

  const refreshActiveCase = useCallback(async () => {
    if (!activeCase) return;
    try {
      const res = await fetch(`/api/dazza/builder-cases/${activeCase.id}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { case?: BuilderCase };
      if (data.case) {
        setActiveCase(data.case);
        setCases(prev => prev.map(c => c.id === data.case!.id ? data.case! : c));
      }
    } catch { /* silent */ }
  }, [activeCase]);

  // ── Patch case ─────────────────────────────────────────────────────────────

  async function patchCase(id: string, body: Record<string, unknown>): Promise<BuilderCase | null> {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/dazza/builder-cases/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; case?: BuilderCase; error?: string };
      if (!res.ok || !data.case) {
        setSaveError(data.error ?? 'Update failed');
        return null;
      }
      setActiveCase(data.case);
      setCases(prev => prev.map(c => c.id === data.case!.id ? data.case! : c));
      return data.case;
    } catch (err) {
      setSaveError(String((err as Error)?.message ?? err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  // ── Generate Airo prompt ───────────────────────────────────────────────────

  async function generateAiroPrompt() {
    if (!activeCase) return;
    setGeneratingPrompt(true);
    try {
      const updated = await patchCase(activeCase.id, { action: 'generate_airo_prompt' });
      if (updated) setActiveCase(updated);
    } finally {
      setGeneratingPrompt(false);
    }
  }

  // ── Mark sent to Airo ──────────────────────────────────────────────────────

  async function markSentToAiro() {
    if (!activeCase) return;
    await patchCase(activeCase.id, { status: 'sent_to_airo' });
  }

  // ── Mark awaiting verification ─────────────────────────────────────────────

  async function markAwaitingVerification() {
    if (!activeCase) return;
    await patchCase(activeCase.id, { status: 'awaiting_verification' });
  }

  // ── Verify ─────────────────────────────────────────────────────────────────

  async function verifyCase() {
    if (!activeCase) return;
    if (!resolutionNote.trim()) {
      setVerifyError('A resolution note is required to verify a case.');
      return;
    }
    setVerifyError(null);
    await patchCase(activeCase.id, {
      status: 'verified',
      resolutionNote: resolutionNote.trim(),
    });
  }

  // ── Download repair package ────────────────────────────────────────────────

  function downloadRepairPackage() {
    if (!activeCase) return;
    const lines: string[] = [
      `# IWILLBUILD Builder Case: ${activeCase.title}`,
      `Case ID: ${activeCase.id}`,
      `Status: ${activeCase.status}`,
      `Created: ${fmtDate(activeCase.created_at)}`,
      `Updated: ${fmtDate(activeCase.updated_at)}`,
      '',
      '## Request',
      activeCase.requested_result ?? '(Not specified)',
      '',
      '## Linked Bug',
      activeCase.linked_bug_id ?? 'None',
      '',
      '## Anatomy Snapshot',
      activeCase.anatomy_snapshot_name ?? activeCase.anatomy_snapshot_id ?? 'Not recorded',
      `Commit SHA: ${activeCase.anatomy_commit_sha ?? 'Not recorded'}`,
      '',
      '## Diagnosis',
      `Symptom: ${activeCase.confirmed_symptom ?? '(Not yet diagnosed)'}`,
      `Root cause: ${activeCase.root_cause ?? '(Not yet diagnosed)'}`,
      `Risk: ${activeCase.risk_level ?? 'Not assessed'}`,
      '',
      '## Evidence',
      activeCase.evidence ?? '(None recorded)',
      '',
      '## Files Inspected',
      activeCase.files_inspected ?? '(None recorded)',
      '',
      '## Proposed Files',
      activeCase.proposed_files ?? '(None)',
      '',
      '## Change Summary',
      activeCase.change_summary ?? '(None)',
      '',
      '## Proposed Patch',
      activeCase.proposed_patch ?? '(Not yet generated)',
      '',
      '## Airo Prompt',
      activeCase.airo_prompt ?? '(Not yet generated)',
      '',
      '## Test Plan',
      activeCase.test_plan ?? '(Not specified)',
      '',
      '## Runtime Checks',
      activeCase.runtime_checks ?? '(Not specified)',
      '',
      '## Verification Notes',
      activeCase.verification_notes ?? '(None)',
      '',
      '## Resolution Note',
      activeCase.resolution_note ?? '(None)',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `builder-case-${activeCase.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Send to Dazza in Build & Repair mode ───────────────────────────────────

  function sendToDazza() {
    if (!dazzaInput.trim() || isTyping) return;
    onSendMessage(dazzaInput.trim(), 'build_repair', activeCase?.id);
    setDazzaInput('');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">Loading builder cases…</span>
      </div>
    );
  }

  // ── Case list view ─────────────────────────────────────────────────────────

  if (!activeCase) {
    return (
      <div className="flex flex-col gap-4">
        {/* Amber banner */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <div>
            <div className="text-xs font-black text-amber-800 tracking-wider">BUILD & REPAIR · AIRO HANDOFF · NO DIRECT WRITES</div>
            <div className="text-[10px] text-amber-700 mt-0.5">Dazza diagnoses and proposes. Airo applies. You verify.</div>
          </div>
        </div>

        {/* New case button */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700">Builder Cases</span>
          <button
            onClick={() => setShowNewForm(f => !f)}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5 transition-all"
          >
            {showNewForm ? <X size={12} /> : <Plus size={12} />}
            {showNewForm ? 'Cancel' : 'New Case'}
          </button>
        </div>

        {showNewForm && (
          <div className="border border-violet-200 bg-violet-50/50 rounded-xl p-4">
            <NewCaseForm
              conversationId={conversationId}
              onCreated={c => {
                setCases(prev => [c, ...prev]);
                setActiveCase(c);
                setShowNewForm(false);
              }}
            />
          </div>
        )}

        {/* Case list */}
        {cases.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Wrench size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No builder cases yet.</p>
            <p className="text-xs mt-1">Create one to start a repair workflow.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {cases.map(c => {
              const cfg = STATUS_CONFIG[c.status];
              const StatusIcon = cfg.icon;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCase(c)}
                  className="w-full text-left border border-slate-200 hover:border-primary/40 bg-white hover:bg-violet-50/30 rounded-xl p-3 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{c.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {c.anatomy_snapshot_name ?? 'No snapshot'} · {fmtDate(c.updated_at)}
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} shrink-0`}>
                      <StatusIcon size={10} className={c.status === 'analysing' ? 'animate-spin' : ''} />
                      {cfg.label}
                    </div>
                  </div>
                  {c.linked_bug_id && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-400">
                      <Bug size={9} />
                      Bug: {c.linked_bug_id.slice(0, 12)}…
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Active case detail view ────────────────────────────────────────────────

  const cfg = STATUS_CONFIG[activeCase.status];
  const StatusIcon = cfg.icon;
  const hasAnatomy = !!activeCase.anatomy_snapshot_id;
  const isStaleAnatomy = !hasAnatomy;

  return (
    <div className="flex flex-col gap-4">
      {/* Amber banner */}
      <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center gap-3">
        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
        <div className="text-[10px] font-black text-amber-800 tracking-wider">BUILD & REPAIR · AIRO HANDOFF · NO DIRECT WRITES</div>
      </div>

      {/* Case header */}
      <div className="border border-slate-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-base font-black text-slate-800 leading-tight">{activeCase.title}</div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">{activeCase.id}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
              <StatusIcon size={10} className={activeCase.status === 'analysing' ? 'animate-spin' : ''} />
              {cfg.label}
            </div>
            <button
              onClick={() => void refreshActiveCase()}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
            <button
              onClick={() => setActiveCase(null)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Back to list"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Anatomy snapshot */}
        <div className={`mt-3 flex items-center gap-2 text-[10px] rounded-lg px-3 py-2 ${isStaleAnatomy ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
          <GitBranch size={10} className="shrink-0" />
          {isStaleAnatomy
            ? 'No anatomy snapshot — refresh anatomy before generating a reliable patch.'
            : `Snapshot: ${activeCase.anatomy_snapshot_name ?? activeCase.anatomy_snapshot_id} · SHA: ${activeCase.anatomy_commit_sha?.slice(0, 8) ?? 'n/a'}`
          }
        </div>

        {/* Risk badge */}
        {activeCase.risk_level && (
          <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[activeCase.risk_level].bg} ${RISK_CONFIG[activeCase.risk_level].color}`}>
            <AlertTriangle size={9} />
            Risk: {RISK_CONFIG[activeCase.risk_level].label}
          </div>
        )}
      </div>

      {saveError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
      )}

      {/* ── Section 1: Request ─────────────────────────────────────────────── */}
      <Section title="Request" icon={BookOpen}>
        <Field label="Problem / requested change" value={activeCase.title} />
        <Field label="Expected result" value={activeCase.requested_result} />
        {activeCase.linked_bug_id && (
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Bug size={12} className="text-red-500 shrink-0" />
            Linked bug: <span className="font-mono">{activeCase.linked_bug_id}</span>
          </div>
        )}
        <Field label="Source version" value={activeCase.source_version} />
      </Section>

      {/* ── Section 2: Dazza Diagnosis ────────────────────────────────────── */}
      <Section title="Dazza Diagnosis" icon={Zap} defaultOpen={!!activeCase.confirmed_symptom}>
        {!activeCase.confirmed_symptom ? (
          <div className="text-sm text-slate-400 italic">
            No diagnosis yet. Ask Dazza to diagnose this case using the input below.
          </div>
        ) : (
          <>
            <Field label="Confirmed symptom" value={activeCase.confirmed_symptom} />
            <Field label="Root cause" value={activeCase.root_cause} />
            <Field label="Evidence" value={activeCase.evidence} />
            <Field label="Files and line ranges inspected" value={activeCase.files_inspected} mono />
            <Field label="Assumptions" value={activeCase.assumptions} />
            <Field label="Unknowns" value={activeCase.unknowns} />
          </>
        )}
      </Section>

      {/* ── Section 3: Proposed Changes ───────────────────────────────────── */}
      <Section title="Proposed Changes" icon={FileCode} defaultOpen={!!activeCase.proposed_patch}>
        {!activeCase.proposed_patch && !activeCase.change_summary ? (
          <div className="text-sm text-slate-400 italic">
            No proposed changes yet. Ask Dazza to generate a repair plan.
          </div>
        ) : (
          <>
            <Field label="Exact files affected" value={activeCase.proposed_files} mono />
            <Field label="Summary of each change" value={activeCase.change_summary} />
            {activeCase.proposed_patch && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Proposed patch</div>
                  <CopyButton text={activeCase.proposed_patch} label="Copy patch" />
                </div>
                <pre className="text-xs font-mono bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto leading-relaxed max-h-80 overflow-y-auto">
                  {activeCase.proposed_patch}
                </pre>
                {isStaleAnatomy && (
                  <div className="mt-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                    Source changed — refresh anatomy before generating a reliable patch.
                  </div>
                )}
              </div>
            )}
            <Field label="Database / route impact" value={activeCase.db_route_impact} />
            <Field label="Security considerations" value={activeCase.security_considerations} />
            <Field label="Rollback instructions" value={activeCase.rollback_instructions} />
          </>
        )}
      </Section>

      {/* ── Section 4: Verification ───────────────────────────────────────── */}
      <Section title="Verification" icon={ShieldCheck} defaultOpen={activeCase.status === 'awaiting_verification' || activeCase.status === 'verified'}>
        <Field label="Test plan" value={activeCase.test_plan} />
        <Field label="Runtime checks" value={activeCase.runtime_checks} />
        <Field label="Verification notes" value={activeCase.verification_notes} />
        {activeCase.resolution_note && (
          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Resolution note</div>
            <div className="text-sm text-emerald-800">{activeCase.resolution_note}</div>
            {activeCase.verified_at && (
              <div className="text-[10px] text-emerald-600 mt-1">Verified: {fmtDate(activeCase.verified_at)}</div>
            )}
          </div>
        )}
      </Section>

      {/* ── Section 5: Airo Handoff ───────────────────────────────────────── */}
      <Section title="Airo Handoff" icon={ArrowRight} defaultOpen>
        {/* Airo prompt */}
        {activeCase.airo_prompt ? (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Airo prompt</div>
              <CopyButton text={activeCase.airo_prompt} label="Copy Airo prompt" />
            </div>
            <pre className="text-xs font-mono bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap">
              {activeCase.airo_prompt}
            </pre>
          </div>
        ) : (
          <div className="text-sm text-slate-400 italic mb-4">
            No Airo prompt yet. Generate one below.
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => void generateAiroPrompt()}
            disabled={generatingPrompt || saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
          >
            {generatingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Generate Airo Prompt
          </button>

          {activeCase.proposed_patch && (
            <CopyButton text={activeCase.proposed_patch} label="Copy Code Patch" />
          )}

          <button
            onClick={downloadRepairPackage}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-primary bg-white border border-slate-200 hover:border-primary/40 rounded-lg px-3 py-1.5 transition-all"
          >
            <Download size={12} />
            Download Repair Package
          </button>

          {activeCase.status === 'awaiting_daryl_review' && (
            <button
              onClick={() => void markSentToAiro()}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Mark Sent to Airo
            </button>
          )}

          {activeCase.status === 'sent_to_airo' && (
            <button
              onClick={() => void markAwaitingVerification()}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
              Airo Applied — Verify Result
            </button>
          )}
        </div>

        {/* Sent to Airo timestamp */}
        {activeCase.sent_to_airo_at && (
          <div className="text-[10px] text-slate-400 mb-3">
            Sent to Airo: {fmtDate(activeCase.sent_to_airo_at)}
          </div>
        )}

        {/* Verify section */}
        {activeCase.status === 'awaiting_verification' && (
          <div className="border border-cyan-200 bg-cyan-50/50 rounded-xl p-4">
            <div className="text-xs font-bold text-cyan-800 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} />
              Verify Airo Result
            </div>
            <p className="text-xs text-cyan-700 mb-3">
              After Airo applies the change, confirm the result here. This does NOT automatically resolve the linked bug — you must verify separately.
            </p>
            <textarea
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              placeholder="Describe what was verified: TypeScript passed, runtime checks passed, TestFlight confirmed…"
              rows={3}
              className="w-full border border-cyan-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white resize-none mb-2"
            />
            {verifyError && (
              <div className="text-xs text-red-600 mb-2">{verifyError}</div>
            )}
            <button
              onClick={() => void verifyCase()}
              disabled={!resolutionNote.trim() || saving}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <ClipboardCheck size={12} />}
              Mark Verified
            </button>
          </div>
        )}

        {/* Info: marking sent does not resolve bug */}
        <div className="mt-3 flex items-start gap-2 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Info size={10} className="shrink-0 mt-0.5" />
          Marking a case sent to Airo does not resolve the linked bug. Resolve the bug only after verification passes.
        </div>
      </Section>

      {/* ── Dazza input (Build & Repair mode) ─────────────────────────────── */}
      <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-4">
        <div className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5">
          <Wrench size={12} />
          Ask Dazza (Build & Repair mode)
        </div>
        <div className="bg-white border border-amber-200 rounded-xl flex items-end gap-2 px-3 py-2.5 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-200 transition-all">
          <textarea
            ref={dazzaInputRef}
            rows={2}
            value={dazzaInput}
            onChange={e => setDazzaInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToDazza(); }
            }}
            placeholder="Ask Dazza to diagnose, inspect anatomy, generate a patch or Airo prompt…"
            className="flex-1 resize-none text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent leading-relaxed"
            style={{ maxHeight: 100, minHeight: 40 }}
          />
          <button
            onClick={sendToDazza}
            disabled={!dazzaInput.trim() || isTyping}
            className="w-8 h-8 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg flex items-center justify-center transition-colors shrink-0"
          >
            {isTyping ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
        <p className="text-[10px] text-amber-700 mt-1.5">
          Dazza will use the active anatomy snapshot and this case context. Responses are proposals only — Airo applies changes.
        </p>
      </div>
    </div>
  );
}
