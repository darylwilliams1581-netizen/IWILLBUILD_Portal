import { clipBoundsToParent } from "./hover-bar-placement";
import {
  getMediaReplaceLockedElement,
  isMediaReplaceSessionActive,
  setMediaReplaceLockedElement,
} from "./media-replace-session";

const OVERLAY_ID = "ai-select-overlay";
const SELECTION_COLOR = "#8b5cf6";
const BADGE_OUTSET_PX = 10;
const BADGE_MIN_VISIBLE_Y_PX = 2;

function keepRemoveBadgeOnScreen(overlay: HTMLElement, overlayTop: number): void {
  const badge: HTMLElement | null = overlay.firstElementChild as HTMLElement | null;
  if (!badge) return;
  badge.style.top = `${Math.max(-BADGE_OUTSET_PX, BADGE_MIN_VISIBLE_Y_PX - overlayTop)}px`;
}

/** Position (or reposition) the overlay to match the element's visible rect */
function positionOverlay(overlay: HTMLElement, el: HTMLElement): void {
  const b = clipBoundsToParent(el);
  const pad = 5;
  const width: number = b.width;
  const height: number = Math.max(0, b.bottom - b.top);
  const top: number = b.top - pad;
  overlay.style.top = `${top}px`;
  overlay.style.left = `${b.left - pad}px`;
  overlay.style.width = `${width + pad * 2}px`;
  overlay.style.height = `${height + pad * 2}px`;
  keepRemoveBadgeOnScreen(overlay, top);
}

/** Inject pulse keyframe once */
function ensurePulseKeyframes(): void {
  const id = "ai-select-pulse-keyframes";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    @keyframes aiSelectPulse {
      0%, 100% { box-shadow: 0 0 0 2px ${SELECTION_COLOR}4D, 0 0 16px ${SELECTION_COLOR}80, inset 0 0 16px ${SELECTION_COLOR}1A; }
      50% { box-shadow: 0 0 0 3px ${SELECTION_COLOR}80, 0 0 24px ${SELECTION_COLOR}99, inset 0 0 20px ${SELECTION_COLOR}26; }
    }
    @media (prefers-reduced-motion: reduce) {
      #${OVERLAY_ID}, [id^="ai-select-overlay-"] { animation: none !important; }
    }
  `;
  document.head.appendChild(style);
}

function createOverlayStyle(): string {
  return `
    position: fixed;
    border: 2px solid ${SELECTION_COLOR};
    border-radius: 6px;
    box-shadow: 0 0 0 2px ${SELECTION_COLOR}4D, 0 0 16px ${SELECTION_COLOR}80, inset 0 0 16px ${SELECTION_COLOR}1A;
    background: ${SELECTION_COLOR}0F;
    pointer-events: none;
    z-index: 10001;
    animation: aiSelectPulse 4s ease-in-out infinite;
  `;
}

/** Create and mount the primary purple selection overlay for `el`. */
function createOverlayElement(el: HTMLElement): HTMLDivElement {
  ensurePulseKeyframes();
  const overlay: HTMLDivElement = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = createOverlayStyle();
  positionOverlay(overlay, el);
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Remove the selection overlay and clear data-ai-selected from any element.
 * During a media replace session the purple pin stays unless `force` is set.
 */
export function clearSelectionOverlay(options?: { force?: boolean }): void {
  if (!options?.force && isMediaReplaceSessionActive()) {
    const locked: HTMLElement | null = getMediaReplaceLockedElement();
    if (locked && document.body.contains(locked)) {
      const overlay: HTMLElement | null = document.getElementById(OVERLAY_ID);
      locked.setAttribute("data-ai-selected", "true");
      if (!overlay) {
        // Re-pin without recursion through the force-clear path below
        createOverlayElement(locked);
      } else {
        positionOverlay(overlay, locked);
      }
      return;
    }
  }

  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.remove();
  const prev = document.querySelector("[data-ai-selected]") as HTMLElement | null;
  if (prev) prev.removeAttribute("data-ai-selected");
}

/** Create a fixed-position overlay that highlights the element.
 *  Not affected by parent overflow:hidden or z-index stacking. */
export function showSelectionOverlay(el: HTMLElement): void {
  clearSelectionOverlay({ force: true });
  el.setAttribute("data-ai-selected", "true");
  if (isMediaReplaceSessionActive()) {
    setMediaReplaceLockedElement(el);
  }
  createOverlayElement(el);
}

/** Update overlay position to track the selected element on scroll/resize.
 *  Clears the overlay if the selected element is no longer in the DOM
 *  (e.g. after page navigation). During a media replace session, re-pins the
 *  locked element when possible. */
export function updateSelectionOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    if (isMediaReplaceSessionActive()) {
      const locked: HTMLElement | null = getMediaReplaceLockedElement();
      if (locked && document.body.contains(locked)) {
        showSelectionOverlay(locked);
      }
    }
    return;
  }
  const el = document.querySelector("[data-ai-selected]") as HTMLElement | null;
  if (!el || !document.body.contains(el)) {
    if (isMediaReplaceSessionActive()) {
      const locked: HTMLElement | null = getMediaReplaceLockedElement();
      if (locked && document.body.contains(locked)) {
        locked.setAttribute("data-ai-selected", "true");
        positionOverlay(overlay, locked);
        return;
      }
    }
    clearSelectionOverlay({ force: true });
    return;
  }
  positionOverlay(overlay, el);
}

// === Multi-overlay support (flag: appbuilder-multi-element-select) ===

const NUMBERED_OVERLAY_PREFIX = "ai-select-overlay-";
const numberedOverlays = new Map<number, { overlay: HTMLElement; el: HTMLElement }>();

function createNumberBadge(number: number, onRemove: () => void): HTMLElement {
  const badge = document.createElement("div");
  const label = `#${number}`;
  badge.style.cssText = `
    position: absolute;
    top: -10px;
    right: -10px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    background: ${SELECTION_COLOR};
    color: white;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, sans-serif;
    pointer-events: auto;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    transition: background 0.15s;
  `;
  badge.textContent = label;
  badge.title = "Remove selection";
  badge.addEventListener("mouseenter", () => {
    badge.textContent = "✕";
    badge.style.background = "#6d28d9";
  });
  badge.addEventListener("mouseleave", () => {
    badge.textContent = label;
    badge.style.background = SELECTION_COLOR;
  });
  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  });
  return badge;
}

/** Returns the lowest positive integer not currently used by any active overlay */
export function getNextSelectionNumber(): number {
  let n = 1;
  while (numberedOverlays.has(n)) n++;
  return n;
}

/** Add a numbered overlay for an element */
export function addNumberedOverlay(el: HTMLElement, number: number, onRemove?: () => void): void {
  removeNumberedOverlay(number);
  ensurePulseKeyframes();
  el.setAttribute("data-ai-selected-num", String(number));

  const overlay = document.createElement("div");
  overlay.id = `${NUMBERED_OVERLAY_PREFIX}${number}`;
  overlay.style.cssText = createOverlayStyle();
  const handleRemove = onRemove ?? (() => removeNumberedOverlay(number));
  overlay.appendChild(createNumberBadge(number, handleRemove));
  positionOverlay(overlay, el);
  document.body.appendChild(overlay);
  numberedOverlays.set(number, { overlay, el });
}

/** Remove a specific numbered overlay */
export function removeNumberedOverlay(number: number): void {
  const entry = numberedOverlays.get(number);
  if (entry) {
    entry.overlay.remove();
    entry.el.removeAttribute("data-ai-selected-num");
    numberedOverlays.delete(number);
  }
}

/** Clear all numbered overlays */
export function clearAllNumberedOverlays(): void {
  numberedOverlays.forEach(({ overlay, el }) => {
    overlay.remove();
    el.removeAttribute("data-ai-selected-num");
  });
  numberedOverlays.clear();
}

/** Reposition all numbered overlays (scroll/resize handler) */
export function updateAllNumberedOverlays(): void {
  const toRemove: number[] = [];
  numberedOverlays.forEach(({ overlay, el }, number) => {
    if (!document.body.contains(el)) {
      toRemove.push(number);
    } else {
      positionOverlay(overlay, el);
    }
  });
  toRemove.forEach(removeNumberedOverlay);
}

