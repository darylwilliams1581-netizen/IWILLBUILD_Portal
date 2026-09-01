/**
 * DashboardPhotoUploader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Quick-upload widget on the desktop dashboard.
 * Lets the user pick a job first, then drop or browse photos — no need to
 * navigate to the job's photo page first.
 *
 * Flow:
 *   1. Job selector (search-as-you-type, defaults to active jobs)
 *   2. File picker / drag-and-drop zone
 *   3. Per-file progress bars while uploading
 *   4. Success summary with link to the job's photo page
 *
 * Uses the same POST /api/jobs/:id/photos endpoint as the job photo page.
 * HEIC files are rejected client-side (matching the existing pre-flight logic).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Search, ChevronDown, X, Upload, CheckCircle2, AlertCircle, Loader2, ImagePlus, ExternalLink, RotateCcw } from 'lucide-react';
import ImageSafeguardNotice from '@/components/ImageSafeguardNotice';
function randomUUID(): string {
  return crypto.randomUUID();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobOption {
  id: number;
  jobNumber: string | null;
  name: string;
  status: string;
}
type FileStatus = 'pending' | 'uploading' | 'done' | 'error';
interface FileEntry {
  id: string;
  file: File;
  status: FileStatus;
  progress: number; // 0–100
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isHeic(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function jobLabel(job: JobOption): string {
  return job.jobNumber ? `#${job.jobNumber} — ${job.name}` : job.name;
}

// ── Job selector ──────────────────────────────────────────────────────────────

function JobSelector({
  selected,
  onSelect
}: {
  selected: JobOption | null;
  onSelect: (job: JobOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load initial active jobs on open
  useEffect(() => {
    if (!open) return;
    fetchJobs(query);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchJobs(query), 250);
    return () => clearTimeout(t);
  }, [query, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  async function fetchJobs(q: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: 'active',
        limit: '30'
      });
      if (q) params.set('q', q);
      const res = await fetch(`/api/jobs/search?${params}`, {
        credentials: 'include'
      });
      const data = (await res.json()) as {
        jobs?: JobOption[];
      };
      setJobs(data.jobs ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }
  function handleSelect(job: JobOption) {
    onSelect(job);
    setOpen(false);
    setQuery('');
  }
  return <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className={`
          w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm
          transition-colors text-left
          ${selected ? 'bg-primary/8 border-primary/30 text-foreground' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/40'}
        `}>
        <Search size={14} className={selected ? 'text-primary shrink-0' : 'text-muted-foreground shrink-0'} />
        <span className="flex-1 truncate font-medium">
          {selected ? jobLabel(selected) : 'Select a job…'}
        </span>
        {selected ? <button type="button" onClick={e => {
        e.stopPropagation();
        onSelect(null as unknown as JobOption);
      }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Clear job">
            <X size={13} />
          </button> : <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      <AnimatePresence>
        {open && <motion.div initial={{
        opacity: 0,
        y: -6,
        scale: 0.98
      }} animate={{
        opacity: 1,
        y: 0,
        scale: 1
      }} exit={{
        opacity: 0,
        y: -6,
        scale: 0.98
      }} transition={{
        duration: 0.12
      }} className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search size={13} className="text-muted-foreground shrink-0" />
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by job number or name…" className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground" />
              {loading && <Loader2 size={12} className="animate-spin text-muted-foreground shrink-0" />}
            </div>

            {/* Results */}
            <div className="max-h-52 overflow-y-auto">
              {jobs.length === 0 && !loading ? <p className="text-xs text-muted-foreground text-center py-4">
                  {query ? 'No jobs found.' : 'No active jobs.'}
                </p> : jobs.map(job => <button key={job.id} type="button" onClick={() => handleSelect(job)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-muted/60 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{job.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.jobNumber ? `#${job.jobNumber} · ` : ''}{job.status}
                      </p>
                    </div>
                  </button>)}
            </div>
          </motion.div>}
      </AnimatePresence>
    </div>;
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

function DropZone({
  disabled,
  onFiles
}: {
  disabled: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || isHeic(f));
    if (files.length) onFiles(files);
  }
  return <div onDragOver={e => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => !disabled && inputRef.current?.click()} className={`
        relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
        py-7 px-4 cursor-pointer transition-all select-none
        ${disabled ? 'opacity-40 cursor-not-allowed border-border' : dragging ? 'border-primary bg-primary/8 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-muted/40'}
      `}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${dragging ? 'bg-primary/20' : 'bg-muted'}`}>
        <ImagePlus size={20} className={dragging ? 'text-primary' : 'text-muted-foreground'} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">
          {dragging ? 'Drop photos here' : 'Drop photos or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          JPEG, PNG, WebP · up to 20 MB each · max 10 at once
        </p>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff" multiple className="sr-only" onChange={e => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onFiles(files);
      e.target.value = '';
    }} />
    </div>;
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({
  entry,
  onRemove
}: {
  entry: FileEntry;
  onRemove: (id: string) => void;
}) {
  const preview = useRef<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(entry.file);
    preview.current = url;
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [entry.file]);
  return <div className="flex items-center gap-3 py-2">
      {/* Thumbnail */}
      <div className="w-9 h-9 rounded-lg bg-muted overflow-hidden shrink-0">
        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
      </div>

      {/* Name + progress */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{entry.file.name}</p>
        <div className="flex items-center gap-2 mt-1">
          {entry.status === 'uploading' && <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <motion.div className="h-full bg-primary rounded-full" initial={{
            width: 0
          }} animate={{
            width: `${entry.progress}%`
          }} transition={{
            duration: 0.2
          }} />
            </div>}
          {entry.status === 'done' && <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 size={10} /> Uploaded
            </span>}
          {entry.status === 'error' && <span className="text-[10px] font-semibold text-destructive flex items-center gap-1 truncate">
              <AlertCircle size={10} /> {entry.error ?? 'Failed'}
            </span>}
          {entry.status === 'pending' && <span className="text-[10px] text-muted-foreground">{formatBytes(entry.file.size)}</span>}
        </div>
      </div>

      {/* Status icon / remove */}
      <div className="shrink-0">
        {entry.status === 'uploading' && <Loader2 size={14} className="animate-spin text-primary" />}
        {entry.status === 'done' && <CheckCircle2 size={14} className="text-emerald-500" />}
        {(entry.status === 'pending' || entry.status === 'error') && <button onClick={() => onRemove(entry.id)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Remove">
            <X size={14} />
          </button>}
      </div>
    </div>;
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function DashboardPhotoUploader() {
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [doneJobId, setDoneJobId] = useState<number | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
  const hasFiles = files.length > 0;
  const allDone = files.length > 0 && files.every(f => f.status === 'done');

  async function addFiles(incoming: File[]) {
    const heicFiles = incoming.filter(isHeic);
    const validFiles = incoming.filter(f => !isHeic(f));

    const entries: FileEntry[] = validFiles.map(f => ({
      id: randomUUID(),
      file: f,
      status: 'pending',
      progress: 0
    }));
    setFiles(prev => {
      // Deduplicate by name+size
      const existing = new Set(prev.map(e => `${e.file.name}-${e.file.size}`));
      const fresh = entries.filter(e => !existing.has(`${e.file.name}-${e.file.size}`));
      return [...prev, ...fresh];
    });
    if (heicFiles.length > 0) {
      // Surface HEIC rejection as error entries so user sees them
      const heicEntries: FileEntry[] = heicFiles.map(f => ({
        id: randomUUID(),
        file: f,
        status: 'error',
        progress: 0,
        error: 'HEIC not supported — convert to JPEG first'
      }));
      setFiles(prev => [...prev, ...heicEntries]);
    }
  }
  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }
  async function uploadAll() {
    if (!selectedJob) return;
    const toUpload = files.filter(f => f.status === 'pending');
    if (toUpload.length === 0) return;
    setUploading(true);

    // Upload with bounded concurrency (2 at a time)
    const CONCURRENCY = 2;
    let idx = 0;
    let successCount = 0;
    async function uploadOne(entry: FileEntry) {
      setFiles(prev => prev.map(f => f.id === entry.id ? {
        ...f,
        status: 'uploading',
        progress: 5
      } : f));
      try {
        const formData = new FormData();
        formData.append('photo', entry.file, entry.file.name);
        const clientId = randomUUID();

        // Simulate progress while uploading (XHR gives real progress; fetch doesn't)
        const progressInterval = setInterval(() => {
          setFiles(prev => prev.map(f => f.id === entry.id && f.status === 'uploading' && f.progress < 85 ? {
            ...f,
            progress: f.progress + 10
          } : f));
        }, 200);
        const res = await fetch(`/api/jobs/${selectedJob.id}/photos`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Client-Id': clientId
          },
          body: formData
        });
        clearInterval(progressInterval);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setFiles(prev => prev.map(f => f.id === entry.id ? {
          ...f,
          status: 'done',
          progress: 100
        } : f));
        successCount++;
      } catch (err) {
        setFiles(prev => prev.map(f => f.id === entry.id ? {
          ...f,
          status: 'error',
          progress: 0,
          error: err instanceof Error ? err.message : 'Upload failed'
        } : f));
      }
    }

    // Worker pool
    async function worker() {
      while (idx < toUpload.length) {
        const entry = toUpload[idx++];
        await uploadOne(entry);
      }
    }
    const workers = Array.from({
      length: CONCURRENCY
    }, () => worker());
    await Promise.all(workers);
    setUploading(false);
    if (successCount > 0) {
      setDoneJobId(selectedJob.id);
      setDoneCount(successCount);
      setDone(true);
    }
  }
  function reset() {
    setFiles([]);
    setSelectedJob(null);
    setDone(false);
    setDoneJobId(null);
    setDoneCount(0);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Camera size={14} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground leading-tight">Quick photo upload</p>
          <p className="text-xs text-muted-foreground leading-tight">Select a job, then add photos</p>
        </div>
        {(hasFiles || done) && <button onClick={reset} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw size={11} />
            Reset
          </button>}
      </div>

      <div className="p-4 flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {done ? (/* ── Success state ── */
        <motion.div key="done" initial={{
          opacity: 0,
          scale: 0.96
        }} animate={{
          opacity: 1,
          scale: 1
        }} exit={{
          opacity: 0
        }} className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 size={24} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {doneCount} photo{doneCount !== 1 ? 's' : ''} uploaded
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Added to {selectedJob?.name ?? 'job'}
                </p>
              </div>
              {doneJobId && <Link to={`/jobs/${doneJobId}/photos`} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  View photos <ExternalLink size={11} />
                </Link>}
            </motion.div>) : <motion.div key="form" className="flex flex-col gap-3">
              {/* Job selector */}
              <JobSelector selected={selectedJob} onSelect={job => {
            setSelectedJob(job);
            setFiles([]);
          }} />

              {/* Drop zone — only shown when job is selected */}
              <AnimatePresence>
                {selectedJob && <motion.div initial={{
              opacity: 0,
              height: 0
            }} animate={{
              opacity: 1,
              height: 'auto'
            }} exit={{
              opacity: 0,
              height: 0
            }} transition={{
              duration: 0.18
            }}>
                    <DropZone disabled={uploading} onFiles={addFiles} />
                  </motion.div>}
              </AnimatePresence>

              {/* File list */}
              <AnimatePresence>
                {files.length > 0 && <motion.div initial={{
              opacity: 0
            }} animate={{
              opacity: 1
            }} className="flex flex-col divide-y divide-border">
                    {files.map(entry => <FileRow key={entry.id} entry={entry} onRemove={removeFile} />)}
                  </motion.div>}
              </AnimatePresence>

              {/* Upload button */}
              <AnimatePresence>
                {pendingFiles.length > 0 && selectedJob && <motion.button initial={{
              opacity: 0,
              y: 4
            }} animate={{
              opacity: 1,
              y: 0
            }} exit={{
              opacity: 0
            }} onClick={uploadAll} disabled={uploading} className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                    {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><Upload size={14} /> Upload {pendingFiles.length} photo{pendingFiles.length !== 1 ? 's' : ''}</>}
                  </motion.button>}
              </AnimatePresence>

              {/* All done inline (some may have errored) */}
              {allDone && <p className="text-xs text-emerald-600 font-semibold text-center flex items-center justify-center gap-1">
                  <CheckCircle2 size={12} /> All photos uploaded
                </p>}
            </motion.div>}
        </AnimatePresence>
      </div>
    </div>;
}
