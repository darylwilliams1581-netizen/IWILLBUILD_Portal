/**
 * /camera — Mobile-first field camera module.
 *
 * UX flow:
 *   1. Tap Camera on Home → lands here
 *   2. Immediately shows capture button (no job selection required)
 *   3. Captured photos land in the "Camera Inbox" below
 *   4. From the inbox: attach to job | keep unassigned | add note | delete
 *
 * This page is mobile-first. Desktop users still see it but it's optimised
 * for phone use. The existing job photo upload flows are untouched.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, ChevronLeft, X, Trash2, Briefcase, StickyNote,
  CheckCircle2, Loader2, ImageIcon, HardHat, ChevronRight,
  WifiOff, RefreshCw, AlertTriangle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaptureItem {
  id: number;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  originalName: string | null;
  note: string | null;
  jobId: number | null;
  status: string;
  capturedAt: string;
}

interface JobOption {
  id: number;
  name: string;
  jobNumber?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Job picker bottom sheet ───────────────────────────────────────────────────

function JobPickerSheet({
  open,
  onClose,
  onSelect,
  title = 'Attach to Job',
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (job: JobOption) => void;
  title?: string;
}) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        setJobs(Array.isArray(data) ? data : (data.jobs ?? []));
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl flex flex-col overflow-hidden"
            style={{
              boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
              maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px) - 3rem)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Briefcase size={15} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">{title}</h2>
                  <p className="text-gray-400 text-xs">Select an active job</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-violet-400" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-10">
                  <HardHat size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No active jobs found</p>
                </div>
              ) : jobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => { onSelect(job); onClose(); }}
                  className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-violet-50 hover:border-violet-200 active:bg-violet-100 rounded-2xl px-4 py-3.5 text-left transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <HardHat size={16} className="text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                    {job.jobNumber && <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>}
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
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

// ── Note editor sheet ─────────────────────────────────────────────────────────

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
            className="fixed inset-0 z-[80] bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.15)' }}
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
                <h2 className="text-gray-900 font-bold text-base">Add Note</h2>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                <X size={14} />
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={4}
                placeholder="Add a note to this photo…"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 resize-none"
                autoFocus
              />
              <button
                onClick={() => { onSave(text.trim()); onClose(); }}
                className="w-full h-12 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-sm transition-colors"
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

// ── Capture row ───────────────────────────────────────────────────────────────

function CaptureRow({
  item,
  onDelete,
  onAttachJob,
  onAddNote,
}: {
  item: CaptureItem;
  onDelete: (id: number) => void;
  onAttachJob: (id: number) => void;
  onAddNote: (id: number) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-start gap-3 bg-white rounded-2xl border border-gray-100 p-3"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0 relative">
        {!imgError ? (
          <img
            src={item.url}
            alt={item.originalName ?? 'Captured photo'}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={20} className="text-gray-300" />
          </div>
        )}
        {item.status === 'assigned' && (
          <div className="absolute bottom-0 left-0 right-0 bg-violet-600/80 flex items-center justify-center py-0.5">
            <span className="text-white text-[8px] font-bold">ATTACHED</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400 text-[11px]">{formatTime(item.capturedAt)}</span>
          <button
            onClick={() => onDelete(item.id)}
            className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors shrink-0"
          >
            <Trash2 size={11} />
          </button>
        </div>

        {item.note && (
          <p className="text-gray-600 text-xs mt-1 line-clamp-2">{item.note}</p>
        )}

        {item.jobId && (
          <div className="mt-1 flex items-center gap-1">
            <HardHat size={10} className="text-violet-500 shrink-0" />
            <span className="text-violet-600 text-[11px] font-semibold truncate">Job attached</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-2">
          <button
            onClick={() => onAttachJob(item.id)}
            className="flex items-center gap-1 bg-violet-50 border border-violet-100 text-violet-700 rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:bg-violet-100 transition-colors"
          >
            <Briefcase size={10} />
            {item.jobId ? 'Change Job' : 'Attach Job'}
          </button>
          <button
            onClick={() => onAddNote(item.id)}
            className="flex items-center gap-1 bg-yellow-50 border border-yellow-100 text-yellow-700 rounded-lg px-2.5 py-1 text-[11px] font-semibold hover:bg-yellow-100 transition-colors"
          >
            <StickyNote size={10} />
            {item.note ? 'Edit Note' : 'Add Note'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CameraPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // Sheets
  const [jobPickerForId, setJobPickerForId] = useState<number | null>(null);
  const [noteForId, setNoteForId] = useState<number | null>(null);

  // ── Network awareness ──────────────────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Load captures ──────────────────────────────────────────────────────────
  const loadCaptures = useCallback(async () => {
    try {
      const res = await fetch('/api/camera-captures', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { captures: CaptureItem[] };
      setCaptures(data.captures ?? []);
    } catch {
      // silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCaptures(); }, [loadCaptures]);

  // ── Capture handler ────────────────────────────────────────────────────────
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);

    const capturedAt = new Date().toISOString();

    try {
      for (const file of Array.from(files)) {
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
      }

      // Reload inbox
      await loadCaptures();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    setCaptures(prev => prev.filter(c => c.id !== id));
    await fetch(`/api/camera-captures/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => {});
  }

  // ── Attach job ─────────────────────────────────────────────────────────────
  async function handleAttachJob(captureId: number, job: JobOption) {
    setCaptures(prev => prev.map(c =>
      c.id === captureId ? { ...c, jobId: job.id, status: 'assigned' } : c
    ));
    await fetch(`/api/camera-captures/${captureId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(() => {});
  }

  // ── Save note ──────────────────────────────────────────────────────────────
  async function handleSaveNote(captureId: number, note: string) {
    setCaptures(prev => prev.map(c =>
      c.id === captureId ? { ...c, note: note || null } : c
    ));
    await fetch(`/api/camera-captures/${captureId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note || null }),
    }).catch(() => {});
  }

  const noteItem = captures.find(c => c.id === noteForId) ?? null;
  const unassignedCount = captures.filter(c => c.status === 'captured').length;
  const assignedCount = captures.filter(c => c.status === 'assigned').length;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#0f0f14' }}
    >
      <Helmet>
        <title>Camera — IWILLBUILD</title>
        <meta name="description" content="Field camera — capture job site photos instantly, then attach to jobs." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/camera" />
      </Helmet>
      <h1 className="sr-only">Camera Inbox</h1>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 pb-4 shrink-0"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
          background: 'linear-gradient(180deg, #0f0f14 0%, #0f0f14 100%)',
        }}
      >
        <button
          onClick={() => navigate('/home')}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-white font-bold text-base">Camera</p>
          {captures.length > 0 && (
            <p className="text-white/40 text-[11px]">
              {captures.length} photo{captures.length !== 1 ? 's' : ''} captured
            </p>
          )}
        </div>
        <div className="w-9" /> {/* spacer */}
      </div>

      {/* ── Offline banner ── */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border-b border-amber-500/30">
              <WifiOff size={13} className="text-amber-400 shrink-0" />
              <span className="text-amber-300 text-xs font-medium">Offline — photos will upload when you reconnect</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Capture button area ── */}
      <div className="flex flex-col items-center justify-center py-8 shrink-0">
        {/* Hidden file input — no capture= so iOS shows full picker (camera + library) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => void handleFiles(e.target.files)}
        />

        {/* Big shutter button */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative"
          aria-label="Take photo"
        >
          {/* Outer ring */}
          <div className="w-24 h-24 rounded-full border-4 border-white/20 flex items-center justify-center">
            {/* Inner button */}
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                uploading ? 'bg-violet-400' : 'bg-violet-500 hover:bg-violet-400'
              }`}
              style={{ boxShadow: '0 0 32px rgba(124,58,237,0.5)' }}
            >
              {uploading ? (
                <Loader2 size={32} className="text-white animate-spin" />
              ) : (
                <Camera size={32} className="text-white" />
              )}
            </div>
          </div>
        </motion.button>

        <p className="text-white/50 text-xs mt-3 font-medium">
          {uploading ? 'Saving…' : 'Tap to capture'}
        </p>

        {/* Upload error */}
        <AnimatePresence>
          {uploadError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-2 max-w-xs"
            >
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-xs">{uploadError}</p>
              <button onClick={() => setUploadError(null)} className="ml-auto text-red-400">
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Camera Inbox ── */}
      <div
        className="flex-1 rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: '#f5f5f7' }}
      >
        {/* Inbox header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-gray-900 font-bold text-base">Camera Inbox</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {loading ? 'Loading…' : captures.length === 0
                ? 'No photos yet — tap the camera to capture'
                : `${unassignedCount} unassigned · ${assignedCount} attached to jobs`
              }
            </p>
          </div>
          {captures.length > 0 && (
            <button
              onClick={() => void loadCaptures()}
              className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 transition-colors"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>

        {/* Captures list */}
        <div className="flex-1 overflow-y-auto px-4 pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-violet-400" />
            </div>
          ) : captures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center mb-3">
                <Camera size={28} className="text-gray-400" />
              </div>
              <p className="text-gray-500 font-semibold text-sm">Your captured photos appear here</p>
              <p className="text-gray-400 text-xs mt-1">No job selection needed — just tap and shoot</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {captures.map(item => (
                  <CaptureRow
                    key={item.id}
                    item={item}
                    onDelete={handleDelete}
                    onAttachJob={(id) => setJobPickerForId(id)}
                    onAddNote={(id) => setNoteForId(id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* ── Job picker sheet ── */}
      <JobPickerSheet
        open={jobPickerForId !== null}
        onClose={() => setJobPickerForId(null)}
        onSelect={(job) => {
          if (jobPickerForId !== null) void handleAttachJob(jobPickerForId, job);
          setJobPickerForId(null);
        }}
      />

      {/* ── Note sheet ── */}
      <NoteSheet
        open={noteForId !== null}
        initialNote={noteItem?.note ?? null}
        onClose={() => setNoteForId(null)}
        onSave={(note) => {
          if (noteForId !== null) void handleSaveNote(noteForId, note);
          setNoteForId(null);
        }}
      />

      {/* Confirm attached toast */}
      <AnimatePresence>
        {captures.some(c => c.status === 'assigned') && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 pointer-events-none"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
          >
            <div className="mx-4 flex items-center gap-2 bg-violet-600 rounded-2xl px-4 py-3 pointer-events-auto"
              style={{ boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}
            >
              <CheckCircle2 size={16} className="text-white shrink-0" />
              <p className="text-white text-sm font-semibold flex-1">
                {assignedCount} photo{assignedCount !== 1 ? 's' : ''} attached to jobs
              </p>
              <button
                onClick={() => navigate('/jobs')}
                className="text-violet-200 text-xs font-bold hover:text-white transition-colors"
              >
                View Jobs →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
