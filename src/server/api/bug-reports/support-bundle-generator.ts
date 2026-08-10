/**
 * Support bundle generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the three text files (summary.md, report.json, timeline.jsonl)
 * that go into the support ZIP.  Screenshot fetching is handled separately
 * in the export handler so this module stays pure / testable.
 */

// ── DiagEvent (inline to avoid cross-boundary import) ────────────────────────
export interface DiagEvent {
  ts: number;
  type: string;
  msg: string;
  route?: string;
  method?: string;
  path?: string;
  status?: number;
  duration?: number;
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

// ── Reference number ──────────────────────────────────────────────────────────

export function buildReference(report: BugReportRow): string {
  const year = new Date(report.created_at).getFullYear();
  // Use last 5 hex chars of id as a stable short number
  const shortId = report.id.replace(/-/g, '').slice(-5).toUpperCase();
  return `BUG-${year}-${shortId}`;
}

// ── Diagnostic event parsing ──────────────────────────────────────────────────

export function parseDiagEvents(raw: string | null): DiagEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagEvent[]) : [];
  } catch {
    return [];
  }
}

// ── Diagnostic summary extraction ────────────────────────────────────────────

interface DiagSummary {
  online: boolean | null;
  locationPermission: string | null;
  gpsStatus: string | null;
  cameraStatus: string | null;
  activeDriverSessionId: number | null;
  lastFailedApiRequest: string | null;
  lastJsError: string | null;
}

export function extractDiagSummary(events: DiagEvent[]): DiagSummary {
  const summary: DiagSummary = {
    online: null,
    locationPermission: null,
    gpsStatus: null,
    cameraStatus: null,
    activeDriverSessionId: null,
    lastFailedApiRequest: null,
    lastJsError: null,
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'network_change':
        if (ev.msg.includes('online')) summary.online = true;
        else if (ev.msg.includes('offline')) summary.online = false;
        break;
      case 'permission_change':
        if (ev.msg.toLowerCase().includes('location') || ev.msg.toLowerCase().includes('gps')) {
          summary.locationPermission = ev.msg;
        }
        break;
      case 'gps_state':
        summary.gpsStatus = ev.msg;
        break;
      case 'camera_state':
        summary.cameraStatus = ev.msg;
        break;
      case 'driver_session':
        // Extract session ID if present
        const sessionMatch = ev.msg.match(/session[:\s#]+(\d+)/i);
        if (sessionMatch) summary.activeDriverSessionId = parseInt(sessionMatch[1], 10);
        break;
      case 'api_request':
        if (ev.status !== undefined && ev.status >= 400) {
          summary.lastFailedApiRequest = `${ev.method ?? 'GET'} ${ev.path ?? ''} → ${ev.status}${ev.duration !== undefined ? ` (${ev.duration}ms)` : ''}`;
        }
        break;
      case 'js_error':
      case 'unhandled_rejection':
      case 'error_boundary':
        summary.lastJsError = ev.msg.slice(0, 200);
        break;
    }
  }

  return summary;
}

// ── summary.md ────────────────────────────────────────────────────────────────

export function buildSummaryMd(report: BugReportRow, events: DiagEvent[]): string {
  const ref = buildReference(report);
  const diagSummary = extractDiagSummary(events);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const lines: string[] = [
    `# Bug Report ${ref}`,
    '',
    '## Summary',
    `- **Status:** ${report.status}`,
    `- **Category:** ${report.category || '—'}`,
    `- **Submitted:** ${fmtDate(report.created_at)} AEST`,
    `- **User:** ${report.submitted_by_name || '(name not provided)'}`,
    `- **Company:** ${report.company_name || '—'}`,
    `- **Platform:** ${report.platform || 'web'}`,
    `- **App version:** ${report.app_version || '—'}`,
    `- **Page at submission:** ${report.current_route || report.page_url || '—'}`,
    '',
    '## Description',
    '',
    report.description.trim(),
    '',
  ];

  if (report.resolution_note) {
    lines.push('## Resolution notes', '', report.resolution_note.trim(), '');
    if (report.resolved_by_name || report.resolved_at) {
      lines.push(`_Resolved by ${report.resolved_by_name ?? 'owner'} on ${fmtDate(report.resolved_at)}_`, '');
    }
  }

  lines.push(
    '## Diagnostic summary',
    '',
    `- **Network:** ${diagSummary.online === null ? 'unknown' : diagSummary.online ? 'online' : 'offline'}`,
    `- **Location permission:** ${diagSummary.locationPermission ?? 'not recorded'}`,
    `- **GPS state:** ${diagSummary.gpsStatus ?? 'not recorded'}`,
    `- **Camera state:** ${diagSummary.cameraStatus ?? 'not recorded'}`,
    `- **Last failed API request:** ${diagSummary.lastFailedApiRequest ?? 'none'}`,
    `- **JavaScript error:** ${diagSummary.lastJsError ?? 'none'}`,
    '',
    `_Diagnostic timeline: ${events.length} event(s) captured in the 60 seconds before submission._`,
    '',
    '---',
    `_Generated by IWILLBUILD support bundle export on ${new Date().toISOString()}_`,
  );

  return lines.join('\n');
}

// ── report.json ───────────────────────────────────────────────────────────────

export function buildReportJson(
  report: BugReportRow,
  events: DiagEvent[],
  hasScreenshot: boolean,
  screenshotMime: string | null,
): string {
  const ref = buildReference(report);
  const diagSummary = extractDiagSummary(events);

  // Parse viewport from device_context if stored (future-proofing)
  // For now derive from user_agent heuristics
  const viewport = { width: null as number | null, height: null as number | null };

  // Parse browser/webview from user agent (safe, no PII)
  const ua = report.user_agent ?? '';
  let browserOrWebView = 'unknown';
  if (ua.includes('CriOS')) browserOrWebView = 'Chrome iOS';
  else if (ua.includes('FxiOS')) browserOrWebView = 'Firefox iOS';
  else if (ua.includes('EdgiOS')) browserOrWebView = 'Edge iOS';
  else if (ua.includes('Safari') && ua.includes('Mobile')) browserOrWebView = 'Safari Mobile';
  else if (ua.includes('Chrome')) browserOrWebView = 'Chrome';
  else if (ua.includes('Firefox')) browserOrWebView = 'Firefox';
  else if (ua.includes('Safari')) browserOrWebView = 'Safari';
  else if (ua.includes('wv')) browserOrWebView = 'WebView';

  const attachments: Array<{ filename: string; type: string }> = [];
  if (hasScreenshot && screenshotMime) {
    const ext = screenshotMime === 'image/jpeg' ? 'jpg'
              : screenshotMime === 'image/webp' ? 'webp'
              : screenshotMime === 'image/heic' ? 'heic'
              : 'png';
    attachments.push({ filename: `screenshot.${ext}`, type: screenshotMime });
  }

  const obj = {
    schemaVersion: 1,
    report: {
      id: report.id,
      reference: ref,
      status: report.status,
      category: report.category || null,
      description: report.description,
      createdAt: new Date(report.created_at).toISOString(),
      currentRoute: report.current_route || null,
    },
    application: {
      version: report.app_version || null,
      platform: report.platform || 'web',
      browserOrWebView,
      viewport,
    },
    user: {
      // Safe internal ID only — no email, no phone
      id: report.submitted_by_user_id,
      displayName: report.submitted_by_name || null,
      companyId: report.company_id ? String(report.company_id) : null,
      companyName: report.company_name || null,
    },
    diagnosticSummary: {
      online: diagSummary.online,
      locationPermission: diagSummary.locationPermission,
      gpsStatus: diagSummary.gpsStatus,
      cameraStatus: diagSummary.cameraStatus,
      activeDriverSessionId: diagSummary.activeDriverSessionId,
      lastFailedApiRequest: diagSummary.lastFailedApiRequest,
      lastJsError: diagSummary.lastJsError,
    },
    attachments,
  };

  return JSON.stringify(obj, null, 2);
}

// ── timeline.jsonl ────────────────────────────────────────────────────────────

const SENSITIVE_PATH_SEGMENTS = /\/(password|token|secret|auth|session|cookie|pin|otp|key|credential)/i;

function sanitisePath(path: string | undefined): string | undefined {
  if (!path) return path;
  // Replace numeric IDs with :id
  let safe = path.replace(/\/\d+/g, '/:id');
  // Replace UUIDs
  safe = safe.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
  // Redact sensitive segments
  if (SENSITIVE_PATH_SEGMENTS.test(safe)) {
    safe = safe.replace(SENSITIVE_PATH_SEGMENTS, '/[redacted]');
  }
  return safe;
}

function sanitiseMsg(msg: string): string {
  // Strip file paths
  let s = msg.replace(/(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z]{2,4}/g, '[file]');
  // Strip URLs
  s = s.replace(/https?:\/\/[^\s"')]+/g, '[url]');
  // Strip query strings
  s = s.replace(/\?[^\s"')]+/g, '');
  return s.slice(0, 300);
}

export function buildTimelineJsonl(events: DiagEvent[], reportCreatedAt: string): string {
  const reportTs = new Date(reportCreatedAt).getTime();

  // Sort oldest first, cap at 100
  const sorted = [...events]
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 100);

  const lines = sorted.map(ev => {
    const offsetSeconds = Math.round((ev.ts - reportTs) / 1000);
    const base: Record<string, unknown> = {
      timestamp: new Date(ev.ts).toISOString(),
      offsetSeconds,
      type: ev.type,
    };
    if (ev.route) base.route = ev.route;
    base.message = sanitiseMsg(ev.msg);
    if (ev.type === 'api_request') {
      base.method = ev.method;
      base.path = sanitisePath(ev.path);
      if (ev.status !== undefined) base.status = ev.status;
      if (ev.duration !== undefined) base.durationMs = ev.duration;
      delete base.message; // path+status is sufficient
    }
    return JSON.stringify(base);
  });

  // Append a synthetic "report submitted" sentinel
  lines.push(JSON.stringify({
    timestamp: new Date(reportTs).toISOString(),
    offsetSeconds: 0,
    type: 'bug_report',
    route: events[events.length - 1]?.route ?? null,
    message: 'Report submitted',
  }));

  return lines.join('\n') + '\n';
}

// ── Screenshot filename ───────────────────────────────────────────────────────

export function screenshotFilename(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'screenshot.jpg';
  if (mimeType === 'image/webp') return 'screenshot.webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'screenshot.heic';
  return 'screenshot.png';
}
