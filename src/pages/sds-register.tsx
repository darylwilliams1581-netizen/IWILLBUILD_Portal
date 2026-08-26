/**
 * /sds-register — SDS / MSDS Register
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload-and-view register for Safety Data Sheets.
 * Workers: search, open, download.
 * Admins: upload, rename, replace, archive/delete.
 *
 * This register is a document store only. It does not extract, summarise or
 * rewrite PDF contents. Always read the manufacturer's original SDS.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, Upload, Search, X, ChevronLeft, Download, Eye,
  RefreshCw, Archive, Trash2, Pencil, Check, AlertTriangle,
  Loader2, ShieldAlert,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { formatBytes } from '@/lib/files-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SdsEntry {
  id: number;
  companyId: number;
  title: string;
  productName: string | null;
  manufacturer: string | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  archivedAt: string | null;
  replacedById: number | null;
  replacedAt: string | null;
  uploaderName: string | null;
  uploadedByUserId: string;
  createdAt: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchEntries(archived = false): Promise<SdsEntry[]> {
  const url = '/api/sds-register' + (archived ? '?archived=1' : '');
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load SDS register');
  const data = await res.json() as { entries?: SdsEntry[] };
  return data.entries ?? [];
}

function downloadUrl(id: number, inline = false) {
  return `/api/sds-register/${id}/download${inline ? '?inline=1' : ''}`;
}

// ── Upload modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void;
  onUploaded: (entry: SdsEntry) => void;
  replaceEntry?: SdsEntry | null;
}

function UploadModal({ onClose, onUploaded, replaceEntry }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(replaceEntry?.title ?? '');
  const [productName, setProductName] = useState(replaceEntry?.productName ?? '');
  const [manufacturer, setManufacturer] = useState(replaceEntry?.manufacturer ?? '');
  const [notes, setNotes] = useState(replaceEntry?.notes ?? '');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    setError('');
    setFile(f);
    if (!title && !replaceEntry) setTitle(f.name.replace(/\.pdf$/i, ''));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file.'); return; }
    setError('');
    setUploading(true);
    setProgress(10);

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (title.trim()) fd.append('title', title.trim());
      if (productName.trim()) fd.append('productName', productName.trim());
      if (manufacturer.trim()) fd.append('manufacturer', manufacturer.trim());
      if (notes.trim()) fd.append('notes', notes.trim());

      const url = replaceEntry
        ? `/api/sds-register/${replaceEntry.id}/replace`
        : '/api/sds-register';

      setProgress(40);
      const res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
      setProgress(90);
      const data = await res.json() as { entry?: SdsEntry; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setProgress(100);
      onUploaded(data.entry!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setProgress(0);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
            <Upload size={16} className="text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground">
              {replaceEntry ? 'Replace SDS Document' : 'Upload SDS / MSDS'}
            </h2>
            {replaceEntry && (
              <p className="text-xs text-muted-foreground truncate">Replacing: {replaceEntry.title}</p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {/* File picker */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">PDF File <span className="text-destructive">*</span></label>
            <div
              className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center gap-2 justify-center">
                  <FileText size={16} className="text-rose-500 shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload size={20} className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Tap to select a PDF</p>
                  <p className="text-xs text-muted-foreground">PDF only · max 25 MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFileChange} />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Display Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Dulux Weathershield SDS"
              maxLength={255}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Product / Manufacturer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Product Name</label>
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="Optional"
                maxLength={255}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Manufacturer</label>
              <input
                type="text"
                value={manufacturer}
                onChange={e => setManufacturer(e.target.value)}
                placeholder="Optional"
                maxLength={255}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional storage location, hazard class, etc."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Progress bar */}
          {uploading && (
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : (replaceEntry ? 'Replace' : 'Upload')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit metadata modal ───────────────────────────────────────────────────────

interface EditModalProps {
  entry: SdsEntry;
  onClose: () => void;
  onSaved: (entry: SdsEntry) => void;
}

function EditModal({ entry, onClose, onSaved }: EditModalProps) {
  const [title, setTitle] = useState(entry.title);
  const [productName, setProductName] = useState(entry.productName ?? '');
  const [manufacturer, setManufacturer] = useState(entry.manufacturer ?? '');
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/sds-register/${entry.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), productName: productName.trim(), manufacturer: manufacturer.trim(), notes: notes.trim() }),
      });
      const data = await res.json() as { entry?: SdsEntry; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data.entry!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Pencil size={15} className="text-blue-600" />
          </div>
          <h2 className="flex-1 text-sm font-bold text-foreground">Edit SDS Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors" aria-label="Close"><X size={15} /></button>
        </div>
        <form onSubmit={handleSave} className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Title <span className="text-destructive">*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={255} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Product Name</label>
              <input type="text" value={productName} onChange={e => setProductName(e.target.value)} maxLength={255} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Manufacturer</label>
              <input type="text" value={manufacturer} onChange={e => setManufacturer(e.target.value)} maxLength={255} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Register row ──────────────────────────────────────────────────────────────

interface RowProps {
  entry: SdsEntry;
  isAdmin: boolean;
  onEdit: (e: SdsEntry) => void;
  onReplace: (e: SdsEntry) => void;
  onArchive: (e: SdsEntry) => void;
  onDelete: (e: SdsEntry) => void;
}

function SdsRow({ entry, isAdmin, onEdit, onReplace, onArchive, onDelete }: RowProps) {
  const navigate = useNavigate();
  const date = new Date(entry.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

  function openPdf() {
    navigate(`/view/file-inline?url=${encodeURIComponent(downloadUrl(entry.id, true))}&name=${encodeURIComponent(entry.title)}&back=/sds-register`);
  }

  return (
    <div className="flex items-start gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 hover:border-primary/30 transition-colors">
      {/* PDF icon */}
      <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 mt-0.5">
        <FileText size={18} className="text-rose-500" />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight truncate">{entry.title}</p>
        {(entry.productName || entry.manufacturer) && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {[entry.productName, entry.manufacturer].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {date}
          {entry.uploaderName ? ` · ${entry.uploaderName}` : ''}
          {' · '}{formatBytes(entry.sizeBytes)}
        </p>
        {entry.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1">{entry.notes}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
        {/* View */}
        <button
          onClick={openPdf}
          className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors min-w-[44px] justify-center"
          aria-label="View PDF"
          title="View"
        >
          <Eye size={13} />
          <span className="hidden sm:inline">View</span>
        </button>

        {/* Download */}
        <a
          href={downloadUrl(entry.id)}
          download={entry.originalName}
          className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/80 transition-colors min-w-[44px] justify-center"
          aria-label="Download PDF"
          title="Download"
        >
          <Download size={13} />
          <span className="hidden sm:inline">Download</span>
        </a>

        {/* Admin actions */}
        {isAdmin && (
          <>
            <button
              onClick={() => onEdit(entry)}
              className="h-8 w-8 rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors flex items-center justify-center"
              aria-label="Edit details"
              title="Edit details"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onReplace(entry)}
              className="h-8 w-8 rounded-lg bg-muted text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors flex items-center justify-center"
              aria-label="Replace PDF"
              title="Replace PDF"
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => onArchive(entry)}
              className="h-8 w-8 rounded-lg bg-muted text-muted-foreground hover:text-orange-600 hover:bg-orange-50 transition-colors flex items-center justify-center"
              aria-label="Archive"
              title="Archive"
            >
              <Archive size={13} />
            </button>
            <button
              onClick={() => onDelete(entry)}
              className="h-8 w-8 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center"
              aria-label="Delete permanently"
              title="Delete permanently (owner only)"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SdsRegisterPage() {
  const navigate = useNavigate();
  const { isAdmin, isOwner } = usePermissions();

  const [entries, setEntries] = useState<SdsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<SdsEntry | null>(null);
  const [editTarget, setEditTarget] = useState<SdsEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SdsEntry | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEntries(false);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter
  const q = search.toLowerCase().trim();
  const filtered = q
    ? entries.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.productName ?? '').toLowerCase().includes(q) ||
        (e.manufacturer ?? '').toLowerCase().includes(q) ||
        e.originalName.toLowerCase().includes(q)
      )
    : entries;

  function handleUploaded(entry: SdsEntry) {
    setShowUpload(false);
    setReplaceTarget(null);
    // Reload to get fresh list (replace archives old entry)
    load();
  }

  function handleSaved(entry: SdsEntry) {
    setEditTarget(null);
    setEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
  }

  async function handleArchive(entry: SdsEntry) {
    if (!confirm(`Archive "${entry.title}"? It will be hidden from the register.`)) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/sds-register/${entry.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Archive failed');
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete(entry: SdsEntry) {
    if (!isOwner) { alert('Only owners can permanently delete SDS documents.'); return; }
    setConfirmDelete(entry);
  }

  async function confirmHardDelete() {
    if (!confirmDelete) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/sds-register/${confirmDelete.id}?hard=1`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      setEntries(prev => prev.filter(e => e.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>SDS / MSDS Register — IWILLBUILD</title>
        <meta name="description" content="Safety Data Sheet register — search, view and manage SDS/MSDS documents on-site." />
        <link rel="canonical" href="https://iwillbuild.com/sds-register" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="flex flex-col h-full bg-background">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
          <button
            onClick={() => navigate('/work?workTab=tools')}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
            aria-label="Back to Tools"
          >
            <ChevronLeft size={17} />
          </button>
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <ShieldAlert size={15} className="text-rose-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground leading-tight">SDS / MSDS Register</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">Safety data sheets</p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shrink-0 min-h-[44px]"
            >
              <Upload size={13} />
              <span>Upload</span>
            </button>
          )}
        </div>

        {/* ── Search ── */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, product or manufacturer…"
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
          <p className="text-[11px] text-amber-700 leading-snug">
            This register stores uploaded PDFs only. Always read the manufacturer's original SDS before handling any chemical product.
          </p>
        </div>

        {/* ── List ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertTriangle size={28} className="text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={load} className="text-xs text-primary hover:underline">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileText size={32} className="text-muted-foreground/40" />
              <p className="text-sm font-semibold text-muted-foreground">
                {search ? 'No SDS documents match your search' : 'No SDS documents uploaded yet'}
              </p>
              {!search && isAdmin && (
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors mt-1"
                >
                  <Upload size={13} /> Upload first SDS
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-muted-foreground px-0.5 mb-1">
                {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}
                {search ? ` matching "${search}"` : ''}
              </p>
              {filtered.map(entry => (
                <SdsRow
                  key={entry.id}
                  entry={entry}
                  isAdmin={isAdmin}
                  onEdit={setEditTarget}
                  onReplace={setReplaceTarget}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Upload modal ── */}
      {(showUpload || replaceTarget) && (
        <UploadModal
          onClose={() => { setShowUpload(false); setReplaceTarget(null); }}
          onUploaded={handleUploaded}
          replaceEntry={replaceTarget}
        />
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <EditModal
          entry={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Hard-delete confirm ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Permanently delete?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2 truncate">{confirmDelete.title}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={actionBusy} className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={confirmHardDelete} disabled={actionBusy} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {actionBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
