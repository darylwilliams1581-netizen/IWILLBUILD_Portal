/**
 * JobDelays — Delay / Condition Record tab for a job.
 *
 * Supports two record types:
 *   delay     — days > 0; a formal time-delay claim
 *   condition — days = 0; weather/site/work condition event record
 *
 * Category drives conditional field reveal:
 *   Weather → rainfall, ground condition, work condition checkboxes
 *   Other   → custom explanation required
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock, Plus, Edit2, Trash2, Loader2, AlertCircle,
  CalendarDays, X, Check, CloudRain, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Weather',
  'Material',
  'Site access',
  'Client / instruction',
  'Labour / subcontractor',
  'Plant / equipment',
  'Other',
] as const;

type Category = typeof CATEGORIES[number];

const GROUND_CONDITIONS = [
  'Wet',
  'Boggy',
  'Flooded',
  'Slippery',
  'Unsafe access',
  'Mud / soft ground',
] as const;

const WORK_CONDITIONS = [
  'Stopped work',
  'Slowed progress',
  'Restricted access',
  'Plant could not operate',
  'Concrete / finishing affected',
  'Unsafe to proceed',
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DelayEntry {
  id: number;
  category: string | null;
  entry_type: string | null;
  impact_summary: string | null;
  reason: string;          // legacy — mirrors impact_summary
  days: string | number;
  delay_date: string;
  notes: string | null;
  rainfall_mm: number | null;
  ground_condition: string | null;
  work_condition: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  jobId: number;
  readOnly?: boolean;
}

export type { DelayEntry };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function parseDays(val: string | number): number {
  return Math.round(parseFloat(String(val ?? 0)) * 100) / 100;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function displaySummary(entry: DelayEntry): string {
  return entry.impact_summary?.trim() || entry.reason?.trim() || '—';
}

// ── Category badge ────────────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  'Weather':                'bg-sky-100 text-sky-700 border-sky-200',
  'Material':               'bg-amber-100 text-amber-700 border-amber-200',
  'Site access':            'bg-orange-100 text-orange-700 border-orange-200',
  'Client / instruction':   'bg-purple-100 text-purple-700 border-purple-200',
  'Labour / subcontractor': 'bg-teal-100 text-teal-700 border-teal-200',
  'Plant / equipment':      'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Other':                  'bg-slate-100 text-slate-600 border-slate-200',
};

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cls = CATEGORY_COLOURS[category] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {category}
    </span>
  );
}

function EntryTypePill({ entryType, days }: { entryType: string | null; days: string | number }) {
  const daysNum = parseDays(days);
  const isDelay = entryType === 'delay' || daysNum > 0;
  if (isDelay) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
        <Clock size={10} />
        {daysNum} {daysNum === 1 ? 'day' : 'days'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
      <CloudRain size={10} />
      Condition
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  editing: DelayEntry | null;
  jobId: number;
  onClose: () => void;
  onSaved: (delay: DelayEntry) => void;
}

export { type ModalProps as DelayModalProps };

export function DelayModal({ open, editing, jobId, onClose, onSaved }: ModalProps) {
  // Core fields
  const [category, setCategory]           = useState<Category | ''>('');
  const [impactSummary, setImpactSummary] = useState('');
  const [days, setDays]                   = useState('0');
  const [delayDate, setDelayDate]         = useState(todayISO());
  const [notes, setNotes]                 = useState('');
  const [otherExplanation, setOtherExplanation] = useState('');

  // Weather sub-fields — checkbox toggles
  const [recordRainfall, setRecordRainfall]         = useState(false);
  const [siteConditionsAffected, setSiteConditions] = useState(false);
  const [workConditionsAffected, setWorkConditions] = useState(false);

  // Weather detail fields
  const [rainfallMm, setRainfallMm]           = useState('');
  const [groundCondition, setGroundCondition] = useState('');
  const [workCondition, setWorkCondition]     = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Scroll body to top when re-opened
  const scrollRef = useRef<HTMLDivElement>(null);

  const isWeather = category === 'Weather';
  const isOther   = category === 'Other';
  const daysNum   = parseFloat(days) || 0;
  const isDelay   = daysNum > 0;

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
    if (editing) {
      setCategory((editing.category as Category | '') ?? '');
      setImpactSummary(editing.impact_summary?.trim() || editing.reason?.trim() || '');
      setDays(String(parseDays(editing.days)));
      setDelayDate(editing.delay_date?.slice(0, 10) ?? todayISO());
      setNotes(editing.notes ?? '');
      setOtherExplanation('');

      // Weather sub-fields
      const hasRainfall = editing.rainfall_mm != null;
      const hasGround   = !!editing.ground_condition;
      const hasWork     = !!editing.work_condition;
      setRecordRainfall(hasRainfall);
      setSiteConditions(hasGround);
      setWorkConditions(hasWork);
      setRainfallMm(hasRainfall ? String(editing.rainfall_mm) : '');
      setGroundCondition(editing.ground_condition ?? '');
      setWorkCondition(editing.work_condition ?? '');
    } else {
      setCategory('');
      setImpactSummary('');
      setDays('0');
      setDelayDate(todayISO());
      setNotes('');
      setOtherExplanation('');
      setRecordRainfall(false);
      setSiteConditions(false);
      setWorkConditions(false);
      setRainfallMm('');
      setGroundCondition('');
      setWorkCondition('');
    }
    setError('');
  }, [editing, open]);

  // Clear weather detail fields when their checkbox is unchecked
  useEffect(() => { if (!recordRainfall) setRainfallMm(''); }, [recordRainfall]);
  useEffect(() => { if (!siteConditionsAffected) setGroundCondition(''); }, [siteConditionsAffected]);
  useEffect(() => { if (!workConditionsAffected) setWorkCondition(''); }, [workConditionsAffected]);

  async function handleSave() {
    // Validation
    if (!category) { setError('Please select a category.'); return; }
    if (!impactSummary.trim()) { setError('Impact summary is required.'); return; }
    if (isOther && !otherExplanation.trim()) { setError('Please describe the "Other" category.'); return; }

    const parsedDays = parseFloat(days);
    if (isNaN(parsedDays) || parsedDays < 0) { setError('Days must be a number ≥ 0.'); return; }

    if (parsedDays === 0 && isWeather && !recordRainfall && !siteConditionsAffected && !workConditionsAffected) {
      setError('For a weather condition record with 0 delay days, please record at least one weather impact (rainfall, site conditions, or work conditions).');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const url = editing
        ? `/api/jobs/${jobId}/delays/${editing.id}`
        : `/api/jobs/${jobId}/delays`;
      const method = editing ? 'PUT' : 'POST';

      const fullSummary = isOther && otherExplanation.trim()
        ? `${impactSummary.trim()} — ${otherExplanation.trim()}`
        : impactSummary.trim();

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          impact_summary: fullSummary,
          days: parsedDays,
          delayDate,
          notes: notes.trim() || undefined,
          rainfall_mm: recordRainfall && rainfallMm !== '' ? parseFloat(rainfallMm) : undefined,
          ground_condition: siteConditionsAffected && groundCondition ? groundCondition : undefined,
          work_condition: workConditionsAffected && workCondition ? workCondition : undefined,
        }),
      });
      const data = await res.json() as { delay?: DelayEntry; error?: string };
      if (!res.ok || !data.delay) {
        setError(data.error ?? 'Failed to save. Please try again.');
        return;
      }
      onSaved(data.delay);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const heading = editing
    ? (editing.entry_type === 'condition' ? 'Edit Condition Record' : 'Edit Delay')
    : (isDelay ? 'Log a Delay' : 'Log a Condition Record');

  // Input / label shared styles
  const inp = 'w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-background';
  const lbl = 'block text-xs font-semibold mb-1.5 text-foreground';

  return (
    <AnimatePresence>
      {open && (
        /* ── Backdrop ── */
        <motion.div
          key="delay-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => { if (!saving) onClose(); }}
        >
          {/* ── Card ── */}
          <motion.div
            key="delay-modal-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' as const }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: 'min(88dvh, 680px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Sticky header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDelay ? 'bg-red-50' : 'bg-blue-50'}`}>
                  {isDelay
                    ? <Clock size={15} className="text-red-600" />
                    : <CloudRain size={15} className="text-blue-600" />
                  }
                </div>
                <h2 className="font-heading font-bold text-sm text-slate-900">{heading}</h2>
              </div>
              <button
                onClick={() => { if (!saving) onClose(); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* ── Category ── */}
              <div>
                <label className={lbl}>
                  Category <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category | '')}
                    className={`${inp} appearance-none pr-8`}
                  >
                    <option value="">Select category…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* ── Delay days + Date ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>
                    Delay days
                    <span className="text-muted-foreground font-normal ml-1 text-[11px]">(0 = condition)</span>
                  </label>
                  <input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.5"
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Date</label>
                  <input
                    type="date"
                    value={delayDate}
                    onChange={(e) => setDelayDate(e.target.value)}
                    className={inp}
                  />
                </div>
              </div>

              {/* ── Entry type hint ── */}
              {category && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border ${
                  isDelay
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  {isDelay ? (
                    <><Clock size={12} className="shrink-0" /><span>Formal delay — {daysNum} {daysNum === 1 ? 'day' : 'days'} added to delay total.</span></>
                  ) : (
                    <><CloudRain size={12} className="shrink-0" /><span>Condition record — no delay days claimed.</span></>
                  )}
                </div>
              )}

              {/* ── Impact summary ── */}
              <div>
                <label className={lbl}>
                  Impact summary <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={impactSummary}
                  onChange={(e) => setImpactSummary(e.target.value)}
                  placeholder={
                    isWeather ? 'e.g. Heavy rain stopped all concrete works'
                    : isOther  ? 'Brief description of the impact'
                    : 'Brief description of the impact on works'
                  }
                  className={inp}
                />
              </div>

              {/* ── Other: custom explanation ── */}
              {isOther && (
                <div>
                  <label className={lbl}>
                    Explain "Other" <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={otherExplanation}
                    onChange={(e) => setOtherExplanation(e.target.value)}
                    placeholder="Describe the category in a few words"
                    className={inp}
                  />
                </div>
              )}

              {/* ── Weather conditional section ── */}
              {isWeather && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 flex flex-col gap-3">
                  <p className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
                    <CloudRain size={13} />
                    Weather details
                  </p>

                  {/* Checkboxes */}
                  <div className="flex flex-col gap-2.5">
                    {(
                      [
                        { key: 'rainfall', label: 'Record rainfall',          checked: recordRainfall,         set: setRecordRainfall },
                        { key: 'site',     label: 'Site conditions affected',  checked: siteConditionsAffected, set: setSiteConditions },
                        { key: 'work',     label: 'Work conditions affected',  checked: workConditionsAffected, set: setWorkConditions },
                      ] as Array<{ key: string; label: string; checked: boolean; set: (v: boolean) => void }>
                    ).map(({ key, label, checked, set }) => (
                      <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                        <div
                          onClick={() => set(!checked)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                            checked
                              ? 'bg-sky-600 border-sky-600'
                              : 'bg-white border-slate-300 hover:border-sky-400'
                          }`}
                        >
                          {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-sm text-foreground">{label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Rainfall total */}
                  {recordRainfall && (
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 text-sky-800">
                        Rainfall total (mm)
                      </label>
                      <input
                        type="number"
                        value={rainfallMm}
                        onChange={(e) => setRainfallMm(e.target.value)}
                        placeholder="e.g. 12.5"
                        min="0"
                        step="0.5"
                        className="w-full px-3 py-2.5 border border-sky-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 transition-colors bg-white"
                      />
                    </div>
                  )}

                  {/* Ground condition */}
                  {siteConditionsAffected && (
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 text-sky-800">
                        Ground condition
                      </label>
                      <div className="relative">
                        <select
                          value={groundCondition}
                          onChange={(e) => setGroundCondition(e.target.value)}
                          className="w-full appearance-none px-3 py-2.5 pr-8 border border-sky-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 transition-colors bg-white"
                        >
                          <option value="">Select…</option>
                          {GROUND_CONDITIONS.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Work condition */}
                  {workConditionsAffected && (
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 text-sky-800">
                        Impact to works
                      </label>
                      <div className="relative">
                        <select
                          value={workCondition}
                          onChange={(e) => setWorkCondition(e.target.value)}
                          className="w-full appearance-none px-3 py-2.5 pr-8 border border-sky-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 transition-colors bg-white"
                        >
                          <option value="">Select…</option>
                          {WORK_CONDITIONS.map((w) => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Notes (optional, secondary) ── */}
              <div>
                <label className={lbl}>
                  Notes{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional context…"
                  rows={2}
                  className={`${inp} resize-none`}
                />
              </div>

            </div>

            {/* ── Sticky footer ── */}
            <div className="flex gap-2.5 px-5 py-4 border-t border-slate-100 shrink-0 bg-white">
              <button
                type="button"
                onClick={() => { if (!saving) onClose(); }}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
                  isDelay
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-primary hover:bg-violet-700'
                }`}
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" />Saving…</>
                ) : (
                  <><Check size={14} />{editing ? 'Save changes' : isDelay ? 'Log delay' : 'Log record'}</>
                )}
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JobDelays({ jobId, readOnly = false }: Props) {
  const [delays, setDelays]       = useState<DelayEntry[]>([]);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDelay, setEditingDelay] = useState<DelayEntry | null>(null);
  const [deletingId, setDeletingId]     = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/delays`, { credentials: 'include' });
      const data = await res.json() as { delays?: DelayEntry[]; totalDays?: number; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to load records.'); return; }
      setDelays(data.delays ?? []);
      setTotalDays(data.totalDays ?? 0);
    } catch {
      setError('Network error. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(delay: DelayEntry) {
    setDelays((prev) => {
      const idx = prev.findIndex((d) => d.id === delay.id);
      const next = idx >= 0
        ? prev.map((d) => d.id === delay.id ? delay : d)
        : [delay, ...prev];
      const total = next.reduce((s, d) => s + parseDays(d.days), 0);
      setTotalDays(Math.round(total * 100) / 100);
      return next;
    });
  }

  async function handleDelete(delayId: number) {
    setDeletingId(delayId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/delays/${delayId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Failed to delete.');
        return;
      }
      setDelays((prev) => {
        const next = prev.filter((d) => d.id !== delayId);
        const total = next.reduce((s, d) => s + parseDays(d.days), 0);
        setTotalDays(Math.round(total * 100) / 100);
        return next;
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  // Counts
  const delayCount     = delays.filter(d => parseDays(d.days) > 0).length;
  const conditionCount = delays.filter(d => parseDays(d.days) === 0).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h2 className="font-heading font-bold text-base">Delays &amp; Conditions</h2>
        </div>
        {!readOnly && (
          <Button
            onClick={() => { setEditingDelay(null); setModalOpen(true); }}
            size="sm"
            className="bg-primary hover:bg-violet-700 text-white font-bold text-xs"
          >
            <Plus size={14} className="mr-1.5" />
            Add Record
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-border p-3.5 flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground font-medium">Total delay</p>
          <p className="text-xl font-bold text-foreground">
            {totalDays}
            <span className="text-xs font-semibold text-muted-foreground ml-1">
              {totalDays === 1 ? 'day' : 'days'}
            </span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-3.5 flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground font-medium">Delays</p>
          <p className="text-xl font-bold text-foreground">
            {delayCount}
            <span className="text-xs font-semibold text-muted-foreground ml-1">entries</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-3.5 flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground font-medium">Conditions</p>
          <p className="text-xl font-bold text-foreground">
            {conditionCount}
            <span className="text-xs font-semibold text-muted-foreground ml-1">records</span>
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && delays.length === 0 && (
        <div className="bg-white rounded-xl border border-border p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
            <CalendarDays size={22} className="text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">No records logged yet.</p>
            {!readOnly && (
              <p className="text-xs text-muted-foreground mt-1">
                Log a formal delay or a weather / site condition record.
              </p>
            )}
          </div>
          {!readOnly && (
            <Button
              onClick={() => { setEditingDelay(null); setModalOpen(true); }}
              variant="outline"
              size="sm"
              className="mt-1 text-xs font-semibold"
            >
              <Plus size={13} className="mr-1.5" />
              Add first record
            </Button>
          )}
        </div>
      )}

      {/* Record list */}
      {!loading && delays.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden divide-y divide-border">
          {delays.map((delay) => (
            <div
              key={delay.id}
              className="flex flex-col gap-2 px-4 py-3.5 hover:bg-slate-50/60 transition-colors"
            >
              {/* Top row: badges + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <EntryTypePill entryType={delay.entry_type} days={delay.days} />
                  <CategoryBadge category={delay.category} />
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingDelay(delay); setModalOpen(true); }}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-violet-50 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => void handleDelete(delay.id)}
                      disabled={deletingId === delay.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Delete"
                    >
                      {deletingId === delay.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  </div>
                )}
              </div>

              {/* Impact summary */}
              <p className="text-sm font-medium text-foreground leading-snug">
                {displaySummary(delay)}
              </p>

              {/* Weather detail chips */}
              {(delay.rainfall_mm != null || delay.ground_condition || delay.work_condition) && (
                <div className="flex flex-wrap gap-1.5">
                  {delay.rainfall_mm != null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-50 text-sky-700 border border-sky-200">
                      <CloudRain size={10} />
                      {delay.rainfall_mm}mm
                    </span>
                  )}
                  {delay.ground_condition && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
                      {delay.ground_condition} ground
                    </span>
                  )}
                  {delay.work_condition && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-200">
                      {delay.work_condition}
                    </span>
                  )}
                </div>
              )}

              {/* Notes */}
              {delay.notes && (
                <p className="text-xs text-muted-foreground leading-relaxed">{delay.notes}</p>
              )}

              {/* Footer: date + added by */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatDate(delay.delay_date)}</span>
                <span>·</span>
                <span>{delay.created_by_name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <DelayModal
        open={modalOpen}
        editing={editingDelay}
        jobId={jobId}
        onClose={() => { setModalOpen(false); setEditingDelay(null); }}
        onSaved={handleSaved}
      />
    </div>
  );
}
