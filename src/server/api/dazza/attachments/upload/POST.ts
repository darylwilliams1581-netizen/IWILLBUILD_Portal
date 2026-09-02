/**
 * POST /api/dazza/attachments/upload
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload a text source file for Dazza to consult.
 *
 * Security:
 *   - Unauthenticated            → 401
 *   - Authenticated non-owner   → 403
 *   - Invalid file               → 400 with safe error message
 *   - File too large             → 413
 *
 * Stage 1 accepted types: .txt, .md, .json (UTF-8, no NUL bytes)
 * Max: 4 attachments per question, 10 MiB per file
 *
 * Deduplication: exact files (same owner + SHA-256) reuse the existing record.
 * The original safe display filename and metadata are preserved.
 *
 * Response:
 *   { attachmentId, safeFilename, sha256, byteLength, mimeType, deduplicated }
 *
 * NEVER:
 *   - Use the uploaded filename as a filesystem path
 *   - Expose storage credentials, internal keys, or private URLs
 *   - Log raw file contents
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import {
  validateAttachmentFile,
  storeAttachment,
  DAZZA_ATTACHMENT_MAX_BYTES,
} from '../../../../lib/dazza-attachment-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth: platform owner only ────────────────────────────────────────────
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    if (!ownerInfo.isPlatformOwner) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Dazza file attachments are restricted to the IWIllBUILD platform owner.',
      });
    }

    // ── Parse multipart ──────────────────────────────────────────────────────
    const parsed = await parseMultipartForm(req, {
      maxFileSize: DAZZA_ATTACHMENT_MAX_BYTES,
      maxFiles: 1,
      fileField: 'file',
    });

    if (parsed.limitError) {
      return res.status(413).json({
        error: 'file_too_large',
        message: parsed.limitError,
      });
    }

    const file = parsed.file;
    if (!file) {
      return res.status(400).json({
        error: 'no_file',
        message: 'No file was included in the request.',
      });
    }

    // ── Validate ─────────────────────────────────────────────────────────────
    const validation = validateAttachmentFile({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });

    if (!validation.ok) {
      return res.status(400).json({
        error: validation.code,
        message: validation.error,
      });
    }

    // ── conversationId from form fields (optional) ───────────────────────────
    const conversationId = parsed.fields.conversationId?.trim() || null;

    // ── Store (with deduplication) ───────────────────────────────────────────
    // companyId: resolve from owner's profile — use 0 as sentinel for platform owner
    // (platform owner may not have a company_id in the normal sense)
    const result = await storeAttachment({
      ownerUserId: ownerInfo.userId,
      companyId: 0,
      conversationId,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
    });

    return res.status(200).json({
      attachmentId: result.attachmentId,
      safeFilename: result.safeFilename,
      sha256: result.sha256,
      byteLength: result.byteLength,
      mimeType: result.mimeType,
      deduplicated: result.deduplicated,
    });

  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dazza/attachments/upload] error:', msg);
    // Never expose internal paths, storage keys, or credentials in error responses
    return res.status(500).json({
      error: 'upload_failed',
      message: 'File upload failed. Please try again.',
    });
  }
}
