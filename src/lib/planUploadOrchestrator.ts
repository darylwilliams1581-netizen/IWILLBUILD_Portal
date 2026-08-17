/**
 * planUploadOrchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin client wrapper around the unified server-side upload endpoint.
 *
 * POST /api/plan-manager/upload
 *   - Accepts multipart/form-data
 *   - Server handles: create record → upload file → create revision → link job
 *   - Server handles rollback if any step fails
 *   - Returns { drawingId, revisionId, jobId, url, pageCount, title }
 *
 * This replaces the old three-request browser-side sequence.
 * Only PlanUploadModal consumes this function.
 */

export interface PlanUploadParams {
  title: string;
  drawingNumber?: string;
  revisionName?: string;
  discipline?: string;
  docStatusLabel?: string;
  file: File;     // required — caller must validate before calling
  jobId: number;  // required — caller must validate before calling
}

export interface PlanUploadResult {
  drawingId: number;
  revisionId: number;
  jobId: number;
  url: string;
  pageCount: number;
  title: string;
}

export async function uploadPlan(params: PlanUploadParams): Promise<PlanUploadResult> {
  const { title, drawingNumber, revisionName, discipline, docStatusLabel, file, jobId } = params;

  if (!file)        throw new Error('A plan file is required.');
  if (!title.trim()) throw new Error('Drawing title is required.');
  if (!jobId)       throw new Error('A job must be selected.');

  const form = new FormData();
  form.append('file',           file);
  form.append('title',          title.trim());
  form.append('jobId',          String(jobId));
  if (drawingNumber?.trim())  form.append('drawingNumber',  drawingNumber.trim());
  if (revisionName?.trim())   form.append('revisionName',   revisionName.trim());
  if (discipline?.trim())     form.append('discipline',     discipline.trim());
  if (docStatusLabel?.trim()) form.append('docStatusLabel', docStatusLabel.trim());

  const res = await fetch('/api/plan-manager/upload', {
    method: 'POST',
    credentials: 'include',
    body: form,
    // Do NOT set Content-Type — browser sets it with the correct boundary
  });

  const data = await res.json() as Partial<PlanUploadResult> & { error?: string };

  if (!res.ok || !data.drawingId) {
    throw new Error(data.error ?? `Upload failed (HTTP ${res.status})`);
  }

  return {
    drawingId:  data.drawingId!,
    revisionId: data.revisionId ?? 0,
    jobId:      data.jobId ?? jobId,
    url:        data.url ?? '',
    pageCount:  data.pageCount ?? 1,
    title:      data.title ?? title,
  };
}
