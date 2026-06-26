import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FolderOpen, Upload, Download, Trash2, Search, Filter,
  FileText, FileImage, File, AlertCircle, Loader2, X, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import PortalSidebar from '@/components/PortalSidebar';
import {
  type CompanyFile, FILE_CATEGORIES, ALLOWED_EXTENSIONS, MAX_FILE_BYTES,
  formatBytes, mimeColor, mimeLabel, mimeIcon,
  fetchFiles, uploadFile, deleteFile, downloadFile,
} from '@/lib/files-api';

// ── File icon ─────────────────────────────────────────────────────────────────
function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith('image/')) return <FileImage className={className} />;
  if (mime === 'application/pdf') return <FileText className={className} />;
  return <File className={className} />;
}

// ── Upload modal ──────────────────────────────────────────────────────────────
interface UploadModalProps {
  onClose: () => void;
  onUploaded: (f: CompanyFile) => void;
}

function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<string>('Other');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = { current: null as HTMLInputElement | null };

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
      const saved = await uploadFile({ file, fileCategory: category, label: label.trim() || undefined, notes: notes.trim() || undefined });
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
            <input
              ref={el => { inputRef.current = el; }}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="up-label" className="text-xs font-semibold text-slate-600">Label</Label>
              <Input id="up-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="Optional label" className="h-9 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="up-cat" className="text-xs font-semibold text-slate-600">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="up-cat" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FILE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FilesPage() {
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyFile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchFiles();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = files.filter(f => {
    if (categoryFilter !== 'All' && f.fileCategory !== categoryFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.originalName.toLowerCase().includes(q) ||
      (f.label ?? '').toLowerCase().includes(q) ||
      f.fileCategory.toLowerCase().includes(q) ||
      (f.uploaderName ?? '').toLowerCase().includes(q)
    );
  });

  // Stats
  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);
  const categoryCounts = FILE_CATEGORIES.reduce<Record<string, number>>((acc, c) => {
    acc[c] = files.filter(f => f.fileCategory === c).length;
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Files — IWILLBUILD Portal</title>
        <meta name="description" content="Store and organise job files, plans and documents in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/files" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <PortalSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <FolderOpen size={20} className="text-primary" />
            <h1 className="font-heading font-bold text-lg">Files</h1>
            {!loading && (
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <Button size="sm" className="h-9 text-sm gap-1.5" onClick={() => setShowUpload(true)}>
            <Upload size={14} />
            Upload File
          </Button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {/* Stats row */}
          {!loading && files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Files</p>
                <p className="font-heading font-black text-2xl text-slate-800">{files.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Size</p>
                <p className="font-heading font-black text-2xl text-slate-800">{formatBytes(totalSize)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Job Files</p>
                <p className="font-heading font-black text-2xl text-slate-800">{files.filter(f => f.jobId).length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Fleet Files</p>
                <p className="font-heading font-black text-2xl text-slate-800">{files.filter(f => f.fleetAssetId).length}</p>
              </div>
            </div>
          )}

          {/* Search + filter */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search files…"
                className="pl-8 h-9 text-sm bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400 shrink-0" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-sm w-36 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All categories</SelectItem>
                  {FILE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>
                      {c} {categoryCounts[c] ? `(${categoryCounts[c]})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400">
              <Loader2 size={22} className="animate-spin mr-2" />
              Loading files…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FolderOpen size={28} className="text-white" />
              </div>
              <h2 className="font-heading font-black text-xl text-slate-800 mb-2">
                {search || categoryFilter !== 'All' ? 'No files match your filters' : 'No files yet'}
              </h2>
              <p className="text-sm text-slate-500 mb-6 max-w-xs">
                {search || categoryFilter !== 'All'
                  ? 'Try adjusting your search or category filter.'
                  : 'Upload your first file to get started. Files can also be attached directly from job and fleet pages.'}
              </p>
              {!search && categoryFilter === 'All' && (
                <Button onClick={() => setShowUpload(true)} className="gap-2">
                  <Upload size={14} />
                  Upload First File
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <span className="w-9" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">File</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-20 text-right">Size</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Category</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-28">Uploaded by</span>
                <span className="w-20" />
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100">
                {filtered.map(f => {
                  const colorCls = mimeColor(f.mimeType);
                  return (
                    <div
                      key={f.id}
                      className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group"
                    >
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${colorCls}`}>
                        <FileIcon mime={f.mimeType} className="w-4 h-4" />
                      </div>

                      {/* Name + meta */}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {f.label || f.originalName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {f.label && (
                            <span className="text-xs text-slate-400 truncate max-w-[200px]">{f.originalName}</span>
                          )}
                          <span className="text-xs text-slate-400">{mimeLabel(f.mimeType)}</span>
                          {f.jobId && (
                            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-semibold">Job #{f.jobId}</span>
                          )}
                          {f.fleetAssetId && (
                            <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full font-semibold">Fleet #{f.fleetAssetId}</span>
                          )}
                          {f.notes && (
                            <span className="text-xs text-slate-400 truncate max-w-[180px]">{f.notes}</span>
                          )}
                        </div>
                      </div>

                      {/* Size */}
                      <span className="text-xs text-slate-500 w-20 text-right tabular-nums">{formatBytes(f.sizeBytes)}</span>

                      {/* Category */}
                      <span className="text-xs text-slate-500 w-24">{f.fileCategory}</span>

                      {/* Uploader */}
                      <span className="text-xs text-slate-500 w-28 truncate">{f.uploaderName ?? '—'}</span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 w-20 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
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
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={f => setFiles(prev => [f, ...prev])}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          file={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={id => setFiles(prev => prev.filter(f => f.id !== id))}
        />
      )}
    </div>
  );
}
