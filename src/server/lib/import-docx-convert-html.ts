/**
 * import-docx-convert-html.ts
 * ────────────────────────────
 * Extracted convert_html logic for POST /api/document-templates/:id/import-docx.
 *
 * Separated from the route handler so it can be unit-tested without Vite
 * struggling to resolve the [id] bracket path.
 *
 * Responsibilities:
 *   1. Run convertDocxToHtml (mammoth + table enricher)
 *   2. Upload each extracted image to the doc-assets bucket; substitute
 *      placeholder URLs in the sanitised HTML with real public URLs
 *   3. Upload the original DOCX bytes as the silent recovery source
 *   4. Write html_content / import_css / import_report / source_type='html' to DB
 *   5. On any DB failure: delete all uploaded assets best-effort (rollback)
 *
 * Returns the full response payload so Studio can open immediately without
 * a second GET request.
 */

import { nanoid } from 'nanoid';
import { convertDocxToHtml } from './docx-to-html.js';
import type { ImportReport } from './docx-to-html.js';
import { validateDocxEmbeddedImage } from '../storage/uploadPolicy.js';

/** Bucket for images extracted from DOCX documents */
export const BUCKET_DOC_ASSETS = 'doc-assets';

/**
 * Build a server-generated storage key for a DOCX embedded image.
 *
 * The key is derived entirely from server-controlled values — companyId,
 * templateId, a cryptographically random nanoid, and the magic-detected
 * extension.  The DOCX relationship filename is never used.
 *
 * Format: `{companyId}/{templateId}/{nanoid(12)}.{safeExt}`
 */
function buildDocxImageKey(companyId: number, templateId: number, safeExt: string): string {
  return `${companyId}/${templateId}/${nanoid(12)}.${safeExt}`;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ─── Injected dependencies (passed in so tests can mock them) ─────────────────

export interface ConvertHtmlDeps {
  /** db.execute — accepts a raw SQL object */
  dbExecute: (q: { sql: string }) => Promise<unknown>;
  /** Upload DOCX bytes as recovery source */
  uploadSourceDocument: (
    buffer: Buffer,
    opts: { companyId: number; templateId: number; revision: number; originalName: string; mimeType: string },
  ) => Promise<{ storageKey: string; sha256: string; sizeBytes: number; publicUrl: string }>;
  /** Delete a source document (best-effort cleanup) */
  deleteSourceDocument: (storageKey: string) => Promise<void>;
  /** Save a file to a named bucket */
  saveFile: (input: {
    bucket: string;
    storageKey: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    skipValidation?: boolean;
  }) => Promise<{ storageKey: string; publicUrl: string }>;
  /** Delete a file from a named bucket (best-effort cleanup) */
  deleteFile: (storageKey: string, bucket: string) => Promise<void>;
}

export interface ConvertHtmlInput {
  docxBuffer: Buffer;
  originalName: string;
  templateId: number;
  companyId: number;
  userId: string;
  currentRevision: number;
}

export interface ConvertHtmlSuccess {
  ok: true;
  payload: {
    mode: 'convert_html';
    sourceDocxName: string;
    sha256: string;
    revision: number;
    sizeBytes: number;
    imageCount: number;
    html: string;
    css: string;
    report: ImportReport;
  };
}

export interface ConvertHtmlError {
  ok: false;
  status: 422 | 500;
  error: string;
}

export type ConvertHtmlResult = ConvertHtmlSuccess | ConvertHtmlError;

// ─── Main function ────────────────────────────────────────────────────────────

export async function runConvertHtml(
  input: ConvertHtmlInput,
  deps: ConvertHtmlDeps,
): Promise<ConvertHtmlResult> {
  const { docxBuffer, originalName, templateId, companyId, userId, currentRevision } = input;

  // ── Step 1: Convert DOCX → HTML ────────────────────────────────────────────
  let convResult: Awaited<ReturnType<typeof convertDocxToHtml>>;
  try {
    convResult = await convertDocxToHtml(docxBuffer, templateId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 422, error: `DOCX conversion failed: ${msg}` };
  }

  const { images, report } = convResult;
  let { html, css } = convResult;

  // Track all storage keys written so we can roll back on DB failure
  const uploadedKeys: Array<{ storageKey: string; bucket: string }> = [];

  // ── Step 2: Upload extracted images → substitute placeholders ──────────────
  for (const img of images) {
    try {
      // ── CP10A6: Treat every DOCX-extracted image as untrusted user content ──
      //
      // The DOCX relationship filename, declared content-type, and extension
      // must NOT be trusted.  validateDocxEmbeddedImage() detects the actual
      // type from magic bytes and permits only JPEG, PNG, and WebP.
      const validation = validateDocxEmbeddedImage(img.buffer);
      if (!validation.ok) {
        // Non-fatal: skip this image, leave placeholder in HTML, log and continue.
        // The document is still usable — the placeholder will remain as a broken
        // image rather than silently storing a potentially dangerous file.
        console.warn(
          `[import-docx/convert_html] embedded image rejected (${validation.code}): ${validation.error}`,
          { assetKey: img.assetKey, declaredContentType: img.contentType },
        );
        continue;
      }

      // Use magic-detected MIME and safe extension — never the DOCX-declared values
      const { detectedMime, safeExt } = validation;

      // Generate the storage key server-side from validated type — never from DOCX metadata
      const imgKey = buildDocxImageKey(companyId, templateId, safeExt);

      const saved = await deps.saveFile({
        bucket: BUCKET_DOC_ASSETS,
        storageKey: imgKey,
        buffer: img.buffer,
        mimeType: detectedMime,
        originalName: `embedded-image.${safeExt}`,
        // No skipValidation — the gate in saveFile() will run IMAGE_POLICY
        // for doc-assets and confirm magic bytes match the declared MIME.
        // This is intentional belt-and-suspenders: validateDocxEmbeddedImage
        // already ran, but the storage gate provides an independent check.
      });
      uploadedKeys.push({ storageKey: saved.storageKey, bucket: BUCKET_DOC_ASSETS });
      // Replace placeholder with real public URL in HTML
      html = html.split(img.placeholder).join(saved.publicUrl);
    } catch (imgErr) {
      // Non-fatal: leave placeholder in HTML; log and continue
      console.warn(`[import-docx/convert_html] image upload failed for ${img.assetKey}:`, imgErr);
    }
  }

  // ── Step 3: Upload DOCX as silent recovery source ──────────────────────────
  const newRevision = currentRevision + 1;
  let recoveryUpload: { storageKey: string; sha256: string; sizeBytes: number; publicUrl: string };
  try {
    recoveryUpload = await deps.uploadSourceDocument(docxBuffer, {
      companyId,
      templateId,
      revision: newRevision,
      originalName,
      mimeType: DOCX_MIME,
    });
    uploadedKeys.push({ storageKey: recoveryUpload.storageKey, bucket: 'source-documents' });
  } catch (uploadErr) {
    await cleanupUploads(uploadedKeys, deps);
    const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
    return { ok: false, status: 500, error: `Failed to store recovery copy: ${msg}` };
  }

  // ── Step 4: Persist to DB (atomic — rollback on failure) ───────────────────
  const safe = (s: string) => s.replace(/'/g, "''");
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const reportJson = JSON.stringify(report);

  try {
    await deps.dbExecute({
      sql: `UPDATE document_templates SET
         source_type       = 'html',
         source_file_key   = '${safe(recoveryUpload.storageKey)}',
         source_file_name  = '${safe(originalName)}',
         source_mime_type  = '${safe(DOCX_MIME)}',
         source_sha256     = '${safe(recoveryUpload.sha256)}',
         source_revision   = ${newRevision},
         source_updated_at = '${now}',
         html_content      = '${safe(html)}',
         import_css        = '${safe(css)}',
         import_report     = '${safe(reportJson)}',
         rendered_pdf_key  = NULL,
         updated_at        = '${now}'
       WHERE id = ${templateId}`,
    });
  } catch (dbErr) {
    await cleanupUploads(uploadedKeys, deps);
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    return { ok: false, status: 500, error: `Failed to save document: ${msg}` };
  }

  // ── Step 5: Insert revision history (non-fatal) ────────────────────────────
  await deps.dbExecute({
    sql: `INSERT INTO document_template_revisions
       (template_id, company_id, revision, source_type, source_file_key,
        source_file_name, source_mime_type, source_sha256, file_size_bytes,
        uploaded_by, uploaded_at)
     VALUES
       (${templateId}, ${companyId}, ${newRevision}, 'html',
        '${safe(recoveryUpload.storageKey)}', '${safe(originalName)}', '${safe(DOCX_MIME)}',
        '${safe(recoveryUpload.sha256)}', ${recoveryUpload.sizeBytes},
        '${safe(userId)}', '${now}')`,
  }).catch((e: unknown) => {
    console.warn('[import-docx/convert_html] revision history insert failed:', e);
  });

  return {
    ok: true,
    payload: {
      mode: 'convert_html',
      sourceDocxName: originalName,
      sha256: recoveryUpload.sha256,
      revision: newRevision,
      sizeBytes: recoveryUpload.sizeBytes,
      imageCount: images.length,
      html,
      css,
      report,
    },
  };
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

async function cleanupUploads(
  keys: Array<{ storageKey: string; bucket: string }>,
  deps: ConvertHtmlDeps,
): Promise<void> {
  await Promise.allSettled(
    keys.map(({ storageKey, bucket }) => {
      if (bucket === 'source-documents') {
        return deps.deleteSourceDocument(storageKey);
      }
      return deps.deleteFile(storageKey, bucket);
    }),
  );
}
