/**
 * POST /api/plan-manager/upload
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified, server-side Plan upload transaction.
 *
 * Accepts multipart/form-data with:
 *   file           — required PDF (field name "file")
 *   title          — required string
 *   jobId          — required integer (job must belong to the authenticated company)
 *   drawingNumber  — optional string  e.g. "A-001"
 *   revisionName   — optional string  e.g. "A", "Draft"
 *   discipline     — optional string  e.g. "Architectural"
 *   docStatusLabel — optional string  e.g. "For Construction"
 *
 * Server-side sequence (all within one request):
 *   1. Authenticate + resolve company from session
 *   2. Verify job belongs to company
 *   3. Validate PDF (mime + extension)
 *   4. Write PDF to /shared-storage/public/assets/drawings/
 *   5. INSERT project_drawings record
 *   6. INSERT drawing_revisions record + UPDATE current_revision_id
 *   7. UPDATE project_drawings with source_file_path + page_count
 *   8. INSERT job_drawing_links record
 *   9. INSERT drawing_audit_log entry
 *  10. Return { drawingId, revisionId, jobId, url }
 *
 * Server-side rollback (reverse order, scoped to this request only):
 *   If step 8 fails → delete job link (if any), delete revision, delete drawing, delete file
 *   If step 7 fails → delete revision, delete drawing, delete file
 *   If step 6 fails → delete drawing, delete file
 *   If step 5 fails → delete file
 *   File deletion is best-effort: logs on failure, does NOT expose storage paths in errors.
 *   Rollback does NOT use the public permanent-delete HTTP endpoint.
 *   Rollback does NOT require admin/owner role.
 *   The original error is always preserved and returned to the caller.
 *
 * Permissions:
 *   Any authenticated user with a valid company membership may upload.
 *   (Matches the permission model of the existing plan-manager POST/upload endpoints.)
 *
 * Storage:
 *   Reuses the same UPLOAD_DIR, naming convention, and page-count detection
 *   as POST /api/plan-manager/drawings/:id/upload.
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { parseMultipartForm } from '../../../lib/file-upload.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const UPLOAD_DIR = '/shared-storage/public/assets/drawings';
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

// ── Rollback helpers ──────────────────────────────────────────────────────────
// Each helper is best-effort: logs on failure, never throws.

async function rollbackFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (e) {
    // Log without exposing the full path in case it contains sensitive info
    console.warn('[plan-upload] rollback: file delete failed (best-effort):', (e as Error).message);
  }
}

async function rollbackDrawing(drawingId: number): Promise<void> {
  try {
    // Remove child records first (FK constraints), then the drawing itself.
    // This is scoped to the newly created drawing — it will not touch any
    // pre-existing records because drawingId was just inserted in this request.
    await db.execute(sql`DELETE FROM drawing_audit_log WHERE drawing_id = ${drawingId}`);
    await db.execute(sql`DELETE FROM drawing_revisions WHERE drawing_id = ${drawingId}`);
    await db.execute(sql`DELETE FROM job_drawing_links WHERE drawing_id = ${drawingId}`);
    await db.execute(sql`DELETE FROM project_drawings WHERE id = ${drawingId}`);
  } catch (e) {
    console.warn('[plan-upload] rollback: drawing delete failed (best-effort):', (e as Error).message);
  }
}

async function rollbackRevision(revisionId: number): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM drawing_revisions WHERE id = ${revisionId}`);
  } catch (e) {
    console.warn('[plan-upload] rollback: revision delete failed (best-effort):', (e as Error).message);
  }
}

async function rollbackJobLink(drawingId: number, jobId: number): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM job_drawing_links WHERE drawing_id = ${drawingId} AND job_id = ${jobId}
    `);
  } catch (e) {
    console.warn('[plan-upload] rollback: job-link delete failed (best-effort):', (e as Error).message);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // Track what has been created so rollback knows what to clean up
  let writtenFilePath: string | null = null;
  let createdDrawingId: number | null = null;
  let createdRevisionId: number | null = null;
  let createdJobLink = false;

  try {
    // ── 1. Authenticate ───────────────────────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const companyId = profile.companyId;

    // ── 2. Parse multipart ────────────────────────────────────────────────────
    const parsed = await parseMultipartForm(req, { maxFileSize: MAX_PDF_SIZE, fileField: 'file' });
    if (parsed.limitError) return res.status(413).json({ error: parsed.limitError });

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'A plan file (PDF) is required.' });

    // Extract text fields from parsed form fields
    const fields = parsed.fields as Record<string, string>;
    const title          = (fields.title          ?? '').trim();
    const jobIdRaw       = (fields.jobId           ?? '').trim();
    const drawingNumber  = (fields.drawingNumber   ?? '').trim() || null;
    const revisionName   = (fields.revisionName    ?? '').trim() || 'Draft';
    const discipline     = (fields.discipline      ?? '').trim() || null;
    const docStatusLabel = (fields.docStatusLabel  ?? '').trim() || null;

    if (!title) return res.status(400).json({ error: 'Drawing title is required.' });

    const jobId = parseInt(jobIdRaw, 10);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'A valid job must be selected.' });
    }

    // ── 3. Validate PDF ───────────────────────────────────────────────────────
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'pdf' && file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are supported.' });
    }

    // ── 2b. Verify job belongs to company ─────────────────────────────────────
    const [jobRows] = await db.execute(sql`
      SELECT id, name, job_number FROM jobs
      WHERE id = ${jobId} AND company_id = ${companyId} AND status != 'deleted'
      LIMIT 1
    `) as unknown as [Array<{ id: number; name: string; job_number: string | null }>];

    if (!jobRows?.length) {
      return res.status(404).json({ error: 'Job not found or does not belong to your company.' });
    }

    // ── 4. Write PDF to storage ───────────────────────────────────────────────
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const safeName = `drawing-upload-${crypto.randomBytes(8).toString('hex')}.pdf`;
    const filePath = path.join(UPLOAD_DIR, safeName);
    await fs.writeFile(filePath, file.buffer);
    writtenFilePath = filePath;

    const publicUrl = `/airo-assets/uploads/drawings/${safeName}`;

    // Detect page count
    let pageCount = 1;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
    } catch {
      try {
        const text = file.buffer.toString('latin1');
        const match = text.match(/\/N\s+(\d+)|\/Count\s+(\d+)/);
        if (match) pageCount = parseInt(match[1] ?? match[2] ?? '1', 10) || 1;
      } catch { /* keep pageCount = 1 */ }
    }

    // ── 5. Create drawing record ──────────────────────────────────────────────
    let drawingId: number;
    try {
      const [result] = await db.execute(sql`
        INSERT INTO project_drawings
          (company_id, project_id, name, title, description, status,
           drawing_number, discipline, doc_status_label, created_by)
        VALUES
          (${companyId}, NULL, ${title}, ${title}, NULL, 'active',
           ${drawingNumber}, ${discipline}, ${docStatusLabel}, ${session.user.id})
      `) as unknown as [{ insertId: number }];
      drawingId = (result as unknown as { insertId: number }).insertId;
      createdDrawingId = drawingId;
    } catch (e) {
      // File written but drawing not created — roll back file
      await rollbackFile(writtenFilePath);
      writtenFilePath = null;
      throw e;
    }

    // ── 6. Create initial revision + link to drawing ──────────────────────────
    let revisionId: number;
    try {
      const [revResult] = await db.execute(sql`
        INSERT INTO drawing_revisions (drawing_id, revision_no, name, source_type, created_by, is_current)
        VALUES (${drawingId}, 1, ${revisionName}, 'draft', ${session.user.id}, 1)
      `) as unknown as [{ insertId: number }];
      revisionId = (revResult as unknown as { insertId: number }).insertId;
      createdRevisionId = revisionId;

      await db.execute(sql`
        UPDATE project_drawings SET current_revision_id = ${revisionId} WHERE id = ${drawingId}
      `);
    } catch (e) {
      await rollbackDrawing(drawingId);
      createdDrawingId = null;
      await rollbackFile(writtenFilePath);
      writtenFilePath = null;
      throw e;
    }

    // ── 7. Attach file path + page count to drawing ───────────────────────────
    try {
      await db.execute(sql`
        UPDATE project_drawings
        SET source_file_path = ${publicUrl},
            source_file_name = ${file.originalname},
            page_count       = ${pageCount},
            updated_at       = NOW()
        WHERE id = ${drawingId}
      `);
    } catch (e) {
      // Revision exists but file path not recorded — roll back revision + drawing + file
      await rollbackRevision(revisionId);
      createdRevisionId = null;
      await rollbackDrawing(drawingId);
      createdDrawingId = null;
      await rollbackFile(writtenFilePath);
      writtenFilePath = null;
      throw e;
    }

    // ── 8. Link drawing to job ────────────────────────────────────────────────
    try {
      await db.execute(sql`
        INSERT INTO job_drawing_links (job_id, drawing_id, context_note, created_by)
        VALUES (${jobId}, ${drawingId}, NULL, ${session.user.id})
        ON DUPLICATE KEY UPDATE context_note = VALUES(context_note)
      `);
      createdJobLink = true;
    } catch (e) {
      // Everything created but job link failed — roll back all
      await rollbackRevision(revisionId);
      createdRevisionId = null;
      await rollbackDrawing(drawingId);
      createdDrawingId = null;
      await rollbackFile(writtenFilePath);
      writtenFilePath = null;
      throw e;
    }

    // ── 9. Audit log (best-effort — never fail the request) ───────────────────
    try {
      await db.execute(sql`
        INSERT INTO drawing_audit_log (drawing_id, revision_id, actor_id, action, details_json)
        VALUES (${drawingId}, ${revisionId}, ${session.user.id}, 'created',
                ${JSON.stringify({
                  title,
                  drawingNumber,
                  discipline,
                  docStatusLabel,
                  revisionName,
                  fileName: file.originalname,
                  sizeBytes: file.size,
                  pageCount,
                  jobId,
                  source: 'unified-upload',
                })})
      `);
    } catch (auditErr) {
      console.warn('[plan-upload] audit log insert failed (non-fatal):', (auditErr as Error).message);
    }

    // ── 10. Success ───────────────────────────────────────────────────────────
    return res.status(201).json({
      drawingId,
      revisionId,
      jobId,
      url: publicUrl,
      pageCount,
      title,
    });

  } catch (err) {
    // If we reach here with partial state still set, something in the rollback
    // chain itself threw — log the residual state for manual cleanup.
    if (createdJobLink || createdRevisionId !== null || createdDrawingId !== null || writtenFilePath !== null) {
      console.error('[plan-upload] PARTIAL STATE after rollback failure:', {
        writtenFile: writtenFilePath ? '[path redacted]' : null,
        drawingId: createdDrawingId,
        revisionId: createdRevisionId,
        jobLink: createdJobLink,
      });
    }

    console.error('POST /api/plan-manager/upload error:', err);
    const message = err instanceof Error ? err.message : 'Failed to upload plan';
    if (!res.headersSent) return res.status(500).json({ error: message });
  }
}
