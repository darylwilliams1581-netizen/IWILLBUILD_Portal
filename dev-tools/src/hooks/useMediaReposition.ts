export interface MediaRepositionState {
  /** 0–100, percentage horizontal offset */
  panX: number;
  /** 0–100, percentage vertical offset */
  panY: number;
  /** 1.0–5.0, scale factor */
  zoom: number;
}

export const MIN_ZOOM = 1.0;
export const MAX_ZOOM = 5.0;
export const ZOOM_STEP = 0.1;
export const PAN_STEP = 5;
const DEFAULT_PAN = 50;

export interface MediaPanAvailability {
  horizontal: boolean;
  vertical: boolean;
}

function getIntrinsicMediaSize(element: HTMLElement): { width: number; height: number } | null {
  const mediaElement: HTMLImageElement | HTMLVideoElement | null = element instanceof HTMLImageElement
    ? element
    : element instanceof HTMLVideoElement
      ? element
      : element.querySelector("img, video");
  if (!mediaElement) return null;

  const width: number = mediaElement instanceof HTMLVideoElement
    ? mediaElement.videoWidth
    : mediaElement.naturalWidth;
  const height: number = mediaElement instanceof HTMLVideoElement
    ? mediaElement.videoHeight
    : mediaElement.naturalHeight;
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Determine which axes have cropped media available to pan at the current zoom. */
export function getMediaPanAvailability(element: HTMLElement, zoom: number): MediaPanAvailability {
  const intrinsicSize: { width: number; height: number } | null = getIntrinsicMediaSize(element);
  if (!intrinsicSize) return { horizontal: true, vertical: true };
  if (zoom > MIN_ZOOM) return { horizontal: true, vertical: true };

  const bounds: DOMRect = element.getBoundingClientRect();
  const boxWidth: number = element.clientWidth || element.offsetWidth || bounds.width;
  const boxHeight: number = element.clientHeight || element.offsetHeight || bounds.height;
  if (boxWidth <= 0 || boxHeight <= 0) return { horizontal: true, vertical: true };

  const mediaAspectRatio: number = intrinsicSize.width / intrinsicSize.height;
  const boxAspectRatio: number = boxWidth / boxHeight;
  return {
    horizontal: mediaAspectRatio > boxAspectRatio,
    vertical: mediaAspectRatio < boxAspectRatio,
  };
}

/**
 * Read existing reposition state from an element's computed styles.
 * Uses getComputedStyle so it picks up values from stylesheets (e.g. after
 * reload when styles come from reposition-overrides.css) not just inline.
 * Returned values are clamped to valid ranges.
 */
export function readExistingState(element: HTMLElement): MediaRepositionState {
  const computed: CSSStyleDeclaration = getComputedStyle(element);
  const objectPosition: string = computed.objectPosition || "";
  const transform: string = computed.transform || "";

  let panX: number = DEFAULT_PAN;
  let panY: number = DEFAULT_PAN;
  let zoom: number = MIN_ZOOM;

  // Parse object-position: "30% 70%"
  const posMatch: RegExpMatchArray | null = objectPosition.match(/([\d.]+)%\s+([\d.]+)%/);
  if (posMatch) {
    panX = Math.max(0, Math.min(100, parseFloat(posMatch[1])));
    panY = Math.max(0, Math.min(100, parseFloat(posMatch[2])));
  }

  // getComputedStyle returns transform as a matrix, e.g. "matrix(1.5, 0, 0, 1.5, 0, 0)"
  // for scale(1.5). Inline scale() takes precedence (active edit) over matrix (stylesheet).
  const scaleMatch: RegExpMatchArray | null = transform.match(/scale\(([\d.]+)\)/);
  if (scaleMatch) {
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, parseFloat(scaleMatch[1])));
  } else {
    const matrixMatch: RegExpMatchArray | null = transform.match(/matrix\(([\d.]+),/);
    if (matrixMatch) {
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, parseFloat(matrixMatch[1])));
    }
  }

  return { panX, panY, zoom };
}

/**
 * Clamp pan to 0–100. With `object-fit: cover`, the full range is always
 * valid — the image covers the element at any `object-position` percentage.
 */
export function clampPan(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Apply reposition styles directly on the DOM element for immediate visual feedback.
 * Values are clamped to valid ranges before applying.
 * Side-effect: sets parent overflow to hidden when zoomed.
 */
export function applyStylesToElement(element: HTMLElement, state: MediaRepositionState): void {
  const panX: number = clampPan(state.panX);
  const panY: number = clampPan(state.panY);
  const zoom: number = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom));

  element.style.setProperty("object-fit", "cover", "important");
  element.style.setProperty("object-position", `${panX}% ${panY}%`, "important");
  if (zoom > MIN_ZOOM) {
    element.style.setProperty("transform", `scale(${zoom})`, "important");
    element.style.setProperty("transform-origin", `${panX}% ${panY}%`, "important");
  } else {
    element.style.removeProperty("transform");
    element.style.removeProperty("transform-origin");
  }

  // Manage parent overflow: clip when zoomed, restore when not
  const parent: HTMLElement | null = element.parentElement;
  if (parent) {
    if (zoom > MIN_ZOOM) {
      parent.style.setProperty("overflow", "hidden", "important");
    } else {
      parent.style.removeProperty("overflow");
    }
  }
}
