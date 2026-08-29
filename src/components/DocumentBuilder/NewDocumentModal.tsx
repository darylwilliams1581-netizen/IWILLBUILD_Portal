/**
 * NewDocumentModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Simplified: user names the document, picks a type, hits Create.
 * Navigates straight to the Studio builder with ?tab=layout open so they
 * can set page size / margins immediately.
 *
 * Word / PDF import is available inside the builder ribbon (DocxImporter).
 * Library template path is still accessible via the Library tab button.
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertCircle, FileText, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router';

interface Props {
  onClose: () => void;
  /** Called when user picks "Library" — parent should switch to library tab */
  onOpenLibrary: () => void;
  /** Kept for API compatibility — not used in this simplified flow */
  onSaved?: (id: number, name: string, sourceType: 'docx' | 'pdf') => void;
}

const DOC_TYPES = [
  { value: 'custom',       label: 'Custom' },
  { value: 'swms',         label: 'SWMS' },
  { value: 'safety_plan',  label: 'Safety Plan' },
  { value: 'policy',       label: 'Policy' },
  { value: 'procedure',    label: 'Procedure' },
  { value: 'toolbox_talk', label: 'Toolbox Talk' },
  { value: 'form',         label: 'Form' },
  { value: 'contract',     label: 'Contract' },
  { value: 'quote',        label: 'Quote' },
  { value: 'report',       label: 'Report' },
  { value: 'induction',    label: 'Induction' },
] as const;

export default function NewDocumentModal({ onClose, onOpenLibrary }: Props) {
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [docType, setDocType] = useState<string>('custom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-focus the name field on mount
  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a document name.');
      nameRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/document-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: trimmed,
          templateType: docType,
          blocks: [],
          layout: {},
          theme: {},
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Could not create document (HTTP ${res.status})`);
      }
      const data = await res.json() as { id?: number };
      if (!data.id) throw new Error('No document ID returned — please try again.');
      onClose();
      // Open builder with Layout tab active so user can name/configure immediately
      navigate(`/studio/builder/${data.id}?tab=layout`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create document');
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !loading) void handleCreate();
    if (e.key === 'Escape') onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
              <FileText size={15} className="text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 leading-tight">New Document</p>
              <p className="text-xs text-slate-400">Name it, then build it</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-500 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 flex flex-col gap-4">

          {/* Document name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">
              Document name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Electrical SWMS — High Voltage"
              maxLength={120}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors"
            />
          </div>

          {/* Document type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Document type</label>
            <div className="relative">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors pr-8"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={loading || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                : 'Create document'
              }
            </button>
          </div>

          {/* Library shortcut */}
          <button
            onClick={() => { onClose(); onOpenLibrary(); }}
            disabled={loading}
            className="text-xs text-slate-400 hover:text-violet-600 transition-colors text-center -mt-1"
          >
            Or browse the template library →
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
