/**
 * GenerateJobReportModal
 * Opens from the "Generate Job Report" button in the Doc Studio ribbon.
 * User selects a job, toggles sections, picks site photos to embed,
 * adds optional notes override, then hits Generate — the API creates a
 * document_template and we redirect to /studio/builder/:id.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Loader2, FileText, ChevronDown, CheckSquare, Square,
  AlertTriangle, Briefcase, Camera, Check,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  name: string;
  job_number: string | null;
  status: string;
  client: string | null;
}

interface JobPhoto {
  id: number;
  label: string;
  thumbUrl: string | null;
  downloadUrl: string;
}

interface Sections {
  jobInfo: boolean;
  progress: boolean;
  delays: boolean;
  incidents: boolean;
  variations: boolean;
  notes: boolean;
  photosLink: boolean;
}

const DEFAULT_SECTIONS: Sections = {
  jobInfo: true,
  progress: true,
  delays: true,
  incidents: true,
  variations: true,
  notes: true,
  photosLink: true,
};

const SECTION_LABELS: { key: keyof Sections; label: string; desc: string }[] = [
  { key: 'jobInfo',    label: 'Job Information',       desc: 'Name, client, address, dates, status' },
  { key: 'progress',  label: 'Progress Summary',       desc: 'Progress lines with % complete' },
  { key: 'delays',    label: 'Delays',                 desc: 'Delay log with reasons and days' },
  { key: 'incidents', label: 'Incidents',              desc: 'Recorded incidents for this job' },
  { key: 'variations',label: 'Variations & Quotes',    desc: 'Estimates and pending variations' },
  { key: 'notes',     label: 'Notes',                  desc: 'Job notes (editable before sending)' },
  { key: 'photosLink',label: 'Site Photos',           desc: 'Embed selected job photos in a 2-up grid' },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export default function GenerateJobReportModal({ onClose }: Props) {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobSearch, setJobSearch] = useState('');
  const [showJobDropdown, setShowJobDropdown] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const [sections, setSections] = useState<Sections>({ ...DEFAULT_SECTIONS });
  const [notesOverride, setNotesOverride] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Photo picker state
  const [jobPhotos, setJobPhotos] = useState<JobPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(new Set());

  // Load jobs list
  useEffect(() => {
    fetch('/api/jobs?limit=200', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { jobs?: Job[] }) => setJobs(d.jobs ?? []))
      .catch(() => {})
      .finally(() => setJobsLoading(false));
  }, []);

  // Load photos when job is selected and photosLink section is on
  useEffect(() => {
    if (!selectedJob || !sections.photosLink) {
      setJobPhotos([]);
      setSelectedPhotoIds(new Set());
      return;
    }
    setPhotosLoading(true);
    fetch(`/api/jobs/${selectedJob.id}/photos/picker`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { photos?: JobPhoto[] }) => {
        const photos = d.photos ?? [];
        setJobPhotos(photos);
        // Auto-select all by default
        setSelectedPhotoIds(new Set(photos.map(p => p.id)));
      })
      .catch(() => setJobPhotos([]))
      .finally(() => setPhotosLoading(false));
  }, [selectedJob, sections.photosLink]);

  const filteredJobs = jobs.filter(j => {
    const q = jobSearch.toLowerCase();
    return (
      j.name.toLowerCase().includes(q) ||
      (j.job_number ?? '').toLowerCase().includes(q) ||
      (j.client ?? '').toLowerCase().includes(q)
    );
  });

  function toggleSection(key: keyof Sections) {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    const allOn = Object.values(sections).every(Boolean);
    const next = Object.fromEntries(
      (Object.keys(sections) as (keyof Sections)[]).map(k => [k, !allOn])
    ) as Sections;
    setSections(next);
  }

  async function handleGenerate() {
    if (!selectedJob) { setError('Please select a job.'); return; }
    const anyOn = Object.values(sections).some(Boolean);
    if (!anyOn) { setError('Please enable at least one section.'); return; }

    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/jobs/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jobId: selectedJob.id,
          sections,
          notesOverride: notesOverride.trim() || undefined,
          selectedPhotoIds: sections.photosLink && selectedPhotoIds.size > 0
            ? Array.from(selectedPhotoIds)
            : undefined,
        }),
      });
      const data = await res.json() as { id?: number; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? 'Failed to generate report. Please try again.');
        return;
      }
      toast.success('Job report created — opening in Doc Studio');
      onClose();
      navigate(`/studio/builder/${data.id}`);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const allOn = Object.values(sections).every(Boolean);
  const enabledCount = Object.values(sections).filter(Boolean).length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <FileText size={17} className="text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-heading font-bold text-base text-slate-900 leading-tight">Generate Job Report</h2>
              <p className="text-xs text-slate-500 mt-0.5">Select a job, choose sections, then open in Doc Studio to review and send.</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

            {/* Job selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700">Job <span className="text-red-500">*</span></label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowJobDropdown(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                >
                  {selectedJob ? (
                    <span className="flex-1 truncate font-medium text-slate-800">
                      {selectedJob.job_number ? `#${selectedJob.job_number} — ` : ''}{selectedJob.name}
                      {selectedJob.client ? <span className="text-slate-400 font-normal ml-1">· {selectedJob.client}</span> : null}
                    </span>
                  ) : (
                    <span className="flex-1 text-slate-400">Select a job…</span>
                  )}
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${showJobDropdown ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showJobDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden"
                    >
                      <div className="p-2 border-b border-slate-100">
                        <input
                          autoFocus
                          value={jobSearch}
                          onChange={e => setJobSearch(e.target.value)}
                          placeholder="Search by name, number or client…"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {jobsLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 size={16} className="animate-spin text-slate-400" />
                          </div>
                        ) : filteredJobs.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-4">No jobs found</p>
                        ) : (
                          filteredJobs.map(j => (
                            <button
                              key={j.id}
                              type="button"
                              onClick={() => { setSelectedJob(j); setShowJobDropdown(false); setJobSearch(''); setError(''); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-orange-50 text-left transition-colors"
                            >
                              <Briefcase size={13} className="text-slate-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">
                                  {j.job_number ? `#${j.job_number} — ` : ''}{j.name}
                                </p>
                                {j.client && <p className="text-[10px] text-slate-400 truncate">{j.client}</p>}
                              </div>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{j.status}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Section toggles */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Sections to include</label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[10px] font-semibold text-primary hover:text-orange-600 transition-colors"
                >
                  {allOn ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {SECTION_LABELS.map(({ key, label, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSection(key)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      sections[key]
                        ? 'border-orange-200 bg-orange-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {sections[key]
                      ? <CheckSquare size={15} className="text-orange-500 shrink-0" />
                      : <Square size={15} className="text-slate-300 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-tight ${sections[key] ? 'text-slate-800' : 'text-slate-500'}`}>{label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">{enabledCount} of {SECTION_LABELS.length} sections selected</p>
            </div>

            {/* Photo picker — shown when Site Photos section is on and a job is selected */}
            {sections.photosLink && selectedJob && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Camera size={12} className="text-slate-400" />
                    Select photos to embed
                  </label>
                  {jobPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedPhotoIds.size === jobPhotos.length) {
                          setSelectedPhotoIds(new Set());
                        } else {
                          setSelectedPhotoIds(new Set(jobPhotos.map(p => p.id)));
                        }
                      }}
                      className="text-[10px] font-semibold text-primary hover:text-orange-600 transition-colors"
                    >
                      {selectedPhotoIds.size === jobPhotos.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>

                {photosLoading ? (
                  <div className="flex items-center justify-center py-6 rounded-xl border border-slate-200 bg-slate-50">
                    <Loader2 size={16} className="animate-spin text-slate-400" />
                  </div>
                ) : jobPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-5 rounded-xl border border-slate-200 bg-slate-50 gap-1.5">
                    <Camera size={20} className="text-slate-300" />
                    <p className="text-xs text-slate-400">No photos uploaded for this job yet</p>
                    <p className="text-[10px] text-slate-300">A text reference will be included instead</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto p-1 rounded-xl border border-slate-200 bg-slate-50">
                    {jobPhotos.map(photo => {
                      const selected = selectedPhotoIds.has(photo.id);
                      return (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => {
                            setSelectedPhotoIds(prev => {
                              const next = new Set(prev);
                              if (next.has(photo.id)) next.delete(photo.id);
                              else next.add(photo.id);
                              return next;
                            });
                          }}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            selected ? 'border-primary' : 'border-transparent'
                          }`}
                        >
                          {photo.thumbUrl ? (
                            <img
                              src={photo.thumbUrl}
                              alt={photo.label}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                              <Camera size={14} className="text-slate-400" />
                            </div>
                          )}
                          {selected && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                              <Check size={9} className="text-white" strokeWidth={3} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {jobPhotos.length > 0 && (
                  <p className="text-[10px] text-slate-400">
                    {selectedPhotoIds.size} of {jobPhotos.length} photos selected — embedded 2 per row
                  </p>
                )}
              </div>
            )}

            {/* Notes override */}
            {sections.notes && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Notes override <span className="text-slate-400 font-normal">(optional — leave blank to use job notes)</span>
                </label>
                <textarea
                  value={notesOverride}
                  onChange={e => setNotesOverride(e.target.value)}
                  rows={3}
                  placeholder="Enter custom notes for this report…"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-colors"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
                <AlertTriangle size={13} className="shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || !selectedJob}
              className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Loader2 size={14} className="animate-spin" />Generating…</>
              ) : (
                <><FileText size={14} />Generate Report</>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
