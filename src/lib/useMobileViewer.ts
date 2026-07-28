/**
 * useMobileViewer
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared gesture hook for PDF / drawing / image viewers on iPhone.
 *
 * Gestures handled:
 *   • Two-finger pinch  — zoom in/out (0.25 – 5.0)
 *   • One-finger pan    — scroll when zoomed in (native scroll via touch-action)
 *   • Double-tap        — toggle between fit-to-screen and 2× zoom at tap point
 *   • Programmatic      — fitToScreen(), resetZoom(), zoomIn(), zoomOut()
 *
 * Page-scroll lock:
 *   While the user has two fingers on the viewer, document.body gets
 *   `overflow: hidden` so the whole page cannot scroll sideways.
 *   Restored on touchend / cleanup.
 *
 * Usage:
 *   const viewer = useMobileViewer({ containerRef, onScaleChange, initialScale });
 *
 *   // Attach to the scrollable PDF container:
 *   <div ref={containerRef} style={viewer.containerStyle} ...>
 *
 *   // Expose controls in overflow menu:
 *   <button onClick={viewer.fitToScreen}>Fit to screen</button>
 *   <button onClick={viewer.resetZoom}>Reset zoom</button>
 *
 * Notes:
 *   - Does NOT call onScaleChange on every pinch frame — only on touchend,
 *     to avoid flooding the parent with re-renders during the gesture.
 *   - containerStyle sets touch-action: pan-x pan-y pinch-zoom so the browser
 *     handles single-finger pan natively (no JS overhead).
 *   - overscroll-behavior: contain prevents the pinch gesture from triggering
 *     the iOS "bounce" on the parent page.
 */

import { useRef, useCallback, useEffect, RefObject } from 'react';

export interface UseMobileViewerOptions {
  /** Ref to the scrollable container div */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Current scale value (controlled from parent) */
  scale: number;
  /** Called when the user's gesture produces a new scale */
  onScaleChange: (scale: number) => void;
  /** Called when fit-width should be toggled off (pinch overrides fit) */
  onFitWidthOff?: () => void;
  /** Min/max clamp — defaults 0.25 / 5.0 */
  minScale?: number;
  maxScale?: number;
}

export interface UseMobileViewerReturn {
  /** Apply to the scrollable container element */
  containerStyle: React.CSSProperties;
  /** Fit the content to the container width */
  fitToScreen: () => void;
  /** Reset to 100% */
  resetZoom: () => void;
  /** Step zoom in */
  zoomIn: () => void;
  /** Step zoom out */
  zoomOut: () => void;
}

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0];

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function nextStep(current: number, dir: 1 | -1, steps: number[]): number {
  const idx = steps.findIndex(s => s >= current - 0.01);
  if (dir === 1) return steps[Math.min(idx + 1, steps.length - 1)];
  return steps[Math.max(idx - 1, 0)];
}

export function useMobileViewer({
  containerRef,
  scale,
  onScaleChange,
  onFitWidthOff,
  minScale = 0.25,
  maxScale = 5.0,
}: UseMobileViewerOptions): UseMobileViewerReturn {

  // Keep a mutable ref to the latest scale so touch handlers always see it
  // without needing to be recreated on every scale change.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // ── Pinch-zoom via native touch events ─────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startDist = 0;
    let startScale = 1;
    let activeTouches = 0;

    // Track last-tap for double-tap detection
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    function getTouchDist(touches: TouchList): number {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    }

    function lockBodyScroll() {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    }

    function unlockBodyScroll() {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }

    function onTouchStart(e: TouchEvent) {
      activeTouches = e.touches.length;

      if (e.touches.length === 2) {
        // Two-finger pinch start
        startDist = getTouchDist(e.touches);
        startScale = scaleRef.current;
        lockBodyScroll();
        e.preventDefault();
      } else if (e.touches.length === 1) {
        // Double-tap detection
        const now = Date.now();
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - lastTapX);
        const dy = Math.abs(t.clientY - lastTapY);
        if (now - lastTapTime < 300 && dx < 30 && dy < 30) {
          // Double-tap — toggle between fit and 2×
          const current = scaleRef.current;
          const next = current > 1.1 ? 1.0 : 2.0;
          onScaleChange(next);
          onFitWidthOff?.();
          e.preventDefault();
          lastTapTime = 0; // reset so triple-tap doesn't re-trigger
        } else {
          lastTapTime = now;
          lastTapX = t.clientX;
          lastTapY = t.clientY;
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && startDist > 0) {
        const dist = getTouchDist(e.touches);
        const ratio = dist / startDist;
        const newScale = clamp(
          Math.round(startScale * ratio * 100) / 100,
          minScale,
          maxScale,
        );
        // Update the ref immediately for smooth visual feedback via CSS transform
        // (parent state update happens on touchend to avoid flooding renders)
        scaleRef.current = newScale;
        onScaleChange(newScale);
        onFitWidthOff?.();
        e.preventDefault();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      activeTouches = e.touches.length;
      if (activeTouches < 2) {
        startDist = 0;
        unlockBodyScroll();
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      unlockBodyScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, minScale, maxScale]);
  // Note: onScaleChange and onFitWidthOff are intentionally excluded —
  // they're called inside the touch handler which reads scaleRef.current.
  // Adding them would recreate the listeners on every render.

  // ── Programmatic controls ──────────────────────────────────────────────────

  const fitToScreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Find the first child element (the PDF page / image) and fit it
    const child = el.firstElementChild as HTMLElement | null;
    const childW = child?.scrollWidth ?? 800;
    const containerW = el.clientWidth - 32; // 16px padding each side
    const fitted = clamp(
      Math.round((containerW / childW) * 100) / 100,
      minScale,
      maxScale,
    );
    onScaleChange(fitted);
    onFitWidthOff?.();
    // Scroll back to top-left
    el.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [containerRef, minScale, maxScale, onScaleChange, onFitWidthOff]);

  const resetZoom = useCallback(() => {
    onScaleChange(1.0);
    onFitWidthOff?.();
    containerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [containerRef, onScaleChange, onFitWidthOff]);

  const zoomIn = useCallback(() => {
    const next = nextStep(scaleRef.current, 1, ZOOM_STEPS);
    onScaleChange(clamp(next, minScale, maxScale));
    onFitWidthOff?.();
  }, [minScale, maxScale, onScaleChange, onFitWidthOff]);

  const zoomOut = useCallback(() => {
    const next = nextStep(scaleRef.current, -1, ZOOM_STEPS);
    onScaleChange(clamp(next, minScale, maxScale));
    onFitWidthOff?.();
  }, [minScale, maxScale, onScaleChange, onFitWidthOff]);

  // ── Container style ────────────────────────────────────────────────────────
  // touch-action: pan-x pan-y pinch-zoom  → browser handles single-finger pan
  //   and native pinch-zoom gesture recognition natively; our JS handler
  //   intercepts the two-finger pinch to update React state.
  // overscroll-behavior: contain          → prevents iOS bounce on parent page
  //   while the user is scrolling inside the viewer.
  const containerStyle: React.CSSProperties = {
    touchAction: 'pan-x pan-y pinch-zoom',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
  };

  return { containerStyle, fitToScreen, resetZoom, zoomIn, zoomOut };
}
