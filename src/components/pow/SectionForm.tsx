/**
 * SectionForm — shared form for creating/editing a Program of Works section.
 */
import { useState, useEffect } from 'react';
import { AlertCircle, Check } from 'lucide-react';

export interface SectionFormValues {
  title: string;
  description: string;
}

interface Props {
  initial?: Partial<SectionFormValues>;
  saving: boolean;
  error: string;
  onSave: (values: SectionFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export default function SectionForm({ initial, saving, error, onSave, onCancel, submitLabel = 'Save' }: Props) {
  const [form, setForm] = useState<SectionFormValues>({ title: '', description: '', ...initial });
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setForm({ title: '', description: '', ...initial });
  }, [initial]);

  function handleSubmit() {
    setValidationError('');
    if (!form.title.trim()) { setValidationError('Section title is required.'); return; }
    if (form.title.trim().length > 255) { setValidationError('Title too long (max 255 chars).'); return; }
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
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1">
          Section title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Preliminaries, Structure, Lock-up…"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1">Description (optional)</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Brief description of this phase…"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
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
