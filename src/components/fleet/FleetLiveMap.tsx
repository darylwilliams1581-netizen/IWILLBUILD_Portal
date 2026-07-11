/**
 * FleetLiveMap — Live GPS tracking map for all active driving sessions.
 *
 * Uses Leaflet (OpenStreetMap tiles — no API key required).
 * Auto-refreshes every 15 seconds.
 * Shows a pin per active driver with a popup: name, vehicle, speed, last seen.
 * Admins/owners/managers only (API enforces this too).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2, MapPin, RefreshCw, AlertCircle, Navigation,
  Truck, Clock, Gauge, Users,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<number, any>>(new Map());

  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [mapReady, setMapReady] = useState(false);

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

  // ── Init Leaflet map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    // Dynamically import Leaflet (browser-only)
    import('leaflet').then((L) => {
      if (!mapRef.current || leafletMapRef.current) return;

      // Fix default icon paths (Leaflet + bundlers issue)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current, {
        center: [-27.4698, 153.0251], // Brisbane default
        zoom: 10,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;

      // Invalidate size after a short delay to handle CSS-not-yet-loaded race
      setTimeout(() => map.invalidateSize(), 200);

      // Watch for container resize (sidebar open/close, window resize)
      if (mapRef.current && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(mapRef.current);
        // Store on the element so we can disconnect on cleanup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).__ro = ro;
      }

      setMapReady(true);
    }).catch(console.error);

    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current as any).__ro?.disconnect();
      }
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // ── Update markers when sessions change ─────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;

    import('leaflet').then((L) => {
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

        // Custom orange icon for active drivers
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="
              width:32px;height:32px;border-radius:50% 50% 50% 0;
              background:#f97316;border:3px solid #fff;
              box-shadow:0 2px 8px rgba(0,0,0,0.3);
              transform:rotate(-45deg);
              display:flex;align-items:center;justify-content:center;
            ">
              <div style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700;">
                🚛
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -36],
        });

        const popupHtml = `
          <div style="font-family:system-ui,sans-serif;min-width:180px;">
            <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:4px;">
              ${session.driver_name}
            </div>
            <div style="font-size:11px;color:#64748b;margin-bottom:6px;">
              ${session.asset_name}${session.rego ? ` · ${session.rego}` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;">
              ${session.speed_kmh != null ? `<div style="font-size:11px;color:#475569;">🚀 <b>${Math.round(Number(session.speed_kmh))} km/h</b></div>` : ''}
              <div style="font-size:11px;color:#475569;">⏱ Driving ${formatDuration(session.start_at)}</div>
              <div style="font-size:11px;color:#94a3b8;">📍 ${formatLastSeen(session.last_seen_at)}</div>
            </div>
          </div>
        `;

        const existing = markersRef.current.get(session.session_id);
        if (existing) {
          existing.setLatLng([lat, lng]);
          existing.setPopupContent(popupHtml);
        } else {
          const marker = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(popupHtml);
          markersRef.current.set(session.session_id, marker);
        }
      });

      // Auto-fit bounds if we have GPS points
      const gpsPoints = sessions.filter(s => s.lat != null && s.lng != null);
      if (gpsPoints.length > 0) {
        const bounds = L.latLngBounds(
          gpsPoints.map(s => [Number(s.lat), Number(s.lng)] as [number, number])
        );
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      }
    }).catch(console.error);
  }, [sessions, mapReady]);

  // ── Pan to selected driver ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !leafletMapRef.current) return;
    const session = sessions.find(s => s.session_id === selectedId);
    if (!session || session.lat == null || session.lng == null) return;

    leafletMapRef.current.setView([Number(session.lat), Number(session.lng)], 15, { animate: true });
    const marker = markersRef.current.get(selectedId);
    if (marker) marker.openPopup();
  }, [selectedId, sessions]);

  // ── Initial load + auto-refresh every 15s ──────────────────────────────────
  useEffect(() => {
    void fetchSessions();
    const interval = setInterval(() => void fetchSessions(true), 15_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Load Leaflet CSS — inject before map init and invalidate size once loaded
  useEffect(() => {
    const id = 'leaflet-css';
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
      // Already loaded — just invalidate size in case map mounted before CSS
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
      return;
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.onload = () => {
      // CSS is now applied — tell Leaflet to re-measure the container
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };
    document.head.appendChild(link);
  }, []);

  // Also invalidate size whenever mapReady flips true (handles race between
  // CSS load and map init order)
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;
    // Small delay lets the browser finish layout before Leaflet measures
    const t = setTimeout(() => {
      leafletMapRef.current?.invalidateSize();
    }, 100);
    return () => clearTimeout(t);
  }, [mapReady]);

  const withGps = sessions.filter(s => s.lat != null && s.lng != null);
  const noGps   = sessions.filter(s => s.lat == null || s.lng == null);

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-3 border-b border-slate-200 bg-white shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
            <Navigation size={13} className="text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Live GPS Tracking</p>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {sessions.length} active driver{sessions.length !== 1 ? 's' : ''} · refreshes every 15s
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
      <div className="flex flex-1 min-h-0">
        {/* Driver sidebar — hidden on very small phones, shown from sm: */}
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

        {/* Map */}
        <div className="flex-1 relative min-w-0">
          {/* Map container */}
          <div ref={mapRef} className="absolute inset-0" />

          {/* No GPS overlay — shown when drivers exist but none have GPS */}
          {!loading && sessions.length > 0 && withGps.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="bg-white/95 backdrop-blur-sm border border-amber-200 rounded-2xl px-6 py-5 shadow-lg text-center max-w-xs">
                <AlertCircle size={28} className="text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">Waiting for GPS</p>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  {sessions.length} driver{sessions.length !== 1 ? 's are' : ' is'} active but
                  {sessions.length !== 1 ? ' haven\'t' : ' hasn\'t'} sent a GPS point yet.
                </p>
                <ul className="text-left text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
                  <li className="flex items-start gap-1.5"><span className="text-amber-400 shrink-0 mt-0.5">•</span>Driver must have the portal open in their browser</li>
                  <li className="flex items-start gap-1.5"><span className="text-amber-400 shrink-0 mt-0.5">•</span>Browser must grant location permission when prompted</li>
                  <li className="flex items-start gap-1.5"><span className="text-amber-400 shrink-0 mt-0.5">•</span>First GPS fix can take up to 30s outdoors</li>
                  <li className="flex items-start gap-1.5"><span className="text-amber-400 shrink-0 mt-0.5">•</span>Map updates automatically — no refresh needed</li>
                </ul>
              </div>
            </div>
          )}

          {/* Empty state overlay */}
          {!loading && sessions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
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
