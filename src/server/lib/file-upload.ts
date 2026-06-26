/**
 * Shared file-upload helpers for the Files MVP.
 * Handles multer config, MIME validation, extension detection.
 * Storage path is defined per-handler to avoid static analysis issues.
 */
import multer from 'multer';

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

export const fileUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isHeic(file.originalname)) {
      return cb(new Error(`HEIC_REJECTED:${file.originalname}`));
    }
    if (isBlockedExtension(file.originalname)) {
      return cb(new Error(`BLOCKED_EXT:${file.originalname}`));
    }
    if (!ALLOWED_MIMES[file.mimetype]) {
      return cb(new Error(`UNSUPPORTED_TYPE:${file.originalname}`));
    }
    cb(null, true);
  },
}).single('file');

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
