/**
 * Patches Leaflet's Map.prototype._getMapPanePos to guard against the
 * "_leaflet_pos is undefined" TypeError that fires when invalidateSize or
 * _rawPanBy is called before setView has initialised the map pane position.
 *
 * Import this module ONCE before any Leaflet map is created.
 * The patch is idempotent — safe to import multiple times.
 */
import L from 'leaflet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MapProto = (L as any).Map?.prototype;

if (MapProto && !MapProto.__airo_pos_patched) {
  const _orig = MapProto._getMapPanePos as () => unknown;

  MapProto._getMapPanePos = function patchedGetMapPanePos() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pane = this._mapPane as any;
      if (!pane) return (L as any).point(0, 0);
      // Seed _leaflet_pos if missing so getPosition() never reads undefined
      if (!pane._leaflet_pos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pane._leaflet_pos = (L as any).point(0, 0);
      }
      return _orig.call(this);
    } catch (_) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (L as any).point(0, 0);
    }
  };

  MapProto.__airo_pos_patched = true;
}
