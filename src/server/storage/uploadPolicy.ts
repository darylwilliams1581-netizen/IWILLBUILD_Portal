/**
 * uploadPolicy.ts — Central upload-policy enforcement (CP10A2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all upload validation rules.
 *
 * WHAT THIS MODULE DOES:
 *   - Defines per-category upload policies (size, MIME, extension, magic bytes)
 *   - Validates file buffers against magic bytes (not just browser-supplied MIME)
 *   - Rejects executable formats, HTML, unvalidated SVG, and MIME mismatches
 *   - Produces safe Content-Disposition headers
 *   - Never trusts the browser-supplied MIME type alone
 *
 * PHYSICAL vs LOGICAL MODEL:
 *   - Policies are keyed by LogicalNamespace (object-key prefix)
 *   - The physical R2 bucket is always R2_BUCKET — never encoded here
 *
 * USAGE:
 *   import { validateUploadPolicy, getContentDisposition } from './uploadPolicy.js';
 *   const result = validateUploadPolicy(file, 'job-photos');
 *   if (!result.ok) return res.status(400).json({ error: result.error });
 */

import type { LogicalNamespace } from './r2Config.js';

// ── Magic byte signatures ─────────────────────────────────────────────────────

interface MagicSignature {
  /** Expected bytes at the given offset */
  bytes: number[];
  /** Byte offset to check (default 0) */
  offset?: number;
  /** MIME type this signature identifies */
  mime: string;
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  // JPEG: FF D8 FF
  { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mime: 'image/png' },
  // WebP: RIFF????WEBP
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }, // RIFF header — confirmed by offset 8
  // GIF: GIF87a or GIF89a
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
  // PDF: %PDF
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  // ZIP (covers DOCX, XLSX, ODT, ODS — all ZIP-based)
  { bytes: [0x50, 0x4B, 0x03, 0x04], mime: 'application/zip' },
  // ZIP empty archive variant
  { bytes: [0x50, 0x4B, 0x05, 0x06], mime: 'application/zip' },
  // DOC/XLS (OLE2 compound document): D0 CF 11 E0 A1 B1 1A E1
  { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], mime: 'application/msword' },
  // HEIC/HEIF: ftyp box at offset 4 — bytes 4-7 are 'ftyp'
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, mime: 'image/heic' },
  // EXE/DLL: MZ header
  { bytes: [0x4D, 0x5A], mime: 'application/x-msdownload' },
  // ELF (Linux executable)
  { bytes: [0x7F, 0x45, 0x4C, 0x46], mime: 'application/x-elf' },
  // Mach-O (macOS executable)
  { bytes: [0xFE, 0xED, 0xFA, 0xCE], mime: 'application/x-mach-binary' },
  { bytes: [0xFE, 0xED, 0xFA, 0xCF], mime: 'application/x-mach-binary' },
  { bytes: [0xCE, 0xFA, 0xED, 0xFE], mime: 'application/x-mach-binary' },
  { bytes: [0xCF, 0xFA, 0xED, 0xFE], mime: 'application/x-mach-binary' },
  // Java class file
  { bytes: [0xCA, 0xFE, 0xBA, 0xBE], mime: 'application/java-vm' },
  // Script shebang (#!)
  { bytes: [0x23, 0x21], mime: 'text/x-shellscript' },
];

/** Executable / dangerous MIME types — always rejected */
const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-elf',
  'application/x-mach-binary',
  'application/java-vm',
  'text/x-shellscript',
  'application/x-sh',
  'application/x-bat',
  'application/x-msi',
  'application/x-dosexec',
  'text/html',           // HTML rejected unless explicitly handled (XSS risk)
  'image/svg+xml',       // SVG rejected unless explicitly sanitized (XSS risk)
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/typescript',
  'text/x-python',
  'application/x-python-code',
  'application/x-ruby',
  'application/x-perl',
  'application/x-php',
]);

/** Blocked file extensions — always rejected regardless of MIME */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'ps1', 'msi', 'dmg', 'app', 'bin', 'com', 'vbs',
  'js', 'ts', 'py', 'rb', 'pl', 'php', 'jar', 'class', 'dll', 'so', 'dylib',
  'html', 'htm', 'svg', 'xml',  // markup — rejected unless explicitly allowed
  'scr', 'pif', 'cpl', 'reg',   // Windows system files
  'lnk', 'url',                  // Windows shortcuts
]);

// ── MIME type sets ────────────────────────────────────────────────────────────

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
]);

const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
]);

const ALL_ALLOWED_MIMES = new Set([...IMAGE_MIMES, ...DOCUMENT_MIMES]);

// ── Policy definitions ────────────────────────────────────────────────────────

export interface UploadPolicy {
  /** Maximum file size in bytes */
  maxBytes: number;
  /** Allowed MIME types (after normalisation) */
  allowedMimes: Set<string>;
  /** Allowed file extensions (lowercase, without dot) */
  allowedExtensions: Set<string>;
  /** Whether inline rendering is allowed (Content-Disposition: inline vs attachment) */
  allowInline: boolean;
  /** Whether magic-byte validation is required */
  requireMagicMatch: boolean;
  /** Human-readable category name for error messages */
  categoryLabel: string;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip']);
const ALL_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS]);

const IMAGE_POLICY: UploadPolicy = {
  maxBytes:          10 * 1024 * 1024, // 10 MB
  allowedMimes:      IMAGE_MIMES,
  allowedExtensions: IMAGE_EXTENSIONS,
  allowInline:       true,
  requireMagicMatch: true,
  categoryLabel:     'image',
};

const DOCUMENT_POLICY: UploadPolicy = {
  maxBytes:          25 * 1024 * 1024, // 25 MB
  allowedMimes:      DOCUMENT_MIMES,
  allowedExtensions: DOCUMENT_EXTENSIONS,
  allowInline:       false,  // documents always attachment
  requireMagicMatch: true,
  categoryLabel:     'document',
};

const MIXED_POLICY: UploadPolicy = {
  maxBytes:          25 * 1024 * 1024,
  allowedMimes:      ALL_ALLOWED_MIMES,
  allowedExtensions: ALL_EXTENSIONS,
  allowInline:       false,
  requireMagicMatch: true,
  categoryLabel:     'file',
};

/** PDF-only policy for drawings (up to 50 MB) */
const PDF_ONLY_MIMES = new Set(['application/pdf']);
const PDF_ONLY_EXTENSIONS = new Set(['pdf']);
const DRAWING_POLICY: UploadPolicy = {
  maxBytes:          50 * 1024 * 1024, // 50 MB — drawings can be large
  allowedMimes:      PDF_ONLY_MIMES,
  allowedExtensions: PDF_ONLY_EXTENSIONS,
  allowInline:       true,
  requireMagicMatch: true,
  categoryLabel:     'drawing',
};

/**
 * Per-namespace upload policies.
 * Namespaces not listed here fall back to MIXED_POLICY.
 */
const NAMESPACE_POLICIES: Partial<Record<LogicalNamespace, UploadPolicy>> = {
  'job-photos':          IMAGE_POLICY,
  'job-card-photos':     IMAGE_POLICY,
  'am-asset-photos':     IMAGE_POLICY,
  'am-inspection-media': IMAGE_POLICY,
  'safety-posters':      IMAGE_POLICY,
  'doc-assets':          IMAGE_POLICY,
  'drawings':            DRAWING_POLICY,   // PDF-only, 50 MB (was IMAGE_POLICY — fixed CP10A5)
  'company-files':       MIXED_POLICY,
  'safety-documents':    DOCUMENT_POLICY,
  'source-documents':    DOCUMENT_POLICY,
  'sds-register':        DOCUMENT_POLICY,
  'dazza-sources':       DOCUMENT_POLICY,
  'form-media':          MIXED_POLICY,
  'fleet-files':         MIXED_POLICY,
  'form-attachments':    MIXED_POLICY,
  'incident-attachments':MIXED_POLICY,
  'profile-attachments': IMAGE_POLICY,
  'tender-attachments':  MIXED_POLICY,
  'bug-reports':         IMAGE_POLICY,
};

export function getPolicyForNamespace(namespace: LogicalNamespace): UploadPolicy {
  return NAMESPACE_POLICIES[namespace] ?? MIXED_POLICY;
}

// ── Magic byte detection ──────────────────────────────────────────────────────

/**
 * Detect the MIME type from magic bytes.
 * Returns null if no signature matches (e.g. plain text, CSV).
 */
export function detectMimeFromMagic(buffer: Buffer): string | null {
  if (buffer.length < 2) return null;

  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[offset + i] !== sig.bytes[i]) { match = false; break; }
    }
    if (match) {
      // Special case: WebP — confirm bytes 8-11 are 'WEBP'
      if (sig.mime === 'image/webp') {
        if (buffer.length < 12) continue;
        if (buffer[8] !== 0x57 || buffer[9] !== 0x45 || buffer[10] !== 0x42 || buffer[11] !== 0x50) continue;
      }
      return sig.mime;
    }
  }

  return null;
}

/**
 * Check whether a detected magic MIME is compatible with the declared MIME.
 * Returns true if they are compatible (same family or one is a ZIP-based format).
 */
export function isMagicCompatible(declaredMime: string, detectedMime: string | null): boolean {
  if (detectedMime === null) {
    // No magic match — acceptable for text-based formats (CSV, TXT, plain text)
    const textMimes = new Set(['text/csv', 'text/plain', 'text/x-csv', 'application/csv']);
    return textMimes.has(declaredMime);
  }

  // Exact match
  if (declaredMime === detectedMime) return true;

  // JPEG aliases
  if (detectedMime === 'image/jpeg' && (declaredMime === 'image/jpg' || declaredMime === 'image/jpeg')) return true;

  // HEIC/HEIF family
  const heicFamily = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
  if (detectedMime === 'image/heic' && heicFamily.has(declaredMime)) return true;

  // ZIP-based Office formats: DOCX, XLSX, ODT, ODS are all ZIP archives
  const zipBasedMimes = new Set([
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
  ]);
  if (detectedMime === 'application/zip' && zipBasedMimes.has(declaredMime)) return true;

  // OLE2 compound document: DOC and XLS share the same magic bytes
  const ole2Mimes = new Set([
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
  ]);
  if (detectedMime === 'application/msword' && ole2Mimes.has(declaredMime)) return true;

  return false;
}

// ── Validation result ─────────────────────────────────────────────────────────

export interface PolicyValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
  /** Normalised MIME type after magic-byte check */
  normalisedMime?: string;
}

// ── Core validation ───────────────────────────────────────────────────────────

export interface FileToValidate {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Validate a file against the policy for the given logical namespace.
 *
 * Checks (in order):
 *   1. Empty file
 *   2. Filename traversal / control characters
 *   3. Blocked extension
 *   4. Blocked MIME type
 *   5. Allowed MIME type (policy)
 *   6. Allowed extension (policy)
 *   7. Size limit (policy)
 *   8. Magic-byte validation (policy)
 *   9. MIME/magic mismatch
 *
 * Returns { ok: true, normalisedMime } on success.
 * Returns { ok: false, code, error } on failure.
 */
export function validateUploadPolicy(
  file: FileToValidate,
  namespace: LogicalNamespace,
): PolicyValidationResult {
  const policy = getPolicyForNamespace(namespace);

  // 1. Empty file
  if (!file.buffer || file.buffer.length === 0 || file.size === 0) {
    return { ok: false, code: 'empty_file', error: 'Empty files are not allowed.' };
  }

  // 2. Filename traversal / control characters
  const filenameError = validateFilename(file.originalname);
  if (filenameError) return { ok: false, code: 'invalid_filename', error: filenameError };

  // 3. Blocked extension
  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      code: 'blocked_extension',
      error: `"${file.originalname}" has a blocked file extension. Executable and script files are not allowed.`,
    };
  }

  // 4. Blocked MIME type (absolute reject — even if policy would allow it)
  if (BLOCKED_MIME_TYPES.has(file.mimetype)) {
    return {
      ok: false,
      code: 'blocked_mime',
      error: `"${file.originalname}" has a blocked content type.`,
    };
  }

  // 5. Allowed MIME type (policy)
  if (!policy.allowedMimes.has(file.mimetype)) {
    const allowed = [...policy.allowedMimes].map(m => m.split('/')[1]).join(', ');
    return {
      ok: false,
      code: 'unsupported_type',
      error: `"${file.originalname}" is not a supported ${policy.categoryLabel} type. Allowed: ${allowed}.`,
    };
  }

  // 6. Allowed extension (policy) — only check if file has an extension
  if (ext && !policy.allowedExtensions.has(ext)) {
    return {
      ok: false,
      code: 'unsupported_extension',
      error: `"${file.originalname}" has an unsupported file extension for this category.`,
    };
  }

  // 7. Size limit
  if (file.size > policy.maxBytes || file.buffer.length > policy.maxBytes) {
    const limitMB = Math.round(policy.maxBytes / (1024 * 1024));
    return {
      ok: false,
      code: 'file_too_large',
      error: `"${file.originalname}" exceeds the ${limitMB} MB limit.`,
    };
  }

  // 8 + 9. Magic-byte validation and MIME/magic mismatch
  if (policy.requireMagicMatch) {
    const detectedMime = detectMimeFromMagic(file.buffer);

    // Absolute reject: executable magic bytes regardless of declared MIME
    if (detectedMime && BLOCKED_MIME_TYPES.has(detectedMime)) {
      return {
        ok: false,
        code: 'blocked_magic',
        error: `"${file.originalname}" contains a blocked file signature.`,
      };
    }

    // MIME/magic mismatch
    if (!isMagicCompatible(file.mimetype, detectedMime)) {
      return {
        ok: false,
        code: 'mime_magic_mismatch',
        error: `"${file.originalname}" content does not match its declared type.`,
      };
    }
  }

  // 10. ZIP container validation (DOCX, XLSX, plain ZIP)
  //     Runs for every file whose magic bytes identify it as a ZIP archive,
  //     regardless of declared MIME.  This catches ZIP bombs, ZIP64 archives
  //     (which bypass our entry-count and ratio limits), and malformed Office
  //     documents that claim to be DOCX/XLSX but lack the required structure.
  const detectedForZip = detectMimeFromMagic(file.buffer);
  const isZipMagic = detectedForZip === 'application/zip';
  if (isZipMagic) {
    const containerType = zipContainerTypeFromMime(file.mimetype);
    const zipResult = validateZipContainer(file.buffer, containerType ?? 'zip');
    if (!zipResult.ok) {
      // Map internal ZIP validation codes to sanitised public codes
      const codeMap: Record<string, string> = {
        zip_bomb:               'zip_bomb',
        too_many_entries:       'zip_bomb',
        missing_required_entry: 'invalid_zip',
        invalid_zip:            'invalid_zip',
        parse_error:            'invalid_zip',
        unsupported_zip64:      'unsupported_zip64',
      };
      const publicCode = codeMap[zipResult.code ?? ''] ?? 'invalid_zip';
      const publicError =
        publicCode === 'zip_bomb'         ? `"${file.originalname}" was rejected: archive exceeds safety limits.` :
        publicCode === 'unsupported_zip64' ? `"${file.originalname}" uses ZIP64 format which is not supported. Please use a standard ZIP archive.` :
                                             `"${file.originalname}" is not a valid archive or Office document.`;
      return { ok: false, code: publicCode, error: publicError };
    }
  }

  return { ok: true, normalisedMime: file.mimetype };
}

// ── DOCX embedded-image validation (CP10A6) ───────────────────────────────────

/**
 * Approved raster MIME types for DOCX embedded images.
 *
 * SVG is intentionally excluded — it can contain arbitrary script/XSS.
 * GIF is excluded — animated GIFs in documents are unusual and the format
 * has a long history of parser exploits; exclude to keep the surface minimal.
 * HEIC/HEIF are excluded — not universally supported in browsers and rare in
 * DOCX files produced by Word/LibreOffice.
 */
const DOCX_IMAGE_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Safe extension derived from magic-detected MIME — never from DOCX metadata */
const DOCX_IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

/** Maximum size for a single embedded image extracted from a DOCX (10 MB) */
const DOCX_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export interface DocxImageValidationResult {
  ok: true;
  /** Magic-detected MIME type — use this, not the DOCX-declared contentType */
  detectedMime: string;
  /** Safe file extension derived from detectedMime — use for the storage key */
  safeExt: string;
}

export interface DocxImageValidationError {
  ok: false;
  code: string;
  error: string;
}

export type DocxImageValidationOutcome = DocxImageValidationResult | DocxImageValidationError;

/**
 * Validate a single image buffer extracted from a DOCX file.
 *
 * DOCX embedded images are UNTRUSTED USER-ORIGINATED CONTENT.  The DOCX
 * relationship filename, declared content-type, and extension must NOT be
 * trusted.  This function:
 *
 *   1. Rejects empty buffers.
 *   2. Detects the actual type from magic bytes.
 *   3. Rejects executable, HTML, SVG, script, and any non-raster magic.
 *   4. Permits only JPEG, PNG, and WebP.
 *   5. Enforces a 10 MB per-image size limit.
 *   6. Returns the magic-detected MIME and a safe extension for key generation.
 *
 * The caller MUST use the returned `detectedMime` and `safeExt` — never the
 * DOCX-declared contentType or relationship filename.
 */
export function validateDocxEmbeddedImage(buffer: Buffer): DocxImageValidationOutcome {
  // 1. Empty buffer
  if (!buffer || buffer.length === 0) {
    return { ok: false, code: 'empty_file', error: 'Embedded image is empty.' };
  }

  // 2. Size limit — checked before magic detection to avoid processing huge buffers
  if (buffer.length > DOCX_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      code: 'file_too_large',
      error: `Embedded image exceeds the ${DOCX_IMAGE_MAX_BYTES / (1024 * 1024)} MB limit.`,
    };
  }

  // 3. Magic-byte detection — this is the authoritative type, not the DOCX metadata
  const detectedMime = detectMimeFromMagic(buffer);

  // 4. Absolute reject: executable / dangerous magic bytes
  if (detectedMime !== null && BLOCKED_MIME_TYPES.has(detectedMime)) {
    return {
      ok: false,
      code: 'blocked_magic',
      error: 'Embedded image contains a blocked file signature.',
    };
  }

  // 5. No magic match — could be SVG (text/XML), HTML, or an unknown binary.
  //    Reject: we only accept formats we can positively identify.
  if (detectedMime === null) {
    return {
      ok: false,
      code: 'unrecognised_format',
      error: 'Embedded image format could not be identified from its content.',
    };
  }

  // 6. Permit only approved raster formats
  if (!DOCX_IMAGE_ALLOWED_MIMES.has(detectedMime)) {
    return {
      ok: false,
      code: 'unsupported_image_type',
      error: `Embedded image type "${detectedMime}" is not permitted. Only JPEG, PNG, and WebP are accepted.`,
    };
  }

  // 7. Derive safe extension from detected MIME — never from DOCX metadata
  const safeExt = DOCX_IMAGE_MIME_TO_EXT[detectedMime] ?? 'bin';

  return { ok: true, detectedMime, safeExt };
}

// ── Filename validation ───────────────────────────────────────────────────────

/**
 * Validate a filename for traversal sequences and control characters.
 * Returns an error string if invalid, null if valid.
 */
export function validateFilename(name: string): string | null {
  if (!name || name.trim() === '') return 'Filename is required.';

  // Control characters
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return 'Filename contains invalid characters.';
  }

  // Path separators
  if (name.includes('/') || name.includes('\\')) {
    return 'Filename must not contain path separators.';
  }

  // Traversal sequences
  if (name.includes('..')) return 'Filename must not contain traversal sequences.';

  // Null bytes (belt-and-suspenders)
  if (name.includes('\x00')) return 'Filename contains invalid characters.';

  return null;
}

// ── Content-Disposition ───────────────────────────────────────────────────────

/**
 * Generate a safe Content-Disposition header value.
 *
 * - Images: inline (browser can render safely)
 * - All other types: attachment (force download)
 *
 * The filename is percent-encoded to prevent header injection.
 */
export function getContentDisposition(
  originalName: string,
  mimeType: string,
): string {
  const safeName = encodeURIComponent(
    originalName
      .replace(/[/\\]/g, '_')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, 200) || 'file',
  );

  // Only images are safe for inline rendering
  const isImage = IMAGE_MIMES.has(mimeType);
  const disposition = isImage ? 'inline' : 'attachment';

  return `${disposition}; filename="${safeName}"; filename*=UTF-8''${safeName}`;
}

// ── Signed URL expiry bounds ──────────────────────────────────────────────────

/** Conservative default signed URL expiry: 15 minutes */
export const SIGNED_URL_DEFAULT_EXPIRY_SECONDS = 15 * 60;

/** Maximum signed URL expiry: 1 hour */
export const SIGNED_URL_MAX_EXPIRY_SECONDS = 60 * 60;

/**
 * Clamp a requested expiry to the allowed bounds.
 * Never returns more than SIGNED_URL_MAX_EXPIRY_SECONDS.
 * Never returns less than 60 seconds.
 */
export function clampSignedUrlExpiry(requestedSeconds: number): number {
  const clamped = Math.max(60, Math.min(requestedSeconds, SIGNED_URL_MAX_EXPIRY_SECONDS));
  return clamped;
}

// ── ZIP container validation (CP10A3) ─────────────────────────────────────────

/**
 * ZIP bomb limits — applied when inspecting DOCX/XLSX archives.
 * These are conservative limits that cover all real-world Office documents.
 */
export const ZIP_MAX_ENTRIES = 10_000;
export const ZIP_MAX_EXPANDED_BYTES = 100 * 1024 * 1024; // 100 MB
export const ZIP_MAX_COMPRESSION_RATIO = 100; // reject if any entry expands > 100×

export type ZipContainerType = 'docx' | 'xlsx' | 'zip';

export interface ZipValidationResult {
  ok: boolean;
  code?: 'zip_bomb' | 'too_many_entries' | 'missing_required_entry' | 'invalid_zip' | 'parse_error' | 'unsupported_zip64';
  error?: string;
}

/**
 * Validate a ZIP-based file buffer.
 *
 * For DOCX: requires [Content_Types].xml and word/ directory entry.
 * For XLSX: requires [Content_Types].xml and xl/ directory entry.
 * For plain ZIP: only applies ZIP bomb limits.
 *
 * Uses a pure-JS ZIP central-directory parser — no external dependencies.
 * Bounded by ZIP_MAX_ENTRIES and ZIP_MAX_EXPANDED_BYTES.
 *
 * @param buffer  File buffer (must start with PK magic bytes)
 * @param type    'docx' | 'xlsx' | 'zip'
 */
export function validateZipContainer(buffer: Buffer, type: ZipContainerType): ZipValidationResult {
  // Minimum ZIP size: local file header (30 bytes) + end of central directory (22 bytes)
  if (buffer.length < 22) {
    return { ok: false, code: 'invalid_zip', error: 'Buffer too small to be a valid ZIP archive.' };
  }

  // Locate the End of Central Directory (EOCD) record.
  // Signature: PK\x05\x06 (0x06054b50 little-endian)
  // Search from the end of the buffer (comment may follow EOCD).
  const EOCD_SIG = 0x06054b50;
  const MAX_COMMENT_LEN = 65535;
  let eocdOffset = -1;

  const searchStart = Math.max(0, buffer.length - 22 - MAX_COMMENT_LEN);
  for (let i = buffer.length - 22; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return { ok: false, code: 'invalid_zip', error: 'No End of Central Directory record found.' };
  }

  // Parse EOCD fields
  const totalEntries    = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize  = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  // ── ZIP64 detection ────────────────────────────────────────────────────────
  //
  // ZIP64 archives use sentinel values in the standard EOCD to signal that the
  // real values are in the ZIP64 EOCD record.  We detect ZIP64 via four
  // independent signals and reject it — our bounded parser does not apply
  // entry-count, expanded-size or compression-ratio limits to ZIP64 data, so
  // accepting it would silently bypass all ZIP bomb protections.
  //
  // Signal 1: EOCD entry-count sentinel (0xFFFF)
  const zip64BySentinelEntryCount = totalEntries === 0xFFFF;

  // Signal 2: EOCD central-directory offset sentinel (0xFFFFFFFF)
  const zip64BySentinelCdOffset = centralDirOffset === 0xFFFFFFFF;

  // Signal 3: EOCD central-directory size sentinel (0xFFFFFFFF)
  const zip64BySentinelCdSize = centralDirSize === 0xFFFFFFFF;

  // Signal 4: ZIP64 End of Central Directory Locator (signature 0x07064b50)
  // Located immediately before the EOCD record (20 bytes before eocdOffset).
  // We scan a small window rather than trusting a fixed offset so that a
  // comment-padded EOCD does not defeat detection.
  const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;
  let zip64ByLocator = false;
  const locatorSearchStart = Math.max(0, eocdOffset - 20);
  for (let i = eocdOffset - 4; i >= locatorSearchStart; i--) {
    if (i + 4 <= buffer.length && buffer.readUInt32LE(i) === ZIP64_EOCD_LOCATOR_SIG) {
      zip64ByLocator = true;
      break;
    }
  }

  // Signal 5: ZIP64 End of Central Directory record (signature 0x06064b50)
  // Appears before the ZIP64 EOCD locator.  Scan the same region.
  const ZIP64_EOCD_SIG = 0x06064b50;
  let zip64ByEocdRecord = false;
  const eocdRecordSearchStart = Math.max(0, eocdOffset - 56 - 20); // ZIP64 EOCD is 56 bytes
  for (let i = eocdOffset - 4; i >= eocdRecordSearchStart; i--) {
    if (i + 4 <= buffer.length && buffer.readUInt32LE(i) === ZIP64_EOCD_SIG) {
      zip64ByEocdRecord = true;
      break;
    }
  }

  const isZip64 =
    zip64BySentinelEntryCount ||
    zip64BySentinelCdOffset   ||
    zip64BySentinelCdSize     ||
    zip64ByLocator            ||
    zip64ByEocdRecord;

  if (isZip64) {
    return {
      ok: false,
      code: 'unsupported_zip64',
      error: 'ZIP64 archives are not supported. Please use a standard ZIP archive.',
    };
  }

  if (totalEntries > ZIP_MAX_ENTRIES) {
    return {
      ok: false,
      code: 'too_many_entries',
      error: `ZIP archive has ${totalEntries} entries (max ${ZIP_MAX_ENTRIES}).`,
    };
  }

  // Walk the central directory
  let cdPos = centralDirOffset;
  const CD_SIG = 0x02014b50;
  let totalExpandedBytes = 0;
  const entryNames: string[] = [];

  for (let i = 0; i < totalEntries; i++) {
    if (cdPos + 46 > buffer.length) break;
    if (buffer.readUInt32LE(cdPos) !== CD_SIG) break;

    const compressedSize   = buffer.readUInt32LE(cdPos + 20);
    const uncompressedSize = buffer.readUInt32LE(cdPos + 24);
    const fileNameLen      = buffer.readUInt16LE(cdPos + 28);
    const extraLen         = buffer.readUInt16LE(cdPos + 30);
    const commentLen       = buffer.readUInt16LE(cdPos + 32);

    // ZIP bomb check: compression ratio
    if (compressedSize > 0 && uncompressedSize > compressedSize * ZIP_MAX_COMPRESSION_RATIO) {
      return {
        ok: false,
        code: 'zip_bomb',
        error: `ZIP bomb detected: entry expands ${uncompressedSize} bytes from ${compressedSize} bytes (ratio > ${ZIP_MAX_COMPRESSION_RATIO}).`,
      };
    }

    totalExpandedBytes += uncompressedSize;
    if (totalExpandedBytes > ZIP_MAX_EXPANDED_BYTES) {
      return {
        ok: false,
        code: 'zip_bomb',
        error: `ZIP archive total expanded size exceeds ${ZIP_MAX_EXPANDED_BYTES / (1024 * 1024)} MB limit.`,
      };
    }

    // Read entry name
    if (cdPos + 46 + fileNameLen <= buffer.length) {
      const name = buffer.toString('utf8', cdPos + 46, cdPos + 46 + fileNameLen);
      entryNames.push(name);
    }

    cdPos += 46 + fileNameLen + extraLen + commentLen;
  }

  // Structure validation for Office formats
  if (type === 'docx') {
    const hasContentTypes = entryNames.some(n => n === '[Content_Types].xml');
    const hasWordDir = entryNames.some(n => n.startsWith('word/'));
    if (!hasContentTypes || !hasWordDir) {
      return {
        ok: false,
        code: 'missing_required_entry',
        error: 'File does not appear to be a valid DOCX (missing [Content_Types].xml or word/ directory).',
      };
    }
  }

  if (type === 'xlsx') {
    const hasContentTypes = entryNames.some(n => n === '[Content_Types].xml');
    const hasXlDir = entryNames.some(n => n.startsWith('xl/'));
    if (!hasContentTypes || !hasXlDir) {
      return {
        ok: false,
        code: 'missing_required_entry',
        error: 'File does not appear to be a valid XLSX (missing [Content_Types].xml or xl/ directory).',
      };
    }
  }

  return { ok: true };
}

/**
 * Determine the ZIP container type from a MIME type.
 * Returns null for non-ZIP-based formats.
 */
export function zipContainerTypeFromMime(mime: string): ZipContainerType | null {
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return 'zip';
  return null;
}
