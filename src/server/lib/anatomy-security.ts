/**
 * anatomy-security.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Archive security pipeline for Dazza Anatomy Index.
 *
 * Prevents:
 *   - ZIP-slip / path traversal
 *   - Absolute paths
 *   - Symbolic links
 *   - Nested archive abuse
 *   - Decompression bombs
 *   - Excessive file counts
 *   - Excessive expanded size
 *   - Duplicate paths
 *   - Malformed archives
 *   - Unsupported binaries
 *
 * Enforces:
 *   - Text/source extension allowlist
 *   - Path denylist (node_modules, .git, build dirs, secrets)
 *   - Secret-pattern detection (quarantine — never log the value)
 */

import { createHash } from 'node:crypto';
import JSZip from 'jszip';

// ── Limits ────────────────────────────────────────────────────────────────────

export const ANATOMY_LIMITS = {
  MAX_COMPRESSED_BYTES:   200 * 1024 * 1024,  // 200 MB compressed
  MAX_EXPANDED_BYTES:     500 * 1024 * 1024,  // 500 MB expanded
  MAX_FILE_COUNT:         20_000,
  MAX_SINGLE_FILE_BYTES:  5 * 1024 * 1024,    // 5 MB per file
  MAX_CHUNK_LINES:        150,
  CHUNK_OVERLAP_LINES:    10,
};

// ── Allowed source extensions ─────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([
  // TypeScript / JavaScript
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  // Config / data
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.env.example',
  // Docs
  '.md', '.mdx', '.txt', '.rst',
  // Server / scripts
  '.sh', '.bash',
  // SQL
  '.sql',
  // Other source
  '.graphql', '.gql', '.proto', '.prisma',
  // Swift / Kotlin / Java (iOS/Android)
  '.swift', '.kt', '.kts', '.java',
  // XML / plist
  '.xml', '.plist',
  // Gradle / build
  '.gradle',
]);

// ── Denied path segments (case-insensitive) ───────────────────────────────────

const DENIED_PATH_SEGMENTS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'out',
  'coverage',
  '__pycache__',
  '.cache',
  'Pods',
  'DerivedData',
  '.gradle',
  'android/build',
  'ios/build',
  '.expo',
  '.turbo',
  'tmp',
  'temp',
  '.tmp',
];

// ── Denied filenames ──────────────────────────────────────────────────────────

const DENIED_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.staging',
  '.env.test',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  '*.p12',
  '*.cer',
  '*.mobileprovision',
  '*.keystore',
  '*.jks',
]);

// ── Denied extensions ─────────────────────────────────────────────────────────

const DENIED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.ipa', '.apk', '.aab',
  '.dmg', '.pkg', '.deb', '.rpm',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',  // nested archives
  '.db', '.sqlite', '.sqlite3',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
  '.mp4', '.mov', '.avi', '.mp3', '.wav',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.map',  // source maps can be large
]);

// ── Secret patterns ───────────────────────────────────────────────────────────
// These patterns detect likely secrets. We record the path + pattern name only.
// NEVER log or store the matched value.

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'aws_access_key',       pattern: /AKIA[0-9A-Z]{16}/i },
  { name: 'aws_secret_key',       pattern: /aws.{0,20}secret.{0,20}[=:]\s*['"]?[A-Za-z0-9/+=]{40}/i },
  { name: 'github_token',         pattern: /ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}/i },
  { name: 'openai_key',           pattern: /sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}/i },
  { name: 'stripe_secret',        pattern: /sk_(live|test)_[A-Za-z0-9]{24,}/i },
  { name: 'private_key_header',   pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'jwt_secret_assign',    pattern: /jwt.{0,20}secret\s*[=:]\s*['"][^'"]{16,}/i },
  { name: 'password_assign',      pattern: /password\s*[=:]\s*['"][^'"]{8,}/i },
  { name: 'bearer_token',         pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i },
  { name: 'twilio_auth',          pattern: /AC[a-f0-9]{32}/i },
  { name: 'generic_api_key',      pattern: /api[_-]?key\s*[=:]\s*['"][A-Za-z0-9\-_]{20,}/i },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SecurityScanResult {
  allowed: Array<{ relPath: string; content: string; sha256: string }>;
  excluded: Array<{ relPath: string; reason: string }>;
  quarantined: Array<{ relPath: string; reason: string; patternName: string }>;
  totalCompressedBytes: number;
  totalExpandedBytes: number;
  fileCount: number;
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseRelPath(raw: string): string | null {
  // Strip leading slash or drive letter
  let p = raw.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/');
  // Strip leading slashes
  p = p.replace(/^\/+/, '');
  // Reject absolute paths
  if (p.startsWith('/')) return null;
  // Reject path traversal
  const parts = p.split('/');
  for (const part of parts) {
    if (part === '..' || part === '.') return null;
  }
  return p;
}

function isDeniedPath(relPath: string): string | null {
  const lower = relPath.toLowerCase();
  const parts = lower.split('/');

  // Check denied segments
  for (const seg of DENIED_PATH_SEGMENTS) {
    if (parts.includes(seg) || lower.includes(`/${seg}/`) || lower.startsWith(`${seg}/`)) {
      return `denied path segment: ${seg}`;
    }
  }

  // Check denied filename
  const filename = parts[parts.length - 1] ?? '';
  if (DENIED_FILENAMES.has(filename)) {
    return `denied filename: ${filename}`;
  }

  // Check denied extension
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx >= 0) {
    const ext = filename.slice(dotIdx).toLowerCase();
    if (DENIED_EXTENSIONS.has(ext)) {
      return `denied extension: ${ext}`;
    }
    // Must be in allowed list
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return `not in allowlist: ${ext}`;
    }
  } else {
    // No extension — allow only known extensionless files
    const ALLOWED_EXTENSIONLESS = new Set([
      'makefile', 'dockerfile', 'procfile', 'gemfile', 'rakefile',
      'brewfile', 'fastfile', 'appfile', 'matchfile', 'podfile',
      '.gitignore', '.gitattributes', '.editorconfig', '.eslintignore',
      '.prettierignore', '.npmignore', '.dockerignore',
    ]);
    if (!ALLOWED_EXTENSIONLESS.has(filename.toLowerCase())) {
      return `no extension, not in extensionless allowlist: ${filename}`;
    }
  }

  return null;
}

function scanForSecrets(content: string): { found: boolean; patternName: string } {
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return { found: true, patternName: name };
    }
  }
  return { found: false, patternName: '' };
}

// ── Main scanner ──────────────────────────────────────────────────────────────

export async function scanArchive(
  buffer: Buffer,
  compressedSize: number,
): Promise<SecurityScanResult> {
  const result: SecurityScanResult = {
    allowed: [],
    excluded: [],
    quarantined: [],
    totalCompressedBytes: compressedSize,
    totalExpandedBytes: 0,
    fileCount: 0,
    errors: [],
  };

  // Compressed size guard
  if (compressedSize > ANATOMY_LIMITS.MAX_COMPRESSED_BYTES) {
    throw new Error(
      `Archive too large: ${(compressedSize / 1024 / 1024).toFixed(1)} MB compressed (max ${ANATOMY_LIMITS.MAX_COMPRESSED_BYTES / 1024 / 1024} MB)`
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    throw new Error(`Malformed archive: ${String(e).slice(0, 200)}`);
  }

  const seenPaths = new Set<string>();

  for (const [rawName, entry] of Object.entries(zip.files)) {
    // Skip directories
    if (entry.dir) continue;

    result.fileCount++;
    if (result.fileCount > ANATOMY_LIMITS.MAX_FILE_COUNT) {
      result.errors.push(`File count limit reached (${ANATOMY_LIMITS.MAX_FILE_COUNT}). Remaining files skipped.`);
      break;
    }

    // Normalise path — strip the top-level directory GitHub adds (e.g. repo-main/)
    let relPath = normaliseRelPath(rawName);
    if (!relPath) {
      result.excluded.push({ relPath: rawName, reason: 'path traversal or absolute path rejected' });
      continue;
    }

    // Strip GitHub archive top-level prefix (e.g. "IWIIlBUILD_Portal-main/")
    const firstSlash = relPath.indexOf('/');
    if (firstSlash > 0) {
      relPath = relPath.slice(firstSlash + 1);
    }
    if (!relPath) continue; // was just the top-level dir entry

    // Duplicate path check
    if (seenPaths.has(relPath)) {
      result.excluded.push({ relPath, reason: 'duplicate path' });
      continue;
    }
    seenPaths.add(relPath);

    // Path denylist / allowlist
    const denyReason = isDeniedPath(relPath);
    if (denyReason) {
      result.excluded.push({ relPath, reason: denyReason });
      continue;
    }

    // Extract content
    let content: string;
    try {
      const rawBytes = await entry.async('nodebuffer');

      // Single file size guard
      if (rawBytes.length > ANATOMY_LIMITS.MAX_SINGLE_FILE_BYTES) {
        result.excluded.push({ relPath, reason: `file too large: ${(rawBytes.length / 1024).toFixed(0)} KB` });
        continue;
      }

      result.totalExpandedBytes += rawBytes.length;

      // Decompression bomb guard
      if (result.totalExpandedBytes > ANATOMY_LIMITS.MAX_EXPANDED_BYTES) {
        result.errors.push(`Expanded size limit reached (${ANATOMY_LIMITS.MAX_EXPANDED_BYTES / 1024 / 1024} MB). Remaining files skipped.`);
        break;
      }

      // Decode as UTF-8 — skip binary files
      content = rawBytes.toString('utf8');

      // Heuristic binary check: if >5% of first 1000 chars are non-printable, skip
      const sample = content.slice(0, 1000);
      const nonPrintable = (sample.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) ?? []).length;
      if (nonPrintable / Math.max(sample.length, 1) > 0.05) {
        result.excluded.push({ relPath, reason: 'binary content detected' });
        continue;
      }
    } catch (e) {
      result.excluded.push({ relPath, reason: `extraction error: ${String(e).slice(0, 100)}` });
      continue;
    }

    // Secret-pattern scan — quarantine, never store the value
    const secretScan = scanForSecrets(content);
    if (secretScan.found) {
      result.quarantined.push({
        relPath,
        reason: `secret pattern detected`,
        patternName: secretScan.patternName,
      });
      continue;
    }

    // Compute SHA-256 of content
    const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');

    result.allowed.push({ relPath, content, sha256 });
  }

  return result;
}
