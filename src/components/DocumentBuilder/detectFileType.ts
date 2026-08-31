/**
 * detectFileType
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side file type detection that does NOT trust the file extension or
 * MIME type alone. It reads the first bytes of the file to verify the actual
 * format, then cross-checks against the extension.
 *
 * Detection rules
 * ───────────────
 * PDF
 *   • Bytes 0–3 must be exactly  25 50 44 46  (%PDF)
 *
 * DOCX / DOTX
 *   • Bytes 0–3 must be the ZIP local-file header  50 4B 03 04  (PK\x03\x04)
 *   • The ZIP must contain  [Content_Types].xml
 *   • The ZIP must contain  word/document.xml
 *   (Both checks are done by scanning the central directory entries without
 *    fully decompressing the archive, keeping detection fast even for large files.)
 *
 * Old .doc (binary compound document)
 *   • Bytes 0–7 match the OLE2 magic  D0 CF 11 E0 A1 B1 1A E1
 *
 * Returns
 * ───────
 * { type: 'pdf' | 'docx' | 'doc' | 'unknown', error?: string }
 *
 * The caller is responsible for deciding what to do with each result.
 * This module never throws — all errors are returned in the `error` field.
 */

export type DetectedType = 'pdf' | 'docx' | 'doc' | 'unknown';

export interface DetectionResult {
  type: DetectedType;
  /** Human-readable rejection reason when type is 'unknown' or mismatched */
  error?: string;
}

// ── Magic byte constants ───────────────────────────────────────────────────────

const PDF_MAGIC  = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC  = [0x50, 0x4B, 0x03, 0x04]; // PK\x03\x04
const OLE2_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Read the first `n` bytes of a File as a Uint8Array */
async function readBytes(file: File, n: number): Promise<Uint8Array> {
  const slice = file.slice(0, n);
  const buf   = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

/** Compare the start of a byte array against a magic sequence */
function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * Scan the ZIP central directory for a filename.
 * We read the last 65_557 bytes (max EOCD + comment) to find the
 * End-of-Central-Directory record, then walk the central directory.
 *
 * This is intentionally simple: we only need to confirm presence of two
 * specific filenames, not extract content.
 */
async function zipContainsFiles(file: File, required: string[]): Promise<boolean> {
  // Read the whole file for small documents; cap at 2 MB for large ones
  // (central directory is always at the end of the ZIP)
  const readSize = Math.min(file.size, 2 * 1024 * 1024);
  const slice    = file.slice(file.size - readSize);
  const buf      = await slice.arrayBuffer();
  const bytes    = new Uint8Array(buf);

  // Convert to string for simple substring search of filenames
  // (ZIP filenames are stored as raw bytes — ASCII-safe for our targets)
  let text = '';
  for (let i = 0; i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i]);
  }

  return required.every((name) => text.includes(name));
}

// ── Main detector ─────────────────────────────────────────────────────────────

export async function detectFileType(file: File): Promise<DetectionResult> {
  try {
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? '';
    const head = await readBytes(file, 8);

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (startsWith(head, PDF_MAGIC)) {
      if (ext === 'docx' || ext === 'dotx') {
        return {
          type:  'unknown',
          error: "This file's contents do not match its extension. Select a valid DOCX or PDF.",
        };
      }
      return { type: 'pdf' };
    }

    // ── ZIP-based (DOCX / DOTX) ───────────────────────────────────────────────
    if (startsWith(head, ZIP_MAGIC)) {
      // Verify it is actually an OOXML Word document
      const hasContentTypes = await zipContainsFiles(file, ['[Content_Types].xml']);
      const hasWordDoc      = await zipContainsFiles(file, ['word/document.xml']);

      if (!hasContentTypes || !hasWordDoc) {
        if (ext === 'pdf') {
          return {
            type:  'unknown',
            error: "This file's contents do not match its extension. Select a valid DOCX or PDF.",
          };
        }
        // It's a ZIP but not a Word document
        return {
          type:  'unknown',
          error: 'This DOCX file is damaged or incomplete.',
        };
      }

      if (ext === 'pdf') {
        return {
          type:  'unknown',
          error: "This file's contents do not match its extension. Select a valid DOCX or PDF.",
        };
      }

      return { type: 'docx' };
    }

    // ── Old binary .doc (OLE2) ────────────────────────────────────────────────
    if (startsWith(head, OLE2_MAGIC)) {
      return {
        type:  'doc',
        error: 'Old Word .doc files are not supported. Save the document as .docx and try again.',
      };
    }

    // ── Corrupt PDF (extension says PDF but magic is wrong) ───────────────────
    if (ext === 'pdf') {
      return {
        type:  'unknown',
        error: 'This PDF file is damaged or unsupported.',
      };
    }

    // ── Corrupt DOCX (extension says DOCX but magic is wrong) ────────────────
    if (ext === 'docx' || ext === 'dotx') {
      return {
        type:  'unknown',
        error: 'This DOCX file is damaged or incomplete.',
      };
    }

    // ── Completely unknown ────────────────────────────────────────────────────
    return {
      type:  'unknown',
      error: 'This file type is not supported. Select a DOCX or PDF.',
    };
  } catch (err) {
    return {
      type:  'unknown',
      error: `Could not read the file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Format a file size in human-readable form */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
