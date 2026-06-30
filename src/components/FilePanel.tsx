/**
 * FilePanel — shared file viewer used by:
 *   - /files (main Files page, via FilesPage wrapper)
 *   - /jobs/:id → Files tab
 *   - /fleet/:id → Files tab
 *
 * Features:
 *   - Multi-select category filter with counts
 *   - Image thumbnails (jpg/jpeg/png/webp/gif)
 *   - Lightbox preview with download + delete
 *   - List view (default) — images show thumbnail, docs show icon
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Download, Trash2, FolderOpen, FileText, FileImage,
  File, AlertCircle, X, Loader2, Search, Filter,
  ChevronDown, ZoomIn, LayoutGrid, List, Cloud, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  type CompanyFile, FILE_CATEGORIES, ALLOWED_EXTENSIONS, MAX_FILE_BYTES,
  formatBytes, mimeColor, mimeLabel, fetchFiles, uploadFile, deleteFile, downloadFile,
} from '@/lib/files-api';
import { fileViewUrl, isImageMime } from '@/lib/files-view';

// ── Category filter options (spec) ────────────────────────────────────────────
const FILTER_CATS = ['All', 'Job', 'Fleet', 'Company', 'Forms', 'Photos', 'Reports', 'Templates', 'Other'] as const;

// ── Icon helper ───────────────────────────────────────────────────────────────
function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (isImageMime(mime)) return <FileImage className={className} />;
  if (mime === 'application/pdf') return <FileText className={className} />;
  return <File className={className} />;
}

// ── Image thumbnail ───────────────────────────────────────────────────────────
function FileThumbnail({
  file,
  size = 56,
  onClick,
}: {
  file: CompanyFile;
  size?: number;
  onClick?: () => void;
}) {
  const [err, setErr] = useState(false);
  const isImg = isImageMime(file.mimeType);
  const colorCls = mimeColor(file.mimeType);

  if (isImg && !err) {
    return (
      <div
        className="rounded-lg overflow-hidden shrink-0 cursor-pointer border border-slate-200 hover:border-primary transition-colors"
        style={{ width: size, height: size }}
        onClick={onClick}
        title="Click to preview"
      >
        <img
          src={fileViewUrl(file.id)}
          alt={file.label || file.originalName}
          className="w-full h-full object-cover"
          onError={() => setErr(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border flex items-center justify-center shrink-0 ${colorCls} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <FileIcon mime={file.mimeType} className="w-5 h-5" />
    </div>
  );
}

// ── Multi-select category filter ──────────────────────────────────────────────
interface CategoryFilterProps {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  counts: Record<string, number>;
  total: number;
}

function CategoryFilter({ selected, onChange, counts, total }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggle(cat: string) {
    if (cat === 'All') {
      onChange(new Set(['All']));
      return;
    }
    const next = new Set(selected);
    next.delete('All');
    if (next.has(cat)) {
      next.delete(cat);
      if (next.size === 0) next.add('All');
    } else {
      next.add(cat);
    }
    onChange(next);
  }

  const isAll = selected.has('All') || selected.size === 0;
  const label = isAll
    ? 'All files'
    : [...selected].join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
          open || !isAll
            ? 'border-primary bg-orange-50 text-primary'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
        }`}
      >
        <Filter size={13} />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute left-0 top-11 z-30 bg-white border border-slate-200 rounded-xl shadow-xl w-52 py-1.5 overflow-hidden"
          >
            {FILTER_CATS.map((cat) => {
              const checked = cat === 'All' ? isAll : selected.has(cat);
              const count = cat === 'All' ? total : (counts[cat] ?? 0);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggle(cat)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                    checked ? 'bg-orange-50 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      checked ? 'bg-primary border-primary' : 'border-slate-300'
                    }`}>
                      {checked && (
                        <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    {cat}
                  </div>
                  {count > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{count}</span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Lightbox / image preview ──────────────────────────────────────────────────
interface LightboxProps {
  file: CompanyFile;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
}

function Lightbox({ file, canDelete, onClose, onDelete }: LightboxProps) {
  const isImg = isImageMime(file.mimeType);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{file.label || file.originalName}</p>
            <p className="text-xs text-slate-400 truncate">{file.originalName} · {mimeLabel(file.mimeType)} · {formatBytes(file.sizeBytes)}</p>
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Preview */}
        {isImg ? (
          <div className="bg-slate-50 flex items-center justify-center" style={{ maxHeight: '60vh', overflow: 'hidden' }}>
            <img
              src={fileViewUrl(file.id)}
              alt={file.label || file.originalName}
              className="max-w-full max-h-[60vh] object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 bg-slate-50">
            <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-3 ${mimeColor(file.mimeType)}`}>
              <FileIcon mime={file.mimeType} className="w-7 h-7" />
            </div>
            <p className="text-sm text-slate-500">{mimeLabel(file.mimeType)} file — no preview available</p>
          </div>
        )}

        {/* Meta + actions */}
        <div className="px-5 py-4 border-t border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Category</p>
              <p className="text-slate-700 font-medium">{file.fileCategory}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Uploaded by</p>
              <p className="text-slate-700 font-medium">{file.uploaderName ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Date</p>
              <p className="text-slate-700 font-medium">
                {new Date(file.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Size</p>
              <p className="text-slate-700 font-medium">{formatBytes(file.sizeBytes)}</p>
            </div>
          </div>
          {file.notes && (
            <p className="text-xs text-slate-500 mb-4 bg-slate-50 rounded-lg px-3 py-2">{file.notes}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-9 text-sm"
              onClick={() => window.open(`/view/file/${file.id}`, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink size={13} />
              Open in new tab
            </Button>
            <Button
              size="sm"
              className="gap-1.5 h-9 text-sm"
              onClick={() => downloadFile(file.id, file.originalName)}
            >
              <Download size={13} />
              Download
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 h-9 text-sm"
                onClick={onDelete}
              >
                <Trash2 size={13} />
                Delete
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────
interface UploadModalProps {
  jobId?: number;
  fleetAssetId?: number;
  onClose: () => void;
  onUploaded: (f: CompanyFile) => void;
}

function UploadModal({ jobId, fleetAssetId, onClose, onUploaded }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<string>(
    jobId ? 'Job' : fleetAssetId ? 'Fleet' : 'Other'
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) { setError('File exceeds the 25 MB limit.'); return; }
    setError('');
    setFile(f);
    if (!label) setLabel(f.name.replace(/\.[^.]+$/, ''));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    setUploading(true);
    setError('');
    try {
      const saved = await uploadFile({ file, fileCategory: category, label: label.trim() || undefined, notes: notes.trim() || undefined, jobId, fleetAssetId });
      onUploaded(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-heading font-bold text-base">Upload File</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-orange-50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept={ALLOWED_EXTENSIONS} className="hidden" onChange={handleFileChange} />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                <FileText size={16} className="text-primary shrink-0" />
                <span className="font-medium truncate max-w-[240px]">{file.name}</span>
                <span className="text-slate-400 shrink-0">({formatBytes(file.size)})</span>
              </div>
            ) : (
              <>
                <Upload size={24} className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Click to select a file</p>
                <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG, DOC, XLS, CSV, TXT, ZIP · max 25 MB</p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="up-label" className="text-xs font-semibold text-slate-600">Label</Label>
            <Input id="up-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="Optional label" className="h-9 text-sm" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="up-cat" className="text-xs font-semibold text-slate-600">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="up-cat" className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="up-notes" className="text-xs font-semibold text-slate-600">Notes</Label>
            <Textarea id="up-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" rows={2} className="text-sm resize-none" />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-9 text-sm" disabled={uploading}>Cancel</Button>
            <Button type="submit" className="flex-1 h-9 text-sm" disabled={uploading || !file}>
              {uploading ? <><Loader2 size={14} className="animate-spin mr-1.5" />Uploading…</> : 'Upload'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
interface DeleteConfirmProps {
  file: CompanyFile;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

function DeleteConfirm({ file, onClose, onDeleted }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteFile(file.id);
      onDeleted(file.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="font-heading font-bold text-base mb-2">Delete File?</h2>
        <p className="text-sm text-slate-600 mb-1">
          This will permanently delete <span className="font-semibold">{file.originalName}</span>.
        </p>
        <p className="text-xs text-slate-400 mb-4">This action cannot be undone.</p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 h-9 text-sm" disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} className="flex-1 h-9 text-sm" disabled={deleting}>
            {deleting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Gallery view ──────────────────────────────────────────────────────────────
function GalleryView({
  files,
  onPreview,
  onDelete,
}: {
  files: CompanyFile[];
  onPreview: (f: CompanyFile) => void;
  onDelete: (f: CompanyFile) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {files.map((f) => {
        const isImg = isImageMime(f.mimeType);
        return (
          <div
            key={f.id}
            className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-primary hover:shadow-md transition-all cursor-pointer"
            onClick={() => onPreview(f)}
          >
            {/* Thumbnail area */}
            <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
              {isImg ? (
                <img
                  src={fileViewUrl(f.id)}
                  alt={f.label || f.originalName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${mimeColor(f.mimeType)}`}>
                  <FileIcon mime={f.mimeType} className="w-6 h-6" />
                </div>
              )}
            </div>
            {/* Info */}
            <div className="px-2.5 py-2">
              <p className="text-xs font-semibold text-slate-800 truncate">{f.label || f.originalName}</p>
              <p className="text-[10px] text-slate-400 truncate">{f.fileCategory} · {formatBytes(f.sizeBytes)}</p>
            </div>
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="bg-white rounded-full p-1.5 shadow-lg">
                <ZoomIn size={14} className="text-slate-700" />
              </div>
            </div>
            {/* Delete button */}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(f); }}
              className="absolute top-1.5 right-1.5 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow"
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Main FilePanel ────────────────────────────────────────────────────────────
interface FilePanelProps {
  jobId?: number;
  fleetAssetId?: number;
  /** If true, renders without outer padding (used inside job/fleet tabs) */
  compact?: boolean;
  /** If true, shows the category filter (default: true for main files page, false for job/fleet tabs) */
  showCategoryFilter?: boolean;
}

export default function FilePanel({ jobId, fleetAssetId, compact, showCategoryFilter = true }: FilePanelProps) {
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(['All']));
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<CompanyFile | null>(null);
  // OneDrive transfer state
  const [oneDriveConnected, setOneDriveConnected] = useState<boolean | null>(null);
  const [transferringId, setTransferringId] = useState<number | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<{ id: number; url: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyFile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchFiles({ jobId, fleetAssetId });
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [jobId, fleetAssetId]);

  useEffect(() => { void load(); }, [load]);

  // Check OneDrive connection status once on mount
  useEffect(() => {
    fetch('/api/integrations/onedrive/status', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { connected?: boolean } | null) => setOneDriveConnected(d?.connected ?? false))
      .catch(() => setOneDriveConnected(false));
  }, []);

  async function handleSendToOneDrive(fileId: number) {
    setTransferringId(fileId);
    setTransferSuccess(null);
    try {
      const res = await fetch('/api/integrations/onedrive/upload-file', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      const data = await res.json() as { ok?: boolean; oneDriveUrl?: string; error?: string };
      if (res.ok && data.ok) {
        setTransferSuccess({ id: fileId, url: data.oneDriveUrl ?? null });
        setTimeout(() => setTransferSuccess(null), 5000);
      } else {
        setError(data.error ?? 'Failed to transfer file to OneDrive');
      }
    } catch {
      setError('Could not reach the server');
    }
    setTransferringId(null);
  }

  // Category counts
  const categoryCounts = FILTER_CATS.reduce<Record<string, number>>((acc, c) => {
    if (c === 'All') return acc;
    acc[c] = files.filter((f) => f.fileCategory === c).length;
    return acc;
  }, {});

  // Filtering
  const filtered = files.filter((f) => {
    const catOk = selectedCats.has('All') || selectedCats.size === 0 || selectedCats.has(f.fileCategory);
    if (!catOk) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.originalName.toLowerCase().includes(q) ||
      (f.label ?? '').toLowerCase().includes(q) ||
      f.fileCategory.toLowerCase().includes(q) ||
      (f.uploaderName ?? '').toLowerCase().includes(q)
    );
  });

  const hasActiveFilter = !selectedCats.has('All') && selectedCats.size > 0;

  function handleDeleted(id: number) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (preview?.id === id) setPreview(null);
  }

  return (
    <div className={compact ? '' : 'p-6'}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="pl-8 h-9 text-sm"
          />
        </div>

        {/* Category filter */}
        {showCategoryFilter && (
          <CategoryFilter
            selected={selectedCats}
            onChange={setSelectedCats}
            counts={categoryCounts}
            total={files.length}
          />
        )}

        {/* View toggle */}
        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`w-8 h-9 flex items-center justify-center transition-colors ${
              viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'
            }`}
            title="List view"
          >
            <List size={14} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('gallery')}
            className={`w-8 h-9 flex items-center justify-center transition-colors ${
              viewMode === 'gallery' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'
            }`}
            title="Gallery view"
          >
            <LayoutGrid size={14} />
          </button>
        </div>

        <div className="flex-1" />

        <Button size="sm" className="h-9 text-sm gap-1.5 shrink-0" onClick={() => setShowUpload(true)}>
          <Upload size={14} />
          Upload
        </Button>
      </div>

      {/* Active filter summary */}
      {hasActiveFilter && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-slate-500">Showing:</span>
          {[...selectedCats].map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1 text-xs font-semibold bg-orange-50 text-primary border border-orange-200 px-2 py-0.5 rounded-full">
              {cat}
              <button onClick={() => {
                const next = new Set(selectedCats);
                next.delete(cat);
                if (next.size === 0) next.add('All');
                setSelectedCats(next);
              }} className="hover:text-red-500 transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            onClick={() => setSelectedCats(new Set(['All']))}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading files…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={14} className="shrink-0" />{error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
            <FolderOpen size={22} className="text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">
            {search || hasActiveFilter ? 'No files match your filters' : 'No files yet'}
          </p>
          <p className="text-xs text-slate-400">
            {search || hasActiveFilter ? 'Try adjusting your search or category filter' : 'Upload a file to get started'}
          </p>
        </div>
      ) : viewMode === 'gallery' ? (
        <GalleryView
          files={filtered}
          onPreview={setPreview}
          onDelete={setDeleteTarget}
        />
      ) : (
        /* List view */
        <div className="flex flex-col gap-2">
          {filtered.map((f) => {
            const isImg = isImageMime(f.mimeType);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:border-slate-300 transition-colors group"
              >
                {/* Thumbnail or icon */}
                <FileThumbnail
                  file={f}
                  size={44}
                  onClick={isImg ? () => setPreview(f) : undefined}
                />

                {/* Info */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setPreview(f)}>
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {f.label || f.originalName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {f.label && <span className="text-xs text-slate-400 truncate max-w-[160px]">{f.originalName}</span>}
                    <span className="text-xs text-slate-400">{mimeLabel(f.mimeType)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{formatBytes(f.sizeBytes)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">{f.fileCategory}</span>
                    {f.jobId && <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-semibold">Job #{f.jobId}</span>}
                    {f.fleetAssetId && <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full font-semibold">Fleet #{f.fleetAssetId}</span>}
                    {f.uploaderName && <><span className="text-slate-300">·</span><span className="text-xs text-slate-400">{f.uploaderName}</span></>}
                  </div>
                  {f.notes && <p className="text-xs text-slate-500 mt-0.5 truncate">{f.notes}</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => window.open(`/view/file/${f.id}`, '_blank', 'noopener,noreferrer')}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={15} />
                  </button>
                  {oneDriveConnected && (
                    transferSuccess?.id === f.id ? (
                      <a
                        href={transferSuccess.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors"
                        title="Sent to OneDrive — click to open"
                      >
                        <CheckCircle2 size={15} />
                      </a>
                    ) : (
                      <button
                        onClick={() => void handleSendToOneDrive(f.id)}
                        disabled={transferringId === f.id}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0078D4] hover:bg-blue-50 transition-colors disabled:opacity-40"
                        title="Send to OneDrive"
                      >
                        {transferringId === f.id
                          ? <Loader2 size={15} className="animate-spin" />
                          : <Cloud size={15} />
                        }
                      </button>
                    )
                  )}
                  <button
                    onClick={() => downloadFile(f.id, f.originalName)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"
                    title="Download"
                  >
                    <Download size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(f)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadModal
          jobId={jobId}
          fleetAssetId={fleetAssetId}
          onClose={() => setShowUpload(false)}
          onUploaded={(f) => setFiles((prev) => [f, ...prev])}
        />
      )}

      <AnimatePresence>
        {preview && (
          <Lightbox
            file={preview}
            canDelete={true}
            onClose={() => setPreview(null)}
            onDelete={() => { setDeleteTarget(preview); setPreview(null); }}
          />
        )}
      </AnimatePresence>

      {deleteTarget && (
        <DeleteConfirm
          file={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
