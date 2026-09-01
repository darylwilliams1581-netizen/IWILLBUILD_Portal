import type { CSSProperties } from "react";

export const OUTLINE_PAD = 8;

const GAP = 8;
const EDGE_MARGIN = 16;
const MIN_CLEARANCE_ABOVE = 200;
const BAR_STACK_GAP = 6;
const ESTIMATED_TOOLBAR_WIDTH = 350;
const ESTIMATED_LINK_BAR_WIDTH = 280;
const ESTIMATED_TOOLBAR_HEIGHT = 40;
const ESTIMATED_LINK_BAR_HEIGHT = 32;

export const HOVER_BAR_VIEWPORT_CHANGE_EVENT = "airo:hover-bar-viewport-change";

export interface Bounds {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
}

/**
 * Clip an element's bounding rect to its parent's bounds when the element
 * overflows the parent (e.g. from `transform: scale` during image repositioning).
 * Returns a `Bounds` representing the visible clipped area.
 */
export function clipBoundsToParent(element: HTMLElement): Bounds {
  const rect: DOMRect = element.getBoundingClientRect();
  let top: number = rect.top;
  let left: number = rect.left;
  let right: number = rect.right;
  let bottom: number = rect.bottom;

  const parent: HTMLElement | null = element.parentElement;
  if (parent) {
    const pr: DOMRect = parent.getBoundingClientRect();
    if (rect.width > pr.width + 1 || rect.height > pr.height + 1) {
      top = Math.max(rect.top, pr.top);
      left = Math.max(rect.left, pr.left);
      right = Math.min(rect.right, pr.right);
      bottom = Math.min(rect.bottom, pr.bottom);
    }
  }

  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
  };
}

export interface Viewport {
  width: number;
  height: number;
}

export type VerticalPlacement = "above" | "below";

export interface PlacedBarStyle {
  style: CSSProperties;
  placement: VerticalPlacement;
}

interface BarAnchor {
  placement: VerticalPlacement;
  top: number;
}

function horizontalPosition(
  bounds: Bounds,
  estimatedBarWidth: number,
  viewportWidth: number,
): { left: string; horizontalTransform: string } {
  const centerX = bounds.left + bounds.width / 2;
  const halfBarWidth = estimatedBarWidth / 2;
  let leftPos = centerX;
  let horizontalTransform = "translateX(-50%)";

  if (centerX - halfBarWidth < EDGE_MARGIN) {
    leftPos = bounds.left;
    horizontalTransform = "translateX(0)";
  } else if (centerX + halfBarWidth > viewportWidth - EDGE_MARGIN) {
    leftPos = bounds.right;
    horizontalTransform = "translateX(-100%)";
  }

  return {
    left: `${leftPos}px`,
    horizontalTransform,
  };
}

function combineTransform(horizontalTransform: string, flipAbove: boolean): string {
  if (!flipAbove) return horizontalTransform;

  if (horizontalTransform === "translateX(-50%)") return "translate(-50%, -100%)";
  if (horizontalTransform === "translateX(0)") return "translate(0, -100%)";
  return "translate(-100%, -100%)";
}

function fitsBelow(top: number, viewportHeight: number): boolean {
  return top + ESTIMATED_LINK_BAR_HEIGHT <= viewportHeight - EDGE_MARGIN;
}

function fitsAbove(anchor: number): boolean {
  return anchor - ESTIMATED_LINK_BAR_HEIGHT >= EDGE_MARGIN;
}

function getBodyBottomGutter(): number {
  const gutter: number = Number.parseFloat(document.body.style.paddingBottom);
  return Number.isFinite(gutter) ? gutter : 0;
}

export function getHoverBarViewport(): Viewport {
  return {
    width: window.innerWidth,
    height: Math.max(0, window.innerHeight - getBodyBottomGutter()),
  };
}

export function computeHoverBarStyle(
  bounds: Bounds,
  viewport: Viewport = getHoverBarViewport(),
): PlacedBarStyle {
  const hasSpaceAbove = bounds.top > MIN_CLEARANCE_ABOVE;
  const horizontal = horizontalPosition(bounds, ESTIMATED_TOOLBAR_WIDTH, viewport.width);
  const belowTop: number = bounds.bottom + GAP + OUTLINE_PAD;
  const fitsBelowToolbar: boolean = belowTop + ESTIMATED_TOOLBAR_HEIGHT <= viewport.height - EDGE_MARGIN;
  const aboveAnchor: number = bounds.top - GAP - OUTLINE_PAD;
  const fitsAboveToolbar: boolean = aboveAnchor - ESTIMATED_TOOLBAR_HEIGHT >= EDGE_MARGIN;

  const style: CSSProperties = {
    position: "fixed",
    left: horizontal.left,
    transform: horizontal.horizontalTransform,
  };

  if (hasSpaceAbove) {
    style.top = `${aboveAnchor}px`;
    style.transform = combineTransform(horizontal.horizontalTransform, true);
    return { style, placement: "above" };
  }

  if (!fitsBelowToolbar && fitsAboveToolbar) {
    style.top = `${aboveAnchor}px`;
    style.transform = combineTransform(horizontal.horizontalTransform, true);
    return { style, placement: "above" };
  }

  // When the element is taller than the usable viewport (or neither edge can
  // fit the toolbar), place it inside at the top rather than below the hidden bottom.
  if (!fitsBelowToolbar || bounds.bottom > viewport.height) {
    style.top = `${Math.max(bounds.top, 0) + GAP + OUTLINE_PAD}px`;
    return { style, placement: "above" };
  }

  style.top = `${belowTop}px`;
  return { style, placement: "below" };
}

/**
 * Position the link-follow bar on whichever side of the element the toolbar left
 * free, so the two bars sandwich the element rather than stacking away from it.
 * Falls back to stacking on the toolbar's side when the free side has no room.
 */
export function computeLinkFollowBarStyle(
  bounds: Bounds,
  toolbarPlacement: VerticalPlacement,
  viewport: Viewport = getHoverBarViewport(),
): PlacedBarStyle {
  const horizontal = horizontalPosition(bounds, ESTIMATED_LINK_BAR_WIDTH, viewport.width);
  const belowElementTop = bounds.bottom + GAP + OUTLINE_PAD;
  const stackedBelowTop = bounds.bottom + GAP + OUTLINE_PAD + ESTIMATED_TOOLBAR_HEIGHT + BAR_STACK_GAP;
  const aboveElementAnchor = bounds.top - GAP - OUTLINE_PAD;
  const stackedAboveAnchor = aboveElementAnchor - ESTIMATED_TOOLBAR_HEIGHT - BAR_STACK_GAP;

  const toolbarAbove: boolean = toolbarPlacement === "above";
  const freeSide: BarAnchor = toolbarAbove
    ? { placement: "below", top: belowElementTop }
    : { placement: "above", top: aboveElementAnchor };
  const stacked: BarAnchor = toolbarAbove
    ? { placement: "above", top: stackedAboveAnchor }
    : { placement: "below", top: stackedBelowTop };
  const freeSideFits: boolean = freeSide.placement === "below"
    ? fitsBelow(freeSide.top, viewport.height)
    : fitsAbove(freeSide.top);
  const stackedFits: boolean = stacked.placement === "below"
    ? fitsBelow(stacked.top, viewport.height)
    : fitsAbove(stacked.top);
  const freeSideEdgeClamp: BarAnchor = {
    placement: freeSide.placement,
    top: freeSide.placement === "above"
      ? EDGE_MARGIN + ESTIMATED_LINK_BAR_HEIGHT
      : viewport.height - EDGE_MARGIN - ESTIMATED_LINK_BAR_HEIGHT,
  };
  const { placement, top }: BarAnchor = freeSideFits
    ? freeSide
    : stackedFits
      ? stacked
      : freeSideEdgeClamp;

  const style: CSSProperties = {
    position: "fixed",
    left: horizontal.left,
    top: `${top}px`,
    transform: combineTransform(horizontal.horizontalTransform, placement === "above"),
  };

  return { style, placement };
}
