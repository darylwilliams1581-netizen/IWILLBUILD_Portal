/**
 * ProgramOfWorksView — canonical Program of Works UI.
 *
 * Used by:
 *   - JobProgress.tsx (job tab ?tab=progress)
 *   - job-progress-page.tsx (standalone /jobs/:id/progress)
 *
 * Features:
 *   - Sections (create, rename, reorder, delete-when-empty)
 *   - Activities (create, edit, duplicate, delete, reorder up/down, move between sections)
 *   - Desktop table: Seq | Activity | Start | Finish | Duration | Progress | Status | Responsible | Notes | Actions
 *   - Mobile cards: full-width, touch-friendly, 44px targets
 *   - Overall progress bar (arithmetic mean of activity percentages)
 *   - Section progress bars
 *   - Zero financial fields
 */
import { useState, useCallback, useRef } from 'react';
import {
  Plus, ChevronUp, ChevronDown, Pencil, Copy, Trash2,
  FolderPlus, AlertCircle,
  GripVertical, ChevronRight, ChevronDown as ChevronDownIcon,
} from 'lucide-react';
import type { ProgressSection, ProgressActivity } from '@/lib/pow-types';
import {
  calcDuration, fmtDuration, calcOverallPct, calcSectionPct,
} from '@/lib/pow-types';
import ActivityForm, { type ActivityFormValues } from './ActivityForm';
import SectionForm, { type SectionFormValues } from './SectionForm';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  jobId: number;
  sections: ProgressSection[];
  activities: ProgressActivity[];
  loading: boolean;
  // Callbacks — parent owns the API calls and state
  onCreateSection: (values: SectionFormValues) => Promise<void>;
  onEditSection: (sectionId: number, values: SectionFormValues) => Promise<void>;
  onDeleteSection: (sectionId: number) => Promise<void>;
  onReorderSections: (ids: number[]) => Promise<void>;
  onCreateActivity: (values: ActivityFormValues) => Promise<void>;
  onEditActivity: (activityId: number, values: ActivityFormValues) => Promise<void>;
  onDeleteActivity: (activityId: number) => Promise<void>;
  onDuplicateActivity: (activityId: number) => Promise<void>;
  onReorderActivities: (ids: number[]) => Promise<void>;
  /** Quick inline % update (slider on desktop row) */
  onUpdatePct: (activityId: number, pct: number) => Promise<void>;
}

// ── Date formatter ────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  // Strip time component if present (e.g. "2026-08-24T00:00:00.000Z" → "2026-08-24")
  const dateOnly = d.slice(0, 10);
  try {
    const [y, m, day] = dateOnly.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateOnly;
  }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, small }: { pct: number; small?: boolean }) {
  const h = small ? 'h-1.5' : 'h-2';
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-primary' : pct > 0 ? 'bg-amber-400' : 'bg-muted';
  return (
    <div className={`w-full ${h} rounded-full bg-muted/50 overflow-hidden`}>
      <div className={`${h} rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ActivityStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${STATUS_CLASSES[status]}`}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────

function ConfirmDelete({ message, onConfirm, onCancel, loading }: {
  message: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
      <p className="text-xs text-red-700 flex items-center gap-1.5">
        <AlertCircle size={12} /> {message}
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-xs border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
        <button onClick={onConfirm} disabled={loading} className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
          {loading ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProgramOfWorksView({
  jobId,
  sections,
  activities,
  loading,
  onCreateSection,
  onEditSection,
  onDeleteSection,
  onReorderSections,
  onCreateActivity,
  onEditActivity,
  onDeleteActivity,
  onDuplicateActivity,
  onReorderActivities,
  onUpdatePct,
}: Props) {
  const overallPct = calcOverallPct(activities);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [addingSection, setAddingSection] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [deletingSectionId, setDeletingSectionId] = useState<number | null>(null);
  const [addingActivitySectionId, setAddingActivitySectionId] = useState<number | 'unsectioned' | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [savingSection, setSavingSection] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [deletingSection, setDeletingSection] = useState(false);
  const [deletingActivity, setDeletingActivity] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [reorderingId, setReorderingId] = useState<number | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function activitiesForSection(sectionId: number | null) {
    return activities.filter((a) => (sectionId === null ? a.sectionId == null : a.sectionId === sectionId));
  }

  function toggleCollapse(sectionId: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
      return next;
    });
  }

  // ── Section reorder ───────────────────────────────────────────────────────────

  async function moveSectionUp(idx: number) {
    if (idx === 0) return;
    const ids = sections.map((s) => s.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    setReorderingId(sections[idx].id);
    try { await onReorderSections(ids); } finally { setReorderingId(null); }
  }

  async function moveSectionDown(idx: number) {
    if (idx === sections.length - 1) return;
    const ids = sections.map((s) => s.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    setReorderingId(sections[idx].id);
    try { await onReorderSections(ids); } finally { setReorderingId(null); }
  }

  // ── Activity reorder ──────────────────────────────────────────────────────────

  async function moveActivityUp(activityId: number) {
    const idx = activities.findIndex((a) => a.id === activityId);
    if (idx <= 0) return;
    const ids = activities.map((a) => a.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    setReorderingId(activityId);
    try { await onReorderActivities(ids); } finally { setReorderingId(null); }
  }

  async function moveActivityDown(activityId: number) {
    const idx = activities.findIndex((a) => a.id === activityId);
    if (idx < 0 || idx === activities.length - 1) return;
    const ids = activities.map((a) => a.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    setReorderingId(activityId);
    try { await onReorderActivities(ids); } finally { setReorderingId(null); }
  }

  // ── Section handlers ──────────────────────────────────────────────────────────

  async function handleCreateSection(values: SectionFormValues) {
    setSavingSection(true); setSectionError('');
    try { await onCreateSection(values); setAddingSection(false); }
    catch (e) { setSectionError(e instanceof Error ? e.message : 'Failed to create section'); }
    finally { setSavingSection(false); }
  }

  async function handleEditSection(sectionId: number, values: SectionFormValues) {
    setSavingSection(true); setSectionError('');
    try { await onEditSection(sectionId, values); setEditingSectionId(null); }
    catch (e) { setSectionError(e instanceof Error ? e.message : 'Failed to update section'); }
    finally { setSavingSection(false); }
  }

  async function handleDeleteSection(sectionId: number) {
    setDeletingSection(true); setSectionError('');
    try { await onDeleteSection(sectionId); setDeletingSectionId(null); }
    catch (e) { setSectionError(e instanceof Error ? e.message : 'Failed to delete section'); }
    finally { setDeletingSection(false); }
  }

  // ── Activity handlers ─────────────────────────────────────────────────────────

  async function handleCreateActivity(values: ActivityFormValues) {
    setSavingActivity(true); setActivityError('');
    try { await onCreateActivity(values); setAddingActivitySectionId(null); }
    catch (e) { setActivityError(e instanceof Error ? e.message : 'Failed to create activity'); }
    finally { setSavingActivity(false); }
  }

  async function handleEditActivity(activityId: number, values: ActivityFormValues) {
    setSavingActivity(true); setActivityError('');
    try { await onEditActivity(activityId, values); setEditingActivityId(null); }
    catch (e) { setActivityError(e instanceof Error ? e.message : 'Failed to update activity'); }
    finally { setSavingActivity(false); }
  }

  async function handleDeleteActivity(activityId: number) {
    setDeletingActivity(true); setActivityError('');
    try { await onDeleteActivity(activityId); setDeletingActivityId(null); }
    catch (e) { setActivityError(e instanceof Error ? e.message : 'Failed to delete activity'); }
    finally { setDeletingActivity(false); }
  }

  async function handleDuplicate(activityId: number) {
    setReorderingId(activityId);
    try { await onDuplicateActivity(activityId); }
    finally { setReorderingId(null); }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderActivityRow(a: ProgressActivity, globalIdx: number, isFirst: boolean, isLast: boolean) {
    const dur = calcDuration(a.startDate, a.endDate);
    const isEditing = editingActivityId === a.id;
    const isDeleting = deletingActivityId === a.id;
    const isReordering = reorderingId === a.id;

    const editInitial: Partial<ActivityFormValues> = {
      description: a.description,
      sectionId: a.sectionId ?? null,
      progressNote: a.progressNote ?? '',
      startDate: a.startDate ?? '',
      endDate: a.endDate ?? '',
      percentComplete: a.percentComplete,
      assignedToName: a.assignedToName ?? '',
      tradeType: a.tradeType ?? '',
    };

    return (
      <div key={a.id} className={`border-b border-border last:border-0 ${isReordering ? 'opacity-50' : ''}`}>
        {/* ── Desktop row ── */}
        <div className="hidden lg:grid items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors"
          style={{ gridTemplateColumns: '28px minmax(120px,1fr) 90px 90px 70px 140px 90px 108px' }}>
          {/* Seq */}
          <span className="text-xs text-muted-foreground font-mono">{globalIdx + 1}</span>
          {/* Activity */}
          <span className="text-sm font-medium text-foreground truncate" title={a.description}>{a.description}</span>
          {/* Start */}
          <span className="text-xs text-muted-foreground">{fmtDate(a.startDate)}</span>
          {/* Finish */}
          <span className="text-xs text-muted-foreground">{fmtDate(a.endDate)}</span>
          {/* Duration */}
          <span className="text-xs text-muted-foreground">{fmtDuration(dur) || '—'}</span>
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            <ProgressBar pct={a.percentComplete} small />
            <span className={`text-xs font-semibold w-8 text-right ${a.percentComplete === 100 ? 'text-emerald-600' : 'text-foreground'}`}>{a.percentComplete}%</span>
          </div>
          {/* Notes */}
          <span className="text-xs text-muted-foreground truncate" title={a.progressNote ?? ''}>{a.progressNote || '—'}</span>
          {/* Actions */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => moveActivityUp(a.id)}
              disabled={isFirst || isReordering}
              title="Move up"
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            ><ChevronUp size={12} /></button>
            <button
              onClick={() => moveActivityDown(a.id)}
              disabled={isLast || isReordering}
              title="Move down"
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            ><ChevronDown size={12} /></button>
            <button
              onClick={() => { setEditingActivityId(a.id); setDeletingActivityId(null); }}
              title="Edit"
              className="p-1 rounded hover:bg-muted transition-colors"
            ><Pencil size={12} /></button>
            <button
              onClick={() => handleDuplicate(a.id)}
              title="Duplicate"
              className="p-1 rounded hover:bg-muted transition-colors"
            ><Copy size={12} /></button>
            <button
              onClick={() => { setDeletingActivityId(a.id); setEditingActivityId(null); }}
              title="Delete"
              className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
            ><Trash2 size={12} /></button>
          </div>
        </div>

        {/* ── Mobile card ── */}
        <div className="lg:hidden px-3 py-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground font-mono shrink-0">{globalIdx + 1}</span>
              <span className="text-sm font-semibold text-foreground leading-snug">{a.description}</span>
            </div>
          </div>

          {/* Dates + Duration */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
            {a.startDate && <span>Start: <strong className="text-foreground">{fmtDate(a.startDate)}</strong></span>}
            {a.endDate && <span>Finish: <strong className="text-foreground">{fmtDate(a.endDate)}</strong></span>}
            {dur !== null && <span>Duration: <strong className="text-foreground">{fmtDuration(dur)}</strong></span>}
          </div>

          {/* Progress */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className={`text-xs font-bold ${a.percentComplete === 100 ? 'text-emerald-600' : ''}`}>{a.percentComplete}%</span>
            </div>
            <ProgressBar pct={a.percentComplete} />
          </div>

          {a.progressNote && (
            <p className="text-xs text-muted-foreground italic mb-2">{a.progressNote}</p>
          )}

          {/* Mobile actions — 44px touch targets */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => moveActivityUp(a.id)}
              disabled={isFirst || isReordering}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Move up"
            ><ChevronUp size={16} /></button>
            <button
              onClick={() => moveActivityDown(a.id)}
              disabled={isLast || isReordering}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Move down"
            ><ChevronDown size={16} /></button>
            <button
              onClick={() => { setEditingActivityId(a.id); setDeletingActivityId(null); }}
              className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-xs"
            ><Pencil size={14} /> Edit</button>
            <button
              onClick={() => handleDuplicate(a.id)}
              className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-xs"
            ><Copy size={14} /> Copy</button>
            <button
              onClick={() => { setDeletingActivityId(a.id); setEditingActivityId(null); }}
              className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-xs"
            ><Trash2 size={14} /> Delete</button>
          </div>
        </div>

        {/* Edit form */}
        {isEditing && (
          <div className="px-3 pb-3 bg-muted/10 border-t border-border">
            <div className="pt-3">
              <ActivityForm
                sections={sections}
                initial={editInitial}
                saving={savingActivity}
                error={activityError}
                onSave={(values) => handleEditActivity(a.id, values)}
                onCancel={() => setEditingActivityId(null)}
                submitLabel="Save changes"
              />
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {isDeleting && (
          <div className="px-3 pb-3">
            <ConfirmDelete
              message="Delete this activity? This cannot be undone."
              onConfirm={() => handleDeleteActivity(a.id)}
              onCancel={() => setDeletingActivityId(null)}
              loading={deletingActivity}
            />
          </div>
        )}
      </div>
    );
  }

  function renderSection(section: ProgressSection | null, sectionIdx: number) {
    const sectionId = section?.id ?? null;
    const sectionActivities = activitiesForSection(sectionId);
    const isCollapsed = sectionId !== null && collapsedSections.has(sectionId);
    const sectionPct = sectionId !== null ? calcSectionPct(activities, sectionId) : null;
    const isEditingSection = editingSectionId === sectionId;
    const isDeletingSection = deletingSectionId === sectionId;
    const isAddingActivity = addingActivitySectionId === (sectionId ?? 'unsectioned');
    const isFirstSection = sectionIdx === 0;
    const isLastSection = sectionIdx === sections.length - 1;

    return (
      <div key={sectionId ?? 'unsectioned'} className="border border-border rounded-xl overflow-hidden mb-3">
        {/* Section header */}
        {section ? (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 border-b border-border">
            <button
              onClick={() => toggleCollapse(section.id)}
              className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDownIcon size={14} />}
            </button>
            <div className="flex-1 min-w-0">
              {isEditingSection ? (
                <SectionForm
                  initial={{ title: section.title }}
                  saving={savingSection}
                  error={sectionError}
                  onSave={(values) => handleEditSection(section.id, values)}
                  onCancel={() => setEditingSectionId(null)}
                  submitLabel="Save"
                />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground">{section.title}</span>
                  {sectionPct !== null && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <ProgressBar pct={sectionPct} small />
                      <span className="text-xs font-semibold text-muted-foreground w-8">{sectionPct}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {!isEditingSection && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => moveSectionUp(sectionIdx)}
                  disabled={isFirstSection || reorderingId === section.id}
                  title="Move section up"
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                ><ChevronUp size={13} /></button>
                <button
                  onClick={() => moveSectionDown(sectionIdx)}
                  disabled={isLastSection || reorderingId === section.id}
                  title="Move section down"
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                ><ChevronDown size={13} /></button>
                <button
                  onClick={() => { setEditingSectionId(section.id); setDeletingSectionId(null); }}
                  title="Rename section"
                  className="p-1.5 rounded hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                ><Pencil size={13} /></button>
                <button
                  onClick={() => { setDeletingSectionId(section.id); setEditingSectionId(null); }}
                  title="Delete section"
                  className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                ><Trash2 size={13} /></button>
              </div>
            )}
          </div>
        ) : (
          /* Unsectioned group header */
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/10 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unsectioned</span>
            <span className="text-xs text-muted-foreground">({sectionActivities.length})</span>
          </div>
        )}

        {/* Delete section confirm */}
        {isDeletingSection && section && (
          <div className="px-3 py-2 bg-red-50/50">
            <ConfirmDelete
              message={sectionActivities.length > 0
                ? `Move or delete all ${sectionActivities.length} activities before deleting this section.`
                : 'Delete this section? This cannot be undone.'}
              onConfirm={() => handleDeleteSection(section.id)}
              onCancel={() => setDeletingSectionId(null)}
              loading={deletingSection}
            />
          </div>
        )}

        {/* Activities */}
        {!isCollapsed && (
          <>
            {/* Desktop table header */}
            {sectionActivities.length > 0 && (
              <div className="hidden lg:grid items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
                style={{ gridTemplateColumns: '28px minmax(120px,1fr) 90px 90px 70px 140px 90px 108px' }}>
                <span>#</span>
                <span>Activity</span>
                <span>Start</span>
                <span>Finish</span>
                <span>Duration</span>
                <span>Progress</span>
                <span>Notes</span>
                <span>Actions</span>
              </div>
            )}

            {sectionActivities.length === 0 && !isAddingActivity && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No activities yet.{' '}
                <button
                  onClick={() => setAddingActivitySectionId(sectionId ?? 'unsectioned')}
                  className="text-primary underline hover:no-underline"
                >Add one</button>
              </div>
            )}

            {sectionActivities.map((a, localIdx) => {
              const globalIdx = activities.findIndex((x) => x.id === a.id);
              const isFirst = globalIdx === 0;
              const isLast = globalIdx === activities.length - 1;
              return renderActivityRow(a, globalIdx, isFirst, isLast);
            })}

            {/* Add activity form */}
            {isAddingActivity && (
              <div className="px-3 py-3 bg-muted/10 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2">New activity</p>
                <ActivityForm
                  sections={sections}
                  initial={{ sectionId: sectionId ?? null }}
                  saving={savingActivity}
                  error={activityError}
                  onSave={handleCreateActivity}
                  onCancel={() => setAddingActivitySectionId(null)}
                  submitLabel="Add activity"
                />
              </div>
            )}

            {/* Add activity button */}
            {!isAddingActivity && (
              <div className="px-3 py-2 border-t border-border/50">
                <button
                  onClick={() => { setAddingActivitySectionId(sectionId ?? 'unsectioned'); setActivityError(''); }}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-semibold transition-colors min-h-[36px]"
                >
                  <Plus size={13} /> Add activity
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Overall progress header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-card border border-border rounded-xl">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-foreground">Overall Progress</span>
            <span className="text-lg font-black text-primary">{overallPct}%</span>
          </div>
          <ProgressBar pct={overallPct} />
          <p className="text-xs text-muted-foreground mt-1">
            {activities.length} {activities.length === 1 ? 'activity' : 'activities'} ·{' '}
            {activities.filter((a) => a.percentComplete === 100).length} complete
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setAddingSection(true); setSectionError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors min-h-[36px]"
          >
            <FolderPlus size={13} /> Add section
          </button>
          <button
            onClick={() => { setAddingActivitySectionId('unsectioned'); setActivityError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors min-h-[36px]"
          >
            <Plus size={13} /> Add activity
          </button>
        </div>
      </div>

      {/* Add section form */}
      {addingSection && (
        <div className="p-4 bg-card border border-border rounded-xl">
          <p className="text-xs font-semibold text-muted-foreground mb-2">New section</p>
          <SectionForm
            saving={savingSection}
            error={sectionError}
            onSave={handleCreateSection}
            onCancel={() => setAddingSection(false)}
            submitLabel="Create section"
          />
        </div>
      )}

      {/* Sections */}
      {sections.map((s, idx) => renderSection(s, idx))}

      {/* Unsectioned group — always rendered last */}
      {renderSection(null, -1)}

      {/* Empty state */}
      {activities.length === 0 && sections.length === 0 && !addingSection && addingActivitySectionId === null && (
        <div className="text-center py-12 text-muted-foreground">
          <GripVertical size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold mb-1">No program of works yet</p>
          <p className="text-xs mb-4">Add sections to organise your work, then add activities to each section.</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setAddingSection(true)}
              className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted transition-colors"
            ><FolderPlus size={14} /> Add section</button>
            <button
              onClick={() => setAddingActivitySectionId('unsectioned')}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
            ><Plus size={14} /> Add activity</button>
          </div>
        </div>
      )}
    </div>
  );
}
