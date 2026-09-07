/**
 * OSM tile map used when Google Maps JS API is blocked
 * (key missing, billing, referrer, or "Maps JavaScript API not enabled").
 *
 * Loads Leaflet from a CDN — do not `import 'leaflet'` (Vite stubs that package).
 */
import { useEffect, useRef } from 'react';

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

type LeafletMarker = { remove: () => void };

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, opts: Record<string, unknown>) => LeafletMap;
      tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: LeafletMap) => void };
      marker: (latlng: [number, number], opts?: Record<string, unknown>) => {
        addTo: (m: LeafletMap) => LeafletMarker;
        bindPopup: (html: string) => unknown;
      };
      divIcon: (opts: Record<string, unknown>) => unknown;
    };
  }
}

const DEFAULT_CENTER: [number, number] = [-19.259, 146.817]; // Townsville
const LEAFLET_JS = '/vendor/leaflet/leaflet.js';
const LEAFLET_CSS = '/vendor/leaflet/leaflet.css';

function loadLeaflet(): Promise<void> {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
      if (window.L) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.appendChild(script);
  });
}

export default function OsmFallbackMap({
  pins,
  zoomInRef,
  zoomOutRef,
  fitRef,
}: {
  pins: Pin[];
  zoomInRef: React.MutableRefObject<(() => void) | null>;
  zoomOutRef: React.MutableRefObject<(() => void) | null>;
  fitRef: React.MutableRefObject<(() => void) | null>;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);

  useEffect(() => {
    let disposed = false;
    void loadLeaflet().then(() => {
      if (disposed || !elRef.current || !window.L || mapRef.current) return;
      const map = window.L.map(elRef.current, {
        center: DEFAULT_CENTER,
        zoom: 11,
        zoomControl: false,
      });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      zoomInRef.current = () => map.setZoom(map.getZoom() + 1);
      zoomOutRef.current = () => map.setZoom(map.getZoom() - 1);
      requestAnimationFrame(() => map.invalidateSize());
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [zoomInRef, zoomOutRef]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const bounds: [number, number][] = [];
    for (const pin of pins) {
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
  }, [pins, fitRef]);

  return <div ref={elRef} className="absolute inset-0 z-0" style={{ minHeight: 300 }} />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c] as string));
}
