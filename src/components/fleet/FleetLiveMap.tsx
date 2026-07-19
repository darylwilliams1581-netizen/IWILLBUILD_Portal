/**
 * FleetLiveMap — Live GPS tracking map for all active driving sessions.
 *
 * Uses Leaflet (OpenStreetMap tiles — no API key required).
 * Auto-refreshes every 5 seconds.
 * Shows a styled pin per active driver with popup: name, vehicle, speed, last seen.
 * Admins/owners/managers only (API enforces this too).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2, MapPin, RefreshCw, AlertCircle, Navigation,
  Truck, Clock, Gauge, Users, ZoomIn, ZoomOut, Crosshair,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveSession {
  session_id: number;
  fleet_asset_id: number;
  driver_name: string;
  start_at: string;
  status: string;
  asset_name: string;
  asset_type: string;
  rego: string | null;
  lat: number | null;
  lng: number | null;
  speed_kmh: number | null;
  heading: number | null;
  last_seen_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(isoStart: string): string {
  const ms = Date.now() - new Date(isoStart).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'No GPS yet';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** Build the HTML for a driver map pin */
function buildPinHtml(driverName: string, selected: boolean): string {
  const initials = driverName
    .split(' ')
    .map(w => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const bg = selected ? '#ea580c' : '#f97316';
  const ring = selected ? '#fff7ed' : '#fff';
  const shadow = selected
    ? '0 4px 16px rgba(249,115,22,0.55)'
    : '0 2px 10px rgba(0,0,0,0.28)';

  return `
    <div style="position:relative;width:40px;height:48px;">
      <!-- Pulse ring (always shown for active drivers) -->
      <div style="
        position:absolute;top:50%;left:50%;
        transform:translate(-50%,-60%);
        width:52px;height:52px;border-radius:50%;
        background:${bg};opacity:0.18;
        animation:fleet-pulse 2s ease-out infinite;
        pointer-events:none;
      "></div>
      <!-- Pin body -->
      <div style="
        position:absolute;top:0;left:50%;transform:translateX(-50%);
        width:36px;height:36px;border-radius:50% 50% 50% 0;
        background:${bg};
        border:3px solid ${ring};
        box-shadow:${shadow};
        transform:translateX(-50%) rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
      ">
        <span style="
          transform:rotate(45deg);
          color:#fff;font-size:11px;font-weight:800;
          font-family:system-ui,sans-serif;letter-spacing:-0.5px;
          line-height:1;
        ">${initials}</span>
      </div>
      <!-- Pin tip shadow -->
      <div style="
        position:absolute;bottom:0;left:50%;transform:translateX(-50%);
        width:8px;height:4px;border-radius:50%;
        background:rgba(0,0,0,0.18);
      "></div>
    </div>
  `;
}

// ── Driver sidebar card ───────────────────────────────────────────────────────

function DriverCard({
  session,
  selected,
  onClick,
}: {
  session: LiveSession;
  selected: boolean;
  onClick: () => void;
}) {
  const hasGps = session.lat != null && session.lng != null;
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left px-3 py-2.5 rounded-xl border transition-all',
        selected
          ? 'bg-orange-50 border-orange-300 shadow-sm'
          : 'bg-white border-slate-200 hover:border-orange-200 hover:bg-orange-50/40',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <div className={[
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          hasGps ? 'bg-emerald-100 border border-emerald-200' : 'bg-slate-100 border border-slate-200',
        ].join(' ')}>
          <Truck size={13} className={hasGps ? 'text-emerald-600' : 'text-slate-400'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800 truncate">{session.driver_name}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {session.asset_name}{session.rego ? ` · ${session.rego}` : ''}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <Clock size={9} />{formatDuration(session.start_at)}
            </span>
            {session.speed_kmh != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                <Gauge size={9} />{Math.round(session.speed_kmh)} km/h
              </span>
            )}
            <span className={[
              'text-[10px] font-medium',
              hasGps ? 'text-emerald-600' : 'text-amber-500',
            ].join(' ')}>
              {hasGps ? formatLastSeen(session.last_seen_at) : 'No GPS'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FleetLiveMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<number, any>>(new Map());
  const hasFitRef = useRef(false);

  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [mapReady, setMapReady] = useState(false);
  const [mapHeight, setMapHeight] = useState(400); // explicit px height for Leaflet

  // ── Track wrapper height so Leaflet always has a real pixel size ──────────
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) {
        setMapHeight(h);
        leafletMapRef.current?.invalidateSize();
      }
    });
    ro.observe(el);
    // Set initial height immediately
    const h = el.getBoundingClientRect().height;
    if (h > 0) setMapHeight(h);
    return () => ro.disconnect();
  }, []);

  // ── Fetch live sessions ─────────────────────────────────────────────────────
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/driver-sessions/live', { credentials: 'include' });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to load');
      }
      const data = await res.json() as { sessions: LiveSession[] };
      setSessions(data.sessions ?? []);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load live sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Inject pulse keyframe CSS once ─────────────────────────────────────────
  useEffect(() => {
    const id = 'fleet-pulse-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes fleet-pulse {
        0%   { transform: translate(-50%, -60%) scale(0.6); opacity: 0.22; }
        70%  { transform: translate(-50%, -60%) scale(1.6); opacity: 0; }
        100% { transform: translate(-50%, -60%) scale(1.6); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Load Leaflet CSS ───────────────────────────────────────────────────────
  useEffect(() => {
    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);

  // ── Load Leaflet (bundled via dynamic import — never runs during SSR) ────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function loadLeafletGlobal(): Promise<any> {
    return import('leaflet');
  }

  // ── Init Leaflet map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    // Defer until the container actually has dimensions to avoid _leaflet_pos errors
    const container = mapRef.current;
    let rafId: number;

    function tryInit() {
      if (!container || leafletMapRef.current) return;
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }

      loadLeafletGlobal().then((L) => {
        if (!container || leafletMapRef.current) return;

        // Fix default icon paths
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (L.Icon.Default.prototype as any)._getIconUrl;
        } catch (_) { /* CDN global doesn't need this */ }
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        // ── Leaflet _leaflet_pos crash fix ─────────────────────────────────────
        // getPosition() at leaflet.js:1570 is a closure-local variable — patching
        // L.DomUtil.getPosition has no effect on it. The only reliable fix is to
        // override _getMapPanePos on the prototype so it never calls that closure,
        // instead reading _leaflet_pos directly (which is all getPosition does).
        // We always re-apply — no guard flag — so HMR remounts stay protected.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Lany = L as any;
        const MapProto = Lany.Map?.prototype;
        if (MapProto) {
          // Override _getMapPanePos to bypass the closure-local getPosition entirely
          MapProto._getMapPanePos = function safeGetMapPanePos(this: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const self = this as any;
            if (!self._mapPane) return Lany.point(0, 0);
            // Seed _leaflet_pos if missing — same as what setPosition() would do
            if (!self._mapPane._leaflet_pos) {
              self._mapPane._leaflet_pos = Lany.point(0, 0);
            }
            return self._mapPane._leaflet_pos;
          };
          // Also guard _rawPanBy which calls _getMapPanePos during construction
          const origRawPanBy = MapProto._rawPanBy;
          MapProto._rawPanBy = function safeRawPanBy(this: unknown, ...args: unknown[]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const self = this as any;
            if (self._mapPane && !self._mapPane._leaflet_pos) {
              self._mapPane._leaflet_pos = Lany.point(0, 0);
            }
            try { return origRawPanBy.apply(this, args); } catch (_) { /* ignore */ }
          };
        }

        const map = L.map(container, {
          center: [-27.4698, 153.0251] as [number, number],
          zoom: 11,
          zoomControl: false,
          attributionControl: true,
          fadeAnimation: false,
          markerZoomAnimation: false,
          zoomAnimation: false,
          inertia: false,
          tap: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        leafletMapRef.current = map;

        // Now safe to call invalidateSize — panes are initialised
        const sizes = [0, 50, 200, 500, 1000];
        sizes.forEach((ms) => setTimeout(() => {
          try { map.invalidateSize(); } catch (_) { /* ignore if removed */ }
        }, ms));

        // Watch for container resize
        if (typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => {
            try { map.invalidateSize(); } catch (_) { /* ignore */ }
          });
          ro.observe(container);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (container as any).__ro = ro;
        }

        setMapReady(true);
      }).catch(console.error);
    }

    rafId = requestAnimationFrame(tryInit);

    return () => {
      cancelAnimationFrame(rafId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (container as any).__ro?.disconnect();
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // ── Invalidate size when map becomes ready ─────────────────────────────────
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    const t = setTimeout(() => leafletMapRef.current?.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [mapReady]);

  // ── Update markers when sessions change ─────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;

    loadLeafletGlobal().then((L) => {
      const map = leafletMapRef.current;
      if (!map) return;

      const activeIds = new Set(sessions.map(s => s.session_id));

      // Remove stale markers
      markersRef.current.forEach((marker, id) => {
        if (!activeIds.has(id)) {
          map.removeLayer(marker);
          markersRef.current.delete(id);
        }
      });

      // Add / update markers
      sessions.forEach((session) => {
        if (session.lat == null || session.lng == null) return;

        const lat = Number(session.lat);
        const lng = Number(session.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const isSelected = selectedId === session.session_id;

        const icon = L.divIcon({
          className: '',
          html: buildPinHtml(session.driver_name, isSelected),
          iconSize: [40, 48],
          iconAnchor: [20, 48],
          popupAnchor: [0, -52],
        });

        const popupHtml = `
          <div style="font-family:system-ui,sans-serif;min-width:190px;padding:2px 0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="
                width:32px;height:32px;border-radius:50%;
                background:#f97316;display:flex;align-items:center;justify-content:center;
                color:#fff;font-size:12px;font-weight:800;flex-shrink:0;
              ">${session.driver_name.split(' ').map((w: string) => w[0] ?? '').slice(0,2).join('').toUpperCase()}</div>
              <div>
                <div style="font-weight:700;font-size:13px;color:#1e293b;line-height:1.2;">${session.driver_name}</div>
                <div style="font-size:11px;color:#64748b;">${session.asset_name}${session.rego ? ` · ${session.rego}` : ''}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding-top:6px;border-top:1px solid #f1f5f9;">
              ${session.speed_kmh != null ? `
                <div style="background:#f8fafc;border-radius:8px;padding:5px 8px;text-align:center;">
                  <div style="font-size:16px;font-weight:800;color:#f97316;">${Math.round(Number(session.speed_kmh))}</div>
                  <div style="font-size:10px;color:#94a3b8;font-weight:600;">km/h</div>
                </div>
              ` : ''}
              <div style="background:#f8fafc;border-radius:8px;padding:5px 8px;text-align:center;">
                <div style="font-size:14px;font-weight:800;color:#1e293b;">${formatDuration(session.start_at)}</div>
                <div style="font-size:10px;color:#94a3b8;font-weight:600;">driving</div>
              </div>
            </div>
            <div style="margin-top:6px;font-size:10px;color:#94a3b8;text-align:center;">
              GPS updated ${formatLastSeen(session.last_seen_at)}
            </div>
          </div>
        `;

        const existing = markersRef.current.get(session.session_id);
        if (existing) {
          existing.setLatLng([lat, lng]);
          existing.setIcon(icon);
          existing.setPopupContent(popupHtml);
        } else {
          const marker = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(popupHtml, { maxWidth: 220 });
          markersRef.current.set(session.session_id, marker);
        }
      });

      // Auto-fit bounds only on first load with GPS data
      if (!hasFitRef.current) {
        const gpsPoints = sessions.filter(s => s.lat != null && s.lng != null);
        if (gpsPoints.length > 0) {
          try {
            const bounds = L.latLngBounds(
              gpsPoints.map(s => [Number(s.lat), Number(s.lng)] as [number, number])
            );
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15, animate: false });
            hasFitRef.current = true;
          } catch (_) { /* ignore _leaflet_pos errors during layout */ }
        }
      }
    }).catch(console.error);
  }, [sessions, mapReady, selectedId]);

  // ── Pan to selected driver ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !leafletMapRef.current) return;
    const session = sessions.find(s => s.session_id === selectedId);
    if (!session || session.lat == null || session.lng == null) return;
    try {
      leafletMapRef.current.setView([Number(session.lat), Number(session.lng)], 16, { animate: false });
      const marker = markersRef.current.get(selectedId);
      if (marker) marker.openPopup();
    } catch (_) { /* ignore _leaflet_pos errors during layout */ }
  }, [selectedId, sessions]);

  // ── Initial load + auto-refresh every 5s ───────────────────────────────────
  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(() => void fetchSessions(true), 5_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // ── Zoom control handlers ───────────────────────────────────────────────────
  function handleZoomIn() {
    try { leafletMapRef.current?.zoomIn(1, { animate: false }); } catch (_) { /* ignore */ }
  }
  function handleZoomOut() {
    try { leafletMapRef.current?.zoomOut(1, { animate: false }); } catch (_) { /* ignore */ }
  }
  function handleFitAll() {
    if (!leafletMapRef.current) return;
    loadLeafletGlobal().then((L) => {
      const gpsPoints = sessions.filter(s => s.lat != null && s.lng != null);
      if (gpsPoints.length === 0) return;
      const bounds = L.latLngBounds(
        gpsPoints.map(s => [Number(s.lat), Number(s.lng)] as [number, number])
      );
      try { leafletMapRef.current?.fitBounds(bounds, { padding: [80, 80], maxZoom: 15, animate: false }); } catch (_) { /* ignore _leaflet_pos */ }
    }).catch(console.error);
  }

  const withGps = sessions.filter(s => s.lat != null && s.lng != null);
  const noGps   = sessions.filter(s => s.lat == null || s.lng == null);

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ height: '100%' }}>
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 border-b border-slate-200 bg-white shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
            <Navigation size={13} className="text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Live GPS Tracking</p>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {sessions.length} active driver{sessions.length !== 1 ? 's' : ''} · refreshes every 5s
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Stats pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-semibold text-emerald-700">
            <MapPin size={10} />
            {withGps.length} on map
          </span>
          {noGps.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-[11px] font-semibold text-amber-700">
              <AlertCircle size={10} />
              {noGps.length} no GPS
            </span>
          )}
        </div>

        <button
          onClick={() => void fetchSessions()}
          disabled={loading}
          title="Refresh now"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Body: sidebar + map */}
      <div className="flex flex-1 min-h-0" style={{ minHeight: 0 }}>
        {/* Driver sidebar */}
        <div className="hidden sm:flex w-56 md:w-64 shrink-0 border-r border-slate-200 bg-[#F4F5F7] flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-200 bg-white">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={10} />
              Active Drivers
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {loading && sessions.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 py-8 px-2 text-center">
                <AlertCircle size={20} className="text-red-400" />
                <p className="text-xs text-red-500">{error}</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 px-2 text-center">
                <Truck size={24} className="text-slate-300" />
                <p className="text-xs font-semibold text-slate-400">No active drivers</p>
                <p className="text-[11px] text-slate-400">Drivers will appear here when they start a session</p>
              </div>
            ) : (
              sessions.map(session => (
                <DriverCard
                  key={session.session_id}
                  session={session}
                  selected={selectedId === session.session_id}
                  onClick={() => setSelectedId(
                    selectedId === session.session_id ? null : session.session_id
                  )}
                />
              ))
            )}
          </div>

          {/* Last refresh footer */}
          <div className="px-3 py-2 border-t border-slate-200 bg-white">
            <p className="text-[10px] text-slate-400">
              Last updated: {lastRefresh.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Map area */}
        <div ref={mapWrapRef} className="flex-1 relative min-w-0 min-h-0" style={{ minHeight: 0 }}>
          {/* Leaflet map container — explicit pixel height so Leaflet can measure it */}
          <div
            ref={mapRef}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${mapHeight}px`, zIndex: 0 }}
          />

          {/* Custom zoom controls — top-right */}
          <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1" style={{ zIndex: 1000 }}>
            <button
              onClick={handleZoomIn}
              title="Zoom in"
              className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors"
            >
              <ZoomIn size={15} className="text-slate-600" />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom out"
              className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors"
            >
              <ZoomOut size={15} className="text-slate-600" />
            </button>
            {withGps.length > 0 && (
              <button
                onClick={handleFitAll}
                title="Fit all drivers"
                className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors mt-1"
              >
                <Crosshair size={14} className="text-orange-500" />
              </button>
            )}
          </div>

          {/* No GPS overlay */}
          {!loading && sessions.length > 0 && withGps.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
              <div className="bg-white/95 backdrop-blur-sm border border-amber-200 rounded-2xl px-6 py-5 shadow-lg text-center max-w-xs">
                <AlertCircle size={28} className="text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">Waiting for GPS</p>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  {sessions.length} driver{sessions.length !== 1 ? 's are' : ' is'} active but
                  {sessions.length !== 1 ? " haven't" : " hasn't"} sent a GPS point yet.
                </p>
                <ul className="text-left text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
                  <li className="flex items-start gap-1.5"><span className="text-amber-400 shrink-0 mt-0.5">•</span>Driver must have the portal open in their browser</li>
                  <li className="flex items-start gap-1.5"><span className="text-amber-400 shrink-0 mt-0.5">•</span>Browser must grant location permission when prompted</li>
                  <li className="flex items-start gap-1.5"><span className="text-amber-400 shrink-0 mt-0.5">•</span>First GPS fix can take up to 30s outdoors</li>
                </ul>
              </div>
            </div>
          )}

          {/* Empty state overlay */}
          {!loading && sessions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
              <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl px-8 py-6 shadow-lg text-center max-w-sm">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Navigation size={24} className="text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-700">No active sessions</p>
                <p className="text-xs text-slate-500 mt-1">
                  When a driver starts a session and their device sends GPS data, their live location will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
