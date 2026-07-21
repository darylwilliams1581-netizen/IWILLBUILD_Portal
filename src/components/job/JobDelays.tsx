/**
 * JobDelays — Delay log tab for a job.
 * Shows a running total, a list of delay entries, and an Add/Edit modal.
 */
import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Edit2, Trash2, Loader2, AlertCircle, CalendarDays, X, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DelayEntry {
  id: number;
  reason: string;
  days: string | number;
  delay_date: string;
  notes: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  jobId: number;
  /** If true, user can only view — no add/edit/delete */
  readOnly?: boolean;
}

export type { DelayEntry };

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
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [delayDate, setDelayDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (editing) {
      setReason(editing.reason);
      setDays(String(parseDays(editing.days)));
      setDelayDate(editing.delay_date?.slice(0, 10) ?? todayISO());
      setNotes(editing.notes ?? '');
    } else {
      setReason('');
      setDays('');
      setDelayDate(todayISO());
      setNotes('');
    }
    setError('');
  }, [editing, open]);

  async function handleSave() {
    if (!reason.trim()) { setError('Reason is required.'); return; }
    const daysNum = parseFloat(days);
    if (isNaN(daysNum) || daysNum < 0) { setError('Days must be a number ≥ 0.'); return; }

    setSaving(true);
    setError('');
    try {
      const url = editing
        ? `/api/jobs/${jobId}/delays/${editing.id}`
        : `/api/jobs/${jobId}/delays`;
      const method = editing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), days: daysNum, delayDate, notes: notes.trim() || undefined }),
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {editing ? 'Edit Delay' : 'Log a Delay'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">
              Delay reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Weather, site access, pending engineering, materials delay, client delay"
              rows={3}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Days + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5">
                Delay days <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="e.g. 2 or 0.5"
                min="0"
                step="0.5"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">Delay date</label>
              <input
                type="date"
                value={delayDate}
                onChange={(e) => setDelayDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold mb-1.5">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context…"
              rows={2}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 sm:flex-none bg-primary hover:bg-orange-600 text-white font-bold"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin mr-2" />Saving…</>
            ) : (
              <><Check size={14} className="mr-2" />{editing ? 'Save changes' : 'Log delay'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JobDelays({ jobId, readOnly = false }: Props) {
  const [delays, setDelays] = useState<DelayEntry[]>([]);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDelay, setEditingDelay] = useState<DelayEntry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/delays`, { credentials: 'include' });
      const data = await res.json() as { delays?: DelayEntry[]; totalDays?: number; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to load delays.'); return; }
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

  function openAdd() {
    setEditingDelay(null);
    setModalOpen(true);
  }

  function openEdit(delay: DelayEntry) {
    setEditingDelay(delay);
    setModalOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h2 className="font-heading font-bold text-base">Delays</h2>
        </div>
        {!readOnly && (
          <Button
            onClick={openAdd}
            size="sm"
            className="bg-primary hover:bg-orange-600 text-white font-bold text-xs"
          >
            <Plus size={14} className="mr-1.5" />
            Add Delay
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-border p-4 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total delay</p>
          <p className="text-2xl font-bold text-foreground">
            {totalDays}
            <span className="text-sm font-semibold text-muted-foreground ml-1">
              {totalDays === 1 ? 'day' : 'days'}
            </span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-border p-4 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Entries</p>
          <p className="text-2xl font-bold text-foreground">
            {delays.length}
            <span className="text-sm font-semibold text-muted-foreground ml-1">
              {delays.length === 1 ? 'entry' : 'entries'}
            </span>
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
            <p className="font-semibold text-sm text-foreground">No delays logged for this job.</p>
            {!readOnly && (
              <p className="text-xs text-muted-foreground mt-1">
                Use the Add Delay button to record site delays.
              </p>
            )}
          </div>
          {!readOnly && (
            <Button
              onClick={openAdd}
              variant="outline"
              size="sm"
              className="mt-1 text-xs font-semibold"
            >
              <Plus size={13} className="mr-1.5" />
              Log first delay
            </Button>
          )}
        </div>
      )}

      {/* Delay list */}
      {!loading && delays.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Table header — hidden on mobile */}
          <div className="hidden sm:grid grid-cols-[1fr_80px_110px_120px_80px] gap-3 px-4 py-2.5 bg-slate-50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Reason</span>
            <span className="text-right">Days</span>
            <span>Date</span>
            <span>Added by</span>
            <span className="text-right">Actions</span>
          </div>

          {delays.map((delay, idx) => (
            <div
              key={delay.id}
              className={`flex flex-col sm:grid sm:grid-cols-[1fr_80px_110px_120px_80px] sm:items-center gap-2 sm:gap-3 px-4 py-3.5 ${
                idx < delays.length - 1 ? 'border-b border-border' : ''
              } hover:bg-slate-50/60 transition-colors`}
            >
              {/* Reason + notes */}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">{delay.reason}</p>
                {delay.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{delay.notes}</p>
                )}
              </div>

              {/* Days */}
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="sm:hidden text-xs text-muted-foreground">Days:</span>
                <span className="text-sm font-bold text-primary">
                  {parseDays(delay.days)}
                </span>
              </div>

              {/* Date */}
              <div className="flex items-center gap-2">
                <span className="sm:hidden text-xs text-muted-foreground">Date:</span>
                <span className="text-xs text-muted-foreground">{formatDate(delay.delay_date)}</span>
              </div>

              {/* Added by */}
              <div className="flex items-center gap-2">
                <span className="sm:hidden text-xs text-muted-foreground">By:</span>
                <span className="text-xs text-muted-foreground truncate">{delay.created_by_name}</span>
              </div>

              {/* Actions */}
              {!readOnly && (
                <div className="flex items-center gap-1.5 sm:justify-end">
                  <button
                    onClick={() => openEdit(delay)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-orange-50 transition-colors"
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
