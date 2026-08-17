/**
 * planUploadOrchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * Single shared function for the Plan Manager upload sequence.
 * Used by both:
 *   - PlanUploadModal (standalone /plan-manager page)
 *   - JobPlanManagerTab (job-scoped Drawings tab)
 *
 * Sequence:
 *   1. POST /api/plan-manager/drawings          → create record
 *   2. POST /api/plan-manager/drawings/:id/upload → upload file
 *   3. POST /api/plan-manager/drawings/:id/job-links → link to job
 *
 * Rollback:
 *   If step 2 or step 3 fails, the orphan drawing record is deleted via
 *   DELETE /api/plan-manager/drawings/:id/permanent before the error is
 *   re-thrown. This prevents unlinked/orphan drawing records.
 *
 *   Rollback is best-effort: if the DELETE itself fails (e.g. network error),
 *   the error is logged but the original error is still thrown so the caller
 *   can surface it to the user. The orphan record will be cleaned up by the
 *   next admin purge or can be manually deleted.
 *
 * File requirement:
 *   `file` is required. The caller must validate this before calling.
 *   Passing a null file throws immediately (no record is created).
 */

export interface PlanUploadParams {
  title: string;
  drawingNumber?: string;
  revisionName?: string;
  discipline?: string;
  docStatusLabel?: string;
  file: File;          // required — caller must validate before calling
  jobId: number;       // required — caller must validate before calling
}

export interface PlanUploadResult {
  drawingId: number;
  revisionId: number;
}

/**
 * Rollback helper — deletes an orphan drawing record.
 * Best-effort: logs but does not throw on failure.
 */
async function rollbackDrawing(drawingId: number, reason: string): Promise<void> {
  try {
    const res = await fetch(`/api/plan-manager/drawings/${drawingId}/permanent`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      console.warn(`[planUploadOrchestrator] Rollback DELETE ${drawingId} returned ${res.status} (${reason})`);
    } else {
      console.info(`[planUploadOrchestrator] Rolled back drawing ${drawingId} after: ${reason}`);
    }
  } catch (rollbackErr) {
    console.error(`[planUploadOrchestrator] Rollback DELETE ${drawingId} threw:`, rollbackErr);
  }
}

export async function uploadPlan(params: PlanUploadParams): Promise<PlanUploadResult> {
  const { title, drawingNumber, revisionName, discipline, docStatusLabel, file, jobId } = params;

  // Guard: file is required
  if (!file) throw new Error('A plan file is required.');
  if (!title.trim()) throw new Error('Drawing title is required.');
  if (!jobId) throw new Error('A job must be selected.');

  // ── Step 1: Create drawing record ─────────────────────────────────────────
  const createRes = await fetch('/api/plan-manager/drawings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      title:          title.trim(),
      drawingNumber:  drawingNumber?.trim()  || undefined,
      revisionName:   revisionName?.trim()   || undefined,
      discipline:     discipline?.trim()     || undefined,
      docStatusLabel: docStatusLabel?.trim() || undefined,
    }),
  });

  const createData = await createRes.json() as { id?: number; revisionId?: number; error?: string };
  if (!createRes.ok || !createData.id) {
    throw new Error(createData.error ?? 'Failed to create drawing record.');
  }
  const drawingId   = createData.id;
  const revisionId  = createData.revisionId ?? 0;

  // ── Step 2: Upload file ───────────────────────────────────────────────────
  try {
    const form = new FormData();
    form.append('file', file);
    const uploadRes = await fetch(`/api/plan-manager/drawings/${drawingId}/upload`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!uploadRes.ok) {
      const ud = await uploadRes.json() as { error?: string };
      throw new Error(ud.error ?? 'File upload failed.');
    }
  } catch (uploadErr) {
    await rollbackDrawing(drawingId, String(uploadErr));
    throw uploadErr;
  }

  // ── Step 3: Link to job ───────────────────────────────────────────────────
  try {
    const linkRes = await fetch(`/api/plan-manager/drawings/${drawingId}/job-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ jobId }),
    });
    if (!linkRes.ok) {
      const ld = await linkRes.json() as { error?: string };
      throw new Error(ld.error ?? 'Failed to link drawing to job.');
    }
  } catch (linkErr) {
    await rollbackDrawing(drawingId, String(linkErr));
    throw linkErr;
  }

  return { drawingId, revisionId };
}
