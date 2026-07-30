/**
 * FleetLiveMap — Live GPS tracking map using Google Maps JS API.
 *
 * Fallback hierarchy (vehicle map, not staff surveillance):
 *   1. Active driver sessions with GPS → live markers
 *   2. No active sessions → last-known vehicle positions (labelled "Last known")
 *   3. No vehicle history → company office/base pin (labelled "Office" / "Base")
 *   4. Nothing at all → clean empty-state message over a valid map
 *
 * GPS status visibility:
 *   - Each driver card shows a colour-coded GpsStatusBadge
 *   - Map overlay banner when ALL active drivers have no usable GPS
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Building2, Clock, Crosshair, Gauge, Loader2,
  MapPin, Navigation, RefreshCw, Truck, Users, ZoomIn, ZoomOut,
} from 'lucide-react';
import GpsStatusBadge from './GpsStatusBadge';
import type { LocationPermissionStatus, GpsStatusValue } from './GpsStatusBadge';

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
  location_permission_status: LocationPermissionStatus;
  gps_status: GpsStatusValue;
  last_heartbeat_at: string | null;
}

interface LastKnownPosition {
  asset_id: number;
  asset_name: string;
  asset_type: string;
  rego: string | null;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  last_seen_at: string;
  last_driver_name: string | null;
  last_session_start: string | null;
}

// ── Google Maps window types ──────────────────────────────────────────────────

type GMaps = any;
type GMap  = any;
type GMarker = any;
type GInfoWindow = any;

type GoogleWindow = Window & typeof globalThis & {
  google?: { maps?: GMaps };
  __gmapsLoader?: Promise<void> | undefined;
  __gmapsLoaded?: boolean;
};

declare const window: GoogleWindow;

const DEFAULT_CENTER = { lat: -27.4698, lng: 153.0251 }; // Brisbane fallback
const DEFAULT_ZOOM   = 11;

// ── Google Maps key — fetched from backend ────────────────────────────────────
//
// Cache rules:
//   - Cache a non-empty key indefinitely (it doesn't change at runtime)
//   - Never cache null / empty string — always retry on next mount
//   - On fetch failure, log the exact reason so it's visible in Safari Web Inspector

let _cachedKey: string | null = null;

async function fetchMapsKey(): Promise<string> {
  if (_cachedKey) return _cachedKey; // only reuse a real, non-empty key

  let res: Response;
  try {
    res = await fetch('/api/config/maps-key', { credentials: 'include' });
  } catch (networkErr) {
    const msg = `Maps key fetch failed (network error): ${String(networkErr)}`;
    console.error('[FleetLiveMap]', msg);
    throw new Error(msg);
  }

  if (res.status === 401) {
    const msg = 'Maps key fetch failed: not authenticated (401). Check session cookie on mobile.';
    console.error('[FleetLiveMap]', msg);
    throw new Error('Not authenticated — please sign in again to load the map.');
  }

  if (res.status === 404) {
    const msg = 'Maps key fetch failed: GOOGLE_MAPS_API_KEY is not configured in Secrets (404).';
    console.error('[FleetLiveMap]', msg);
    throw new Error('Google Maps API key is not configured. Add VITE_GOOGLE_MAPS_API_KEY in Settings → Secrets.');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const msg = `Maps key fetch failed: HTTP ${res.status} — ${body}`;
    console.error('[FleetLiveMap]', msg);
    throw new Error(`Maps key unavailable (HTTP ${res.status}). Check server logs.`);
  }

  let data: { key?: string };
  try {
    data = await res.json() as { key?: string };
  } catch (parseErr) {
    const msg = `Maps key response is not valid JSON: ${String(parseErr)}`;
    console.error('[FleetLiveMap]', msg);
    throw new Error('Maps key response was malformed. Check /api/config/maps-key.');
  }

  const key = data.key ?? '';
  if (!key) {
    const msg = 'Maps key fetch succeeded but key is empty. Check VITE_GOOGLE_MAPS_API_KEY secret value.';
    console.error('[FleetLiveMap]', msg);
    // Do NOT cache empty key — allow retry on next mount
    throw new Error('Google Maps API key is empty. Update VITE_GOOGLE_MAPS_API_KEY in Settings → Secrets.');
  }

  console.info('[FleetLiveMap] Maps key loaded successfully.');
  _cachedKey = key;
  return _cachedKey;
}

// ── Google Maps script loader (singleton) ─────────────────────────────────────
//
// Reset rules:
//   - __gmapsLoader is cleared on rejection so the next mount retries cleanly
//   - __gmapsLoaded is only set to true on a successful load

function loadGoogleMaps(): Promise<void> {
  if (window.__gmapsLoaded) return Promise.resolve();
  if (window.__gmapsLoader) return window.__gmapsLoader;

  window.__gmapsLoader = fetchMapsKey()
    .then(key => new Promise<void>((resolve, reject) => {
      // Guard: if another mount already loaded the script while we were fetching the key
      if (window.__gmapsLoaded) { resolve(); return; }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.__gmapsLoaded = true;
        console.info('[FleetLiveMap] Google Maps script loaded.');
        resolve();
      };
      script.onerror = () => {
        const msg = 'Google Maps script failed to load. Check API key restrictions and billing in Google Cloud Console.';
        console.error('[FleetLiveMap]', msg);
        reject(new Error(msg));
      };
      document.head.appendChild(script);
    }))
    .catch((err: unknown) => {
      // Clear the loader so the next mount retries instead of getting the same rejection
      window.__gmapsLoader = undefined;
      throw err;
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
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
}

/** Live driver pin — orange with initials */
function buildLiveMarkerIcon(driverName: string, selected: boolean): string {
  const bg   = selected ? '#ea580c' : '#7c3aed';
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

/** Last-known vehicle pin — slate/grey truck icon */
function buildLastKnownMarkerIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="16" r="16" fill="#64748b" stroke="#e2e8f0" stroke-width="2.5"/>
    <polygon points="10,27 26,27 18,42" fill="#64748b"/>
    <text x="18" y="21" text-anchor="middle" dominant-baseline="middle"
      font-family="system-ui,sans-serif" font-size="14" fill="#fff">🚛</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Office/base pin — blue building icon */
function buildOfficeMarkerIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="16" r="16" fill="#3b82f6" stroke="#dbeafe" stroke-width="2.5"/>
    <polygon points="10,27 26,27 18,42" fill="#3b82f6"/>
    <text x="18" y="21" text-anchor="middle" dominant-baseline="middle"
      font-family="system-ui,sans-serif" font-size="14" fill="#fff">🏢</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildLiveInfoContent(session: LiveSession): string {
  const initials = getInitials(session.driver_name);
  return `
    <div style="font-family:system-ui,sans-serif;min-width:190px;padding:2px 0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#7c3aed;
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
            <div style="font-size:16px;font-weight:800;color:#7c3aed;">${Math.round(Number(session.speed_kmh))}</div>
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

function buildLastKnownInfoContent(pos: LastKnownPosition): string {
  return `
    <div style="font-family:system-ui,sans-serif;min-width:180px;padding:2px 0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:32px;height:32px;border-radius:50%;background:#64748b;
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-size:16px;flex-shrink:0;">🚛</div>
        <div>
          <div style="font-weight:700;font-size:13px;color:#1e293b;line-height:1.2;">${pos.asset_name}${pos.rego ? ` · ${pos.rego}` : ''}</div>
          <div style="font-size:11px;color:#64748b;">Last known position</div>
        </div>
      </div>
      <div style="padding-top:6px;border-top:1px solid #f1f5f9;">
        ${pos.last_driver_name ? `<div style="font-size:11px;color:#64748b;margin-bottom:3px;">Last driver: <strong>${pos.last_driver_name}</strong></div>` : ''}
        <div style="font-size:11px;color:#94a3b8;">Seen ${formatLastSeen(pos.last_seen_at)}</div>
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
          ? 'bg-violet-50 border-violet-300 shadow-sm'
          : 'bg-white border-slate-200 hover:border-violet-200 hover:bg-violet-50/40',
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
          </div>
          <div className="mt-1.5">
            <GpsStatusBadge
              locationPermissionStatus={session.location_permission_status ?? (hasGps ? 'granted' : 'unknown')}
              gpsStatus={session.gps_status ?? (hasGps ? 'live' : 'waiting_fix')}
              lastSeenAt={session.last_seen_at}
              size="sm"
            />
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Last-known vehicle card ───────────────────────────────────────────────────

function LastKnownCard({
  pos, selected, onClick,
}: {
  pos: LastKnownPosition;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left px-3 py-2.5 rounded-xl border transition-all',
        selected
          ? 'bg-slate-100 border-slate-400 shadow-sm'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-slate-100 border border-slate-200">
          <Truck size={13} className="text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-700 truncate">{pos.asset_name}</p>
          {pos.rego && <p className="text-[11px] text-slate-400">{pos.rego}</p>}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-500">
              Last known
            </span>
            <span className="text-[10px] text-slate-400">{formatLastSeen(pos.last_seen_at)}</span>
          </div>
          {pos.last_driver_name && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              Last: {pos.last_driver_name}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Map mode type ─────────────────────────────────────────────────────────────

type MapMode = 'live' | 'last-known' | 'office' | 'empty';

// ── Main component ────────────────────────────────────────────────────────────

export default function FleetLiveMap() {
  const mapRef          = useRef<HTMLDivElement>(null);
  const gMapRef         = useRef<GMap | null>(null);
  const liveMarkersRef  = useRef<Map<number, GMarker>>(new Map());
  const staticMarkersRef = useRef<GMarker[]>([]);
  const infoWinRef      = useRef<GInfoWindow | null>(null);
  const hasFitRef       = useRef(false);

  const [sessions,       setSessions]       = useState<LiveSession[]>([]);
  const [lastKnown,      setLastKnown]      = useState<LastKnownPosition[]>([]);
  const [officePos,      setOfficePos]      = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [selectedLiveId, setSelectedLiveId] = useState<number | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [lastRefresh,    setLastRefresh]    = useState<Date>(new Date());
  const [mapReady,       setMapReady]       = useState(false);
  const [mapError,       setMapError]       = useState<string | null>(null);
  // Incrementing this triggers a fresh map-init attempt after a failure
  const [mapRetryKey,    setMapRetryKey]    = useState(0);

  // ── Derive map mode ─────────────────────────────────────────────────────────
  const withGps = sessions.filter(s => s.lat != null && s.lng != null);
  const noGps   = sessions.filter(s => s.lat == null || s.lng == null);

  const mapMode: MapMode = (() => {
    if (sessions.length > 0) return 'live';
    if (lastKnown.length > 0) return 'last-known';
    if (officePos) return 'office';
    return 'empty';
  })();

  // ── Fetch live sessions ─────────────────────────────────────────────────────
  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15_000);
      let res: Response;
      try {
        res = await fetch('/api/fleet/driver-sessions/live', { credentials: 'include', signal: ac.signal });
      } finally {
        clearTimeout(timer);
      }
      // Parse body ONCE — reading it twice throws "body already used"
      const data = await res.json() as { sessions?: LiveSession[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to load (HTTP ${res.status})`);
      }
      setSessions(data.sessions ?? []);
      setLastRefresh(new Date());
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Request timed out — check your connection');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load live sessions');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch last-known positions (once on mount) ──────────────────────────────
  useEffect(() => {
    fetch('/api/fleet/last-known-positions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.resolve({ positions: [] }))
      .then((data: { positions: LastKnownPosition[] }) => setLastKnown(data.positions ?? []))
      .catch(() => { /* non-critical */ });
  }, []);

  // ── Fetch office/base location from company settings (once on mount) ────────
  useEffect(() => {
    fetch('/api/company-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((data: { structure?: { office_lat?: number; office_lng?: number; office_label?: string } }) => {
        const lat = data.structure?.office_lat;
        const lng = data.structure?.office_lng;
        if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
          setOfficePos({
            lat: Number(lat),
            lng: Number(lng),
            label: data.structure?.office_label ?? 'Office',
          });
        }
      })
      .catch(() => { /* non-critical */ });
  }, []);

  // ── Init Google Map ─────────────────────────────────────────────────────────
  // Re-runs when mapRetryKey increments (user tapped Retry after a failure).
  useEffect(() => {
    if (!mapRef.current || gMapRef.current) return;
    let disposed = false;

    // 30s hard timeout — if loadGoogleMaps never resolves (e.g. script blocked
    // by a corporate proxy or the key fetch hangs), surface an error instead of
    // leaving the user on a blank spinner forever.
    const initTimer = setTimeout(() => {
      if (!disposed && !gMapRef.current) {
        window.__gmapsLoader = undefined; // reset so retry works
        setMapError('Map took too long to load. Check your connection and tap Retry.');
      }
    }, 30_000);

    loadGoogleMaps()
      .then(() => {
        clearTimeout(initTimer);
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
        clearTimeout(initTimer);
        if (!disposed) setMapError(err instanceof Error ? err.message : 'Map failed to load');
      });

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      liveMarkersRef.current.forEach(m => m.setMap(null));
      liveMarkersRef.current.clear();
      staticMarkersRef.current.forEach(m => m.setMap(null));
      staticMarkersRef.current = [];
      infoWinRef.current?.close();
      gMapRef.current = null;
    };
  // mapRetryKey intentionally included — incrementing it re-runs this effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRetryKey]);

  // ── Update LIVE markers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !gMapRef.current || !window.google?.maps) return;
    const map = gMapRef.current;
    const G   = window.google.maps;

    const activeIds = new Set(sessions.map(s => s.session_id));

    // Remove stale live markers
    liveMarkersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) { marker.setMap(null); liveMarkersRef.current.delete(id); }
    });

    // Add / update live markers
    sessions.forEach(session => {
      if (session.lat == null || session.lng == null) return;
      const lat = Number(session.lat);
      const lng = Number(session.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const isSelected = selectedLiveId === session.session_id;
      const iconUrl    = buildLiveMarkerIcon(session.driver_name, isSelected);
      const content    = buildLiveInfoContent(session);

      const existing = liveMarkersRef.current.get(session.session_id);
      if (existing) {
        existing.setPosition({ lat, lng });
        existing.setIcon({ url: iconUrl, scaledSize: new G.Size(40, 48), anchor: new G.Point(20, 48) });
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
          setSelectedLiveId(session.session_id);
        });
        liveMarkersRef.current.set(session.session_id, marker);
      }
    });

    // Auto-fit on first load with GPS data
    if (!hasFitRef.current && withGps.length > 0) {
      const bounds = new G.LatLngBounds();
      withGps.forEach(s => bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) }));
      map.fitBounds(bounds);
      hasFitRef.current = true;
    }
  }, [sessions, mapReady, selectedLiveId, withGps]);

  // ── Update STATIC markers (last-known + office) ─────────────────────────────
  useEffect(() => {
    if (!mapReady || !gMapRef.current || !window.google?.maps) return;
    if (sessions.length > 0) {
      // Live mode — clear static markers
      staticMarkersRef.current.forEach(m => m.setMap(null));
      staticMarkersRef.current = [];
      return;
    }

    const map = gMapRef.current;
    const G   = window.google.maps;

    // Clear previous static markers
    staticMarkersRef.current.forEach(m => m.setMap(null));
    staticMarkersRef.current = [];

    if (lastKnown.length > 0) {
      // Last-known vehicle positions
      const bounds = new G.LatLngBounds();
      lastKnown.forEach(pos => {
        const lat = Number(pos.lat);
        const lng = Number(pos.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const isSelected = selectedAssetId === pos.asset_id;
        const marker = new G.Marker({
          position: { lat, lng },
          map,
          title: `${pos.asset_name} — Last known`,
          icon: {
            url: buildLastKnownMarkerIcon(),
            scaledSize: new G.Size(36, 44),
            anchor: new G.Point(18, 44),
          },
          zIndex: isSelected ? 999 : 1,
        });
        marker.addListener('click', () => {
          infoWinRef.current?.setContent(buildLastKnownInfoContent(pos));
          infoWinRef.current?.open(map, marker);
          setSelectedAssetId(pos.asset_id);
        });
        staticMarkersRef.current.push(marker);
        bounds.extend({ lat, lng });
      });

      if (!hasFitRef.current) {
        map.fitBounds(bounds);
        hasFitRef.current = true;
      }
    } else if (officePos) {
      // Office/base pin
      const marker = new G.Marker({
        position: { lat: officePos.lat, lng: officePos.lng },
        map,
        title: officePos.label,
        icon: {
          url: buildOfficeMarkerIcon(),
          scaledSize: new G.Size(36, 44),
          anchor: new G.Point(18, 44),
        },
        zIndex: 1,
      });
      marker.addListener('click', () => {
        infoWinRef.current?.setContent(`
          <div style="font-family:system-ui,sans-serif;padding:4px 0;">
            <div style="font-weight:700;font-size:13px;color:#1e293b;">${officePos.label}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Company base location</div>
          </div>`);
        infoWinRef.current?.open(map, marker);
      });
      staticMarkersRef.current.push(marker);

      if (!hasFitRef.current) {
        map.setCenter({ lat: officePos.lat, lng: officePos.lng });
        map.setZoom(14);
        hasFitRef.current = true;
      }
    }
  }, [sessions, lastKnown, officePos, mapReady, selectedAssetId]);

  // ── Pan to selected live driver ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedLiveId || !gMapRef.current) return;
    const session = sessions.find(s => s.session_id === selectedLiveId);
    if (!session || session.lat == null || session.lng == null) return;
    gMapRef.current.panTo({ lat: Number(session.lat), lng: Number(session.lng) });
    gMapRef.current.setZoom(16);
    const marker = liveMarkersRef.current.get(selectedLiveId);
    if (marker && infoWinRef.current) {
      infoWinRef.current.setContent(buildLiveInfoContent(session));
      infoWinRef.current.open(gMapRef.current, marker);
    }
  }, [selectedLiveId, sessions]);

  // ── Initial load + auto-refresh every 5s ───────────────────────────────────
  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(() => void fetchSessions(true), 5_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // ── Zoom / fit controls ─────────────────────────────────────────────────────
  function handleZoomIn()  { if (gMapRef.current) gMapRef.current.setZoom((gMapRef.current.getZoom() ?? DEFAULT_ZOOM) + 1); }
  function handleZoomOut() { if (gMapRef.current) gMapRef.current.setZoom((gMapRef.current.getZoom() ?? DEFAULT_ZOOM) - 1); }
  function handleFitAll() {
    if (!gMapRef.current || !window.google?.maps) return;
    const G = window.google.maps;
    if (mapMode === 'live' && withGps.length > 0) {
      const bounds = new G.LatLngBounds();
      withGps.forEach(s => bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) }));
      gMapRef.current.fitBounds(bounds);
    } else if (mapMode === 'last-known' && lastKnown.length > 0) {
      const bounds = new G.LatLngBounds();
      lastKnown.forEach(p => bounds.extend({ lat: Number(p.lat), lng: Number(p.lng) }));
      gMapRef.current.fitBounds(bounds);
    } else if (mapMode === 'office' && officePos) {
      gMapRef.current.setCenter({ lat: officePos.lat, lng: officePos.lng });
      gMapRef.current.setZoom(14);
    }
  }

  // ── GPS no-signal summary (for live mode overlay) ──────────────────────────
  const noGpsSummary = (() => {
    if (noGps.length === 0) return null;
    const denied  = noGps.filter(s => s.gps_status === 'denied' || s.location_permission_status === 'denied');
    const waiting = noGps.filter(s => s.gps_status === 'waiting_permission' || s.location_permission_status === 'prompt');
    const noFix   = noGps.filter(s => s.gps_status === 'waiting_fix' || (!s.gps_status && !s.last_heartbeat_at));
    if (denied.length > 0)  return 'denied';
    if (waiting.length > 0) return 'waiting_permission';
    if (noFix.length > 0)   return 'waiting_fix';
    return 'unknown';
  })();

  // ── Sidebar content ─────────────────────────────────────────────────────────
  const sidebarTitle = mapMode === 'live'
    ? 'Active Drivers'
    : mapMode === 'last-known'
      ? 'Fleet Vehicles'
      : 'Fleet';

  const sidebarIcon = mapMode === 'live' ? <Users size={10} /> : <Truck size={10} />;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ height: '100%' }}>

      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 border-b border-slate-200 bg-white shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
            <Navigation size={13} className="text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Fleet Map</p>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {mapMode === 'live'
                ? `${sessions.length} active driver${sessions.length !== 1 ? 's' : ''} · refreshes every 5s`
                : mapMode === 'last-known'
                  ? `${lastKnown.length} vehicle${lastKnown.length !== 1 ? 's' : ''} · last known positions`
                  : mapMode === 'office'
                    ? 'No active drivers · showing base location'
                    : 'No active drivers'}
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Mode badge */}
        {mapMode === 'live' && (
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
        )}
        {mapMode === 'last-known' && (
          <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 border border-slate-200 rounded-full text-[11px] font-semibold text-slate-500">
            <Clock size={10} />
            Last known
          </span>
        )}
        {mapMode === 'office' && (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-full text-[11px] font-semibold text-blue-600">
            <Building2 size={10} />
            Base location
          </span>
        )}

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

      {/* ── Body: sidebar + map ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar — desktop only */}
        <div className="hidden sm:flex w-56 md:w-64 shrink-0 border-r border-slate-200 bg-[#F4F5F7] flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-200 bg-white">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              {sidebarIcon}
              {sidebarTitle}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {loading && sessions.length === 0 && lastKnown.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 py-8 px-2 text-center">
                <AlertCircle size={20} className="text-red-400" />
                <p className="text-xs text-red-500">{error}</p>
              </div>
            ) : mapMode === 'live' ? (
              sessions.map(session => (
                <DriverCard
                  key={session.session_id}
                  session={session}
                  selected={selectedLiveId === session.session_id}
                  onClick={() => setSelectedLiveId(
                    selectedLiveId === session.session_id ? null : session.session_id
                  )}
                />
              ))
            ) : mapMode === 'last-known' ? (
              <>
                <p className="text-[10px] text-slate-400 px-1 pb-1">No drivers active. Showing last known vehicle positions.</p>
                {lastKnown.map(pos => (
                  <LastKnownCard
                    key={pos.asset_id}
                    pos={pos}
                    selected={selectedAssetId === pos.asset_id}
                    onClick={() => setSelectedAssetId(
                      selectedAssetId === pos.asset_id ? null : pos.asset_id
                    )}
                  />
                ))}
              </>
            ) : mapMode === 'office' ? (
              <div className="flex flex-col items-center gap-2 py-6 px-2 text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <Building2 size={18} className="text-blue-400" />
                </div>
                <p className="text-xs font-semibold text-slate-500">No active drivers</p>
                <p className="text-[11px] text-slate-400 leading-snug">Showing base location. Drivers will appear here when they start a session.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 px-2 text-center">
                <Truck size={24} className="text-slate-300" />
                <p className="text-xs font-semibold text-slate-400">No active drivers</p>
                <p className="text-[11px] text-slate-400">Drivers will appear here when they start a session.</p>
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-slate-200 bg-white">
            <p className="text-[10px] text-slate-500">
              Updated: {lastRefresh.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>

        {/* ── Map area ── */}
        <div
          className="flex-1 relative min-w-0 overflow-hidden"
          style={{ minHeight: 'min(60vh, 400px)' }}
        >
          <div ref={mapRef} className="absolute inset-0" />

          {/* Map load error — shows exact diagnostic reason + clean retry */}
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10 p-4">
              <div className="bg-white border border-red-200 rounded-2xl px-6 py-5 shadow-lg text-center max-w-sm w-full">
                <AlertCircle size={28} className="text-red-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 mb-1">Map unavailable</p>
                <p className="text-xs text-slate-500 break-words leading-relaxed">{mapError}</p>
                <button
                  onClick={() => {
                    // Reset all singleton state so loadGoogleMaps retries from scratch
                    window.__gmapsLoader = undefined;
                    // Do NOT reset __gmapsLoaded — if the script already loaded,
                    // we only need to re-init the Map instance, not re-fetch the script.
                    setMapError(null);
                    setMapReady(false);
                    gMapRef.current = null;
                    // Increment key → triggers the map init useEffect to re-run
                    setMapRetryKey(k => k + 1);
                  }}
                  className="mt-3 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Map loading spinner */}
          {!mapReady && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-violet-400" />
                <p className="text-xs text-slate-400">Loading map…</p>
              </div>
            </div>
          )}

          {/* Custom zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            <button onClick={handleZoomIn} title="Zoom in"
              className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors">
              <ZoomIn size={15} className="text-slate-600" />
            </button>
            <button onClick={handleZoomOut} title="Zoom out"
              className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors">
              <ZoomOut size={15} className="text-slate-600" />
            </button>
            {(withGps.length > 0 || lastKnown.length > 0 || officePos) && (
              <button onClick={handleFitAll} title="Fit all"
                className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors mt-1">
                <Crosshair size={14} className="text-violet-600" />
              </button>
            )}
          </div>

          {/* ── Map overlay: mode indicator chip ── */}
          {mapReady && !mapError && mapMode !== 'live' && (
            <div className="absolute top-3 left-3 z-10 pointer-events-none">
              {mapMode === 'last-known' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm text-[11px] font-semibold text-slate-600">
                  <Clock size={11} className="text-slate-400" />
                  Last known positions
                </div>
              )}
              {mapMode === 'office' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 backdrop-blur-sm border border-blue-200 rounded-xl shadow-sm text-[11px] font-semibold text-blue-600">
                  <Building2 size={11} />
                  Base location
                </div>
              )}
              {mapMode === 'empty' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm text-[11px] font-semibold text-slate-500">
                  <Truck size={11} className="text-slate-400" />
                  No active drivers
                </div>
              )}
            </div>
          )}

          {/* ── Live mode: GPS status overlay (all drivers have no GPS) ── */}
          {!loading && mapMode === 'live' && withGps.length === 0 && sessions.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-4">
              <div className="bg-white/95 backdrop-blur-sm border rounded-2xl px-5 py-5 shadow-lg text-center max-w-sm w-full"
                style={{ borderColor: noGpsSummary === 'denied' ? '#fca5a5' : '#fcd34d' }}>
                <div className={[
                  'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 border',
                  noGpsSummary === 'denied' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200',
                ].join(' ')}>
                  {noGpsSummary === 'denied'
                    ? <AlertCircle size={22} className="text-red-500" />
                    : <Crosshair size={22} className="text-amber-500 animate-pulse" />}
                </div>
                {noGpsSummary === 'denied' && (
                  <>
                    <p className="text-sm font-bold text-slate-700 mb-1">Location access denied</p>
                    <p className="text-xs text-slate-500 leading-snug">Ask the driver to open Settings and enable location for IWILLBUILD.</p>
                  </>
                )}
                {noGpsSummary === 'waiting_permission' && (
                  <>
                    <p className="text-sm font-bold text-slate-700 mb-1">Waiting for location permission</p>
                    <p className="text-xs text-slate-500 leading-snug">Ask the driver to tap "Enable Location" on their Drive screen.</p>
                  </>
                )}
                {(noGpsSummary === 'waiting_fix' || noGpsSummary === 'unknown') && (
                  <>
                    <p className="text-sm font-bold text-slate-700 mb-1">Waiting for GPS fix</p>
                    <p className="text-xs text-slate-500 leading-snug">
                      {sessions.length} driver{sessions.length !== 1 ? 's are' : ' is'} active. GPS will appear once their device gets a signal.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Empty state: no data at all ── */}
          {!loading && mapMode === 'empty' && mapReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-4">
              <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl px-5 py-6 shadow-lg text-center max-w-xs w-full">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Truck size={22} className="text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-600 mb-1">Fleet map ready</p>
                <p className="text-xs text-slate-400 leading-snug">
                  No active drivers and no vehicle history yet. Vehicles will appear here once drivers start sessions.
                </p>
              </div>
            </div>
          )}

          {/* ── Mobile driver list ── */}
          {(sessions.length > 0 || lastKnown.length > 0) && (
            <div className="sm:hidden absolute bottom-0 inset-x-0 z-10 bg-white/95 backdrop-blur-sm border-t border-slate-200 max-h-36 overflow-y-auto">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  {sidebarIcon}
                  {mapMode === 'live'
                    ? `${sessions.length} Active Driver${sessions.length !== 1 ? 's' : ''}`
                    : `${lastKnown.length} Vehicle${lastKnown.length !== 1 ? 's' : ''} — Last Known`}
                </p>
              </div>
              <div className="p-2 flex flex-col gap-1.5">
                {mapMode === 'live'
                  ? sessions.map(session => (
                    <DriverCard
                      key={session.session_id}
                      session={session}
                      selected={selectedLiveId === session.session_id}
                      onClick={() => setSelectedLiveId(selectedLiveId === session.session_id ? null : session.session_id)}
                    />
                  ))
                  : lastKnown.map(pos => (
                    <LastKnownCard
                      key={pos.asset_id}
                      pos={pos}
                      selected={selectedAssetId === pos.asset_id}
                      onClick={() => setSelectedAssetId(selectedAssetId === pos.asset_id ? null : pos.asset_id)}
                    />
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
