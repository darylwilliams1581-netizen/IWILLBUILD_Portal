/**
 * Patches Leaflet's internal getPosition utility to guard against the
 * "_leaflet_pos is undefined" TypeError.
 *
 * getPosition(el) reads el._leaflet_pos directly. If setView hasn't run yet
 * (e.g. invalidateSize fires first via ResizeObserver), _leaflet_pos is
 * undefined and the read crashes.
 *
 * We patch it by intercepting the DOMUtil.getPosition export on the Leaflet
 * module object after the dynamic import resolves — called from FleetLiveMap
 * immediately after `import('leaflet')`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function patchLeaflet(L: any) {
  if (!L || L.__airo_pos_patched) return;

  // Patch DOMUtil.getPosition — the lowest-level reader of _leaflet_pos
  if (L.DomUtil && typeof L.DomUtil.getPosition === 'function') {
    const _origGet = L.DomUtil.getPosition as (el: HTMLElement) => unknown;
    L.DomUtil.getPosition = function patchedGetPosition(el: HTMLElement) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!el || !(el as any)._leaflet_pos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el as any)._leaflet_pos = L.point(0, 0);
      }
      return _origGet(el);
    };
  }

  // Also patch Map.prototype._getMapPanePos as a belt-and-suspenders guard
  const MapProto = L.Map?.prototype;
  if (MapProto && typeof MapProto._getMapPanePos === 'function') {
    const _origPane = MapProto._getMapPanePos as () => unknown;
    MapProto._getMapPanePos = function patchedGetMapPanePos() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pane = this._mapPane as any;
        if (pane && !pane._leaflet_pos) {
          pane._leaflet_pos = L.point(0, 0);
        }
        return _origPane.call(this);
      } catch (_) {
        return L.point(0, 0);
      }
    };
  }

  L.__airo_pos_patched = true;
}
