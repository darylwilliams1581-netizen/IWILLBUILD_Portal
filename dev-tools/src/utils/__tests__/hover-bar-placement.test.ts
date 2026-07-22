/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, it, expect } from 'vitest';

import {
  computeHoverBarStyle,
  computeLinkFollowBarStyle,
  getHoverBarViewport,
  type Bounds,
  type PlacedBarStyle,
  type Viewport,
} from '../hover-bar-placement.js';

const GAP = 8;
const OUTLINE_PAD = 8;
const ESTIMATED_TOOLBAR_HEIGHT = 40;
const BAR_STACK_GAP = 6;

const viewport: Viewport = { width: 1200, height: 800 };

afterEach(function cleanupBodyPadding() {
  document.body.style.paddingBottom = '';
});

function bounds(overrides: Partial<Bounds> & Pick<Bounds, 'top' | 'bottom'>): Bounds {
  const top = overrides.top;
  const bottom = overrides.bottom;
  const left = overrides.left ?? 100;
  const width = overrides.width ?? 120;
  return {
    top,
    left,
    right: overrides.right ?? left + width,
    bottom,
    width,
  };
}

describe('hover-bar-placement', function packageTests() {
  describe('#computeHoverBarStyle', function hoverBarStyleTests() {
    it('places toolbar above when there is clearance', function aboveClearance() {
      const result = computeHoverBarStyle(bounds({ top: 250, bottom: 274 }), viewport);
      expect(result.placement).toBe('above');
      expect(result.style.top).toBe('234px');
      expect(String(result.style.transform)).toMatch(/-100%/);
    });

    it('places toolbar below when there is not enough clearance above', function belowClearance() {
      const result = computeHoverBarStyle(bounds({ top: 50, bottom: 74 }), viewport);
      expect(result.placement).toBe('below');
      expect(result.style.top).toBe('90px');
    });

    it('places toolbar below when bottom space exactly fits the toolbar', function exactBottomFit() {
      const result: PlacedBarStyle = computeHoverBarStyle(bounds({ top: 50, bottom: 728 }), viewport);
      expect(result.placement).toBe('below');
      expect(result.style.top).toBe('744px');
    });

    it('places toolbar above when bottom space cannot fit the toolbar', function flipFromClippedBottom() {
      const result = computeHoverBarStyle(bounds({ top: 100, bottom: 760 }), viewport);
      expect(result.placement).toBe('above');
      expect(result.style.top).toBe('84px');
      expect(String(result.style.transform)).toMatch(/-100%/);
    });

    it('places toolbar inside the element when neither edge can fit it', function insideTopWhenNoEdgeFits() {
      const result = computeHoverBarStyle(bounds({ top: 20, bottom: 760 }), viewport);
      expect(result.placement).toBe('above');
      expect(result.style.top).toBe('36px');
    });

    it('places toolbar at the top inside the element when it is taller than the viewport', function fullPageHero() {
      const result = computeHoverBarStyle(bounds({ top: 0, bottom: 1200 }), viewport);
      expect(result.placement).toBe('above');
      expect(result.style.top).toBe('16px'); // 0 + GAP(8) + OUTLINE_PAD(8)
    });

    it('uses full viewport height when body padding is unset', function defaultViewportHeight() {
      expect(getHoverBarViewport()).toEqual({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    });

    it('subtracts commander gutter from available viewport height', function commanderGutterViewport() {
      document.body.style.paddingBottom = '96px';
      expect(getHoverBarViewport()).toEqual({
        width: window.innerWidth,
        height: window.innerHeight - 96,
      });
    });
  });

  describe('#computeLinkFollowBarStyle', function linkFollowStyleTests() {
    it('places link bar below the element when toolbar is above', function belowElement() {
      const result = computeLinkFollowBarStyle(bounds({ top: 250, bottom: 274 }), 'above', viewport);
      expect(result.placement).toBe('below');
      expect(result.style.top).toBe('290px');
    });

    it('stacks link bar below toolbar when toolbar is below', function stackBelowToolbar() {
      const elementBounds = bounds({ top: 50, bottom: 74 });
      const toolbar = computeHoverBarStyle(elementBounds, viewport);
      const link = computeLinkFollowBarStyle(elementBounds, toolbar.placement, viewport);
      const toolbarTop = elementBounds.bottom + GAP + OUTLINE_PAD;
      const linkTop = Number.parseFloat(String(link.style.top));

      expect(toolbar.placement).toBe('below');
      expect(link.placement).toBe('below');
      expect(linkTop).toBe(toolbarTop + ESTIMATED_TOOLBAR_HEIGHT + BAR_STACK_GAP);
      expect(linkTop).toBeGreaterThan(toolbarTop);
    });

    it('flips link bar above toolbar when toolbar is above and no room below', function flipAboveFooter() {
      const elementBounds = bounds({ top: 760, bottom: 784 });
      const toolbar = computeHoverBarStyle(elementBounds, viewport);
      const link = computeLinkFollowBarStyle(elementBounds, toolbar.placement, viewport);

      expect(toolbar.placement).toBe('above');
      expect(link.placement).toBe('above');
      // Stacked above toolbar: aboveElementAnchor (744) - ESTIMATED_TOOLBAR_HEIGHT (40) - BAR_STACK_GAP (6) = 698
      expect(link.style.top).toBe('698px');
      expect(String(link.style.transform)).toMatch(/-100%/);
    });
  });
});
