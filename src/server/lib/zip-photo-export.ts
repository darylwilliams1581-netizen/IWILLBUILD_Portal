/**
 * zip-photo-export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared ZIP-export helper for job photos.
 *
 * Used by:
 *   POST /api/jobs/:id/photos/export-zip   — single-job export (existing)
 *   POST /api/lens/photos/export-zip       — cross-job Lens selection (new)
 *
 * Design decisions:
 *   - Buffers the full ZIP in memory (JSZip nodebuffer) — same as the original
 *     endpoint. Streaming JSZip output is complex and not needed at current
 *     photo volumes. Revisit if exports regularly exceed ~500 MB.
 *   - Reads originals from the active storage provider via getDownloadStream.
 *   - Never creates a permanent ZIP in R2 / local storage.
 *   - Never modifies photo or job records.
 *   - Organises multi-job archives into safe sub-folders.
 *   - Deduplicates filenames within each folder with a numeric suffix.
 *   - Sanitises all folder names and filenames to prevent path traversal.
 */

import JSZip from 'jszip';
import { getDownloadStream, BUCKET_JOB_PHOTOS } from '../storage/storage-service.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhotoRow {
  id: number;
  jobId: number;
  filename: string;
  originalName: string | null;
  mimeType: string | null;
}

export interface JobMeta {
  id: number;
  name: string | null;
  jobNumber: string | null;
}

export interface ZipBuildResult {
  buffer: Buffer;
  /** Suggested Content-Disposition filename (already sanitised) */
  zipFilename: string;
}

// ── Sanitisation ──────────────────────────────────────────────────────────────

/**
 * Sanitise a string for use as a ZIP entry name component.
 * Strips path separators and control characters; collapses runs of unsafe
 * chars to underscores; trims leading/trailing dots and spaces.
 */
export function sanitiseZipName(raw: string, maxLen = 80): string {
  return raw
    .replace(/[/\\:*?"<>|]/g, '_')   // path-traversal and Windows-illegal chars
    .replace(/[\x00-\x1f\x7f]/g, '') // control characters
    .replace(/\.{2,}/g, '_')          // double-dots (directory traversal)
    .replace(/_{2,}/g, '_')           // collapse repeated underscores
    .replace(/^[.\s]+|[.\s]+$/g, '')  // leading/trailing dots and spaces
    .slice(0, maxLen)
    || 'photo';
}

/**
 * Build a safe folder label for a job.
 * Format: "JOB-001 Kitchen" or "Job-42" if no number.
 */
export function jobFolderName(job: JobMeta): string {
  const num  = job.jobNumber ? `JOB-${job.jobNumber}` : `Job-${job.id}`;
  const name = job.name ? ` ${job.name}` : '';
  return sanitiseZipName(`${num}${name}`, 60);
}

/**
 * Build a safe archive entry filename, deduplicating within a seen-names set.
 * Appends _2, _3, … before the extension when a name is already taken.
 */
export function dedupeFilename(
  raw: string,
  seen: Set<string>,
): string {
  const safe = sanitiseZipName(raw, 120);
  if (!seen.has(safe)) {
    seen.add(safe);
    return safe;
  }
  // Split at last dot to insert suffix before extension
  const dotIdx = safe.lastIndexOf('.');
  const base   = dotIdx >= 0 ? safe.slice(0, dotIdx) : safe;
  const ext    = dotIdx >= 0 ? safe.slice(dotIdx)    : '';
  let counter  = 2;
  while (counter < 10_000) {
    const candidate = `${base}_${counter}${ext}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
    counter++;
  }
  // Extremely unlikely fallback
  const fallback = `${base}_${Date.now()}${ext}`;
  seen.add(fallback);
  return fallback;
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build a ZIP buffer from an array of photo rows.
 *
 * @param photos   Rows to include (already validated for company ownership).
 * @param jobMap   Map of jobId → JobMeta for folder naming.
 * @param multiJob When true, organise into per-job sub-folders.
 */
export async function buildPhotoZip(
  photos: PhotoRow[],
  jobMap: Map<number, JobMeta>,
  multiJob: boolean,
): Promise<Buffer> {
  const zip = new JSZip();

  // Per-folder seen-name sets to track duplicates independently per folder
  const seenByFolder = new Map<string, Set<string>>();

  for (const photo of photos) {
    try {
      const { stream } = await getDownloadStream(photo.filename, BUCKET_JOB_PHOTOS);

      // Determine archive entry path
      const rawName = photo.originalName ?? `photo-${photo.id}.jpg`;
      let entryPath: string;

      if (multiJob) {
        const job    = jobMap.get(photo.jobId);
        const folder = job ? jobFolderName(job) : 'No Job';
        if (!seenByFolder.has(folder)) seenByFolder.set(folder, new Set());
        const seen   = seenByFolder.get(folder)!;
        const fname  = dedupeFilename(rawName, seen);
        entryPath    = `${folder}/${fname}`;
      } else {
        if (!seenByFolder.has('root')) seenByFolder.set('root', new Set());
        const seen  = seenByFolder.get('root')!;
        entryPath   = dedupeFilename(rawName, seen);
      }

      // Collect stream into buffer
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        (stream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
        (stream as NodeJS.ReadableStream).on('end', resolve);
        (stream as NodeJS.ReadableStream).on('error', reject);
      });

      zip.file(entryPath, Buffer.concat(chunks));
    } catch (e) {
      console.warn(`zip-photo-export: skipping photo ${photo.id}:`, e);
    }
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 5 },
  });
}

// ── ZIP filename builders ─────────────────────────────────────────────────────

/** Whole-job ZIP filename: JOB-001_Kitchen_Photos_2026-08-17.zip */
export function wholeJobZipFilename(job: JobMeta, date: string): string {
  const num  = job.jobNumber ? `JOB-${sanitiseZipName(job.jobNumber, 20)}` : `Job-${job.id}`;
  const name = job.name ? `_${sanitiseZipName(job.name, 40)}` : '';
  return `${num}${name}_Photos_${date}.zip`;
}

/** Mixed-selection ZIP filename: IWIllBUILD_Lens_Photos_2026-08-17.zip */
export function lensSelectionZipFilename(date: string): string {
  return `IWIllBUILD_Lens_Photos_${date}.zip`;
}

/** ISO date string YYYY-MM-DD in local time (server uses UTC; close enough) */
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
