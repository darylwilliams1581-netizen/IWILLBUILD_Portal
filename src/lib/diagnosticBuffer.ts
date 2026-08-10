/**
 * diagnosticBuffer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory circular diagnostic buffer.
 *
 * Keeps only events from the previous 60 seconds.
 * Hard caps: 100 events, 64 KB serialised.
 * Resets on logout (call resetDiagnosticBuffer()).
 *
 * NEVER records: passwords, tokens, PINs, cookies, GPS coordinates,
 * form contents, request/response bodies, or any key matching the
 * REDACT_KEYS list.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiagEventType =
  | 'route_change'
  | 'action'
  | 'js_error'
  | 'unhandled_rejection'
  | 'api_request'
  | 'network_change'
  | 'permission_change'
  | 'camera_state'
  | 'gps_state'
  | 'driver_session'
  | 'map_state'
  | 'app_state'
  | 'feature_flag'
  | 'error_boundary';

export interface DiagEvent {
  ts: number;           // epoch ms
  type: DiagEventType;
  msg: string;          // safe human-readable message
  route?: string;       // current pathname at time of event
  status?: number;      // HTTP status (api_request)
  duration?: number;    // ms (api_request)
  meta?: Record<string, string | number | boolean>; // safe key/value only
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_MS   = 60_000;   // 60 seconds
const MAX_EVENTS  = 100;
const MAX_BYTES   = 64 * 1024; // 64 KB

/** Keys whose values must be redacted from meta */
const REDACT_KEYS = new Set([
  'password', 'token', 'secret', 'authorization', 'cookie', 'session',
  'apikey', 'otp', 'pin', 'code', 'signature', 'phone', 'address',
  'latitude', 'longitude', 'lat', 'lng',
]);

// ── Buffer ────────────────────────────────────────────────────────────────────

let _buffer: DiagEvent[] = [];

function pruneOld(): void {
  const cutoff = Date.now() - WINDOW_MS;
  _buffer = _buffer.filter(e => e.ts >= cutoff);
}

function pruneSize(): void {
  // Enforce event count cap
  if (_buffer.length > MAX_EVENTS) {
    _buffer = _buffer.slice(_buffer.length - MAX_EVENTS);
  }
  // Enforce byte cap — drop oldest until under limit
  while (_buffer.length > 0) {
    try {
      if (JSON.stringify(_buffer).length <= MAX_BYTES) break;
    } catch { break; }
    _buffer.shift();
  }
}

/** Sanitise meta — redact sensitive keys, stringify non-primitives */
function sanitiseMeta(
  meta?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    const lk = k.toLowerCase().replace(/[_-]/g, '');
    if (REDACT_KEYS.has(lk)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (v !== null && v !== undefined) {
      out[k] = String(v).slice(0, 200);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Sanitise a URL pathname — strip query params, replace numeric IDs */
export function sanitisePath(path: string): string {
  try {
    // Strip query string
    const clean = path.split('?')[0] ?? path;
    // Replace numeric segments with :id
    return clean.replace(/\/\d+(?=\/|$)/g, '/:id');
  } catch {
    return '/unknown';
  }
}

/** Sanitise an error message — remove file paths, tokens, query strings */
export function sanitiseErrorMsg(msg: string): string {
  return msg
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .replace(/\/[a-zA-Z0-9_/.-]+\.(ts|tsx|js|jsx|mjs)/g, '[file]')
    .replace(/[?&][^=\s]+=[^\s&]*/g, '')
    .slice(0, 300);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Push a diagnostic event into the buffer */
export function pushDiagEvent(
  type: DiagEventType,
  msg: string,
  extras?: {
    route?: string;
    status?: number;
    duration?: number;
    meta?: Record<string, unknown>;
  },
): void {
  try {
    pruneOld();
    const event: DiagEvent = {
      ts: Date.now(),
      type,
      msg: msg.slice(0, 300),
      ...(extras?.route    !== undefined && { route: extras.route }),
      ...(extras?.status   !== undefined && { status: extras.status }),
      ...(extras?.duration !== undefined && { duration: Math.round(extras.duration) }),
    };
    const meta = sanitiseMeta(extras?.meta);
    if (meta) event.meta = meta;
    _buffer.push(event);
    pruneSize();
  } catch {
    // Never crash the app
  }
}

/** Take an immutable snapshot of the current buffer (for submission) */
export function snapshotDiagBuffer(): DiagEvent[] {
  try {
    pruneOld();
    return JSON.parse(JSON.stringify(_buffer)) as DiagEvent[];
  } catch {
    return [];
  }
}

/** Reset the buffer — call on logout */
export function resetDiagnosticBuffer(): void {
  _buffer = [];
}
