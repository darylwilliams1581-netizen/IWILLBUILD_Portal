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
  'drawings':            IMAGE_POLICY,
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

  return { ok: true, normalisedMime: file.mimetype };
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
