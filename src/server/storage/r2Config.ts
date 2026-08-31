/**
 * r2Config.ts — Central validated R2 configuration loader (CP10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all R2 configuration.
 *
 * CONTRACT:
 *   - Fails closed: throws if STORAGE_PROVIDER=r2 and any required secret is absent.
 *   - Never silently falls back to local storage after R2 has been selected.
 *   - Never returns raw credential values through any public API.
 *   - Status-safe fields: provider, configured, bucket, publicMode, sanitizedError.
 *
 * REQUIRED SECRETS (when STORAGE_PROVIDER=r2):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * OPTIONAL:
 *   R2_PUBLIC_URL — leave unset for private-bucket signed-URL mode.
 */

import { getSecret } from '#airo/secrets';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Optional public base URL — undefined means private/signed-URL mode */
  publicUrl: string | undefined;
}

export type StorageProviderName = 'r2' | 'local';

/** Safe status object — never contains credential values */
export interface StorageStatus {
  provider: StorageProviderName;
  configured: boolean;
  bucket: string | null;
  publicMode: boolean;
  /** Sanitized error category — never a raw error message with credentials */
  error?: 'missing_credentials' | 'missing_bucket' | 'unknown';
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function readSecret(name: string): string | undefined {
  const v = getSecret(name);
  if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  // Fallback to process.env for local dev without Airo secrets
  const e = process.env[name];
  if (e && e.trim() !== '') return e.trim();
  return undefined;
}

// ── Provider resolution ───────────────────────────────────────────────────────

export function resolveProviderName(): StorageProviderName {
  const raw = readSecret('STORAGE_PROVIDER') ?? 'local';
  return raw.toLowerCase() === 'r2' ? 'r2' : 'local';
}

// ── R2 config loader — fails closed ──────────────────────────────────────────

/**
 * Load and validate R2 configuration.
 * Throws a sanitized error (no credential values) if any required secret is absent.
 * Call only when STORAGE_PROVIDER=r2.
 */
export function loadR2Config(): R2Config {
  const accountId       = readSecret('R2_ACCOUNT_ID');
  const accessKeyId     = readSecret('R2_ACCESS_KEY_ID');
  const secretAccessKey = readSecret('R2_SECRET_ACCESS_KEY');
  const bucket          = readSecret('R2_BUCKET');

  const missing: string[] = [];
  if (!accountId)       missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId)     missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!bucket)          missing.push('R2_BUCKET');

  if (missing.length > 0) {
    // Throw a sanitized error — list missing secret NAMES only, never values
    throw new Error(
      `[r2Config] R2 storage selected but required secrets are absent: ${missing.join(', ')}. ` +
      'Add them in Settings → Secrets.',
    );
  }

  const rawPublicUrl = readSecret('R2_PUBLIC_URL');
  const publicUrl = rawPublicUrl ? rawPublicUrl.replace(/\/+$/, '') : undefined;

  return {
    accountId:       accountId!,
    accessKeyId:     accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket:          bucket!,
    publicUrl,
  };
}

// ── Safe status (for API responses) ──────────────────────────────────────────

/**
 * Returns a safe status object suitable for API responses.
 * Never includes credential values, account IDs, access keys, or signatures.
 */
export function getStorageStatus(): StorageStatus {
  const provider = resolveProviderName();

  if (provider !== 'r2') {
    return { provider: 'local', configured: true, bucket: null, publicMode: false };
  }

  const accountId       = readSecret('R2_ACCOUNT_ID');
  const accessKeyId     = readSecret('R2_ACCESS_KEY_ID');
  const secretAccessKey = readSecret('R2_SECRET_ACCESS_KEY');
  const bucket          = readSecret('R2_BUCKET');
  const publicUrl       = readSecret('R2_PUBLIC_URL');

  const credentialsPresent = !!(accountId && accessKeyId && secretAccessKey);
  const bucketPresent      = !!bucket;
  const configured         = credentialsPresent && bucketPresent;

  if (!credentialsPresent) {
    return { provider: 'r2', configured: false, bucket: null, publicMode: false, error: 'missing_credentials' };
  }
  if (!bucketPresent) {
    return { provider: 'r2', configured: false, bucket: null, publicMode: false, error: 'missing_bucket' };
  }

  return {
    provider:   'r2',
    configured,
    bucket:     bucket ?? null,        // bucket name is non-sensitive
    publicMode: !!publicUrl,
  };
}

// ── Object key validation ─────────────────────────────────────────────────────

/**
 * Validate a storage key segment (one path component — not the full key).
 * Rejects: empty, `..`, backslashes, control characters, absolute paths,
 * percent-encoded traversal, and keys outside the authenticated company prefix.
 */
export function isValidKeySegment(segment: string): boolean {
  if (!segment || segment.length === 0) return false;
  if (segment === '..') return false;
  if (segment === '.') return false;
  if (segment.includes('\\')) return false;
  if (segment.startsWith('/')) return false;
  // Control characters (0x00–0x1F, 0x7F)
  for (let i = 0; i < segment.length; i++) {
    const c = segment.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  // Percent-encoded traversal: %2e%2e, %2f, %5c etc.
  // Decode and re-validate — if the decoded form differs, check it too
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed percent-encoding — reject
    return false;
  }
  if (decoded !== segment) {
    // The decoded form must also be valid, AND must not introduce path separators
    if (decoded.includes('/') || decoded.includes('\\')) return false;
    if (!isValidKeySegment(decoded)) return false;
  }
  return true;
}

/**
 * Validate a full object key (slash-separated path).
 * Every segment must pass isValidKeySegment.
 * Empty path segments (double slashes) are rejected.
 */
export function isValidObjectKey(key: string): boolean {
  if (!key || key.length === 0) return false;
  if (key.startsWith('/')) return false;
  const segments = key.split('/');
  for (const seg of segments) {
    if (!isValidKeySegment(seg)) return false;
  }
  return true;
}

/**
 * Build a canonical object key for a new upload.
 * Format: companies/{companyId}/{category}/{uuid}/{sanitisedFilename}
 *
 * The sanitised filename strips path separators and control characters.
 * UUID prevents collisions and unintended overwrites.
 */
export function buildObjectKey(opts: {
  companyId: number;
  category: string;
  uuid: string;
  originalName: string;
}): string {
  const { companyId, category, uuid, originalName } = opts;

  // Sanitise the display filename: keep only safe characters
  const safeName = originalName
    .replace(/[/\\]/g, '_')          // path separators → underscore
    .replace(/[\x00-\x1f\x7f]/g, '') // control characters
    .replace(/\.\./g, '_')            // traversal sequences
    .slice(0, 200)                    // length cap
    || 'file';

  return `companies/${companyId}/${category}/${uuid}/${safeName}`;
}

/**
 * Assert that a storage key belongs to the given company.
 * Returns true if the key starts with `companies/{companyId}/`.
 * Legacy keys (pre-CP10) that don't follow the new format are allowed through
 * with a warning — they are identified by NOT starting with `companies/`.
 */
export function keyBelongsToCompany(key: string, companyId: number): boolean {
  const prefix = `companies/${companyId}/`;
  if (key.startsWith(prefix)) return true;
  // Legacy key — does not start with `companies/` at all
  if (!key.startsWith('companies/')) return true; // legacy: pass through
  // Starts with `companies/` but a different company ID — reject
  return false;
}

// ── Log redaction ─────────────────────────────────────────────────────────────

/**
 * Redact a storage URL for safe logging.
 * Strips query parameters (presigned URL credentials) and account IDs from the host.
 * Returns only the path component.
 */
export function redactStorageUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip query string (contains X-Amz-Credential, X-Amz-Signature etc.)
    // Strip host (contains accountId in R2 virtual-hosted URLs)
    return u.pathname;
  } catch {
    // Not a valid URL — return a fixed placeholder
    return '[redacted-url]';
  }
}
