/**
 * BugReportModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating action button + slide-up modal for submitting bug reports.
 *
 * Visibility: Manager / Admin / Owner / Platform Owner only.
 * Attaches a 60-second diagnostic snapshot and safe device context.
 * Does NOT auto-capture screenshots — user must explicitly attach one.
 *
 * Usage: <BugReportModal /> — drop it anywhere in the layout tree.
 */
import { useState, useRef } from 'react';
import {
  Bug, X, Image, ChevronDown, Send, CheckCircle2,
  AlertCircle, Loader2, Paperclip, ChevronRight, Info,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { snapshotDiagBuffer, pushDiagEvent, type DiagEvent } from '@/lib/diagnosticBuffer';
import { compressScreenshot } from '@/lib/imageCompressor';
import { getStorageDiagnostics, type StorageDiagnostics } from '@/lib/storageDiagnostics';

// ── Categories ────────────────────────────────────────────────────────────────

export const BUG_CATEGORIES = [
  { value: 'ui_display',      label: 'UI / Display issue' },
  { value: 'data_incorrect',  label: 'Incorrect data' },
  { value: 'feature_broken',  label: 'Feature not working' },
  { value: 'performance',     label: 'Slow / performance' },
  { value: 'crash',           label: 'App crash / error' },
  { value: 'photos_upload',   label: 'Photos / uploads' },
  { value: 'maps_gps',        label: 'Maps / GPS' },
  { value: 'notifications',   label: 'Notifications' },
  { value: 'permissions',     label: 'Permissions / access' },
  { value: 'other',           label: 'Other' },
] as const;

// ── Roles allowed to see the FAB ──────────────────────────────────────────────
const ALLOWED_ROLES = new Set(['manager', 'admin', 'owner']);

// ── Device context (safe, no GPS coords) ─────────────────────────────────────
function collectDeviceContext(): Record<string, string | number | boolean> {
  const ctx: Record<string, string | number | boolean> = {};
  try {
    ctx.viewport_w = window.innerWidth;
    ctx.viewport_h = window.innerHeight;
    ctx.pixel_ratio = window.devicePixelRatio ?? 1;
    ctx.online = navigator.onLine;
    ctx.platform = navigator.platform ?? 'unknown';
    // Detect Capacitor native
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (cap) {
      ctx.capacitor = true;
      ctx.native_platform = cap.getPlatform?.() ?? 'unknown';
    } else {
      ctx.capacitor = false;
      // Detect PWA
      const isPwa =
        window.matchMedia('(display-mode: standalone)').matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true;
      ctx.pwa = isPwa;
    }
  } catch { /* non-fatal */ }
  return ctx;
}

/**
 * Collect GPS-specific diagnostics from the active driver session context
 * stored on window by DriverSessionContext. Safe — never includes coordinates.
 */
function collectGpsDiagnostics(): Record<string, string | number | boolean> {
  const ctx: Record<string, string | number | boolean> = {};
  try {
    // DriverSessionContext exposes a debug snapshot on window.__driverSessionDebug
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbg = (window as any).__driverSessionDebug as Record<string, unknown> | undefined;
    if (dbg) {
      if (typeof dbg.session_id === 'number')   ctx.active_driver_session_id = dbg.session_id;
      if (typeof dbg.gps_status === 'string')   ctx.gps_status = dbg.gps_status;
      if (typeof dbg.permission_status === 'string') ctx.gps_permission_status = dbg.permission_status;
      if (typeof dbg.last_heartbeat_at === 'string') {
        ctx.last_heartbeat_at = dbg.last_heartbeat_at;
        const ageMs = Date.now() - new Date(dbg.last_heartbeat_at).getTime();
        ctx.last_heartbeat_age_s = Math.round(ageMs / 1000);
      }
      if (typeof dbg.last_telemetry_at === 'string') {
        ctx.last_telemetry_at = dbg.last_telemetry_at;
        const ageMs = Date.now() - new Date(dbg.last_telemetry_at).getTime();
        ctx.last_telemetry_age_s = Math.round(ageMs / 1000);
      }
      if (typeof dbg.is_tracking === 'boolean') ctx.gps_tracking_active = dbg.is_tracking;
    }
    // Geolocation permission via Permissions API (web only)
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        // Best-effort — result arrives after submission, captured in diag buffer
        pushDiagEvent('gps_state', `Geolocation permission: ${result.state}`, {
          meta: { permission_state: result.state },
        });
      }).catch(() => { /* non-fatal */ });
    }
  } catch { /* non-fatal */ }
  return ctx;
}

function detectPlatform(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (cap) {
      const p = cap.getPlatform?.() ?? 'native';
      return p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'native';
    }
    if (window.matchMedia('(display-mode: standalone)').matches ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true) {
      return 'pwa';
    }
    return 'web';
  } catch {
    return 'web';
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'open' | 'submitting' | 'success';

// ── Component ─────────────────────────────────────────────────────────────────

export default function BugReportModal() {
  const { role, isPlatformOwner, loading: permsLoading } = usePermissions();

  // Role gate — only show to manager/admin/owner/platform-owner
  const canSeeFab = !permsLoading && (
    isPlatformOwner ||
    (role !== null && ALLOWED_ROLES.has(role))
  );

  const [phase, setPhase]             = useState<Phase>('idle');
  const [category, setCategory]       = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot]   = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [diagExpanded, setDiagExpanded] = useState(false);
  const [diagPreview, setDiagPreview] = useState<DiagEvent[]>([]);
  const [storageDiag, setStorageDiag] = useState<StorageDiagnostics | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openModal() {
    const snap = snapshotDiagBuffer();
    setDiagPreview(snap);
    setPhase('open');
    setCategory('');
    setDescription('');
    setScreenshot(null);
    setScreenshotPreview(null);
    setErrorMsg('');
    setDiagExpanded(false);
    void getStorageDiagnostics().then(setStorageDiag).catch(() => { /* non-fatal */ });
  }

  function closeModal() {
    if (phase === 'submitting') return;
    // Revoke preview URL on close to free memory immediately
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setPhase('idle');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Screenshot must be under 10 MB.');
      return;
    }
    // Revoke any previous preview URL to free memory
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(file);
    setErrorMsg('');
    // Use object URL — never store base64 in state (can be 2–5 MB for phone screenshots)
    setScreenshotPreview(URL.createObjectURL(file));
  }

  function removeScreenshot() {
    // Revoke the object URL to release memory immediately
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setErrorMsg('Please describe the issue.'); return; }
    setErrorMsg('');
    setPhase('submitting');

    try {
      // Take a fresh snapshot at submission time
      const diagSnapshot = snapshotDiagBuffer();
      const deviceCtx = collectDeviceContext();
      const platform = detectPlatform();

      // For GPS/Maps bugs, enrich device context with GPS session diagnostics
      const isGpsBug = category === 'maps_gps';
      const gpsDiag = isGpsBug ? collectGpsDiagnostics() : {};
      if (isGpsBug) {
        // Push a summary event into the buffer so it appears in the timeline
        pushDiagEvent('gps_state', 'GPS bug report submitted — GPS diagnostics collected', {
          meta: gpsDiag as Record<string, string | number | boolean>,
        });
      }

      // Always include storage diagnostics — useful for photos/upload bugs
      let storageDiagCtx: Record<string, string | number | boolean> = {};
      try {
        const sd = await getStorageDiagnostics();
        storageDiagCtx = {
          storage_queued_items:  sd.queue.queuedItemCount,
          storage_queued_bytes:  sd.queue.totalQueuedBytes,
          storage_manager_api:   sd.storageManagerSupported,
          ...(sd.quota ? {
            storage_used_pct:    sd.quota.usedPercent,
            storage_level:       sd.quota.level,
          } : {}),
          ...(sd.queue.lastUploadFailureAt ? {
            last_upload_failure: sd.queue.lastUploadFailureAt,
          } : {}),
        };
      } catch { /* non-fatal */ }

      const enrichedDeviceCtx = { ...deviceCtx, ...gpsDiag, ...storageDiagCtx };

      const formData = new FormData();
      formData.append('category', category);
      formData.append('description', description.trim());
      formData.append('page_url', window.location.href);
      formData.append('user_agent', navigator.userAgent);
      formData.append('platform', platform);
      formData.append('app_version', __APP_VERSION__);
      formData.append('current_route', window.location.pathname);
      formData.append('diagnostic_events', JSON.stringify(diagSnapshot));
      formData.append('device_context', JSON.stringify(enrichedDeviceCtx));

      // Compress screenshot before upload — max 1280px, 0.75q
      // This reduces a typical phone screenshot from ~3 MB to ~200–400 KB
      if (screenshot) {
        const compressed = await compressScreenshot(screenshot);
        formData.append('screenshot', compressed);
        // Revoke the preview URL now — we no longer need it in memory
        if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
      }

      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await res.json() as { ok?: boolean; error?: string; id?: number };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'Failed to submit. Please try again.');
        setPhase('open');
        return;
      }

      setPhase('success');
      setTimeout(() => setPhase('idle'), 4000);
    } catch {
      setErrorMsg('Network error. Please try again.');
      setPhase('open');
    }
  }

  // Don't render anything until permissions are known, or if not allowed
  if (!canSeeFab) return null;

  return (
    <>
      {/* ── FAB ── */}
      {phase === 'idle' && (
        <div
          className="fixed z-40"
          style={{
            bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
            right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <button
            onClick={openModal}
            title="Report a bug"
            aria-label="Report a bug"
            className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          >
            <Bug size={20} className="text-slate-300" />
          </button>
        </div>
      )}

      {/* ── Success toast ── */}
      {phase === 'success' && (
        <div
          className="fixed z-50 flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-xl"
          style={{
            bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
            right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
          }}
        >
          <CheckCircle2 size={16} />
          Thanks — your report was received.
        </div>
      )}

      {/* ── Modal backdrop ── */}
      {(phase === 'open' || phase === 'submitting') && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 3.5rem)',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: 'min(calc(100dvh - max(env(safe-area-inset-top, 0px), 3.5rem) - env(safe-area-inset-bottom, 0px)), 680px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center">
                  <Bug size={15} className="text-red-500" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-sm leading-tight">Report a Bug</h2>
                  <p className="text-xs text-slate-400">Help us improve IWILLBUILD</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                disabled={phase === 'submitting'}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable form body */}
            <div className="overflow-y-auto flex-1">
              <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
                {/* Category dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <div className="relative">
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-base sm:text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-8"
                      disabled={phase === 'submitting'}
                    >
                      <option value="">Select a category…</option>
                      {BUG_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Description <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What happened? What were you trying to do? What did you expect?"
                    rows={4}
                    maxLength={2000}
                    disabled={phase === 'submitting'}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base sm:text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-slate-300"
                  />
                  <p className="text-right text-[11px] text-slate-300 mt-0.5">{description.length}/2000</p>
                </div>

                {/* Screenshot */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Screenshot <span className="text-slate-300 font-normal normal-case">(optional)</span>
                  </label>

                  {/* Privacy notice for screenshot */}
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 leading-relaxed">
                    The screenshot may contain information visible on your screen and will be sent to IWILLBUILD support.
                  </p>

                  {screenshotPreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                      <img
                        src={screenshotPreview}
                        alt="Screenshot preview"
                        className="w-full max-h-40 object-contain"
                      />
                      <button
                        type="button"
                        onClick={removeScreenshot}
                        disabled={phase === 'submitting'}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                        aria-label="Remove screenshot"
                      >
                        <X size={12} />
                      </button>
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 text-white text-[11px] px-2 py-0.5 rounded-full">
                        <Image size={10} />
                        {screenshot?.name}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={phase === 'submitting'}
                      className="w-full border-2 border-dashed border-slate-200 hover:border-primary/40 rounded-xl py-5 flex flex-col items-center gap-2 text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
                    >
                      <Paperclip size={18} />
                      <span className="text-xs font-medium">Attach screenshot</span>
                      <span className="text-[11px] opacity-60">PNG, JPG, WebP — max 10 MB</span>
                    </button>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* Diagnostic info notice + expandable preview */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-start gap-2.5 px-3 py-3 bg-slate-50">
                    <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-500 leading-relaxed flex-1">
                      This report includes basic device information and the previous 60 seconds of technical events.
                      It does not include passwords, form contents or exact location.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiagExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors border-t border-slate-200"
                  >
                    <span className="font-medium">Diagnostic information ({diagPreview.length} events)</span>
                    <ChevronRight size={12} className={`transition-transform ${diagExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  {diagExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 max-h-40 overflow-y-auto">
                      {/* Storage diagnostics row */}
                      {storageDiag && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 pb-2 border-b border-slate-200">
                          {storageDiag.storageManagerSupported && storageDiag.quota && (
                            <span className="text-[10px] text-slate-400">
                              Storage: <span className={storageDiag.quota.level === 'critical' ? 'text-red-500 font-semibold' : storageDiag.quota.level === 'low' ? 'text-amber-500 font-semibold' : 'text-slate-500'}>
                                {storageDiag.quota.usedPercent}% used
                              </span>
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            Queue: <span className="text-slate-500">{storageDiag.queue.queuedItemCount} items ({storageDiag.queue.totalQueuedSizeLabel})</span>
                          </span>
                          {storageDiag.queue.lastUploadFailureAt && (
                            <span className="text-[10px] text-amber-500">
                              Last failure: {new Date(storageDiag.queue.lastUploadFailureAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      )}
                      {diagPreview.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No diagnostic events captured yet.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {diagPreview.map((ev, i) => {
                            const secsAgo = Math.round((Date.now() - ev.ts) / 1000);
                            return (
                              <div key={i} className="flex items-start gap-2 text-[10px] text-slate-500">
                                <span className="text-slate-400 shrink-0 font-mono w-10 text-right">-{secsAgo}s</span>
                                <span className="text-slate-400 shrink-0 bg-slate-200 px-1 rounded">{ev.type}</span>
                                <span className="break-all">{ev.msg}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Error */}
                {errorMsg && (
                  <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle size={13} className="shrink-0" />{errorMsg}
                  </div>
                )}

                {/* Current page hint */}
                <p className="text-[11px] text-slate-300 -mt-1">
                  Page: <span className="font-mono">{window.location.pathname}</span>
                </p>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={phase === 'submitting' || !description.trim()}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {phase === 'submitting'
                    ? <><Loader2 size={15} className="animate-spin" />Submitting…</>
                    : <><Send size={14} />Submit Bug Report</>
                  }
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── App version constant (injected by Vite define) ────────────────────────────
declare const __APP_VERSION__: string;
