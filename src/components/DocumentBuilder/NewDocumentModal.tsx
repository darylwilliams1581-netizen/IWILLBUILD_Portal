/**
 * NewDocumentModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Four creation paths:
 *   1. Choose Library Template  — opens the Library tab
 *   2. Upload Word (.docx/.dotx) — creates a placeholder doc, converts DOCX to
 *                                  semantically-grouped builder blocks
 *                                  (convert_blocks_v2 mode), writes them as
 *                                  builder_json, then navigates to the standard
 *                                  block-canvas Studio builder.
 *                                  Never writes html_content or source_type='html'.
 *   3. Upload PDF               — creates a placeholder doc, stores as PDF
 *                                 source (keep_word equivalent), calls onSaved
 *                                 so the list refreshes.
 *   4. Blank Studio Canvas      — creates an empty doc and navigates to builder.
 *
 * Word is an import format, not a live editing format. The recommended path
 * converts the file to blocks and opens the block-canvas Studio immediately.
 * There is no intermediate "source preview" step for Word.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Library, FileText, File, LayoutTemplate,
  Loader2, AlertCircle, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import type { DocumentBlock } from './types';

interface Props {
  onClose: () => void;
  /** Called when user picks "Library" — parent should switch to library tab */
  onOpenLibrary: () => void;
  /**
   * Called after a successful PDF source upload (keep_word equivalent).
   * Parent should: close this modal, refresh the document list, and open
   * the SourceDocumentPanel for the new document.
   * NOT called for Word — Word navigates directly to Studio.
   */
  onSaved?: (id: number, name: string, sourceType: 'docx' | 'pdf') => void;
}

type Path = 'library' | 'word' | 'pdf' | 'blank';

export default function NewDocumentModal({ onClose, onOpenLibrary, onSaved }: Props) {
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

  // ── Handle Word upload — convert_blocks_v2 → write builder_json → navigate ──
  async function handleWordFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const docName = file.name.replace(/\.(docx|dotx)$/i, '').trim() || 'Imported Document';
      const id = await createPlaceholder(docName);
      if (!id) throw new Error('Could not create document placeholder — please try again');

      // Step 1: convert DOCX → semantically-grouped builder blocks
      const formData = new FormData();
      formData.append('docx', file);
      formData.append('mode', 'convert_blocks_v2');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch(`/api/document-templates/${id}/import-docx`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        let errMsg = `Import failed (HTTP ${res.status})`;
        try {
          const errData = await res.json() as { error?: string };
          if (errData.error) errMsg = errData.error;
        } catch { /* non-JSON error body */ }
        throw new Error(errMsg);
      }

      let data: { mode?: string; blocks?: DocumentBlock[]; warnings?: string[]; error?: string };
      try {
        data = await res.json() as typeof data;
      } catch {
        throw new Error('Server returned an unreadable response — please try again.');
      }
      if (data.error) throw new Error(data.error);
      if (data.mode !== 'convert_blocks_v2') {
        throw new Error('Server did not convert the document to blocks — please try again');
      }

      // Step 2: write the blocks to builder_json via PATCH
      // (the placeholder already exists; we just update its blocks)
      const blocks: DocumentBlock[] = data.blocks ?? [];
      const patchRes = await fetch(`/api/document-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ builderJson: { blocks } }),
      });
      if (!patchRes.ok) {
        const patchData = await patchRes.json() as { error?: string };
        throw new Error(patchData.error ?? `Could not save blocks (HTTP ${patchRes.status})`);
      }

      // Navigate to the standard block-canvas builder — no HtmlDocumentCanvas
      onClose();
      navigate(`/studio/builder/${id}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload timed out — the file may be too large. Try a smaller file.');
      } else {
        setError(err instanceof Error ? err.message : 'Import failed');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Handle PDF upload — keep as source, call onSaved ─────────────────────
  async function handlePdfFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const docName = file.name.replace(/\.pdf$/i, '').trim() || 'Imported Document';
      const id = await createPlaceholder(docName);
      if (!id) throw new Error('Could not create document placeholder — please try again');

      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('mode', 'keep_word');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch(`/api/document-templates/${id}/import-pdf`, {
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
      if (data.error) throw new Error(data.error);

      onSaved?.(id, docName, 'pdf');
      onClose();
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
      fileInputRef.current.accept = path === 'word' ? '.docx,.dotx' : '.pdf';
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
      title: 'Import Word Document',
      description: 'Upload a .docx or .dotx file — converted to editable Studio blocks immediately',
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

  // ── Success state removed — Word navigates directly to Studio ─────────────
  // PDF success is handled by onSaved() + onClose() in handlePdfFile.

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
          data-testid="ndm-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && activePath === 'word') {
              void handleWordFile(file);
            } else if (file && activePath === 'pdf') {
              void handlePdfFile(file);
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
