/**
 * Shared file-upload helpers for the Files MVP.
 * Uses busboy directly instead of multer — multer's concat-stream dependency
 * breaks prototype chains when bundled by Rollup (TypeError: this.on is not a
 * function at new ConcatStream), crashing the published server on any upload.
 *
 * parseMultipartForm() is a drop-in replacement for the multer middleware
 * pattern used across all upload handlers.
 */
import type { Request } from 'express';
import Busboy from 'busboy';

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Allowed MIME types → canonical extension
export const ALLOWED_MIMES: Record<string, string> = {
  'application/pdf':                                                          'pdf',
  'image/jpeg':                                                               'jpg',
  'image/png':                                                                'png',
  'application/msword':                                                       'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':  'docx',
  'application/vnd.ms-excel':                                                 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':        'xlsx',
  'text/csv':                                                                 'csv',
  'text/plain':                                                               'txt',
  'application/zip':                                                          'zip',
  'application/x-zip-compressed':                                             'zip',
};

// Blocked extensions (executables / scripts)
const BLOCKED_EXTS = new Set([
  'exe','bat','cmd','sh','ps1','msi','dmg','app','bin','com','vbs','js','ts',
  'py','rb','pl','php','jar','class','dll','so','dylib',
]);

export function isBlockedExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return BLOCKED_EXTS.has(ext);
}

export function isHeic(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'heic' || ext === 'heif';
}

export function extForMime(mime: string): string {
  return ALLOWED_MIMES[mime] ?? 'bin';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Parsed file shape (mirrors Express.Multer.File) ───────────────────────────
export interface ParsedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface ParseMultipartResult {
  /** First file found (for single-file uploads) */
  file: ParsedFile | null;
  /** All files found (for multi-file uploads) */
  files: ParsedFile[];
  /** Non-file form fields */
  fields: Record<string, string>;
  /** Set if the file exceeded maxFileSize */
  limitError: string | null;
}

/**
 * Parse a multipart/form-data request using busboy.
 * Replaces multer.memoryStorage() across all upload handlers.
 *
 * @param req         Express request
 * @param opts.maxFileSize   Max bytes per file (default: MAX_FILE_SIZE)
 * @param opts.maxFiles      Max number of files (default: 1)
 * @param opts.fileField     Expected file field name (default: any)
 */
export function parseMultipartForm(
  req: Request,
  opts: { maxFileSize?: number; maxFiles?: number; fileField?: string } = {},
): Promise<ParseMultipartResult> {
  const maxFileSize = opts.maxFileSize ?? MAX_FILE_SIZE;
  const maxFiles    = opts.maxFiles ?? 1;

  return new Promise((resolve, reject) => {
    const result: ParseMultipartResult = {
      file: null,
      files: [],
      fields: {},
      limitError: null,
    };

    let bb: ReturnType<typeof Busboy>;
    try {
      bb = Busboy({
        headers: req.headers as Record<string, string>,
        limits: { fileSize: maxFileSize, files: maxFiles },
      });
    } catch (err) {
      return reject(err);
    }

    bb.on('file', (fieldname, stream, info) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];
      let truncated = false;

      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => {
        if (truncated) {
          result.limitError = `File too large — maximum is ${formatBytes(maxFileSize)}.`;
          // drain remaining data
          return;
        }
        const buffer = Buffer.concat(chunks);
        const parsed: ParsedFile = {
          fieldname,
          originalname: filename,
          mimetype: mimeType,
          buffer,
          size: buffer.length,
        };
        result.files.push(parsed);
        if (!result.file) result.file = parsed;
      });
    });

    bb.on('field', (name, value) => {
      result.fields[name] = value;
    });

    bb.on('finish', () => resolve(result));
    bb.on('error', (err: Error) => reject(err));

    req.pipe(bb);
  });
}

/**
 * Attach parsed multipart result back onto the Express request so handlers
 * that reference req.file / req.files / req.body continue to work unchanged.
 */
export function attachToRequest(
  req: Request,
  result: ParseMultipartResult,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = req as any;
  r.file  = result.file   ?? undefined;
  r.files = result.files;
  // Merge fields into req.body (busboy doesn't populate req.body)
  r.body  = { ...(r.body ?? {}), ...result.fields };
}
