/**
 * /camera — Field Camera Module (Prompt 2 refinement)
 *
 * UX model:
 *   ┌─────────────────────────────────┐
 *   │  Dark viewfinder zone           │  ← always visible
 *   │  [Camera btn]  [Library btn]    │
 *   ├─────────────────────────────────┤
 *   │  Captured tray  (light)         │  ← slides up as photos accumulate
 *   │  [compact rows]                 │
 *   │  [bulk action bar when selected]│
 *   └─────────────────────────────────┘
 *
 * Key behaviours:
 * - Camera button uses capture="environment" → opens native camera directly on iOS/Android
 * - Library button opens full photo picker
 * - Each photo appears in the tray immediately (optimistic) with a per-item upload spinner
 * - Shutter stays accessible at all times — no modal blocking re-shoot
 * - Compact rows: 56px, thumbnail + time + status chip + action buttons
 * - Long-press or checkbox → select mode → bulk "Move to Job"
 * - camera_captures table is a transitional workflow layer, not a long-term silo
 */

import {
  useState, useEffect, useRef, useCallback, useId,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, Images, ChevronLeft, X, Trash2, Briefcase,
  StickyNote, Loader2, ImageIcon, HardHat, ChevronRight,
  WifiOff, CheckCircle2, CheckSquare, Square, ArrowRight,
  AlertCircle, Plus,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

interface CaptureItem {
  /** Temporary client-side ID used before the server responds */
  clientId: string;
  /** Server-assigned ID (null while uploading) */
  id: number | null;
  /** Object URL for the local preview (revoked after server URL arrives) */
  localUrl: string | null;
  /** Server-signed URL (available after upload completes) */
  serverUrl: string | null;
  note: string | null;
  jobId: number | null;
  jobName: string | null;
  status: UploadStatus;
  errorMsg: string | null;
  capturedAt: string;
}

interface JobOption {
  id: number;
  name: string;
  jobNumber?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function makeClientId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job picker bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function JobPickerSheet({
  open,
  title = 'Attach to Job',
  onClose,
  onSelect,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (job: JobOption) => void;
}) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) { setQ(''); return; }
    setLoading(true);
    fetch('/api/jobs?status=active&limit=200', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { jobs?: JobOption[] } | JobOption[]) =>
        setJobs(Array.isArray(d) ? d : (d.jobs ?? [])))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = q.trim()
    ? jobs.filter(j =>
        j.name.toLowerCase().includes(q.toLowerCase()) ||
        (j.jobNumber ?? '').toLowerCase().includes(q.toLowerCase()))
    : jobs;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl flex flex-col"
            style={{
              boxShadow: '0 -4px 40px rgba(0,0,0,0.18)',
              maxHeight: 'calc(100dvh - 4rem)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Briefcase size={15} className="text-violet-600" />
                </div>
                <div>
                  <p className="text-gray-900 font-bold text-sm">{title}</p>
                  <p className="text-gray-400 text-[11px]">Active jobs</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
              >
                <X size={14} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <input
                type="search"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search jobs…"
                className="w-full h-9 bg-gray-100 rounded-xl px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 px-4 pb-3 space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-violet-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10">
                  <HardHat size={28} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">
                    {q ? 'No matching jobs' : 'No active jobs found'}
                  </p>
                </div>
              ) : filtered.map(job => (
                <button
                  key={job.id}
                  onClick={() => { onSelect(job); onClose(); }}
                  className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-violet-50 hover:border-violet-200 active:bg-violet-100 rounded-2xl px-4 py-3 text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <HardHat size={14} className="text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                    {job.jobNumber && (
                      <p className="text-gray-400 text-[11px] font-mono">{job.jobNumber}</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>

            <div className="shrink-0" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Note sheet
// ─────────────────────────────────────────────────────────────────────────────

function NoteSheet({
  open,
  initialNote,
  onClose,
  onSave,
}: {
  open: boolean;
  initialNote: string | null;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [text, setText] = useState(initialNote ?? '');
  useEffect(() => { if (open) setText(initialNote ?? ''); }, [open, initialNote]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl flex flex-col"
            style={{ boxShadow: '0 -4px 40px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-yellow-100 flex items-center justify-center">
                  <StickyNote size={15} className="text-yellow-500" />
                </div>
                <p className="text-gray-900 font-bold text-sm">
                  {initialNote ? 'Edit Note' : 'Add Note'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={3}
                placeholder="Short note for this photo…"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 resize-none"
                autoFocus
              />
              <button
                onClick={() => { onSave(text.trim()); onClose(); }}
                className="w-full h-11 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-sm transition-colors"
              >
                Save Note
              </button>
            </div>
            <div className="shrink-0" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact capture row  (56px target height)
// ─────────────────────────────────────────────────────────────────────────────

function CaptureRow({
  item,
  selected,
  selectMode,
  onToggleSelect,
  onDelete,
  onAttachJob,
  onAddNote,
}: {
  item: CaptureItem;
  selected: boolean;
  selectMode: boolean;
  onToggleSelect: (clientId: string) => void;
  onDelete: (clientId: string) => void;
  onAttachJob: (clientId: string) => void;
  onAddNote: (clientId: string) => void;
}) {
  const imgUrl = item.serverUrl ?? item.localUrl;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 transition-colors ${
        selected
          ? 'bg-violet-50 border border-violet-200'
          : 'bg-white border border-gray-100'
      }`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
    >
      {/* Select checkbox */}
      <button
        onClick={() => onToggleSelect(item.clientId)}
        className="shrink-0 w-5 h-5 flex items-center justify-center"
        aria-label={selected ? 'Deselect' : 'Select'}
      >
        {selected
          ? <CheckSquare size={16} className="text-violet-600" />
          : <Square size={16} className="text-gray-300" />
        }
      </button>

      {/* Thumbnail */}
      <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 shrink-0 relative">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt="Captured"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={16} className="text-gray-300" />
          </div>
        )}

        {/* Upload overlay */}
        {item.status === 'uploading' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 size={14} className="text-white animate-spin" />
          </div>
        )}
        {item.status === 'error' && (
          <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
            <AlertCircle size={14} className="text-red-300" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status chip */}
          {item.status === 'uploading' && (
            <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 border border-blue-100 rounded-md px-1.5 py-0.5">
              Saving…
            </span>
          )}
          {item.status === 'error' && (
            <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-100 rounded-md px-1.5 py-0.5">
              Failed
            </span>
          )}
          {item.status === 'done' && item.jobId && (
            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 rounded-md px-1.5 py-0.5 truncate max-w-[120px]">
              {item.jobName ?? 'Attached'}
            </span>
          )}
          {item.status === 'done' && !item.jobId && (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5">
              Unassigned
            </span>
          )}
          <span className="text-[10px] text-gray-400">{formatTime(item.capturedAt)}</span>
        </div>
        {item.note && (
          <p className="text-gray-500 text-[11px] mt-0.5 truncate">{item.note}</p>
        )}
        {item.errorMsg && (
          <p className="text-red-400 text-[10px] mt-0.5 truncate">{item.errorMsg}</p>
        )}
      </div>

      {/* Action buttons — hidden in select mode */}
      {!selectMode && item.status !== 'uploading' && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onAttachJob(item.clientId)}
            className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 hover:bg-violet-100 transition-colors"
            title="Attach to job"
          >
            <Briefcase size={12} />
          </button>
          <button
            onClick={() => onAddNote(item.clientId)}
            className="w-7 h-7 rounded-lg bg-yellow-50 border border-yellow-100 flex items-center justify-center text-yellow-600 hover:bg-yellow-100 transition-colors"
            title="Add note"
          >
            <StickyNote size={12} />
          </button>
          <button
            onClick={() => onDelete(item.clientId)}
            className="w-7 h-7 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraPage() {
  const navigate = useNavigate();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraId = useId();
  const libraryId = useId();

  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectMode = selectedIds.size > 0;

  // Sheets
  const [jobPickerForClientId, setJobPickerForClientId] = useState<string | null>(null);
  const [bulkJobPickerOpen, setBulkJobPickerOpen] = useState(false);
  const [noteForClientId, setNoteForClientId] = useState<string | null>(null);

  // ── Network ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Load existing captures from server on mount ───────────────────────────
  const loadCaptures = useCallback(async () => {
    try {
      const res = await fetch('/api/camera-captures', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as {
        captures: Array<{
          id: number;
          url: string;
          note: string | null;
          jobId: number | null;
          status: string;
          capturedAt: string;
        }>;
      };
      setCaptures(
        (data.captures ?? []).map(c => ({
          clientId: `srv_${c.id}`,
          id: c.id,
          localUrl: null,
          serverUrl: c.url,
          note: c.note,
          jobId: c.jobId,
          jobName: null,
          status: 'done' as UploadStatus,
          errorMsg: null,
          capturedAt: c.capturedAt,
        }))
      );
    } catch {
      // silently ignore — user can still shoot
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => { void loadCaptures(); }, [loadCaptures]);

  // ── Upload a single file ──────────────────────────────────────────────────
  async function uploadFile(file: File, clientId: string) {
    const capturedAt = new Date().toISOString();

    // Mark uploading
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, status: 'uploading' } : c
    ));

    try {
      const fd = new FormData();
      fd.append('photos', file);
      fd.append('capturedAt', capturedAt);

      const res = await fetch('/api/camera-captures', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Upload failed');
      }

      const d = await res.json() as { captures: Array<{ id: number; storageKey: string; url: string }> };
      const saved = d.captures[0];

      setCaptures(prev => prev.map(c => {
        if (c.clientId !== clientId) return c;
        // Revoke the object URL now that we have a server URL
        if (c.localUrl) URL.revokeObjectURL(c.localUrl);
        return {
          ...c,
          id: saved.id,
          serverUrl: saved.url,
          localUrl: null,
          status: 'done',
          errorMsg: null,
        };
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setCaptures(prev => prev.map(c =>
        c.clientId === clientId ? { ...c, status: 'error', errorMsg: msg } : c
      ));
    }
  }

  // ── Handle file selection (camera or library) ─────────────────────────────
  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const clientId = makeClientId();
      const localUrl = URL.createObjectURL(file);

      // Add optimistic item immediately
      setCaptures(prev => [{
        clientId,
        id: null,
        localUrl,
        serverUrl: null,
        note: null,
        jobId: null,
        jobName: null,
        status: 'pending',
        errorMsg: null,
        capturedAt: new Date().toISOString(),
      }, ...prev]);

      // Upload in background
      void uploadFile(file, clientId);
    }

    // Reset inputs so the same file can be re-selected
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (libraryInputRef.current) libraryInputRef.current.value = '';
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(clientId: string) {
    const item = captures.find(c => c.clientId === clientId);
    if (!item) return;

    // Revoke local URL if present
    if (item.localUrl) URL.revokeObjectURL(item.localUrl);

    setCaptures(prev => prev.filter(c => c.clientId !== clientId));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(clientId); return s; });

    if (item.id) {
      await fetch(`/api/camera-captures/${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => {});
    }
  }

  // ── Attach single job ─────────────────────────────────────────────────────
  async function handleAttachJob(clientId: string, job: JobOption) {
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId
        ? { ...c, jobId: job.id, jobName: job.name }
        : c
    ));

    const item = captures.find(c => c.clientId === clientId);
    if (item?.id) {
      await fetch(`/api/camera-captures/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      }).catch(() => {});
    }
  }

  // ── Bulk attach job ───────────────────────────────────────────────────────
  async function handleBulkAttachJob(job: JobOption) {
    const ids = Array.from(selectedIds);

    setCaptures(prev => prev.map(c =>
      ids.includes(c.clientId)
        ? { ...c, jobId: job.id, jobName: job.name }
        : c
    ));
    setSelectedIds(new Set());

    // Fire PATCH for each server-persisted item
    const serverItems = captures.filter(c => ids.includes(c.clientId) && c.id != null);
    await Promise.allSettled(
      serverItems.map(c =>
        fetch(`/api/camera-captures/${c.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id }),
        })
      )
    );
  }

  // ── Save note ─────────────────────────────────────────────────────────────
  async function handleSaveNote(clientId: string, note: string) {
    setCaptures(prev => prev.map(c =>
      c.clientId === clientId ? { ...c, note: note || null } : c
    ));

    const item = captures.find(c => c.clientId === clientId);
    if (item?.id) {
      await fetch(`/api/camera-captures/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || null }),
      }).catch(() => {});
    }
  }

  // ── Toggle select ─────────────────────────────────────────────────────────
  function toggleSelect(clientId: string) {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(clientId)) s.delete(clientId); else s.add(clientId);
      return s;
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const noteItem = captures.find(c => c.clientId === noteForClientId) ?? null;
  const unassigned = captures.filter(c => c.status === 'done' && !c.jobId).length;
  const attached = captures.filter(c => c.status === 'done' && c.jobId).length;
  const uploading = captures.filter(c => c.status === 'uploading' || c.status === 'pending').length;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: '#0d0d12' }}
    >
      <Helmet>
        <title>Camera — IWILLBUILD</title>
        <meta name="description" content="Field camera — capture job site photos instantly, then attach to jobs." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/camera" />
      </Helmet>
      <h1 className="sr-only">Camera Inbox</h1>

      {/* ── Hidden file inputs ── */}
      {/* Camera input: capture="environment" → opens native camera on iOS/Android */}
      <input
        ref={cameraInputRef}
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={e => handleFiles(e.target.files)}
        aria-label="Take photo with camera"
      />
      {/* Library input: no capture= → shows full photo picker */}
      <input
        ref={libraryInputRef}
        id={libraryId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={e => handleFiles(e.target.files)}
        aria-label="Choose from photo library"
      />

      {/* ── Offline banner ── */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0 z-10"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border-b border-amber-500/30">
              <WifiOff size={12} className="text-amber-400 shrink-0" />
              <span className="text-amber-300 text-xs font-medium">
                Offline — photos will upload when you reconnect
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════════
          VIEWFINDER ZONE  (dark, top ~40% of screen)
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        className="shrink-0 flex flex-col"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pb-4">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            aria-label="Back to home"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="text-center">
            <p className="text-white font-bold text-base tracking-tight">Camera</p>
            {(uploading > 0 || captures.length > 0) && (
              <p className="text-white/40 text-[11px] mt-0.5">
                {uploading > 0
                  ? `Saving ${uploading} photo${uploading !== 1 ? 's' : ''}…`
                  : `${unassigned} unassigned · ${attached} attached`
                }
              </p>
            )}
          </div>

          {/* Clear selection or spacer */}
          {selectMode ? (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
              aria-label="Clear selection"
            >
              <X size={16} />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>

        {/* ── Shutter row ── */}
        <div className="flex items-center justify-center gap-8 pb-6 px-4">
          {/* Library button */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => libraryInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5"
            aria-label="Choose from library"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors">
              <Images size={22} className="text-white/70" />
            </div>
            <span className="text-white/40 text-[10px] font-medium">Library</span>
          </motion.button>

          {/* Main shutter button */}
          <motion.button
            whileTap={{ scale: 0.90 }}
            whileHover={{ scale: 1.04 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            onClick={() => cameraInputRef.current?.click()}
            className="relative flex items-center justify-center"
            aria-label="Take photo"
          >
            {/* Outer ring */}
            <div className="w-[76px] h-[76px] rounded-full border-[3px] border-white/30 flex items-center justify-center">
              {/* Inner disc */}
              <div
                className="w-[62px] h-[62px] rounded-full bg-white flex items-center justify-center"
                style={{ boxShadow: '0 0 24px rgba(255,255,255,0.25)' }}
              >
                <Camera size={26} className="text-gray-900" />
              </div>
            </div>
          </motion.button>

          {/* Add another / count badge */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5"
            aria-label="Take another photo"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors relative">
              <Plus size={22} className="text-white/70" />
              {captures.length > 0 && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">
                    {captures.length > 99 ? '99+' : captures.length}
                  </span>
                </div>
              )}
            </div>
            <span className="text-white/40 text-[10px] font-medium">More</span>
          </motion.button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CAPTURED TRAY  (light, scrollable, fills remaining height)
      ════════════════════════════════════════════════════════════════════════ */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          background: '#f5f5f7',
          borderRadius: '24px 24px 0 0',
        }}
      >
        {/* Tray header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
          <div>
            <p className="text-gray-900 font-bold text-sm">
              {captures.length === 0 ? 'Captured' : `Captured (${captures.length})`}
            </p>
            {captures.length === 0 && !loadingInitial && (
              <p className="text-gray-400 text-[11px] mt-0.5">
                Tap the shutter — no job needed yet
              </p>
            )}
          </div>

          {/* Select all / deselect all when items exist */}
          {captures.length > 0 && (
            <button
              onClick={() => {
                if (selectedIds.size === captures.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(captures.map(c => c.clientId)));
                }
              }}
              className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
            >
              {selectedIds.size === captures.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {/* List */}
        <div
          className="flex-1 overflow-y-auto px-3 space-y-1.5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
        >
          {loadingInitial ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-violet-400" />
            </div>
          ) : captures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-200 flex items-center justify-center mb-3">
                <Camera size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-semibold text-sm">No photos yet</p>
              <p className="text-gray-400 text-xs mt-1">
                Tap the shutter above to start capturing
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {captures.map(item => (
                <CaptureRow
                  key={item.clientId}
                  item={item}
                  selected={selectedIds.has(item.clientId)}
                  selectMode={selectMode}
                  onToggleSelect={toggleSelect}
                  onDelete={handleDelete}
                  onAttachJob={(id) => setJobPickerForClientId(id)}
                  onAddNote={(id) => setNoteForClientId(id)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          BULK ACTION BAR  (floats above tray when items selected)
      ════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="absolute left-0 right-0 z-20 px-4"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
          >
            <div
              className="flex items-center gap-3 bg-gray-900 rounded-2xl px-4 py-3"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
            >
              <div className="flex-1">
                <p className="text-white font-bold text-sm">
                  {selectedIds.size} selected
                </p>
                <p className="text-white/40 text-[11px]">Choose an action</p>
              </div>

              <button
                onClick={() => setBulkJobPickerOpen(true)}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-3.5 py-2 text-xs font-bold transition-colors"
              >
                <Briefcase size={12} />
                Move to Job
                <ArrowRight size={11} />
              </button>

              <button
                onClick={async () => {
                  const ids = Array.from(selectedIds);
                  setSelectedIds(new Set());
                  for (const cid of ids) await handleDelete(cid);
                }}
                className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors"
                aria-label="Delete selected"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Attached confirmation strip (non-blocking, bottom) ── */}
      <AnimatePresence>
        {!selectMode && attached > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute left-0 right-0 z-10 px-4"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
          >
            <div
              className="flex items-center gap-2 bg-violet-600 rounded-2xl px-4 py-2.5"
              style={{ boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}
            >
              <CheckCircle2 size={14} className="text-white shrink-0" />
              <p className="text-white text-xs font-semibold flex-1">
                {attached} photo{attached !== 1 ? 's' : ''} attached to jobs
              </p>
              <button
                onClick={() => navigate('/jobs')}
                className="text-violet-200 text-xs font-bold hover:text-white transition-colors shrink-0"
              >
                View →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sheets ── */}
      <JobPickerSheet
        open={jobPickerForClientId !== null}
        title="Attach to Job"
        onClose={() => setJobPickerForClientId(null)}
        onSelect={(job) => {
          if (jobPickerForClientId) void handleAttachJob(jobPickerForClientId, job);
          setJobPickerForClientId(null);
        }}
      />

      <JobPickerSheet
        open={bulkJobPickerOpen}
        title={`Move ${selectedIds.size} photo${selectedIds.size !== 1 ? 's' : ''} to Job`}
        onClose={() => setBulkJobPickerOpen(false)}
        onSelect={(job) => {
          void handleBulkAttachJob(job);
          setBulkJobPickerOpen(false);
        }}
      />

      <NoteSheet
        open={noteForClientId !== null}
        initialNote={noteItem?.note ?? null}
        onClose={() => setNoteForClientId(null)}
        onSave={(note) => {
          if (noteForClientId) void handleSaveNote(noteForClientId, note);
          setNoteForClientId(null);
        }}
      />
    </div>
  );
}
