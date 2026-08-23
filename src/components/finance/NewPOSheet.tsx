/**
 * NewPOSheet — multi-step Purchase Order creation workflow.
 *
 * Steps:
 *  1. Select Job
 *  2. Select Contractor / Supplier
 *  3. Details (title, instructions, dates)
 *  4. Line items
 *  → Save as Draft → opens PO detail
 *
 * Renders as a bottom sheet on mobile, right-side panel on desktop.
 */
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X, ChevronRight, ChevronLeft, Search, Plus, Trash2,
  Loader2, AlertCircle, Briefcase, User, FileText, Check,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  name: string;
  job_number: string | null;
  status: string;
}

interface Vendor {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  record_type: string;
}

interface POLine {
  description: string;
  qty: number;
  unit: string;
  rate: number;
}

interface Props {
  onClose: () => void;
  onCreated: (po: { id: number; job_id: number; po_number: string; title: string; status: string }) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

function calcAmount(qty: number, rate: number): number {
  return Math.round(qty * rate * 100) / 100;
}

function calcTotals(lines: POLine[]) {
  const subtotal = Math.round(lines.reduce((s, l) => s + calcAmount(l.qty, l.rate), 0) * 100) / 100;
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;
  return { subtotal, gst, total };
}

const STEP_LABELS = ['Job', 'Contractor', 'Details', 'Lines'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewPOSheet({ onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);

  // Step 1 — Job
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Step 2 — Vendor
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  // Step 3 — Details
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [startDate, setStartDate] = useState('');
  const [finishDate, setFinishDate] = useState('');

  // Step 4 — Lines
  const [lines, setLines] = useState<POLine[]>([{ description: '', qty: 1, unit: '', rate: 0 }]);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Load jobs ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 0) return;
    setJobsLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (jobSearch) params.set('search', jobSearch);
    fetch(`/api/jobs?${params}`)
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? d.data ?? []))
      .catch(() => setJobs([]))
      .finally(() => setJobsLoading(false));
  }, [step, jobSearch]);

  // ── Load vendors ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 1) return;
    setVendorsLoading(true);
    const params = new URLSearchParams({ limit: '50', recordType: 'contractor,supplier', status: 'active' });
    if (vendorSearch) params.set('search', vendorSearch);
    fetch(`/api/customers?${params}`)
      .then((r) => r.json())
      .then((d) => setVendors(d.customers ?? d.data ?? []))
      .catch(() => setVendors([]))
      .finally(() => setVendorsLoading(false));
  }, [step, vendorSearch]);

  // ── Line helpers ───────────────────────────────────────────────────────────
  const addLine = () => setLines((prev) => [...prev, { description: '', qty: 1, unit: '', rate: 0 }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof POLine, value: string | number) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const { subtotal, gst, total } = calcTotals(lines);

  // ── Validation ─────────────────────────────────────────────────────────────
  const canProceed = () => {
    if (step === 0) return !!selectedJob;
    if (step === 1) return !!selectedVendor;
    if (step === 2) return true; // title optional
    if (step === 3) return lines.every((l) => l.description.trim() && l.qty >= 0 && l.rate >= 0);
    return false;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!selectedJob) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/finance/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: selectedJob.id,
          contractorId: selectedVendor?.id ?? null,
          assignedToType: selectedVendor ? 'contractor' : 'internal',
          title: title.trim() || null,
          instructions: instructions.trim() || null,
          startDate: startDate || null,
          finishDate: finishDate || null,
          lines: lines.map((l) => ({
            description: l.description,
            qty: l.qty,
            unit: l.unit || null,
            rate: l.rate,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onCreated(data.purchaseOrder);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[1200] flex items-end md:items-center justify-center md:justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative z-10 w-full md:w-[520px] md:h-full bg-background flex flex-col rounded-t-2xl md:rounded-none shadow-2xl"
        style={{ maxHeight: 'min(90dvh, 800px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText size={15} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">New Purchase Order</h2>
            <p className="text-xs text-muted-foreground">Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-border shrink-0">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-primary text-primary-foreground' :
                i === step ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {i < step ? <Check size={11} /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && <div className="w-4 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          {/* Step 0: Job */}
          {step === 0 && (
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-3">Select the job this purchase order is for.</p>
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Search jobs…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {jobsLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex items-center gap-3 ${
                        selectedJob?.id === job.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Briefcase size={13} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {job.job_number ? `#${job.job_number} — ` : ''}{job.name}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{job.status}</p>
                      </div>
                      {selectedJob?.id === job.id && <Check size={14} className="text-primary shrink-0" />}
                    </button>
                  ))}
                  {jobs.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No jobs found</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Vendor */}
          {step === 1 && (
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-3">Select the contractor or supplier for this PO.</p>
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  placeholder="Search contractors, suppliers…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {vendorsLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {vendors.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVendor(v)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex items-center gap-3 ${
                        selectedVendor?.id === v.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                        <User size={13} className="text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{v.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {v.record_type}{v.email ? ` · ${v.email}` : ''}
                        </p>
                      </div>
                      {selectedVendor?.id === v.id && <Check size={14} className="text-primary shrink-0" />}
                    </button>
                  ))}
                  {vendors.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No contractors or suppliers found</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Electrical rough-in works"
                  maxLength={200}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Instructions / Scope</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Describe the scope of work…"
                  rows={4}
                  maxLength={2000}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Finish Date</label>
                  <input
                    type="date"
                    value={finishDate}
                    onChange={(e) => setFinishDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Lines */}
          {step === 3 && (
            <div className="p-5">
              <div className="space-y-3 mb-4">
                {lines.map((line, i) => (
                  <div key={i} className="border border-border rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(i, 'description', e.target.value)}
                        placeholder="Description *"
                        maxLength={1000}
                        className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(i)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pl-7">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Qty</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.qty}
                          onChange={(e) => updateLine(i, 'qty', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Unit</label>
                        <input
                          value={line.unit}
                          onChange={(e) => updateLine(i, 'unit', e.target.value)}
                          placeholder="ea, m, hr…"
                          maxLength={50}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Rate ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.rate}
                          onChange={(e) => updateLine(i, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                    <div className="pl-7 text-xs text-muted-foreground">
                      Amount: <span className="font-semibold text-foreground">{fmtCurrency(calcAmount(line.qty, line.rate))}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addLine}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mb-4"
              >
                <Plus size={14} /> Add line
              </button>

              {/* Totals */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal (ex GST)</span>
                  <span className="font-medium">{fmtCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST (10%)</span>
                  <span className="font-medium">{fmtCurrency(gst)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-1">
                  <span>Total (inc GST)</span>
                  <span className="text-primary">{fmtCurrency(total)}</span>
                </div>
              </div>

              {submitError && (
                <div className="flex items-center gap-2 mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                  <AlertCircle size={14} className="shrink-0" />
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-border shrink-0">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={14} /> Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          )}

          <div className="flex-1" />

          {step < STEP_LABELS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || !canProceed()}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save as Draft
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
