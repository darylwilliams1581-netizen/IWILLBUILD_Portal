/**
 * ActivityForm — shared form for creating/editing a Program of Works activity.
 * Used by ProgramOfWorksView (add + edit inline).
 * Does NOT accept Quantity, Unit, or Rate.
 */
import { useState, useEffect } from 'react';
import { AlertCircle, Calendar, Check, X } from 'lucide-react';
import type { ProgressSection, ProgressActivity } from '@/lib/pow-types';
import { calcDuration, fmtDuration } from '@/lib/pow-types';

export interface ActivityFormValues {
  description: string;
  sectionId: number | null;
  progressNote: string;
  startDate: string;
  endDate: string;
  percentComplete: number;
  assignedToName: string;
  tradeType: string;
}

const EMPTY: ActivityFormValues = {
  description: '',
  sectionId: null,
  progressNote: '',
  startDate: '',
  endDate: '',
  percentComplete: 0,
  assignedToName: '',
  tradeType: '',
};

export const TRADE_TYPES = [
  'Carpenter', 'Electrician', 'Plumber', 'Concreter', 'Bricklayer',
  'Painter', 'Tiler', 'Roofer', 'Plasterer', 'Landscaper',
  'Steel Fixer', 'Excavator', 'Surveyor', 'Engineer', 'Other',
];

interface Props {
  sections: ProgressSection[];
  initial?: Partial<ActivityFormValues>;
  saving: boolean;
  error: string;
  onSave: (values: ActivityFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export default function ActivityForm({ sections, initial, saving, error, onSave, onCancel, submitLabel = 'Save' }: Props) {
  const [form, setForm] = useState<ActivityFormValues>({ ...EMPTY, ...initial });
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setForm({ ...EMPTY, ...initial });
  }, [initial]);

  const duration = calcDuration(form.startDate || null, form.endDate || null);

  function handleSubmit() {
    setValidationError('');
    if (!form.description.trim()) { setValidationError('Activity description is required.'); return; }
    if (form.description.trim().length > 2000) { setValidationError('Description too long (max 2000 chars).'); return; }
    if (form.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) { setValidationError('Start date must be a valid date.'); return; }
    if (form.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate)) { setValidationError('Finish date must be a valid date.'); return; }
    if (form.startDate && form.endDate && form.endDate < form.startDate) { setValidationError('Finish date cannot be before Start date.'); return; }
    if (form.percentComplete < 0 || form.percentComplete > 100) { setValidationError('Progress must be 0–100.'); return; }
    onSave(form);
  }

  const displayError = validationError || error;

  return (
    <div className="flex flex-col gap-3">
      {displayError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle size={12} /> {displayError}
        </p>
      )}

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1">
          Activity description <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="e.g. Install roof trusses — Level 1"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {/* Section + Progress row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Section</label>
          <select
            value={form.sectionId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value ? Number(e.target.value) : null }))}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="">Unsectioned</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            Progress: <span className="text-foreground font-bold">{form.percentComplete}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={form.percentComplete}
            onChange={(e) => setForm((f) => ({ ...f, percentComplete: Number(e.target.value) }))}
            className="w-full accent-primary"
          />
        </div>
      </div>

      {/* Dates row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <Calendar size={10} /> Start date
          </label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <Calendar size={10} /> Finish date
          </label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Duration</label>
          <div className="px-3 py-2 border border-border rounded-lg text-sm bg-muted/30 text-muted-foreground">
            {fmtDuration(duration) || '—'}
          </div>
        </div>
      </div>

      {/* Responsible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Trade / type</label>
          <select
            value={form.tradeType}
            onChange={(e) => setForm((f) => ({ ...f, tradeType: e.target.value }))}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="">— Select trade —</option>
            {TRADE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Responsible person</label>
          <input
            type="text"
            value={form.assignedToName}
            onChange={(e) => setForm((f) => ({ ...f, assignedToName: e.target.value }))}
            placeholder="e.g. John Smith, Site crew…"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
        <textarea
          value={form.progressNote}
          onChange={(e) => setForm((f) => ({ ...f, progressNote: e.target.value }))}
          placeholder="Optional detailed notes…"
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving
            ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            : <Check size={12} />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
