/**
 * FleetLiveMap — Live GPS tracking map using Google Maps JS API.
 * Uses VITE_GOOGLE_MAPS_API_KEY. No Leaflet dependency.
 * Auto-refreshes every 5 seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Clock, Crosshair, Gauge, Loader2,
  MapPin, Navigation, RefreshCw, Truck, Users, ZoomIn, ZoomOut,
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

// ── Google Maps window types ──────────────────────────────────────────────────

type GMaps = typeof google.maps;
type GMap  = google.maps.Map;
type GMarker = google.maps.Marker;
type GInfoWindow = google.maps.InfoWindow;

type GoogleWindow = Window & typeof globalThis & {
  google?: { maps?: GMaps };
  __gmapsLoader?: Promise<void>;
  __gmapsLoaded?: boolean;
};

declare const window: GoogleWindow;

const GOOGLE_MAPS_KEY = (import.meta as { env: Record<string, string> }).env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const DEFAULT_CENTER  = { lat: -27.4698, lng: 153.0251 };
const DEFAULT_ZOOM    = 11;

// ── Google Maps script loader (singleton) ─────────────────────────────────────

function loadGoogleMaps(): Promise<void> {
  if (window.__gmapsLoaded) return Promise.resolve();
  if (window.__gmapsLoader) return window.__gmapsLoader;

  window.__gmapsLoader = new Promise<void>((resolve, reject) => {
    if (!GOOGLE_MAPS_KEY) {
      reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not set'));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.__gmapsLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  return window.__gmapsLoader;
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

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
}

/** Build SVG data-URL icon for a driver pin */
function buildMarkerIcon(driverName: string, selected: boolean): string {
  const bg   = selected ? '#ea580c' : '#f97316';
  const ring = selected ? '#fff7ed' : '#ffffff';
  const initials = getInitials(driverName);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
    <circle cx="20" cy="18" r="18" fill="${bg}" stroke="${ring}" stroke-width="3"/>
    <polygon points="12,30 28,30 20,46" fill="${bg}"/>
    <text x="20" y="23" text-anchor="middle" dominant-baseline="middle"
      font-family="system-ui,sans-serif" font-size="13" font-weight="800" fill="#fff">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildInfoWindowContent(session: LiveSession): string {
  const initials = getInitials(session.driver_name);
  return `
    <div style="font-family:system-ui,sans-serif;min-width:190px;padding:2px 0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#f97316;
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-size:12px;font-weight:800;flex-shrink:0;">${initials}</div>
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
          </div>` : ''}
        <div style="background:#f8fafc;border-radius:8px;padding:5px 8px;text-align:center;">
          <div style="font-size:14px;font-weight:800;color:#1e293b;">${formatDuration(session.start_at)}</div>
          <div style="font-size:10px;color:#94a3b8;font-weight:600;">driving</div>
        </div>
      </div>
      <div style="margin-top:6px;font-size:10px;color:#94a3b8;text-align:center;">
        GPS updated ${formatLastSeen(session.last_seen_at)}
      </div>
    </div>`;
}

// ── Driver sidebar card ───────────────────────────────────────────────────────

function DriverCard({
  session, selected, onClick,
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
            <span className={['text-[10px] font-medium', hasGps ? 'text-emerald-600' : 'text-amber-500'].join(' ')}>
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
  const mapRef     = useRef<HTMLDivElement>(null);
  const gMapRef    = useRef<GMap | null>(null);
  const markersRef = useRef<Map<number, GMarker>>(new Map());
  const infoWinRef = useRef<GInfoWindow | null>(null);
  const hasFitRef  = useRef(false);

  const [sessions,     setSessions]     = useState<LiveSession[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedId,   setSelectedId]   = useState<number | null>(null);
  const [lastRefresh,  setLastRefresh]  = useState<Date>(new Date());
  const [mapReady,     setMapReady]     = useState(false);
  const [mapError,     setMapError]     = useState<string | null>(null);

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

  // ── Init Google Map ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || gMapRef.current) return;
    let disposed = false;

    loadGoogleMaps()
      .then(() => {
        if (disposed || !mapRef.current || gMapRef.current) return;
        const map = new window.google!.maps!.Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });
        infoWinRef.current = new window.google!.maps!.InfoWindow({});
        gMapRef.current = map;
        setMapReady(true);
      })
      .catch((err: unknown) => {
        if (!disposed) setMapError(err instanceof Error ? err.message : 'Map failed to load');
      });

    return () => {
      disposed = true;
      // Clean up markers
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current.clear();
      infoWinRef.current?.close();
      gMapRef.current = null;
    };
  }, []);

  // ── Update markers when sessions change ─────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !gMapRef.current || !window.google?.maps) return;
    const map = gMapRef.current;
    const G   = window.google.maps;

    const activeIds = new Set(sessions.map(s => s.session_id));

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });

    // Add / update markers
    sessions.forEach(session => {
      if (session.lat == null || session.lng == null) return;
      const lat = Number(session.lat);
      const lng = Number(session.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const isSelected = selectedId === session.session_id;
      const iconUrl    = buildMarkerIcon(session.driver_name, isSelected);
      const content    = buildInfoWindowContent(session);

      const existing = markersRef.current.get(session.session_id);
      if (existing) {
        existing.setPosition({ lat, lng });
        existing.setIcon({ url: iconUrl, scaledSize: new G.Size(40, 48), anchor: new G.Point(20, 48) });
        existing.setTitle(session.driver_name);
        existing.setZIndex(isSelected ? 999 : 1);
      } else {
        const marker = new G.Marker({
          position: { lat, lng },
          map,
          title: session.driver_name,
          icon: { url: iconUrl, scaledSize: new G.Size(40, 48), anchor: new G.Point(20, 48) },
          zIndex: isSelected ? 999 : 1,
        });
        marker.addListener('click', () => {
          infoWinRef.current?.setContent(content);
          infoWinRef.current?.open(map, marker);
          setSelectedId(session.session_id);
        });
        markersRef.current.set(session.session_id, marker);
      }
    });

    // Auto-fit bounds on first load with GPS data
    if (!hasFitRef.current) {
      const gpsPoints = sessions.filter(s => s.lat != null && s.lng != null);
      if (gpsPoints.length > 0) {
        const bounds = new G.LatLngBounds();
        gpsPoints.forEach(s => bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) }));
        map.fitBounds(bounds);
        hasFitRef.current = true;
      }
    }
  }, [sessions, mapReady, selectedId]);

  // ── Pan to selected driver ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !gMapRef.current) return;
    const session = sessions.find(s => s.session_id === selectedId);
    if (!session || session.lat == null || session.lng == null) return;
    gMapRef.current.panTo({ lat: Number(session.lat), lng: Number(session.lng) });
    gMapRef.current.setZoom(16);
    const marker = markersRef.current.get(selectedId);
    if (marker && infoWinRef.current) {
      infoWinRef.current.setContent(buildInfoWindowContent(session));
      infoWinRef.current.open(gMapRef.current, marker);
    }
  }, [selectedId, sessions]);

  // ── Initial load + auto-refresh every 5s ───────────────────────────────────
  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(() => void fetchSessions(true), 5_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // ── Zoom controls ───────────────────────────────────────────────────────────
  function handleZoomIn()  { if (gMapRef.current) gMapRef.current.setZoom((gMapRef.current.getZoom() ?? DEFAULT_ZOOM) + 1); }
  function handleZoomOut() { if (gMapRef.current) gMapRef.current.setZoom((gMapRef.current.getZoom() ?? DEFAULT_ZOOM) - 1); }
  function handleFitAll() {
    if (!gMapRef.current || !window.google?.maps) return;
    const gpsPoints = sessions.filter(s => s.lat != null && s.lng != null);
    if (gpsPoints.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    gpsPoints.forEach(s => bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) }));
    gMapRef.current.fitBounds(bounds);
  }

  const withGps = sessions.filter(s => s.lat != null && s.lng != null);
  const noGps   = sessions.filter(s => s.lat == null || s.lng == null);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ height: '100%' }}>
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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Driver sidebar — desktop only */}
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

          <div className="px-3 py-2 border-t border-slate-200 bg-white">
            <p className="text-[10px] text-slate-500">
              Last updated: {lastRefresh.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Map area — explicit min-height so it doesn't collapse on mobile */}
        <div
          className="flex-1 relative min-w-0 overflow-hidden"
          style={{ minHeight: 'min(60vh, 400px)' }}
        >
          {/* Google Maps container */}
          <div ref={mapRef} className="absolute inset-0" />

          {/* Map load error */}
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10 p-4">
              <div className="bg-white border border-red-200 rounded-2xl px-6 py-5 shadow-lg text-center max-w-xs w-full">
                <AlertCircle size={28} className="text-red-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 mb-1">Map unavailable</p>
                <p className="text-xs text-slate-500 break-words">{mapError}</p>
                {!GOOGLE_MAPS_KEY && (
                  <p className="text-xs text-amber-600 mt-2 font-medium">
                    Add VITE_GOOGLE_MAPS_API_KEY to your environment secrets.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Map loading spinner */}
          {!mapReady && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-orange-400" />
                <p className="text-xs text-slate-400">Loading map…</p>
              </div>
            </div>
          )}

          {/* Custom zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
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

          {/* ── Improved empty / no-GPS overlays ── */}

          {/* Active drivers but none have sent a GPS fix yet */}
          {!loading && sessions.length > 0 && withGps.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-4">
              <div className="bg-white/95 backdrop-blur-sm border border-amber-200 rounded-2xl px-5 py-5 shadow-lg text-center max-w-xs w-full">
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-3">
                  <Crosshair size={22} className="text-amber-500 animate-pulse" />
                </div>
                <p className="text-sm font-bold text-slate-700 mb-1">Waiting for GPS fix</p>
                <p className="text-xs text-slate-500 leading-snug">
                  {sessions.length} driver{sessions.length !== 1 ? 's are' : ' is'} active.
                  {' '}GPS location will appear once their device gets a signal.
                </p>
                <p className="text-[11px] text-amber-600 mt-2 font-medium">
                  Make sure location permission is enabled on the driver's device.
                </p>
              </div>
            </div>
          )}

          {/* No active sessions at all */}
          {!loading && sessions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-4">
              <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl px-5 py-5 shadow-lg text-center max-w-xs w-full">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Truck size={24} className="text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500 mb-1">No active drivers</p>
                <p className="text-xs text-slate-400 leading-snug">
                  Drivers will appear on the map when they start a session from the Driver screen.
                </p>
              </div>
            </div>
          )}

          {/* Mobile driver list — shown below map on small screens */}
          {sessions.length > 0 && (
            <div className="sm:hidden absolute bottom-0 inset-x-0 z-10 bg-white/95 backdrop-blur-sm border-t border-slate-200 max-h-36 overflow-y-auto">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={10} />
                  {sessions.length} Active Driver{sessions.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="p-2 flex flex-col gap-1.5">
                {sessions.map(session => (
                  <DriverCard
                    key={session.session_id}
                    session={session}
                    selected={selectedId === session.session_id}
                    onClick={() => setSelectedId(
                      selectedId === session.session_id ? null : session.session_id
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
