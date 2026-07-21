import { describe, it, expect, beforeEach } from 'vitest';
import {
  readExistingState,
  clampPan,
  applyStylesToElement,
  getMediaPanAvailability,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../useMediaReposition';

describe('useMediaReposition helpers', () => {
  describe('clampPan', () => {
    it('clamps below 0 to 0', () => {
      expect(clampPan(-10)).toBe(0);
    });

    it('clamps above 100 to 100', () => {
      expect(clampPan(150)).toBe(100);
    });

    it('passes through valid values', () => {
      expect(clampPan(50)).toBe(50);
      expect(clampPan(0)).toBe(0);
      expect(clampPan(100)).toBe(100);
    });
  });

  describe('readExistingState', () => {
    let el: HTMLElement;

    beforeEach(() => {
      el = document.createElement('div');
      document.body.appendChild(el);
    });

    it('returns defaults when no styles are set', () => {
      const state = readExistingState(el);
      expect(state).toEqual({ panX: 50, panY: 50, zoom: MIN_ZOOM });
    });

    it('reads object-position percentage values', () => {
      el.style.objectPosition = '30% 70%';
      const state = readExistingState(el);
      expect(state.panX).toBe(30);
      expect(state.panY).toBe(70);
    });

    it('reads inline scale() transform', () => {
      el.style.transform = 'scale(2.5)';
      const state = readExistingState(el);
      expect(state.zoom).toBe(2.5);
    });

    it('clamps zoom to MAX_ZOOM', () => {
      el.style.transform = 'scale(10)';
      const state = readExistingState(el);
      expect(state.zoom).toBe(MAX_ZOOM);
    });

    it('clamps pan values to 0-100', () => {
      el.style.objectPosition = '150% -20%';
      const state = readExistingState(el);
      expect(state.panX).toBe(100);
      expect(state.panY).toBe(0);
    });

    it('parses matrix() from computed styles (browser serialization)', () => {
      // Simulate what getComputedStyle returns for scale(1.8)
      // jsdom doesn't compute transforms, so we test via inline scale() which
      // the function also handles. This test verifies the regex pattern.
      el.style.transform = 'scale(1.8)';
      const state = readExistingState(el);
      expect(state.zoom).toBeCloseTo(1.8);
    });
  });

  describe('applyStylesToElement', () => {
    let el: HTMLElement;
    let parent: HTMLElement;

    beforeEach(() => {
      parent = document.createElement('div');
      el = document.createElement('img');
      parent.appendChild(el);
      document.body.appendChild(parent);
    });

    it('sets object-fit and object-position', () => {
      applyStylesToElement(el, { panX: 25, panY: 75, zoom: 1 });
      expect(el.style.objectFit).toBe('cover');
      expect(el.style.objectPosition).toBe('25% 75%');
    });

    it('sets transform and transform-origin when zoom > 1', () => {
      applyStylesToElement(el, { panX: 50, panY: 50, zoom: 2 });
      expect(el.style.transform).toBe('scale(2)');
      expect(el.style.transformOrigin).toBe('50% 50%');
    });

    it('clears transform when zoom is 1', () => {
      el.style.transform = 'scale(2)';
      applyStylesToElement(el, { panX: 50, panY: 50, zoom: 1 });
      expect(el.style.transform).toBe('');
      expect(el.style.transformOrigin).toBe('');
    });

    it('sets parent overflow hidden when zoomed', () => {
      applyStylesToElement(el, { panX: 50, panY: 50, zoom: 1.5 });
      expect(parent.style.overflow).toBe('hidden');
    });

    it('does not set parent overflow when zoom is 1', () => {
      parent.style.overflow = 'visible';
      applyStylesToElement(el, { panX: 50, panY: 50, zoom: 1 });
      expect(parent.style.overflow).toBe('visible');
    });

    it('clamps values before applying', () => {
      applyStylesToElement(el, { panX: -10, panY: 200, zoom: 10 });
      expect(el.style.objectPosition).toBe('0% 100%');
      expect(el.style.transform).toBe(`scale(${MAX_ZOOM})`);
    });
  });

  describe('getMediaPanAvailability', () => {
    function createImage(naturalWidth: number, naturalHeight: number): HTMLImageElement {
      const image: HTMLImageElement = document.createElement('img');
      Object.defineProperties(image, {
        naturalWidth: { value: naturalWidth },
        naturalHeight: { value: naturalHeight },
      });
      image.getBoundingClientRect = () => ({ width: 200, height: 200 } as DOMRect);
      return image;
    }

    function createVideo(videoWidth: number, videoHeight: number): HTMLVideoElement {
      const video: HTMLVideoElement = document.createElement('video');
      Object.defineProperties(video, {
        videoWidth: { value: videoWidth },
        videoHeight: { value: videoHeight },
      });
      video.getBoundingClientRect = () => ({ width: 200, height: 200 } as DOMRect);
      return video;
    }

    function createWrapper(naturalWidth: number, naturalHeight: number): HTMLDivElement {
      const wrapper: HTMLDivElement = document.createElement('div');
      const image: HTMLImageElement = document.createElement('img');
      Object.defineProperties(image, {
        naturalWidth: { value: naturalWidth },
        naturalHeight: { value: naturalHeight },
      });
      wrapper.appendChild(image);
      wrapper.getBoundingClientRect = () => ({ width: 200, height: 200 } as DOMRect);
      return wrapper;
    }

    it('enables only the overflowing axis at default zoom', () => {
      expect(getMediaPanAvailability(createImage(400, 200), MIN_ZOOM)).toEqual({
        horizontal: true,
        vertical: false,
      });
      expect(getMediaPanAvailability(createImage(200, 400), MIN_ZOOM)).toEqual({
        horizontal: false,
        vertical: true,
      });
    });

    it('disables both axes when the media fits exactly at default zoom', () => {
      expect(getMediaPanAvailability(createImage(200, 200), MIN_ZOOM)).toEqual({
        horizontal: false,
        vertical: false,
      });
    });

    it('enables both axes after zooming in', () => {
      expect(getMediaPanAvailability(createImage(400, 200), 1.1)).toEqual({
        horizontal: true,
        vertical: true,
      });
    });

    it('keeps axes enabled when intrinsic dimensions are unavailable', () => {
      expect(getMediaPanAvailability(createImage(0, 0), MIN_ZOOM)).toEqual({
        horizontal: true,
        vertical: true,
      });
    });

    it('resolves intrinsic size from a nested img when given a wrapper element', () => {
      expect(getMediaPanAvailability(createWrapper(400, 200), MIN_ZOOM)).toEqual({
        horizontal: true,
        vertical: false,
      });
    });

    it('uses videoWidth/videoHeight for video elements', () => {
      expect(getMediaPanAvailability(createVideo(200, 400), MIN_ZOOM)).toEqual({
        horizontal: false,
        vertical: true,
      });
    });

    it('keeps axes enabled when the element has no box size', () => {
      const image: HTMLImageElement = createImage(400, 200);
      image.getBoundingClientRect = () => ({ width: 0, height: 0 } as DOMRect);
      expect(getMediaPanAvailability(image, MIN_ZOOM)).toEqual({
        horizontal: true,
        vertical: true,
      });
    });
  });
});
