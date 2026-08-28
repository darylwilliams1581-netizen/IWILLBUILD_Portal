/**
 * NewDocumentModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the old "New document" → navigate('/studio/builder/new') shortcut.
 *
 * Four creation paths:
 *   1. Choose Library Template  — opens the Library tab
 *   2. Upload Word (.docx)      — creates a placeholder doc, uploads DOCX as
 *                                 Word Source (keep_word mode), shows success
 *                                 state, calls onSaved so the list refreshes
 *   3. Upload PDF               — same flow for PDF source
 *   4. Blank Studio Canvas      — creates an empty doc and navigates to builder
 *
 * Widget buttons (SWMS / Safety Plan / Policy) are NOT shown here.
 * They remain accessible from within the builder's Apply Widget ribbon tab
 * for backward compatibility with existing widget documents.
 *
 * IMPORTANT: keep_word / PDF upload paths do NOT navigate to the builder.
 * They call onSaved(id) so the parent can refresh the list and open the
 * SourceDocumentPanel for the new document. The user can then choose to
 * open the builder from there.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Library, FileText, File, LayoutTemplate,
  Loader2, AlertCircle, ChevronRight, CheckCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';

interface Props {
  onClose: () => void;
  /** Called when user picks "Library" — parent should switch to library tab */
  onOpenLibrary: () => void;
  /**
   * Called after a successful Word/PDF source upload.
   * Parent should: close this modal, refresh the document list, and open
   * the SourceDocumentPanel for the new document.
   */
  onSaved?: (id: number, name: string, sourceType: 'docx' | 'pdf') => void;
}

type Path = 'library' | 'word' | 'pdf' | 'blank';

/** Result of a successful Word/PDF upload — shown in the success step */
interface SavedResult {
  id: number;
  name: string;
  sourceType: 'docx' | 'pdf';
}

export default function NewDocumentModal({ onClose, onOpenLibrary, onSaved }: Props) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePath, setActivePath] = useState<Path | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set after a successful Word/PDF upload — shows the success step */
  const [saved, setSaved] = useState<SavedResult | null>(null);

  // ── Create a blank placeholder document ──────────────────────────────────
  async function createPlaceholder(name: string, templateType = 'custom'): Promise<number | null> {
    const res = await fetch('/api/document-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, templateType, blocks: [], layout: {}, theme: {} }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: number };
    return data.id ?? null;
  }

  // ── Handle file selection for Word / PDF upload ───────────────────────────
  async function handleFileSelected(file: File, mode: 'word' | 'pdf') {
    setLoading(true);
    setError(null);
    try {
      const docName = file.name.replace(/\.(docx|pdf)$/i, '').trim() || 'Imported Document';
      const id = await createPlaceholder(docName);
      if (!id) throw new Error('Could not create document placeholder — please try again');

      const formData = new FormData();
      // The import-docx endpoint accepts field name "docx" for Word files
      formData.append(mode === 'word' ? 'docx' : 'pdf', file);
      formData.append('mode', 'keep_word');

      const endpoint = mode === 'word'
        ? `/api/document-templates/${id}/import-docx`
        : `/api/document-templates/${id}/import-pdf`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `Upload failed (HTTP ${res.status})`);
      }

      const data = await res.json() as { mode?: string; error?: string };
      // Verify the server actually persisted it as keep_word
      if (data.error) throw new Error(data.error);
      if (data.mode !== 'keep_word') {
        throw new Error('Server did not persist the source document — please try again');
      }

      const sourceType = mode === 'word' ? 'docx' : 'pdf';
      const result: SavedResult = { id, name: docName, sourceType };
      setSaved(result);
      // Notify parent to refresh list and open SourceDocumentPanel
      onSaved?.(id, docName, sourceType);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload timed out — the file may be too large. Try a smaller file.');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Handle blank canvas ───────────────────────────────────────────────────
  async function handleBlank() {
    setLoading(true);
    setError(null);
    try {
      const id = await createPlaceholder('Untitled Document');
      if (!id) throw new Error('Could not create document');
      onClose();
      navigate(`/studio/builder/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create document');
      setLoading(false);
    }
  }

  // ── Path card click ───────────────────────────────────────────────────────
  function handlePathClick(path: Path) {
    setError(null);
    if (path === 'library') {
      onClose();
      onOpenLibrary();
      return;
    }
    if (path === 'blank') {
      setActivePath('blank');
      void handleBlank();
      return;
    }
    // word or pdf — trigger file picker
    setActivePath(path);
    if (fileInputRef.current) {
      fileInputRef.current.accept = path === 'word' ? '.docx' : '.pdf';
      fileInputRef.current.click();
    }
  }

  const paths: Array<{
    id: Path;
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    title: string;
    description: string;
    badge?: string;
    badgeColor?: string;
  }> = [
    {
      id: 'library',
      icon: Library,
      iconColor: 'text-violet-600',
      iconBg: 'bg-violet-50 border-violet-200',
      title: 'Choose Library Template',
      description: 'Browse SWMS, policies, procedures and more from the shared library',
    },
    {
      id: 'word',
      icon: FileText,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50 border-blue-200',
      title: 'Upload Word Document',
      description: 'Upload a .docx file — stored as a live Word source you can re-download and replace',
    },
    {
      id: 'pdf',
      icon: File,
      iconColor: 'text-red-500',
      iconBg: 'bg-red-50 border-red-200',
      title: 'Upload PDF',
      description: 'Upload a PDF — stored as a source file with download and replace support',
    },
    {
      id: 'blank',
      icon: LayoutTemplate,
      iconColor: 'text-slate-500',
      iconBg: 'bg-slate-50 border-slate-200',
      title: 'Blank Studio Canvas',
      description: 'Start from scratch with the block-based Studio editor',
    },
  ];

  // ── Success state ─────────────────────────────────────────────────────────
  if (saved) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800">Document Saved</p>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
              <CheckCircle size={28} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-800">{saved.name}</p>
              <p className="text-xs text-slate-500 mt-1">
                Saved as {saved.sourceType === 'pdf' ? 'PDF' : 'Word'} source document.
                The original file is stored securely and can be downloaded or replaced at any time.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
              >
                View in documents list
              </button>
              <button
                onClick={() => { onClose(); navigate(`/studio/builder/${saved.id}`); }}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Open in builder
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">New Document</p>
            <p className="text-xs text-slate-400 mt-0.5">Choose how you want to create your document</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-500 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Path cards */}
        <div className="p-4 flex flex-col gap-2">
          {paths.map((p) => {
            const Icon = p.icon;
            const isActive = activePath === p.id && loading;
            return (
              <button
                key={p.id}
                onClick={() => !loading && handlePathClick(p.id)}
                disabled={loading}
                className={[
                  'flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all',
                  'hover:border-violet-300 hover:bg-violet-50/40 hover:shadow-sm',
                  loading && activePath !== p.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  isActive ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white',
                ].join(' ')}
              >
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${p.iconBg}`}>
                  {isActive
                    ? <Loader2 size={16} className="animate-spin text-violet-500" />
                    : <Icon size={16} className={p.iconColor} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{p.title}</span>
                    {p.badge && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.badgeColor}`}>
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{p.description}</p>
                </div>
                <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-4 flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && activePath) {
              void handleFileSelected(file, activePath as 'word' | 'pdf');
            }
            // Reset so same file can be re-selected
            e.target.value = '';
          }}
        />
      </div>
    </div>,
    document.body
  );
}
