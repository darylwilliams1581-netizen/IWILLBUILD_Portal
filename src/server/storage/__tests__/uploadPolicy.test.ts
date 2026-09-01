/**
 * CP10A2 — uploadPolicy unit tests
 *
 * UP1   Magic byte detection
 * UP2   MIME/magic compatibility
 * UP3   Filename validation
 * UP4   validateUploadPolicy — accepted file categories
 * UP5   validateUploadPolicy — rejected file categories
 * UP6   validateUploadPolicy — MIME/extension/magic mismatch
 * UP7   validateUploadPolicy — size boundaries
 * UP8   validateUploadPolicy — namespace-specific policies
 * UP9   Content-Disposition generation
 * UP10  Signed URL expiry bounds
 * UP11  Namespace injection rejection
 */

import { describe, it, expect } from 'vitest';
import {
  detectMimeFromMagic,
  isMagicCompatible,
  validateFilename,
  validateUploadPolicy,
  getContentDisposition,
  clampSignedUrlExpiry,
  SIGNED_URL_DEFAULT_EXPIRY_SECONDS,
  SIGNED_URL_MAX_EXPIRY_SECONDS,
  getPolicyForNamespace,
  validateZipContainer,
  zipContainerTypeFromMime,
  ZIP_MAX_ENTRIES,
  ZIP_MAX_EXPANDED_BYTES,
  ZIP_MAX_COMPRESSION_RATIO,
  validateDocxEmbeddedImage,
} from '../uploadPolicy.js';
import type { FileToValidate } from '../uploadPolicy.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBuffer(bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

function jpegBuffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF;
  return b;
}

function pngBuffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0x89; b[1] = 0x50; b[2] = 0x4E; b[3] = 0x47;
  b[4] = 0x0D; b[5] = 0x0A; b[6] = 0x1A; b[7] = 0x0A;
  return b;
}

function webpBuffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0x52; b[1] = 0x49; b[2] = 0x46; b[3] = 0x46; // RIFF
  b[8] = 0x57; b[9] = 0x45; b[10] = 0x42; b[11] = 0x50; // WEBP
  return b;
}

function pdfBuffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0x25; b[1] = 0x50; b[2] = 0x44; b[3] = 0x46; // %PDF
  return b;
}

function zipBuffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0x50; b[1] = 0x4B; b[2] = 0x03; b[3] = 0x04; // PK..
  return b;
}

function ole2Buffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0xD0; b[1] = 0xCF; b[2] = 0x11; b[3] = 0xE0;
  b[4] = 0xA1; b[5] = 0xB1; b[6] = 0x1A; b[7] = 0xE1;
  return b;
}

function exeBuffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0x4D; b[1] = 0x5A; // MZ
  return b;
}

function elfBuffer(): Buffer {
  const b = Buffer.alloc(20, 0);
  b[0] = 0x7F; b[1] = 0x45; b[2] = 0x4C; b[3] = 0x46; // ELF
  return b;
}

function scriptBuffer(): Buffer {
  return Buffer.from('#!bin/sh\nrm -rf /\n');
}

function csvBuffer(): Buffer {
  return Buffer.from('name,email\nAlice,alice@example.com\n');
}

function makeFile(
  name: string,
  mime: string,
  buffer: Buffer,
): FileToValidate {
  return { originalname: name, mimetype: mime, size: buffer.length, buffer };
}

// ── UP1: Magic byte detection ─────────────────────────────────────────────────

describe('UP1 detectMimeFromMagic', () => {
  it('detects JPEG', () => expect(detectMimeFromMagic(jpegBuffer())).toBe('image/jpeg'));
  it('detects PNG', () => expect(detectMimeFromMagic(pngBuffer())).toBe('image/png'));
  it('detects WebP', () => expect(detectMimeFromMagic(webpBuffer())).toBe('image/webp'));
  it('detects PDF', () => expect(detectMimeFromMagic(pdfBuffer())).toBe('application/pdf'));
  it('detects ZIP', () => expect(detectMimeFromMagic(zipBuffer())).toBe('application/zip'));
  it('detects OLE2 (DOC/XLS)', () => expect(detectMimeFromMagic(ole2Buffer())).toBe('application/msword'));
  it('detects EXE (MZ)', () => expect(detectMimeFromMagic(exeBuffer())).toBe('application/x-msdownload'));
  it('detects ELF', () => expect(detectMimeFromMagic(elfBuffer())).toBe('application/x-elf'));
  it('detects shebang script', () => expect(detectMimeFromMagic(scriptBuffer())).toBe('text/x-shellscript'));
  it('returns null for CSV (no magic bytes)', () => expect(detectMimeFromMagic(csvBuffer())).toBeNull());
  it('returns null for empty buffer', () => expect(detectMimeFromMagic(Buffer.alloc(0))).toBeNull());
  it('returns null for 1-byte buffer', () => expect(detectMimeFromMagic(Buffer.from([0xFF]))).toBeNull());
});

// ── UP2: MIME/magic compatibility ─────────────────────────────────────────────

describe('UP2 isMagicCompatible', () => {
  it('JPEG declared + JPEG detected → compatible', () => expect(isMagicCompatible('image/jpeg', 'image/jpeg')).toBe(true));
  it('image/jpg alias + JPEG detected → compatible', () => expect(isMagicCompatible('image/jpg', 'image/jpeg')).toBe(true));
  it('PNG declared + PNG detected → compatible', () => expect(isMagicCompatible('image/png', 'image/png')).toBe(true));
  it('PDF declared + PDF detected → compatible', () => expect(isMagicCompatible('application/pdf', 'application/pdf')).toBe(true));
  it('DOCX declared + ZIP detected → compatible (ZIP-based)', () => {
    expect(isMagicCompatible(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    )).toBe(true);
  });
  it('XLSX declared + ZIP detected → compatible (ZIP-based)', () => {
    expect(isMagicCompatible(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
    )).toBe(true);
  });
  it('DOC declared + OLE2 detected → compatible', () => {
    expect(isMagicCompatible('application/msword', 'application/msword')).toBe(true);
  });
  it('XLS declared + OLE2 detected → compatible', () => {
    expect(isMagicCompatible('application/vnd.ms-excel', 'application/msword')).toBe(true);
  });
  it('HEIC family → compatible', () => {
    expect(isMagicCompatible('image/heif', 'image/heic')).toBe(true);
    expect(isMagicCompatible('image/heic-sequence', 'image/heic')).toBe(true);
  });
  it('CSV declared + null detected → compatible (text format)', () => {
    expect(isMagicCompatible('text/csv', null)).toBe(true);
  });
  it('TXT declared + null detected → compatible', () => {
    expect(isMagicCompatible('text/plain', null)).toBe(true);
  });
  it('JPEG declared + PNG detected → NOT compatible', () => {
    expect(isMagicCompatible('image/jpeg', 'image/png')).toBe(false);
  });
  it('PDF declared + ZIP detected → NOT compatible', () => {
    expect(isMagicCompatible('application/pdf', 'application/zip')).toBe(false);
  });
  it('JPEG declared + EXE detected → NOT compatible', () => {
    expect(isMagicCompatible('image/jpeg', 'application/x-msdownload')).toBe(false);
  });
  it('PDF declared + null detected → NOT compatible (PDF has magic bytes)', () => {
    expect(isMagicCompatible('application/pdf', null)).toBe(false);
  });
});

// ── UP3: Filename validation ──────────────────────────────────────────────────

describe('UP3 validateFilename', () => {
  it('accepts normal filename', () => expect(validateFilename('photo.jpg')).toBeNull());
  it('accepts filename with spaces', () => expect(validateFilename('my photo.jpg')).toBeNull());
  it('accepts filename with unicode', () => expect(validateFilename('résumé.pdf')).toBeNull());
  it('rejects empty string', () => expect(validateFilename('')).not.toBeNull());
  it('rejects whitespace-only', () => expect(validateFilename('   ')).not.toBeNull());
  it('rejects forward slash', () => expect(validateFilename('a/b.jpg')).not.toBeNull());
  it('rejects backslash', () => expect(validateFilename('a\\b.jpg')).not.toBeNull());
  it('rejects traversal ..', () => expect(validateFilename('../etc/passwd')).not.toBeNull());
  it('rejects null byte', () => expect(validateFilename('file\x00.jpg')).not.toBeNull());
  it('rejects control character', () => expect(validateFilename('file\x01.jpg')).not.toBeNull());
  it('rejects tab character', () => expect(validateFilename('file\t.jpg')).not.toBeNull());
});

// ── UP4: Accepted file categories ────────────────────────────────────────────

describe('UP4 validateUploadPolicy — accepted categories', () => {
  it('accepts JPEG for job-photos', () => {
    const f = makeFile('photo.jpg', 'image/jpeg', jpegBuffer());
    expect(validateUploadPolicy(f, 'job-photos').ok).toBe(true);
  });

  it('accepts PNG for job-photos', () => {
    const f = makeFile('photo.png', 'image/png', pngBuffer());
    expect(validateUploadPolicy(f, 'job-photos').ok).toBe(true);
  });

  it('accepts WebP for job-photos', () => {
    const f = makeFile('photo.webp', 'image/webp', webpBuffer());
    expect(validateUploadPolicy(f, 'job-photos').ok).toBe(true);
  });

  it('accepts PDF for company-files', () => {
    const f = makeFile('report.pdf', 'application/pdf', pdfBuffer());
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts DOCX for company-files', () => {
    // Must be a structurally valid DOCX (ZIP with [Content_Types].xml + word/)
    const buf = buildMinimalZip(['[Content_Types].xml', 'word/document.xml', '_rels/.rels']);
    const f = makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buf);
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts XLSX for company-files', () => {
    // Must be a structurally valid XLSX (ZIP with [Content_Types].xml + xl/)
    const buf = buildMinimalZip(['[Content_Types].xml', 'xl/workbook.xml', '_rels/.rels']);
    const f = makeFile('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buf);
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts DOC for company-files', () => {
    const f = makeFile('doc.doc', 'application/msword', ole2Buffer());
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts XLS for company-files', () => {
    const f = makeFile('sheet.xls', 'application/vnd.ms-excel', ole2Buffer());
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts CSV for company-files', () => {
    const f = makeFile('data.csv', 'text/csv', csvBuffer());
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts TXT for company-files', () => {
    const f = makeFile('notes.txt', 'text/plain', csvBuffer());
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts ZIP for company-files', () => {
    // Must be a structurally valid ZIP archive
    const buf = buildMinimalZip(['file1.txt', 'file2.csv']);
    const f = makeFile('archive.zip', 'application/zip', buf);
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts PDF for safety-documents', () => {
    const f = makeFile('swms.pdf', 'application/pdf', pdfBuffer());
    expect(validateUploadPolicy(f, 'safety-documents').ok).toBe(true);
  });
});

// ── UP5: Rejected file categories ────────────────────────────────────────────

describe('UP5 validateUploadPolicy — rejected categories', () => {
  it('rejects empty file', () => {
    const f = makeFile('photo.jpg', 'image/jpeg', Buffer.alloc(0));
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('empty_file');
  });

  it('rejects EXE by extension', () => {
    const f = makeFile('malware.exe', 'application/octet-stream', exeBuffer());
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_extension');
  });

  it('rejects SH by extension', () => {
    const f = makeFile('script.sh', 'text/plain', scriptBuffer());
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_extension');
  });

  it('rejects HTML by extension', () => {
    const f = makeFile('page.html', 'text/html', Buffer.from('<html>'));
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_extension');
  });

  it('rejects SVG by extension', () => {
    const f = makeFile('icon.svg', 'image/svg+xml', Buffer.from('<svg>'));
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_extension');
  });

  it('rejects JS by extension', () => {
    const f = makeFile('script.js', 'application/javascript', Buffer.from('alert(1)'));
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_extension');
  });

  it('rejects text/html MIME type', () => {
    const f = makeFile('page.txt', 'text/html', Buffer.from('<html>'));
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_mime');
  });

  it('rejects image/svg+xml MIME type', () => {
    const f = makeFile('icon.png', 'image/svg+xml', pngBuffer());
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_mime');
  });

  it('rejects EXE magic bytes regardless of declared MIME', () => {
    const f = makeFile('photo.jpg', 'image/jpeg', exeBuffer());
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_magic');
  });

  it('rejects ELF magic bytes', () => {
    const f = makeFile('photo.jpg', 'image/jpeg', elfBuffer());
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_magic');
  });

  it('rejects shebang script magic bytes', () => {
    const f = makeFile('photo.jpg', 'image/jpeg', scriptBuffer());
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('blocked_magic');
  });

  it('rejects filename with path traversal', () => {
    const f = makeFile('../etc/passwd', 'image/jpeg', jpegBuffer());
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_filename');
  });

  it('rejects filename with null byte', () => {
    const f = makeFile('photo\x00.jpg', 'image/jpeg', jpegBuffer());
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_filename');
  });
});

// ── UP6: MIME/extension/magic mismatch ───────────────────────────────────────

describe('UP6 validateUploadPolicy — MIME/magic mismatch', () => {
  it('rejects JPEG declared but PNG magic bytes', () => {
    const f = makeFile('photo.jpg', 'image/jpeg', pngBuffer());
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('mime_magic_mismatch');
  });

  it('rejects PDF declared but ZIP magic bytes', () => {
    const f = makeFile('doc.pdf', 'application/pdf', zipBuffer());
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('mime_magic_mismatch');
  });

  it('rejects PDF declared but JPEG magic bytes', () => {
    const f = makeFile('doc.pdf', 'application/pdf', jpegBuffer());
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('mime_magic_mismatch');
  });

  it('accepts DOCX declared with ZIP magic bytes (ZIP-based format)', () => {
    // DOCX is ZIP-based — must be a structurally valid DOCX archive
    const buf = buildMinimalZip(['[Content_Types].xml', 'word/document.xml', '_rels/.rels']);
    const f = makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buf);
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts CSV declared with no magic bytes (text format)', () => {
    const f = makeFile('data.csv', 'text/csv', csvBuffer());
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });
});

// ── UP7: Size boundaries ──────────────────────────────────────────────────────

describe('UP7 validateUploadPolicy — size boundaries', () => {
  it('accepts image at exactly 10 MB', () => {
    const buf = Buffer.concat([jpegBuffer(), Buffer.alloc(10 * 1024 * 1024 - jpegBuffer().length)]);
    const f = makeFile('photo.jpg', 'image/jpeg', buf);
    expect(validateUploadPolicy(f, 'job-photos').ok).toBe(true);
  });

  it('rejects image 1 byte over 10 MB', () => {
    const buf = Buffer.concat([jpegBuffer(), Buffer.alloc(10 * 1024 * 1024 - jpegBuffer().length + 1)]);
    const f = makeFile('photo.jpg', 'image/jpeg', buf);
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('file_too_large');
  });

  it('accepts document at exactly 25 MB', () => {
    const buf = Buffer.concat([pdfBuffer(), Buffer.alloc(25 * 1024 * 1024 - pdfBuffer().length)]);
    const f = makeFile('doc.pdf', 'application/pdf', buf);
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('rejects document 1 byte over 25 MB', () => {
    const buf = Buffer.concat([pdfBuffer(), Buffer.alloc(25 * 1024 * 1024 - pdfBuffer().length + 1)]);
    const f = makeFile('doc.pdf', 'application/pdf', buf);
    const r = validateUploadPolicy(f, 'company-files');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('file_too_large');
  });
});

// ── UP8: Namespace-specific policies ─────────────────────────────────────────

describe('UP8 validateUploadPolicy — namespace-specific policies', () => {
  it('job-photos rejects PDF', () => {
    const f = makeFile('doc.pdf', 'application/pdf', pdfBuffer());
    const r = validateUploadPolicy(f, 'job-photos');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_type');
  });

  it('safety-documents rejects JPEG', () => {
    const f = makeFile('photo.jpg', 'image/jpeg', jpegBuffer());
    const r = validateUploadPolicy(f, 'safety-documents');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_type');
  });

  it('company-files accepts both images and documents', () => {
    expect(validateUploadPolicy(makeFile('photo.jpg', 'image/jpeg', jpegBuffer()), 'company-files').ok).toBe(true);
    expect(validateUploadPolicy(makeFile('doc.pdf', 'application/pdf', pdfBuffer()), 'company-files').ok).toBe(true);
  });

  it('profile-attachments accepts images only', () => {
    const policy = getPolicyForNamespace('profile-attachments');
    expect(policy.allowedMimes.has('image/jpeg')).toBe(true);
    expect(policy.allowedMimes.has('application/pdf')).toBe(false);
  });

  it('source-documents accepts documents only', () => {
    const policy = getPolicyForNamespace('source-documents');
    expect(policy.allowedMimes.has('application/pdf')).toBe(true);
    expect(policy.allowedMimes.has('image/jpeg')).toBe(false);
  });
});

// ── UP9: Content-Disposition ──────────────────────────────────────────────────

describe('UP9 getContentDisposition', () => {
  it('returns inline for JPEG', () => {
    expect(getContentDisposition('photo.jpg', 'image/jpeg')).toContain('inline');
  });

  it('returns inline for PNG', () => {
    expect(getContentDisposition('photo.png', 'image/png')).toContain('inline');
  });

  it('returns attachment for PDF', () => {
    expect(getContentDisposition('doc.pdf', 'application/pdf')).toContain('attachment');
  });

  it('returns attachment for DOCX', () => {
    expect(getContentDisposition('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toContain('attachment');
  });

  it('returns attachment for CSV', () => {
    expect(getContentDisposition('data.csv', 'text/csv')).toContain('attachment');
  });

  it('encodes filename to prevent header injection', () => {
    const disp = getContentDisposition('file; rm -rf /', 'application/pdf');
    expect(disp).not.toContain('; rm -rf /');
  });

  it('handles empty filename gracefully', () => {
    const disp = getContentDisposition('', 'application/pdf');
    expect(disp).toContain('file');
  });

  it('strips path separators from filename', () => {
    const disp = getContentDisposition('../../../etc/passwd', 'application/pdf');
    expect(disp).not.toContain('/');
  });
});

// ── UP10: Signed URL expiry bounds ────────────────────────────────────────────

describe('UP10 clampSignedUrlExpiry', () => {
  it('default expiry is 15 minutes', () => {
    expect(SIGNED_URL_DEFAULT_EXPIRY_SECONDS).toBe(15 * 60);
  });

  it('max expiry is 1 hour', () => {
    expect(SIGNED_URL_MAX_EXPIRY_SECONDS).toBe(60 * 60);
  });

  it('clamps below minimum to 60 seconds', () => {
    expect(clampSignedUrlExpiry(0)).toBe(60);
    expect(clampSignedUrlExpiry(-100)).toBe(60);
    expect(clampSignedUrlExpiry(30)).toBe(60);
  });

  it('passes through values within bounds', () => {
    expect(clampSignedUrlExpiry(300)).toBe(300);
    expect(clampSignedUrlExpiry(900)).toBe(900);
    expect(clampSignedUrlExpiry(3600)).toBe(3600);
  });

  it('clamps above maximum to 1 hour', () => {
    expect(clampSignedUrlExpiry(3601)).toBe(3600);
    expect(clampSignedUrlExpiry(86400)).toBe(3600);
    expect(clampSignedUrlExpiry(Number.MAX_SAFE_INTEGER)).toBe(3600);
  });
});

// ── UP11: Namespace injection rejection ──────────────────────────────────────

describe('UP11 namespace injection rejection', () => {
  it('buildObjectKey throws for unknown namespace', async () => {
    const { buildObjectKey } = await import('../r2Config.js');
    expect(() => buildObjectKey({
      logicalNamespace: '../../etc' as never,
      companyId: 1, category: 'x', uuid: 'u', originalName: 'f.jpg',
    })).toThrow(/namespace/i);
  });

  it('assertValidNamespace throws for traversal attempt', async () => {
    const { assertValidNamespace } = await import('../r2Config.js');
    expect(() => assertValidNamespace('../../other-company')).toThrow(/namespace/i);
  });

  it('assertValidNamespace throws for SQL injection attempt', async () => {
    const { assertValidNamespace } = await import('../r2Config.js');
    expect(() => assertValidNamespace("'; DROP TABLE users; --")).toThrow(/namespace/i);
  });

  it('isValidNamespace returns false for traversal', async () => {
    const { isValidNamespace } = await import('../r2Config.js');
    expect(isValidNamespace('../../etc')).toBe(false);
  });
});

// ── UP12: ZIP container validation (CP10A3) ───────────────────────────────────

/**
 * Build a minimal valid ZIP archive buffer containing the given entries.
 * Each entry has zero-length content (compressed and uncompressed size = 0).
 */
function buildMinimalZip(entries: string[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const name of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const nameLen = nameBytes.length;

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30 + nameLen, 0);
    local.writeUInt32LE(0x04034b50, 0); // local file header sig
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(0, 8);           // compression (stored)
    local.writeUInt32LE(0, 14);          // crc-32
    local.writeUInt32LE(0, 18);          // compressed size
    local.writeUInt32LE(0, 22);          // uncompressed size
    local.writeUInt16LE(nameLen, 26);    // file name length
    local.writeUInt16LE(0, 28);          // extra field length
    nameBytes.copy(local, 30);

    // Central directory entry (46 bytes + name)
    const cd = Buffer.alloc(46 + nameLen, 0);
    cd.writeUInt32LE(0x02014b50, 0);     // central dir sig
    cd.writeUInt16LE(20, 4);             // version made by
    cd.writeUInt16LE(20, 6);             // version needed
    cd.writeUInt16LE(0, 8);              // flags
    cd.writeUInt16LE(0, 10);             // compression
    cd.writeUInt32LE(0, 16);             // crc-32
    cd.writeUInt32LE(0, 20);             // compressed size
    cd.writeUInt32LE(0, 24);             // uncompressed size
    cd.writeUInt16LE(nameLen, 28);       // file name length
    cd.writeUInt16LE(0, 30);             // extra field length
    cd.writeUInt16LE(0, 32);             // comment length
    cd.writeUInt32LE(offset, 42);        // local header offset
    nameBytes.copy(cd, 46);

    localHeaders.push(local);
    centralDirs.push(cd);
    offset += local.length;
  }

  const cdStart = offset;
  const cdBuf = Buffer.concat(centralDirs);

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);    // EOCD sig
  eocd.writeUInt16LE(0, 4);             // disk number
  eocd.writeUInt16LE(0, 6);             // disk with CD
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdBuf.length, 12); // CD size
  eocd.writeUInt32LE(cdStart, 16);      // CD offset
  eocd.writeUInt16LE(0, 20);            // comment length

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

/** Build a ZIP with one entry that has a very high compression ratio */
function buildZipBombEntry(compressedSize: number, uncompressedSize: number): Buffer {
  const nameBytes = Buffer.from('bomb.txt', 'utf8');
  const nameLen = nameBytes.length;

  const local = Buffer.alloc(30 + nameLen + compressedSize, 0);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(compressedSize, 18);
  local.writeUInt32LE(uncompressedSize, 22);
  local.writeUInt16LE(nameLen, 26);
  nameBytes.copy(local, 30);

  const cdStart = local.length;
  const cd = Buffer.alloc(46 + nameLen, 0);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt32LE(compressedSize, 20);
  cd.writeUInt32LE(uncompressedSize, 24);
  cd.writeUInt16LE(nameLen, 28);
  cd.writeUInt32LE(0, 42);
  nameBytes.copy(cd, 46);

  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdStart, 16);

  return Buffer.concat([local, cd, eocd]);
}

describe('UP12 validateZipContainer — ZIP structure validation', () => {
  // ── Constants ──────────────────────────────────────────────────────────────

  it('ZIP_MAX_ENTRIES is 10,000', () => expect(ZIP_MAX_ENTRIES).toBe(10_000));
  it('ZIP_MAX_EXPANDED_BYTES is 100 MB', () => expect(ZIP_MAX_EXPANDED_BYTES).toBe(100 * 1024 * 1024));
  it('ZIP_MAX_COMPRESSION_RATIO is 100', () => expect(ZIP_MAX_COMPRESSION_RATIO).toBe(100));

  // ── Valid DOCX ─────────────────────────────────────────────────────────────

  it('valid DOCX: [Content_Types].xml + word/ → ok', () => {
    const buf = buildMinimalZip(['[Content_Types].xml', 'word/document.xml', 'word/_rels/document.xml.rels']);
    const r = validateZipContainer(buf, 'docx');
    expect(r.ok).toBe(true);
  });

  it('valid XLSX: [Content_Types].xml + xl/ → ok', () => {
    const buf = buildMinimalZip(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    const r = validateZipContainer(buf, 'xlsx');
    expect(r.ok).toBe(true);
  });

  it('plain ZIP: no structure requirements → ok', () => {
    const buf = buildMinimalZip(['file1.txt', 'file2.csv']);
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(true);
  });

  // ── Missing required entries ───────────────────────────────────────────────

  it('DOCX missing [Content_Types].xml → missing_required_entry', () => {
    const buf = buildMinimalZip(['word/document.xml']);
    const r = validateZipContainer(buf, 'docx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_required_entry');
  });

  it('DOCX missing word/ directory → missing_required_entry', () => {
    const buf = buildMinimalZip(['[Content_Types].xml', '_rels/.rels']);
    const r = validateZipContainer(buf, 'docx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_required_entry');
  });

  it('XLSX missing [Content_Types].xml → missing_required_entry', () => {
    const buf = buildMinimalZip(['xl/workbook.xml']);
    const r = validateZipContainer(buf, 'xlsx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_required_entry');
  });

  it('XLSX missing xl/ directory → missing_required_entry', () => {
    const buf = buildMinimalZip(['[Content_Types].xml', '_rels/.rels']);
    const r = validateZipContainer(buf, 'xlsx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_required_entry');
  });

  it('XLSX with word/ but not xl/ → missing_required_entry', () => {
    const buf = buildMinimalZip(['[Content_Types].xml', 'word/document.xml']);
    const r = validateZipContainer(buf, 'xlsx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('missing_required_entry');
  });

  // ── ZIP bomb detection ─────────────────────────────────────────────────────

  it('ZIP bomb: compression ratio > 100 → zip_bomb', () => {
    const compressedSize = 1000;
    const uncompressedSize = compressedSize * (ZIP_MAX_COMPRESSION_RATIO + 1); // 101×
    const buf = buildZipBombEntry(compressedSize, uncompressedSize);
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('zip_bomb');
  });

  it('ZIP bomb: exactly at ratio limit → ok', () => {
    const compressedSize = 1000;
    const uncompressedSize = compressedSize * ZIP_MAX_COMPRESSION_RATIO; // exactly 100×
    const buf = buildZipBombEntry(compressedSize, uncompressedSize);
    const r = validateZipContainer(buf, 'zip');
    // Exactly at limit is allowed (> not >=)
    expect(r.ok).toBe(true);
  });

  // ── Invalid ZIP ────────────────────────────────────────────────────────────

  it('empty buffer → invalid_zip', () => {
    const r = validateZipContainer(Buffer.alloc(0), 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_zip');
  });

  it('JPEG buffer (not a ZIP) → invalid_zip', () => {
    const buf = Buffer.alloc(100, 0);
    buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF;
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_zip');
  });

  it('PDF buffer (not a ZIP) → invalid_zip', () => {
    const buf = Buffer.from('%PDF-1.4\n%EOF\n');
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_zip');
  });

  // ── zipContainerTypeFromMime ───────────────────────────────────────────────

  it('zipContainerTypeFromMime: DOCX MIME → docx', () => {
    expect(zipContainerTypeFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
  });

  it('zipContainerTypeFromMime: XLSX MIME → xlsx', () => {
    expect(zipContainerTypeFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('xlsx');
  });

  it('zipContainerTypeFromMime: application/zip → zip', () => {
    expect(zipContainerTypeFromMime('application/zip')).toBe('zip');
  });

  it('zipContainerTypeFromMime: application/x-zip-compressed → zip', () => {
    expect(zipContainerTypeFromMime('application/x-zip-compressed')).toBe('zip');
  });

  it('zipContainerTypeFromMime: image/jpeg → null', () => {
    expect(zipContainerTypeFromMime('image/jpeg')).toBeNull();
  });

  it('zipContainerTypeFromMime: application/pdf → null', () => {
    expect(zipContainerTypeFromMime('application/pdf')).toBeNull();
  });
});

// ── UP13: ZIP64 rejection ─────────────────────────────────────────────────────
//
// ZIP64 archives use sentinel values (0xFFFF, 0xFFFFFFFF) in the standard EOCD
// and/or prepend a ZIP64 EOCD locator (0x07064b50) and ZIP64 EOCD record
// (0x06064b50).  Our bounded parser cannot safely apply entry-count, expanded-
// size or compression-ratio limits to ZIP64 data, so all ZIP64 signals must
// produce unsupported_zip64 — never ok:true.
//
// Tests do NOT allocate attacker-declared sizes: all buffers are small and
// fixed-size; sentinel values are written into header fields only.

/**
 * Build a standard ZIP with one entry, then patch specific EOCD fields to
 * inject ZIP64 sentinel values without changing the buffer size.
 */
function buildZipWithEocdSentinels(opts: {
  sentinelEntryCount?: boolean;
  sentinelCdOffset?: boolean;
  sentinelCdSize?: boolean;
}): Buffer {
  // Build a valid minimal ZIP first
  const buf = buildMinimalZip(['file.txt']);

  // Find the EOCD signature from the end
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('buildZipWithEocdSentinels: no EOCD found');

  const patched = Buffer.from(buf); // copy

  if (opts.sentinelEntryCount) {
    patched.writeUInt16LE(0xFFFF, eocdOffset + 8);  // entries on disk
    patched.writeUInt16LE(0xFFFF, eocdOffset + 10); // total entries
  }
  if (opts.sentinelCdOffset) {
    patched.writeUInt32LE(0xFFFFFFFF, eocdOffset + 16);
  }
  if (opts.sentinelCdSize) {
    patched.writeUInt32LE(0xFFFFFFFF, eocdOffset + 12);
  }

  return patched;
}

/**
 * Build a buffer that contains a ZIP64 EOCD Locator signature (0x07064b50)
 * immediately before the standard EOCD record, as a real ZIP64 tool would
 * produce.  The locator is 20 bytes; we prepend it to a valid minimal ZIP.
 */
function buildZipWithZip64Locator(): Buffer {
  const base = buildMinimalZip(['file.txt']);

  // Find EOCD offset in base
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = base.length - 22; i >= 0; i--) {
    if (base.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('buildZipWithZip64Locator: no EOCD found');

  // ZIP64 EOCD Locator: 20 bytes
  //   sig (4) | disk with ZIP64 EOCD (4) | offset of ZIP64 EOCD (8) | total disks (4)
  const locator = Buffer.alloc(20, 0);
  locator.writeUInt32LE(0x07064b50, 0); // ZIP64 EOCD locator sig
  locator.writeUInt32LE(0, 4);           // disk with ZIP64 EOCD
  // offset of ZIP64 EOCD record — points before the locator (doesn't matter for detection)
  locator.writeBigUInt64LE(BigInt(eocdOffset - 56), 8);
  locator.writeUInt32LE(1, 16);          // total disks

  // Insert locator just before the EOCD
  return Buffer.concat([
    base.subarray(0, eocdOffset),
    locator,
    base.subarray(eocdOffset),
  ]);
}

/**
 * Build a buffer that contains a ZIP64 EOCD record (0x06064b50) followed by
 * the ZIP64 EOCD locator, followed by the standard EOCD — the structure a
 * real ZIP64 archiver produces.
 */
function buildZipWithZip64EocdRecord(): Buffer {
  const base = buildMinimalZip(['file.txt']);

  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = base.length - 22; i >= 0; i--) {
    if (base.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('buildZipWithZip64EocdRecord: no EOCD found');

  // ZIP64 EOCD record: 56 bytes minimum
  //   sig (4) | size of ZIP64 EOCD (8) | version made by (2) | version needed (2) |
  //   disk number (4) | disk with CD (4) | entries on disk (8) | total entries (8) |
  //   CD size (8) | CD offset (8)
  const zip64Eocd = Buffer.alloc(56, 0);
  zip64Eocd.writeUInt32LE(0x06064b50, 0);          // ZIP64 EOCD sig
  zip64Eocd.writeBigUInt64LE(BigInt(44), 4);        // size of remaining record (56 - 12)
  zip64Eocd.writeUInt16LE(45, 12);                  // version made by
  zip64Eocd.writeUInt16LE(45, 14);                  // version needed
  zip64Eocd.writeBigUInt64LE(BigInt(1), 24);        // entries on disk
  zip64Eocd.writeBigUInt64LE(BigInt(1), 32);        // total entries
  zip64Eocd.writeBigUInt64LE(BigInt(0), 40);        // CD size (placeholder)
  zip64Eocd.writeBigUInt64LE(BigInt(0), 48);        // CD offset (placeholder)

  // ZIP64 EOCD locator: 20 bytes
  const locator = Buffer.alloc(20, 0);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(eocdOffset), 8);
  locator.writeUInt32LE(1, 16);

  return Buffer.concat([
    base.subarray(0, eocdOffset),
    zip64Eocd,
    locator,
    base.subarray(eocdOffset),
  ]);
}

/**
 * Build a truncated/malformed ZIP64 buffer: has the ZIP64 EOCD locator
 * signature but the buffer is cut short before the standard EOCD.
 * Verifies detection does not allocate attacker-declared sizes.
 */
function buildTruncatedZip64(): Buffer {
  // Start with a valid ZIP, inject the ZIP64 locator sig, then truncate
  const base = buildMinimalZip(['file.txt']);

  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = base.length - 22; i >= 0; i--) {
    if (base.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('buildTruncatedZip64: no EOCD found');

  const locator = Buffer.alloc(20, 0);
  locator.writeUInt32LE(0x07064b50, 0);

  // Inject locator before EOCD, then truncate 10 bytes into the EOCD
  const full = Buffer.concat([
    base.subarray(0, eocdOffset),
    locator,
    base.subarray(eocdOffset),
  ]);
  // Truncate: remove last 10 bytes so the EOCD is incomplete
  return full.subarray(0, full.length - 10);
}

describe('UP13 validateZipContainer — ZIP64 rejection', () => {
  // ── Signal 1: sentinel entry count (0xFFFF) ────────────────────────────────

  it('EOCD entry-count sentinel 0xFFFF → unsupported_zip64', () => {
    const buf = buildZipWithEocdSentinels({ sentinelEntryCount: true });
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  it('EOCD entry-count sentinel on DOCX → unsupported_zip64 (not missing_required_entry)', () => {
    const buf = buildZipWithEocdSentinels({ sentinelEntryCount: true });
    const r = validateZipContainer(buf, 'docx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  // ── Signal 2: sentinel CD offset (0xFFFFFFFF) ──────────────────────────────

  it('EOCD CD-offset sentinel 0xFFFFFFFF → unsupported_zip64', () => {
    const buf = buildZipWithEocdSentinels({ sentinelCdOffset: true });
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  // ── Signal 3: sentinel CD size (0xFFFFFFFF) ────────────────────────────────

  it('EOCD CD-size sentinel 0xFFFFFFFF → unsupported_zip64', () => {
    const buf = buildZipWithEocdSentinels({ sentinelCdSize: true });
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  // ── Signal 4: ZIP64 EOCD Locator (0x07064b50) ─────────────────────────────

  it('ZIP64 EOCD Locator present → unsupported_zip64', () => {
    const buf = buildZipWithZip64Locator();
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  it('ZIP64 EOCD Locator on XLSX → unsupported_zip64 (not missing_required_entry)', () => {
    const buf = buildZipWithZip64Locator();
    const r = validateZipContainer(buf, 'xlsx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  // ── Signal 5: ZIP64 EOCD Record (0x06064b50) ──────────────────────────────

  it('ZIP64 EOCD Record present → unsupported_zip64', () => {
    const buf = buildZipWithZip64EocdRecord();
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  it('ZIP64 EOCD Record on DOCX → unsupported_zip64', () => {
    const buf = buildZipWithZip64EocdRecord();
    const r = validateZipContainer(buf, 'docx');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  // ── Malformed / truncated ZIP64 ────────────────────────────────────────────

  it('truncated ZIP64 (locator present, EOCD incomplete) → unsupported_zip64 not ok', () => {
    const buf = buildTruncatedZip64();
    const r = validateZipContainer(buf, 'zip');
    // Must not return ok:true — either unsupported_zip64 or invalid_zip
    expect(r.ok).toBe(false);
    expect(['unsupported_zip64', 'invalid_zip']).toContain(r.code);
  });

  // ── No allocation of attacker-declared sizes ───────────────────────────────

  it('ZIP64 sentinel values do not cause large allocation (no RangeError)', () => {
    // Patch a valid ZIP to have 0xFFFF entries and 0xFFFFFFFF CD offset/size.
    // If the parser naively allocated based on these values it would OOM or throw.
    const buf = buildZipWithEocdSentinels({
      sentinelEntryCount: true,
      sentinelCdOffset: true,
      sentinelCdSize: true,
    });
    // Must reject cleanly without throwing
    expect(() => validateZipContainer(buf, 'zip')).not.toThrow();
    const r = validateZipContainer(buf, 'zip');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported_zip64');
  });

  // ── Ordinary archives still pass ──────────────────────────────────────────

  it('ordinary DOCX (no ZIP64 signals) still passes', () => {
    const buf = buildMinimalZip(['[Content_Types].xml', 'word/document.xml']);
    const r = validateZipContainer(buf, 'docx');
    expect(r.ok).toBe(true);
  });

  it('ordinary XLSX (no ZIP64 signals) still passes', () => {
    const buf = buildMinimalZip(['[Content_Types].xml', 'xl/workbook.xml']);
    const r = validateZipContainer(buf, 'xlsx');
    expect(r.ok).toBe(true);
  });
});

// ─── UP12. validateDocxEmbeddedImage — unit tests (CP10A6) ───────────────────

describe('UP12 — validateDocxEmbeddedImage', () => {
  const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xD9]);
  const PNG_MAGIC  = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082', 'hex');
  const WEBP_MAGIC = (() => {
    const b = Buffer.alloc(30);
    b[0]=0x52;b[1]=0x49;b[2]=0x46;b[3]=0x46; // RIFF
    b[4]=0x16;b[5]=0x00;b[6]=0x00;b[7]=0x00;
    b[8]=0x57;b[9]=0x45;b[10]=0x42;b[11]=0x50; // WEBP
    b[12]=0x56;b[13]=0x50;b[14]=0x38;b[15]=0x4C; // VP8L
    return b;
  })();

  it('accepts JPEG — returns ok=true, detectedMime=image/jpeg, safeExt=jpg', () => {
    const r = validateDocxEmbeddedImage(JPEG_MAGIC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detectedMime).toBe('image/jpeg');
    expect(r.safeExt).toBe('jpg');
  });

  it('accepts PNG — returns ok=true, detectedMime=image/png, safeExt=png', () => {
    const r = validateDocxEmbeddedImage(PNG_MAGIC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detectedMime).toBe('image/png');
    expect(r.safeExt).toBe('png');
  });

  it('accepts WebP — returns ok=true, detectedMime=image/webp, safeExt=webp', () => {
    const r = validateDocxEmbeddedImage(WEBP_MAGIC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detectedMime).toBe('image/webp');
    expect(r.safeExt).toBe('webp');
  });

  it('rejects empty buffer — code=empty_file', () => {
    const r = validateDocxEmbeddedImage(Buffer.alloc(0));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('empty_file');
  });

  it('rejects oversized buffer (> 10 MB) — code=file_too_large', () => {
    // Allocate 10 MB + 1 byte with JPEG magic so it is not rejected for format
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    oversized[0] = 0xFF; oversized[1] = 0xD8; oversized[2] = 0xFF;
    const r = validateDocxEmbeddedImage(oversized);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('file_too_large');
  });

  it('rejects Windows PE executable (MZ header) — code=blocked_magic', () => {
    const exe = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const r = validateDocxEmbeddedImage(exe);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('blocked_magic');
  });

  it('rejects SVG text (no magic match) — code=unrecognised_format', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const r = validateDocxEmbeddedImage(svg);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // SVG has no magic bytes — falls through to unrecognised_format
    expect(['unrecognised_format', 'unsupported_image_type']).toContain(r.code);
  });

  it('rejects malformed bytes (no magic match) — code=unrecognised_format', () => {
    const bad = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const r = validateDocxEmbeddedImage(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('unrecognised_format');
  });

  it('rejects GIF (recognised but not in allowed set) — code=unsupported_image_type', () => {
    // GIF89a magic
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
    const r = validateDocxEmbeddedImage(gif);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('unsupported_image_type');
  });

  it('DOCX-declared MIME is irrelevant — only buffer magic is checked', () => {
    // PNG magic bytes — regardless of what DOCX declared, result is PNG
    const r = validateDocxEmbeddedImage(PNG_MAGIC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detectedMime).toBe('image/png');
  });
});
