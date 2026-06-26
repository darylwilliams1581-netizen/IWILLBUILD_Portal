import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Download, Trash2, FolderOpen, FileText, FileImage,
  File, AlertCircle, X, Loader2, Search,
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

// ── Icon helper ───────────────────────────────────────────────────────────────
function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith('image/')) return <FileImage className={className} />;
  if (mime === 'application/pdf') return <FileText className={className} />;
  return <File className={className} />;
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
    if (f.size > MAX_FILE_BYTES) {
      setError('File exceeds the 25 MB limit.');
      return;
    }
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-orange-50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS}
              className="hidden"
              onChange={handleFileChange}
            />
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
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-9 text-sm" disabled={uploading}>
              Cancel
            </Button>
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
            {deleting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main FilePanel ────────────────────────────────────────────────────────────
interface FilePanelProps {
  jobId?: number;
  fleetAssetId?: number;
  /** If true, shows a compact inline panel instead of full-page layout */
  compact?: boolean;
}

export default function FilePanel({ jobId, fleetAssetId, compact }: FilePanelProps) {
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
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

  const filtered = files.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.originalName.toLowerCase().includes(q) ||
      (f.label ?? '').toLowerCase().includes(q) ||
      f.fileCategory.toLowerCase().includes(q)
    );
  });

  function handleUploaded(f: CompanyFile) {
    setFiles(prev => [f, ...prev]);
  }

  function handleDeleted(id: number) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  return (
    <div className={compact ? '' : 'p-6'}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search files…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Button size="sm" className="h-9 text-sm gap-1.5" onClick={() => setShowUpload(true)}>
          <Upload size={14} />
          Upload
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading files…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
            <FolderOpen size={22} className="text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">
            {search ? 'No files match your search' : 'No files yet'}
          </p>
          <p className="text-xs text-slate-400">
            {search ? 'Try a different search term' : 'Upload a file to get started'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(f => {
            const colorCls = mimeColor(f.mimeType);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-slate-300 transition-colors group"
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${colorCls}`}>
                  <FileIcon mime={f.mimeType} className="w-4 h-4" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {f.label || f.originalName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-400">{f.originalName}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{mimeLabel(f.mimeType)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{formatBytes(f.sizeBytes)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{f.fileCategory}</span>
                    {f.uploaderName && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-400">{f.uploaderName}</span>
                      </>
                    )}
                  </div>
                  {f.notes && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{f.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
          onUploaded={handleUploaded}
        />
      )}
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
