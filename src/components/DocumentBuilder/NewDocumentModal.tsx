/**
 * NewDocumentModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the old "New document" → navigate('/studio/builder/new') shortcut.
 *
 * Four creation paths:
 *   1. Choose Library Template  — opens the Library tab
 *   2. Upload Word (.docx)      — creates a placeholder doc, uploads DOCX as
 *                                 Word Source (keep_word mode), navigates to builder
 *   3. Upload PDF               — same flow for PDF source
 *   4. Blank Studio Canvas      — creates an empty doc and navigates to builder
 *
 * Widget buttons (SWMS / Safety Plan / Policy) are NOT shown here.
 * They remain accessible from within the builder's Apply Widget ribbon tab
 * for backward compatibility with existing widget documents.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Library, FileText, File, LayoutTemplate,
  Loader2, AlertCircle, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
  /** Called when user picks "Library" — parent should switch to library tab */
  onOpenLibrary: () => void;
}

type Path = 'library' | 'word' | 'pdf' | 'blank';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function NewDocumentModal({ onClose, onOpenLibrary }: Props) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePath, setActivePath] = useState<Path | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const docName = file.name.replace(/\.(docx|pdf)$/i, '') || 'Imported Document';
      const id = await createPlaceholder(docName);
      if (!id) throw new Error('Could not create document placeholder');

      const formData = new FormData();
      formData.append('docx', file);
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
        throw new Error(data.error ?? 'Upload failed');
      }

      toast.success(`"${docName}" saved as Word source document`);
      onClose();
      navigate(`/studio/builder/${id}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload timed out — the file may be too large. Try a smaller file.');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
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
