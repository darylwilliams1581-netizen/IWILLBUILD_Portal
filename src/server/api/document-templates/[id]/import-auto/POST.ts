/**
 * POST /api/document-templates/:id/import-auto
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-detecting import controller.
 *
 * Accepts a single multipart field "file" containing either a DOCX or PDF.
 * Performs authoritative server-side detection from the file's actual bytes,
 * then delegates to the existing import handlers without duplicating any
 * conversion logic.
 *
 * Detection rules (server-side, authoritative)
 * ─────────────────────────────────────────────
 * PDF   — first 4 bytes are  25 50 44 46  (%PDF)
 * DOCX  — first 4 bytes are  50 4B 03 04  (ZIP magic) AND the buffer
 *          contains "[Content_Types].xml" and "word/document.xml"
 * .doc  — first 8 bytes match OLE2 magic  D0 CF 11 E0 A1 B1 1A E1
 *
 * Routing
 * ────────
 * DOCX → existing import-docx handler (convert_blocks_v2 by default)
 * PDF  → existing import-pdf handler
 *
 * Neither conversion implementation is duplicated here.
 * The pre-parsed escape hatch in parseMultipartForm is used so the downstream
 * handlers skip busboy and use the already-parsed buffer directly.
 *
 * Failure behaviour
 * ──────────────────
 * All errors return JSON { error: string } — never HTML.
 * No partial document or orphaned assets are created on failure.
 *
 * Multipart form
 * ──────────────
 * Field "file"  — the document (DOCX or PDF)
 * Field "mode"  — optional; forwarded to import-docx (default: convert_blocks_v2)
 */

import type { Request, Response } from 'express';
import { parseMultipartForm, type PreParsedUpload } from '../../../../lib/file-upload.js';
import importDocxHandler from '../import-docx/POST.js';
import importPdfHandler  from '../import-pdf/POST.js';

// ── Magic byte constants ───────────────────────────────────────────────────────

const PDF_MAGIC  = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const ZIP_MAGIC  = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK\x03\x04
const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);

function bufStartsWith(buf: Buffer, magic: Buffer): boolean {
  if (buf.length < magic.length) return false;
  return magic.every((b, i) => buf[i] === b);
}

type ServerDetectedType = 'pdf' | 'docx' | 'doc' | 'unknown';

interface ServerDetectionResult {
  type: ServerDetectedType;
  error?: string;
}

function detectFromBuffer(buf: Buffer, originalName: string): ServerDetectionResult {
  const ext = (originalName.split('.').pop() ?? '').toLowerCase();

  // ── PDF ────────────────────────────────────────────────────────────────────
  if (bufStartsWith(buf, PDF_MAGIC)) {
    if (ext === 'docx' || ext === 'dotx') {
      return { type: 'unknown', error: "This file's contents do not match its extension. Select a valid DOCX or PDF." };
    }
    return { type: 'pdf' };
  }

  // ── ZIP-based (DOCX / DOTX) ────────────────────────────────────────────────
  if (bufStartsWith(buf, ZIP_MAGIC)) {
    const text = buf.toString('binary');
    const hasContentTypes = text.includes('[Content_Types].xml');
    const hasWordDoc      = text.includes('word/document.xml');

    if (!hasContentTypes || !hasWordDoc) {
      if (ext === 'pdf') {
        return { type: 'unknown', error: "This file's contents do not match its extension. Select a valid DOCX or PDF." };
      }
      return { type: 'unknown', error: 'This DOCX file is damaged or incomplete.' };
    }

    if (ext === 'pdf') {
      return { type: 'unknown', error: "This file's contents do not match its extension. Select a valid DOCX or PDF." };
    }

    return { type: 'docx' };
  }

  // ── Old binary .doc (OLE2) ─────────────────────────────────────────────────
  if (bufStartsWith(buf, OLE2_MAGIC)) {
    return { type: 'doc', error: 'Old Word .doc files are not supported. Save the document as .docx and try again.' };
  }

  // ── Corrupt / wrong extension ──────────────────────────────────────────────
  if (ext === 'pdf')              return { type: 'unknown', error: 'This PDF file is damaged or unsupported.' };
  if (ext === 'docx' || ext === 'dotx') return { type: 'unknown', error: 'This DOCX file is damaged or incomplete.' };

  return { type: 'unknown', error: 'This file type is not supported. Select a DOCX or PDF.' };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // Parse the multipart upload — field name is "file"
    const { files, fields, limitError } = await parseMultipartForm(req, {
      maxFileSize: 50 * 1024 * 1024,
    });

    if (limitError) {
      res.status(413).json({ error: limitError });
      return;
    }

    const fileEntry = files.find((f) => f.fieldname === 'file') ?? files[0];
    if (!fileEntry?.buffer) {
      res.status(400).json({ error: 'No file uploaded. Provide a DOCX or PDF in the "file" field.' });
      return;
    }

    const fileBuffer   = fileEntry.buffer;
    const originalName = fileEntry.originalname ?? 'upload';
    const mode         = (fields['mode'] as string | undefined) ?? 'convert_blocks_v2';

    // ── Server-side authoritative detection ───────────────────────────────────
    const detection = detectFromBuffer(fileBuffer, originalName);

    if (detection.error) {
      res.status(422).json({ error: detection.error });
      return;
    }

    // ── Route to existing handlers via pre-parsed escape hatch ────────────────
    // Attach the already-parsed data so the downstream handler's parseMultipartForm
    // call returns immediately without re-reading the (already consumed) stream.

    if (detection.type === 'docx') {
      const preParsed: PreParsedUpload = {
        files: [{
          fieldname:    'docx',
          originalname: originalName,
          mimetype:     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer:       fileBuffer,
          size:         fileBuffer.length,
        }],
        fields: { mode },
      };
      (req as Request & { _preParsed?: PreParsedUpload })._preParsed = preParsed;
      return importDocxHandler(req, res);
    }

    if (detection.type === 'pdf') {
      const preParsed: PreParsedUpload = {
        files: [{
          fieldname:    'pdf',
          originalname: originalName,
          mimetype:     'application/pdf',
          buffer:       fileBuffer,
          size:         fileBuffer.length,
        }],
        fields: {},
      };
      (req as Request & { _preParsed?: PreParsedUpload })._preParsed = preParsed;
      return importPdfHandler(req, res);
    }

    // Should not reach here
    res.status(422).json({ error: 'This file type is not supported. Select a DOCX or PDF.' });
  } catch (err) {
    console.error('[import-auto] unexpected error:', err);
    res.status(500).json({ error: 'Import failed — please try again.' });
  }
}
