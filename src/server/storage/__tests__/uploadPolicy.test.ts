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
    const f = makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipBuffer());
    expect(validateUploadPolicy(f, 'company-files').ok).toBe(true);
  });

  it('accepts XLSX for company-files', () => {
    const f = makeFile('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zipBuffer());
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
    const f = makeFile('archive.zip', 'application/zip', zipBuffer());
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
    const f = makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipBuffer());
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
