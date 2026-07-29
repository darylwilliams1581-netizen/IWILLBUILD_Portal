/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// resolveAnchorInRect is co-located in useImageHoverDetection.ts. It does not
// exist yet — this import is the intended red until the fix lands.
import { resolveAnchorInRect } from '../useImageHoverDetection';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function stubElementsFromPoint(fn: (x: number, y: number) => Element[]): void {
  document.elementsFromPoint = fn as typeof document.elementsFromPoint;
}

function makeImg(src: string): HTMLImageElement {
  const img: HTMLImageElement = document.createElement('img');
  img.src = src;
  document.body.appendChild(img);
  return img;
}

describe('resolveAnchorInRect', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // Case 1: box fully over a single <img> — every sample point hits it.
  it('resolves a single <img> under the box', () => {
    const img: HTMLImageElement = makeImg('https://cdn.example.com/photo.jpg');
    stubElementsFromPoint(() => [img]);

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('image');
    if (result?.type === 'image') {
      expect(result.element).toBe(img);
    }
  });

  // Case 2: box spans two images; 6 sample points land on imgA, 3 on imgB.
  // Majority vote (NOT area/IoU) must pick imgA. The 9 points are center,
  // 4 edge-midpoints, 4 inset corners — splitting on clientX <= 50 yields 6/3.
  it('picks the image the majority of sample points hit', () => {
    const imgA: HTMLImageElement = makeImg('https://cdn.example.com/a.jpg');
    const imgB: HTMLImageElement = makeImg('https://cdn.example.com/b.jpg');
    stubElementsFromPoint((x: number) => (x <= 50 ? [imgA] : [imgB]));

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result?.type).toBe('image');
    if (result?.type === 'image') {
      expect(result.element).toBe(imgA);
    }
  });

  // Case 2b: the CENTER point hits the minority image, the other 8 hit the
  // majority. Result must be the majority — proving the aggregation counts all
  // 9 votes, not just the center (a center-only implementation fails this).
  it('outvotes the center point with the surrounding majority', () => {
    const imgMajority: HTMLImageElement = makeImg('https://cdn.example.com/majority.jpg');
    const imgCenter: HTMLImageElement = makeImg('https://cdn.example.com/center.jpg');
    // Center of a 100x100 box at origin is (50,50); every other sample point → majority.
    stubElementsFromPoint((x: number, y: number) => (x === 50 && y === 50 ? [imgCenter] : [imgMajority]));

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result?.type).toBe('image');
    if (result?.type === 'image') {
      expect(result.element).toBe(imgMajority);
    }
  });

  // Case 3: background-image div wrapper. jsdom limitation noted — we assert it
  // does NOT return null and prefers an image classification.
  it('resolves a background-image wrapper as an image', () => {
    const div: HTMLDivElement = document.createElement('div');
    div.style.backgroundImage = 'url("https://cdn.example.com/bg.jpg")';
    document.body.appendChild(div);
    stubElementsFromPoint(() => [div]);

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('image');
  });

  // Case 4: the annotation overlay's own element sits ABOVE the real <img> in
  // the stack. isDevToolsElement must skip it and resolve the img beneath.
  // Core regression guard.
  it('skips a dev-tools overlay above the image and resolves the real <img>', () => {
    const overlay: HTMLDivElement = document.createElement('div');
    overlay.setAttribute('data-airo-dev-tools', '');
    const img: HTMLImageElement = makeImg('https://cdn.example.com/real.jpg');
    document.body.insertBefore(overlay, img);
    stubElementsFromPoint(() => [overlay, img]);

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result?.type).toBe('image');
    if (result?.type === 'image') {
      expect(result.element).toBe(img);
    }
  });

  // Case 5: plain text/content — resolves to the <p>, not null and not overlay.
  it('resolves plain text content to the <p>', () => {
    const p: HTMLParagraphElement = document.createElement('p');
    p.textContent = 'Hello world';
    document.body.appendChild(p);
    stubElementsFromPoint(() => [p]);

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('content');
    if (result?.type === 'content') {
      expect(result.element).toBe(p);
    }
  });

  // Scroll conversion: box is in document coords, elementsFromPoint takes client
  // coords. With scrollY=400 a document box at y=500 must be sampled at client
  // y≈100. The stub only returns the img for client-space points, so a resolved
  // hit proves box.y - scrollY was applied.
  it('converts document-coord box to client coords using scroll', () => {
    const img: HTMLImageElement = makeImg('https://cdn.example.com/scrolled.jpg');
    const sampledYs: number[] = [];
    stubElementsFromPoint((x: number, y: number) => {
      sampledYs.push(y);
      // Client rect is document (0,500)-(100,600) minus scroll (0,400) = (0,100)-(100,200).
      return y >= 100 && y <= 200 ? [img] : [];
    });

    const box: Box = { x: 0, y: 500, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 400);

    expect(result?.type).toBe('image');
    // Every sampled point is in client space (shifted down by scrollY), not document space.
    expect(sampledYs.every((y: number) => y >= 100 && y <= 200)).toBe(true);
  });

  // Mixed box: 1 point hits an <img>, the other 8 hit a <p>. Image must still
  // win — image beats content regardless of vote count (the wrong-image crux).
  it('prefers an image over content even when content has more points', () => {
    const p: HTMLParagraphElement = document.createElement('p');
    p.textContent = 'Hello world';
    document.body.appendChild(p);
    const img: HTMLImageElement = makeImg('https://cdn.example.com/hero.jpg');
    // Center point (50,50 for a 100x100 box at origin) hits the img; all else the <p>.
    stubElementsFromPoint((x: number, y: number) => (x === 50 && y === 50 ? [img] : [p]));

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result?.type).toBe('image');
    if (result?.type === 'image') {
      expect(result.element).toBe(img);
    }
  });

  // Case 6: nothing resolvable — only body/html in the stack → null.
  it('returns null when nothing resolvable is under the box', () => {
    stubElementsFromPoint(() => [document.documentElement, document.body]);

    const box: Box = { x: 0, y: 0, width: 100, height: 100 };
    const result = resolveAnchorInRect(box, 0, 0);

    expect(result).toBeNull();
  });
});
