/**
 * Client-safe helpers for the support bundle UI actions.
 * Mirrors the server-side generator logic but runs in the browser.
 * No server imports, no Node.js APIs.
 *
 * SANITISATION SPEC — must stay in sync with support-bundle-generator.ts:
 *   - Remove exact GPS coordinates
 *   - Remove tokens, cookies and authorisation values
 *   - Remove query strings
 *   - Remove request/response bodies
 *   - Remove user-entered form content
 *   - Replace numeric API record IDs with :id
 *   - Strip local filesystem paths
 *   - Enforce 100-event and 64-KB limits
 *   - Only include events from the 60 seconds before submission
 */
import type { DiagEvent } from '@/lib/diagnosticBuffer';

// ── Types (mirrored from server — keep in sync) ───────────────────────────────

export interface BugReportRow {
  id: string;
  submitted_by_user_id: string;
  submitted_by_name: string;
  submitted_by_email: string;
  company_id: number | null;
  company_name: string | null;
  category: string;
  description: string;
  page_url: string;
  user_agent: string;
  screenshot_path: string | null;
  screenshot_bucket: string | null;
  status: string;
  resolution_note: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  platform: string | null;
  app_version: string | null;
  current_route: string | null;
  diagnostic_events: string | null;
  created_at: string;
  updated_at: string;
  // extra fields from GET
  screenshotUrl?: string | null;
  exported_at?: string | null;
  exported_by?: string | null;
  // Dazza AI analysis fields (added 2026-08-14)
  ai_analysis?: string | null;
  ai_suggested_fix?: string | null;
  ai_suggested_prompt?: string | null;
  ai_analysed_at?: string | null;
  sms_auth_used?: number | null;
}

// ── Reference number ──────────────────────────────────────────────────────────

export function buildReference(report: BugReportRow): string {
  const year = new Date(report.created_at).getFullYear();
  const shortId = report.id.replace(/-/g, '').slice(-5).toUpperCase();
  return `BUG-${year}-${shortId}`;
}

// ── Parse diagnostic events ───────────────────────────────────────────────────

export function parseDiagEvents(raw: string | null): DiagEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagEvent[]) : [];
  } catch {
    return [];
  }
}

// ── Shared sanitisation (mirrors support-bundle-generator.ts) ─────────────────

const SENSITIVE_PATH_SEGMENTS = /\/(password|token|secret|auth|session|cookie|pin|otp|key|credential)/i;

/**
 * Pure linear string scanner: returns true when `token` looks like a local
 * filesystem path — one or more `/segment` components followed by a
 * dot-extension.  Uses no regex on the token itself so there is no
 * nested-quantifier ReDoS risk regardless of input content.
 *
 * Accepts: /foo/bar.ts  /a/b/c.json  /very/deep/path/file.tsx
 * Rejects: plain words, URLs, tokens without a leading slash or extension.
 */
function isFilePath(token: string): boolean {
  // Must start with '/' and contain at least one more '/' (i.e. ≥2 segments)
  if (token.charCodeAt(0) !== 47 /* '/' */) return false;
  // Find the last dot — must exist and not be the last char
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 1 || lastDot === token.length - 1) return false;
  // Extension must be 2–4 alpha chars
  const ext = token.slice(lastDot + 1);
  if (ext.length < 2 || ext.length > 4) return false;
  for (let i = 0; i < ext.length; i++) {
    const c = ext.charCodeAt(i);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) return false;
  }
  // Walk segments: each must start with '/' and contain only safe chars,
  // max 64 chars per segment, max 16 segments total.
  let pos = 0;
  let segments = 0;
  while (pos < lastDot) {
    if (token.charCodeAt(pos) !== 47 /* '/' */) return false;
    pos++;
    const segStart = pos;
    while (pos < lastDot && token.charCodeAt(pos) !== 47) {
      const c = token.charCodeAt(pos);
      // Allow: A-Z a-z 0-9 _ . -
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||
            (c >= 48 && c <= 57) || c === 95 || c === 46 || c === 45)) return false;
      pos++;
    }
    const segLen = pos - segStart;
    if (segLen === 0 || segLen > 64) return false;
    segments++;
    if (segments > 16) return false;
  }
  return segments >= 1;
}

function sanitisePath(path: string | undefined): string | undefined {
  if (!path) return path;
  let safe = path.split('?')[0];
  safe = safe.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
  safe = safe.replace(/\/\d+/g, '/:id');
  if (SENSITIVE_PATH_SEGMENTS.test(safe)) {
    safe = safe.replace(SENSITIVE_PATH_SEGMENTS, '/[redacted]');
  }
  return safe;
}

function sanitiseMsg(msg: string): string {
  let s = msg.replace(/https?:\/\/[^\s"')]+/g, '[url]');
  s = s.replace(/\?[^\s"')]+/g, '');
  // Strip local filesystem paths — bounded linear scan to avoid nested-quantifier ReDoS.
  // Splits on whitespace/quotes/parens so each token is independently bounded, then
  // tests each token for a path-like shape using a pure string scanner (no regex on
  // the token itself) to guarantee O(n) time on any input.
  s = s.replace(/[^\s"')]+/g, (token) => {
    if (token.length > 300) return '[file]'; // hard cap per token
    return isFilePath(token) ? '[file]' : token;
  });
  // Strip JWT-style tokens (three base64url segments separated by dots)
  s = s.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted]');
  // Strip long alphanumeric strings ≥40 chars
  s = s.replace(/[A-Za-z0-9+/=_-]{40,}/g, '[redacted]');
  // Strip GPS coordinates
  s = s.replace(/(?:lat|lng|latitude|longitude)[=:\s]+[-+]?\d+\.\d+/gi, '[location]');
  s = s.replace(/[-+]?\d{1,3}\.\d{4,}\s*[,/]\s*[-+]?\d{1,3}\.\d{4,}/g, '[location]');
  return s.slice(0, 300);
}

function sanitiseEvent(ev: DiagEvent, reportTs: number): Record<string, unknown> {
  const offsetSeconds = Math.round((ev.ts - reportTs) / 1000);
  const base: Record<string, unknown> = {
    timestamp: new Date(ev.ts).toISOString(),
    offsetSeconds,
    type: ev.type,
  };
  if (ev.route) base.route = sanitisePath(ev.route);
  if (ev.type === 'api_request') {
    base.method = ev.method;
    base.path = sanitisePath(ev.path);
    if (ev.status !== undefined) base.status = ev.status;
    if (ev.duration !== undefined) base.durationMs = ev.duration;
  } else {
    base.message = sanitiseMsg(ev.msg);
  }
  return base;
}

const TIMELINE_MAX_EVENTS = 100;
const TIMELINE_MAX_BYTES  = 64 * 1024;
const TIMELINE_WINDOW_MS  = 60_000;

/**
 * Build a sanitised diagnostics array — same rules as timeline.jsonl.
 * Used by "Download diagnostics" button.
 * Returns an array of sanitised event objects (NOT the raw DiagEvent[]).
 */
export function buildSanitisedDiagnostics(
  events: DiagEvent[],
  reportCreatedAt: string,
): Record<string, unknown>[] {
  const reportTs = new Date(reportCreatedAt).getTime();
  const windowStart = reportTs - TIMELINE_WINDOW_MS;

  const sorted = [...events]
    .filter(ev => ev.ts >= windowStart && ev.ts <= reportTs + 5000)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, TIMELINE_MAX_EVENTS);

  const result: Record<string, unknown>[] = [];
  let byteCount = 0;

  for (const ev of sorted) {
    let sanitised: Record<string, unknown>;
    try {
      sanitised = sanitiseEvent(ev, reportTs);
    } catch {
      continue;
    }
    const lineBytes = new TextEncoder().encode(JSON.stringify(sanitised)).length;
    if (byteCount + lineBytes > TIMELINE_MAX_BYTES) break;
    result.push(sanitised);
    byteCount += lineBytes;
  }

  // Append sentinel
  const lastSorted = sorted[sorted.length - 1];
  result.push({
    timestamp: new Date(reportTs).toISOString(),
    offsetSeconds: 0,
    type: 'bug_report',
    route: lastSorted ? sanitisePath(lastSorted.route) : null,
    message: 'Report submitted',
  });

  return result;
}

// ── Diagnostic summary ────────────────────────────────────────────────────────

interface DiagSummary {
  online: boolean | null;
  locationPermission: string | null;
  gpsStatus: string | null;
  cameraStatus: string | null;
  lastFailedApiRequest: string | null;
  lastJsError: string | null;
}

function extractDiagSummary(events: DiagEvent[]): DiagSummary {
  const s: DiagSummary = {
    online: null, locationPermission: null, gpsStatus: null,
    cameraStatus: null, lastFailedApiRequest: null, lastJsError: null,
  };
  for (const ev of events) {
    switch (ev.type) {
      case 'network_change':
        s.online = ev.msg.includes('online') ? true : ev.msg.includes('offline') ? false : s.online;
        break;
      case 'permission_change':
        if (/location|gps/i.test(ev.msg)) s.locationPermission = sanitiseMsg(ev.msg);
        break;
      case 'gps_state': s.gpsStatus = sanitiseMsg(ev.msg); break;
      case 'camera_state': s.cameraStatus = sanitiseMsg(ev.msg); break;
      case 'api_request':
        if (ev.status !== undefined && ev.status >= 400) {
          s.lastFailedApiRequest = `${ev.method ?? 'GET'} ${sanitisePath(ev.path) ?? ''} → ${ev.status}${ev.duration !== undefined ? ` (${ev.duration}ms)` : ''}`;
        }
        break;
      case 'js_error': case 'unhandled_rejection': case 'error_boundary':
        s.lastJsError = sanitiseMsg(ev.msg).slice(0, 200);
        break;
    }
  }
  return s;
}

// ── summary.md (client-side) ──────────────────────────────────────────────────

export function buildSummaryMd(report: BugReportRow, events: DiagEvent[]): string {
  const ref = buildReference(report);
  const ds = extractDiagSummary(events);
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const lines = [
    `# Bug Report ${ref}`,
    '',
    '## Summary',
    `- **Status:** ${report.status}`,
    `- **Category:** ${report.category || '—'}`,
    `- **Submitted:** ${fmt(report.created_at)} AEST`,
    `- **User:** ${report.submitted_by_name || '(name not provided)'}`,
    `- **Company:** ${report.company_name || '—'}`,
    `- **Platform:** ${report.platform || 'web'}`,
    `- **App version:** ${report.app_version || '—'}`,
    `- **Page at submission:** ${(report.current_route || report.page_url || '—').split('?')[0]}`,
    '',
    '## Description',
    '',
    report.description.trim(),
    '',
  ];

  if (report.resolution_note) {
    lines.push('## Resolution notes', '', report.resolution_note.trim(), '');
    if (report.resolved_by_name || report.resolved_at) {
      lines.push(`_Resolved by ${report.resolved_by_name ?? 'owner'} on ${fmt(report.resolved_at)}_`, '');
    }
  }

  lines.push(
    '## Diagnostic summary',
    '',
    `- **Network:** ${ds.online === null ? 'unknown' : ds.online ? 'online' : 'offline'}`,
    `- **Location permission:** ${ds.locationPermission ?? 'not recorded'}`,
    `- **GPS state:** ${ds.gpsStatus ?? 'not recorded'}`,
    `- **Camera state:** ${ds.cameraStatus ?? 'not recorded'}`,
    `- **Last failed API request:** ${ds.lastFailedApiRequest ?? 'none'}`,
    `- **JavaScript error:** ${ds.lastJsError ?? 'none'}`,
    '',
    `_Diagnostic timeline: ${events.length} event(s) captured in the 60 seconds before submission._`,
    '',
    '---',
    `_Generated by IWILLBUILD support bundle export on ${new Date().toISOString()}_`,
  );

  return lines.join('\n');
}
