/**
 * OSM tile map used when Google Maps JS API is blocked or unavailable in the
 * native shell. Leaflet itself is bundled with the app so only map tiles need
 * a network connection.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';

type Pin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
};

type LeafletMap = {
  setView: (c: [number, number], z: number) => void;
  getZoom: () => number;
  setZoom: (z: number) => void;
  fitBounds: (b: [number, number][], opts?: { padding: [number, number] }) => void;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletMarker = {
  remove: () => void;
  bindPopup: (html: string) => LeafletMarker;
};

type LeafletTileLayer = {
  addTo: (m: LeafletMap) => LeafletTileLayer;
  on: (event: 'tileload' | 'tileerror', handler: () => void) => LeafletTileLayer;
};

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, opts: Record<string, unknown>) => LeafletMap;
      tileLayer: (url: string, opts: Record<string, unknown>) => LeafletTileLayer;
      marker: (latlng: [number, number], opts?: Record<string, unknown>) => LeafletMarker & {
        addTo: (m: LeafletMap) => LeafletMarker;
      };
      divIcon: (opts: Record<string, unknown>) => unknown;
    };
  }
}

const DEFAULT_CENTER: [number, number] = [-19.259, 146.817]; // Townsville
const LEAFLET_JS = '/vendor/leaflet/leaflet.js';
const LEAFLET_CSS = '/vendor/leaflet/leaflet.css';
const LOAD_TIMEOUT_MS = 8_000;
const TILE_TIMEOUT_MS = 10_000;

let leafletLoadPromise: Promise<void> | null = null;

function ensureLeafletStylesheet(): void {
  if (document.querySelector(`link[href="${LEAFLET_CSS}"]`)) return;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = LEAFLET_CSS;
  document.head.appendChild(css);
}

function loadLeaflet(): Promise<void> {
  if (window.L) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  ensureLeafletStylesheet();
  leafletLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    const script = existing ?? document.createElement('script');
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleLoad = () => {
      if (window.L) finish();
      else finish(new Error('The bundled map library did not initialise.'));
    };
    const handleError = () => finish(new Error('The bundled map library could not be loaded.'));
    const timer = window.setTimeout(
      () => finish(new Error('The bundled map library took too long to load.')),
      LOAD_TIMEOUT_MS,
    );

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    if (!existing) {
      script.setAttribute('src', LEAFLET_JS);
      script.setAttribute('async', '');
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    leafletLoadPromise = null;
    if (!window.L) document.querySelector(`script[src="${LEAFLET_JS}"]`)?.remove();
    throw error;
  });

  return leafletLoadPromise;
}

type MapStatus =
  | { phase: 'loading'; message: string }
  | { phase: 'ready'; message: '' }
  | { phase: 'error'; message: string };

export default function OsmFallbackMap({
  pins,
  zoomInRef,
  zoomOutRef,
  fitRef,
}: {
  pins: Pin[];
  zoomInRef: MutableRefObject<(() => void) | null>;
  zoomOutRef: MutableRefObject<(() => void) | null>;
  fitRef: MutableRefObject<(() => void) | null>;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const [mapStatus, setMapStatus] = useState<MapStatus>({
    phase: 'loading',
    message: 'Loading map…',
  });
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let tileLoaded = false;
    let tileTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    setMapStatus({ phase: 'loading', message: 'Loading map…' });

    void loadLeaflet()
      .then(() => {
        if (disposed || !elRef.current || !window.L || mapRef.current) return;

        const map = window.L.map(elRef.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          zoomControl: false,
        });
        mapRef.current = map;

        const tiles = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        });
        tiles.on('tileload', () => {
          if (disposed) return;
          tileLoaded = true;
          if (tileTimer !== undefined) window.clearTimeout(tileTimer);
          setMapStatus({ phase: 'ready', message: '' });
        });
        tiles.on('tileerror', () => {
          console.warn('[OsmFallbackMap] An OpenStreetMap tile failed to load.');
        });
        tiles.addTo(map);

        tileTimer = window.setTimeout(() => {
          if (!disposed && !tileLoaded) {
            setMapStatus({
              phase: 'error',
              message: 'Map tiles could not load. Check your internet connection and try again.',
            });
          }
        }, TILE_TIMEOUT_MS);

        zoomInRef.current = () => map.setZoom(map.getZoom() + 1);
        zoomOutRef.current = () => map.setZoom(map.getZoom() - 1);
        setMapReadyVersion(version => version + 1);

        const resizeMap = () => requestAnimationFrame(() => map.invalidateSize());
        resizeMap();
        requestAnimationFrame(resizeMap);
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(resizeMap);
          resizeObserver.observe(elRef.current);
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : 'The map could not be loaded.';
        console.error('[OsmFallbackMap]', message);
        setMapStatus({ phase: 'error', message });
      });

    return () => {
      disposed = true;
      if (tileTimer !== undefined) window.clearTimeout(tileTimer);
      resizeObserver?.disconnect();
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      zoomInRef.current = null;
      zoomOutRef.current = null;
      fitRef.current = null;
    };
  }, [fitRef, loadAttempt, zoomInRef, zoomOutRef]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    const bounds: [number, number][] = [];
    for (const pin of pins) {
      if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) continue;
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${pin.color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:700 10px system-ui;display:flex;align-items:center;justify-content:center">${escapeHtml(pin.label.slice(0, 2).toUpperCase())}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
      marker.bindPopup(escapeHtml(pin.label));
      markersRef.current.push(marker);
      bounds.push([pin.lat, pin.lng]);
    }
    const fit = () => {
      if (bounds.length === 1) map.setView(bounds[0], 14);
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
    };
    fitRef.current = fit;
    if (bounds.length) fit();
    map.invalidateSize();
  }, [pins, fitRef, mapReadyVersion]);

  return (
    <div className="absolute inset-0 z-0 min-h-[300px] bg-slate-100">
      <div ref={elRef} className="absolute inset-0" />

      {mapStatus.phase !== 'ready' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100 px-6 text-center">
          <div className="max-w-xs rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-700">
              {mapStatus.phase === 'loading' ? 'Loading Live Map' : 'Live Map unavailable'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{mapStatus.message}</p>
            {mapStatus.phase === 'error' && (
              <button
                type="button"
                onClick={() => setLoadAttempt(attempt => attempt + 1)}
                className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Retry map
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] as string));
}
