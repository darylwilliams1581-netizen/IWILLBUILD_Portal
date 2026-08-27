/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { HoveredElement } from '../../hooks/useImageHoverDetection';
import { isOriginAllowed, safePostMessage } from '../../utils/postMessage';
import { HOVER_BAR_VIEWPORT_CHANGE_EVENT } from '../../utils/hover-bar-placement';
import { computePopoverPlacement } from '../ElementHoverBar';

type ImageHoveredElement = Extract<HoveredElement, { type: 'image' }>;

const textFixMock = vi.hoisted(() => ({
  request: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  reset: vi.fn(),
}));

const formatOverrideControlsMock = vi.hoisted(() => ({
  render: vi.fn(),
}));

vi.mock('../../utils/postMessage', () => ({
  safePostMessage: vi.fn(),
  isOriginAllowed: vi.fn(() => true),
}));

vi.mock('../../utils/element-helpers', () => ({
  extractDevContext: vi.fn(() => ({ devId: 'test-id', fileName: 'test.tsx', lineNumber: 1, componentName: 'Test' })),
  generatePreciseSelector: vi.fn(() => 'div > img'),
  getElementClassName: vi.fn((el: HTMLElement) => el.className),
}));

vi.mock('../../utils/translations', () => ({
  t: vi.fn((_: string, fallback: string) => fallback),
}));

vi.mock('../../utils/device', () => ({
  isTouchDevice: vi.fn(() => false),
}));

vi.mock('../../utils/element-detection', () => ({
  isClickable: vi.fn(() => false),
  isTextElement: vi.fn(() => false),
  isTextBlockElement: vi.fn(() => false),
  isListElement: vi.fn(() => false),
  isTextFixSaveable: vi.fn(() => true),
}));

vi.mock('../../utils/selection-overlay', () => ({
  showSelectionOverlay: vi.fn(),
  addNumberedOverlay: vi.fn(),
  removeNumberedOverlay: vi.fn(),
  getNextSelectionNumber: vi.fn(() => 1),
}));

vi.mock('../../utils/popover-coordinator', () => ({
  nextOpenMenu: vi.fn(() => null),
}));

vi.mock('../../hooks/useTextFix', () => ({
  useTextFix: vi.fn(() => ({
    state: { status: 'idle' },
    request: textFixMock.request,
    accept: textFixMock.accept,
    reject: textFixMock.reject,
    reset: textFixMock.reset,
  })),
}));

vi.mock('../TextFixPopover', () => ({ default: () => null, TextFixPopover: () => null }));
vi.mock('../TextFixButton', () => ({ default: () => <button title="mock-textfix" /> }));
vi.mock('../QuickEditBar', () => ({ QuickEditBar: () => null }));
// Text-formatting buttons are stubbed as titled buttons (not null) so their
// presence/absence is assertable — this is how the loop-rendered gating tests
// observe whether the formatting group renders.
vi.mock('../TextAlignButton', () => ({ default: () => <button title="mock-textalign" /> }));
vi.mock('../BoldButton', () => ({ default: () => <button title="mock-bold" /> }));
vi.mock('../ItalicButton', () => ({ default: () => <button title="mock-italic" /> }));
vi.mock('../TextColorButton', () => ({ default: () => <button title="mock-textcolor" /> }));
vi.mock('../TextSizeStepperButton', () => ({ default: () => <button title="mock-textsize" /> }));
vi.mock('../FontFamilyButton', () => ({ default: () => <button title="mock-fontfamily" /> }));
vi.mock('../ListTypeButton', () => ({ default: () => <button title="mock-listtype" /> }));
vi.mock('../FormatOverrideControls', () => ({
  default: (props: unknown) => {
    formatOverrideControlsMock.render(props);
    return (
      <>
        <button title="Bound format controls" />
        <button title="mock-textsize" />
      </>
    );
  },
}));

import ElementHoverBar from '../ElementHoverBar';

function makeImageElement(attrs: Record<string, string> = {}): HTMLElement {
  const img = document.createElement('img');
  img.src = 'https://commerce-cdn.example.com/product-1.jpg';
  Object.entries(attrs).forEach(([key, value]) => img.setAttribute(key, value));
  img.getBoundingClientRect = vi.fn(() => ({
    top: 100, left: 100, width: 200, height: 200, right: 300, bottom: 300, x: 100, y: 100, toJSON: () => {},
  } as DOMRect));
  document.body.appendChild(img);
  return img;
}

function makeImageHover(
  element: HTMLElement,
  overrides: Partial<Omit<ImageHoveredElement, 'type' | 'element'>> = {},
): ImageHoveredElement {
  return {
    type: 'image',
    element,
    imageUrl: 'https://commerce-cdn.example.com/product-1.jpg',
    isMediaSlot: false,
    slotPath: null,
    isVideo: false,
    ...overrides,
  };
}

// toolbarMode is owned by useImageHoverDetection in production, but for unit
// tests we render with toolbarMode=true directly to exercise the open-bar UI.
function renderHoverBar(hoveredElement: HoveredElement) {
  return render(
    createElement(ElementHoverBar, {
      hoveredElement,
      isMultiSelectActive: false,
      toolbarMode: true,
      setToolbarMode: vi.fn(),
      onMouseEnter: vi.fn(),
      onMouseLeave: vi.fn(),
      saveStatus: 'idle',
    })
  );
}

function openToolbar(element: HTMLElement): void {
  fireEvent.click(element);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = '';
  document.body.style.paddingBottom = '';
  vi.unstubAllEnvs();
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
  });
});

describe('ElementHoverBar - viewport gutter changes', () => {
  it('repositions when the hover-bar viewport changes', async () => {
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, width: 1024, height: 768, right: 1024, bottom: 768, x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
    const img: HTMLElement = makeImageElement();
    const hovered: ImageHoveredElement = makeImageHover(img);

    renderHoverBar(hovered);

    const bar: HTMLElement = document.querySelector('.edit-mode-hover-bar') as HTMLElement;
    await waitFor(() => expect(bar.style.top).toBe('316px'));

    document.body.style.paddingBottom = '500px';
    window.dispatchEvent(new Event(HOVER_BAR_VIEWPORT_CHANGE_EVENT));

    await waitFor(() => expect(bar.style.top).toBe('84px'));
  });
});

describe('ElementHoverBar - Commerce product image gating', () => {
  it('shows Replace/Modify for images on non-Commerce apps', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');

    const img = makeImageElement();
    const hovered = makeImageHover(img);

    renderHoverBar(hovered);

    openToolbar(img);

    expect(await screen.findByRole('button', { name: 'Replace' })).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Modify' })).not.toBeNull();
  });

  it('hides Replace/Modify for Commerce product images (no data-dev-id, not a media slot)', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', 'store-123');

    const img = makeImageElement(); // No data-dev-id
    const hovered = makeImageHover(img);

    renderHoverBar(hovered);
    openToolbar(img);

    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modify' })).toBeNull();
  });

  it('shows Replace/Modify for Commerce app images that ARE media slots', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', 'store-123');

    const img = makeImageElement();
    const hovered = makeImageHover(img, {
      imageUrl: '/airo-assets/images/hero.jpg',
      isMediaSlot: true,
      slotPath: 'hero',
    });

    renderHoverBar(hovered);
    openToolbar(img);

    expect(await screen.findByRole('button', { name: 'Replace' })).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Modify' })).not.toBeNull();
  });

  it('shows Replace/Modify for Commerce app images with data-dev-id (user source code)', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', 'store-123');

    const img = makeImageElement({ 'data-dev-id': 'src/pages/index.tsx:15' });
    const hovered = makeImageHover(img, {
      imageUrl: 'https://example.com/banner.jpg',
    });

    renderHoverBar(hovered);
    openToolbar(img);

    expect(await screen.findByRole('button', { name: 'Replace' })).not.toBeNull();
    expect(await screen.findByRole('button', { name: 'Modify' })).not.toBeNull();
  });

  it('still shows Reference but hides Edit with Airo for Commerce product images', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', 'store-123');

    const img = makeImageElement();
    const hovered = makeImageHover(img);

    renderHoverBar(hovered);
    openToolbar(img);

    expect(await screen.findByRole('button', { name: 'Add as reference' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit with Airo' })).toBeNull();
  });

  it('hides image mutation actions for direct-DOM Commerce product images', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');

    const root = document.createElement('article');
    root.setAttribute('data-dev-source-origin', 'commerce');
    root.setAttribute('data-dev-commerce-product-id', 'sku-group-1');
    const img = makeImageElement({ 'data-dev-id': 'src/pages/Product.tsx:15' });
    root.appendChild(img);
    document.body.appendChild(root);
    const hovered = makeImageHover(img);

    renderHoverBar(hovered);
    openToolbar(img);

    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modify' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

describe('ElementHoverBar - Commerce product text gating', () => {
  it('hides Quick Edit for direct-DOM Commerce product text', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isTextElement).mockReturnValue(true);

    const root = document.createElement('article');
    root.setAttribute('data-dev-source-origin', 'commerce');
    root.setAttribute('data-dev-commerce-product-id', 'sku-group-1');
    const h2 = document.createElement('h2');
    h2.textContent = 'Commerce product';
    h2.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    root.appendChild(h2);
    document.body.appendChild(root);

    renderHoverBar({ type: 'content', element: h2 });
    openToolbar(h2);

    expect(await screen.findByRole('button', { name: 'Add as reference' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit with Airo' })).toBeNull();
  });
});

describe('ElementHoverBar - link follow bar', () => {
  it('shows link follow bar below links and removes toolbar follow icon', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isClickable).mockReturnValue(true);

    const anchor = document.createElement('a');
    anchor.href = 'https://loom.com/share/c587cabe155a499fa63ae88fe0d61d23';
    anchor.textContent = 'Loom';
    anchor.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 120, height: 24, right: 220, bottom: 124, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    document.body.appendChild(anchor);

    renderHoverBar({ type: 'content', element: anchor });
    openToolbar(anchor);

    expect(screen.queryByTitle('Follow link')).toBeNull();
    expect(await screen.findByTestId('devtools-link-follow-destination')).not.toBeNull();
    expect(screen.getByText('Go to: loom.com · /share')).toBeTruthy();
  });
});

describe('ElementHoverBar - bound text formatting gating', () => {
  it('shows bound format controls for eligible bound text', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isTextElement).mockReturnValue(true);

    const h1 = document.createElement('h1');
    h1.textContent = 'Title';
    h1.setAttribute('data-dev-id', 'abc123');
    h1.setAttribute('data-dev-line', '7');
    h1.setAttribute('data-dev-file', '/app/src/pages/index.tsx');
    h1.setAttribute('data-dev-bound-text', 'true');
    h1.setAttribute('data-dev-bound-source-kind', 'bound-expression');
    h1.setAttribute('data-dev-bound-expression-hash', `sha256:${'a'.repeat(64)}`);
    h1.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    document.body.appendChild(h1);

    renderHoverBar({ type: 'content', element: h1 });
    openToolbar(h1);

    expect(await screen.findByTitle('Bound format controls')).not.toBeNull();
    expect(screen.getByTitle('mock-textsize')).not.toBeNull();
  });

  it('uses ancestor bound format controls for children inside bound text', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isTextElement).mockReturnValue(true);

    const h1 = document.createElement('h1');
    h1.setAttribute('data-dev-id', 'abc123');
    h1.setAttribute('data-dev-line', '7');
    h1.setAttribute('data-dev-file', '/app/src/pages/index.tsx');
    h1.setAttribute('data-dev-bound-text', 'true');
    h1.setAttribute('data-dev-bound-source-kind', 'bound-expression');
    h1.setAttribute('data-dev-bound-expression-hash', `sha256:${'a'.repeat(64)}`);

    const child = document.createElement('span');
    child.textContent = 'Title';
    child.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    h1.appendChild(child);
    document.body.appendChild(h1);

    renderHoverBar({ type: 'content', element: child });
    openToolbar(child);

    expect(await screen.findByTitle('Bound format controls')).not.toBeNull();
    expect(formatOverrideControlsMock.render).toHaveBeenCalledWith(expect.objectContaining({ selectedElement: h1 }));
  });

  it('blocks bound format controls for loop-rendered bound text', async () => {
    const first = document.createElement('li');
    const second = document.createElement('li');
    for (const li of [first, second]) {
      li.textContent = 'Product';
      li.setAttribute('data-dev-id', 'loopid');
      li.setAttribute('data-dev-line', '9');
      li.setAttribute('data-dev-file', '/app/src/pages/index.tsx');
      li.setAttribute('data-dev-bound-text', 'true');
      li.setAttribute('data-dev-bound-source-kind', 'content-key-template');
      li.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100, toJSON: () => {},
      } as DOMRect));
      document.body.appendChild(li);
    }

    renderHoverBar({ type: 'content', element: first });
    openToolbar(first);

    expect(await screen.findByRole('button', { name: 'Add as reference' })).not.toBeNull();
    expect(screen.queryByTitle('Bound format controls')).toBeNull();
  });
});

// AIROBUILD-4419: clicking a list item in a .map()-rendered list must still
// show the text-formatting toolbar. Previously the loop-rendered guard
// suppressed it (all mapped <li> share one data-dev-id/line).
describe('ElementHoverBar - loop-rendered text formatting (AIROBUILD-4419)', () => {
  function appendLoopLis(): HTMLElement {
    const first = document.createElement('li');
    const second = document.createElement('li');
    (['First item', 'Second item'] as const).forEach((text, i) => {
      const li = i === 0 ? first : second;
      li.textContent = text;
      li.setAttribute('data-dev-id', 'loopid');
      li.setAttribute('data-dev-line', '9');
      li.setAttribute('data-dev-file', '/app/src/pages/index.tsx');
      li.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100, toJSON: () => {},
      } as DOMRect));
      document.body.appendChild(li);
    });
    return first;
  }

  it('shows the text-formatting toolbar for a loop-rendered <li>', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isTextElement).mockReturnValue(true);
    vi.mocked(detection.isTextBlockElement).mockReturnValue(true);

    const first: HTMLElement = appendLoopLis();
    renderHoverBar({ type: 'content', element: first });
    openToolbar(first);

    expect(await screen.findByTitle('mock-bold')).not.toBeNull();
    expect(screen.getByTitle('mock-italic')).not.toBeNull();
    expect(screen.getByTitle('mock-textcolor')).not.toBeNull();
    expect(screen.getByTitle('mock-textsize')).not.toBeNull();
    expect(screen.getByTitle('mock-fontfamily')).not.toBeNull();
    expect(screen.getByTitle('mock-textalign')).not.toBeNull();
  });

  it('still shows the toolbar for a single-instance (non-loop) <li>', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isTextElement).mockReturnValue(true);
    vi.mocked(detection.isTextBlockElement).mockReturnValue(true);

    const li: HTMLElement = document.createElement('li');
    li.textContent = 'Only item';
    li.setAttribute('data-dev-id', 'uniqueid');
    li.setAttribute('data-dev-line', '9');
    li.setAttribute('data-dev-file', '/app/src/pages/index.tsx');
    li.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    document.body.appendChild(li);

    renderHoverBar({ type: 'content', element: li });
    openToolbar(li);

    expect(await screen.findByTitle('mock-bold')).not.toBeNull();
  });
});

describe('ElementHoverBar - Fix button saveability (isTextFixSaveable)', () => {
  function makeFixCandidate(): HTMLElement {
    const p = document.createElement('p');
    p.textContent = 'teh cat sat';
    p.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 30, right: 300, bottom: 130, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    document.body.appendChild(p);
    return p;
  }

  it('shows the Fix button when isTextFixSaveable returns true', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isTextElement).mockReturnValue(true);
    vi.mocked(detection.isTextFixSaveable).mockReturnValue(true);

    const p: HTMLElement = makeFixCandidate();
    renderHoverBar({ type: 'content', element: p });
    openToolbar(p);

    expect(await screen.findByTitle('mock-textfix')).not.toBeNull();
  });

  it('hides the Fix button when isTextFixSaveable returns false', async () => {
    const detection = await import('../../utils/element-detection');
    vi.mocked(detection.isTextElement).mockReturnValue(true);
    vi.mocked(detection.isTextFixSaveable).mockReturnValue(false);

    const p: HTMLElement = makeFixCandidate();
    renderHoverBar({ type: 'content', element: p });
    openToolbar(p);

    await screen.findByTitle('mock-bold');
    expect(screen.queryByTitle('mock-textfix')).toBeNull();
  });
});

const trackCalls = () =>
  vi.mocked(safePostMessage).mock.calls.filter(
    ([, msg]) => (msg as { type?: string })?.type === 'TRACK_EVENT',
  );

const findTrackCall = (eid: string) =>
  trackCalls().find(([, msg]) => (msg as { eid?: string })?.eid === eid);

function makeTextHover(): HoveredElement {
  const p = document.createElement('p');
  p.textContent = 'Hello world';
  p.getBoundingClientRect = vi.fn(() => ({
    top: 100, left: 100, width: 200, height: 30, right: 300, bottom: 130, x: 100, y: 100, toJSON: () => {},
  } as DOMRect));
  document.body.appendChild(p);
  return { type: 'content', element: p };
}

describe('ElementHoverBar - tracking', () => {
  it('fires toolbar-view impression with surface=image when toolbar opens on an image', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    const hovered = makeImageHover(img, { imageUrl: 'x' });
    renderHoverBar(hovered);
    openToolbar(img);
    expect(findTrackCall('devtools.toolbar.view')).toEqual([
      window.parent,
      { type: 'TRACK_EVENT', kind: 'impression', eid: 'devtools.toolbar.view', properties: { surface: 'image' } },
    ]);
  });

  it('fires toolbar-view impression with surface=text when toolbar opens on a text element', () => {
    const hovered = makeTextHover();
    renderHoverBar(hovered);
    openToolbar(hovered.element);
    expect(findTrackCall('devtools.toolbar.view')).toEqual([
      window.parent,
      { type: 'TRACK_EVENT', kind: 'impression', eid: 'devtools.toolbar.view', properties: { surface: 'text' } },
    ]);
  });

  it('fires replace_image click when Replace is clicked', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    const hovered = makeImageHover(img, { imageUrl: 'https://x/y.jpg' });
    renderHoverBar(hovered);
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(findTrackCall('devtools.toolbar.replace_image')).toBeTruthy();
  });

  it('fires modify_image click when Modify is clicked', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    const hovered = makeImageHover(img, { imageUrl: 'https://x/y.jpg' });
    renderHoverBar(hovered);
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Modify' }));
    expect(findTrackCall('devtools.toolbar.modify_image')).toBeTruthy();
  });

  it('fires multi_select_add click when Reference is clicked', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    const hovered = makeImageHover(img, { imageUrl: 'https://x/y.jpg' });
    renderHoverBar(hovered);
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Add as reference' }));
    expect(findTrackCall('devtools.toolbar.multi_select_add')).toBeTruthy();
  });

  it('fires sparkles click when Edit with Airo is clicked', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    const hovered = makeImageHover(img, { imageUrl: 'https://x/y.jpg' });
    renderHoverBar(hovered);
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Edit with Airo' }));
    expect(findTrackCall('devtools.toolbar.sparkles')).toBeTruthy();
  });
});

const findDeleteMediaCall = () =>
  vi.mocked(safePostMessage).mock.calls.find(
    ([, msg]) => (msg as { type?: string })?.type === 'DELETE_ELEMENT',
  );

describe('ElementHoverBar - delete media button', () => {
  it('renders Delete for an image', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    renderHoverBar(makeImageHover(img));
    openToolbar(img);
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeNull();
  });

  it('does not render Delete for a non-image element the strategy classifier does not recognize', () => {
    // A bare <div> with no dev/content/conformable attributes matches none of
    // classifyDeleteStrategy's branches (not a leaf tag, not a container
    // without data-dev-id, not agent-fallback without data-dev-file) — unlike
    // a bare <p>/<li>, which are LEAF_TAGS and are deletable by design.
    const div: HTMLElement = document.createElement('div');
    div.textContent = 'Hello world';
    div.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 30, right: 300, bottom: 130, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    document.body.appendChild(div);

    renderHoverBar({ type: 'content', element: div });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('sends DELETE_ELEMENT with elementInfo/devContext when Delete is clicked', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement({ alt: 'A product photo' });
    renderHoverBar(makeImageHover(img, { imageUrl: 'https://x/y.jpg' }));
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findDeleteMediaCall();
    expect(call).toBeTruthy();
    const msg = call![1] as {
      type: string;
      data: {
        selector: string;
        preciseSelector: string;
        devContext?: unknown;
        elementInfo?: { tagName?: string; devContext?: unknown };
        isVideo: boolean;
        imageUrl: string | null;
        alt?: string;
      };
    };
    expect(msg.type).toBe('DELETE_ELEMENT');
    expect(msg.data.preciseSelector).toBe('div > img');
    expect(msg.data.selector).toBe('div > img');
    expect(msg.data.isVideo).toBe(false);
    expect(msg.data.imageUrl).toBe('https://x/y.jpg');
    expect(msg.data.alt).toBe('A product photo');
    expect(msg.data.devContext).toMatchObject({ devId: 'test-id' });
    expect(msg.data.elementInfo).toMatchObject({ tagName: 'img', devContext: { devId: 'test-id' } });
  });

  it('reports isVideo from the captured hovered element', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    renderHoverBar(makeImageHover(img, { isVideo: true }));
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findDeleteMediaCall();
    expect(call).toBeTruthy();
    expect((call![1] as { data: { isVideo: boolean } }).data.isVideo).toBe(true);
  });

  it('fires delete_media click tracking when Delete is clicked', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    renderHoverBar(makeImageHover(img, { imageUrl: 'https://x/y.jpg' }));
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(findTrackCall('devtools.toolbar.delete_media')).toBeTruthy();
  });

  it('renders Delete for a static-leaf text element (p tag)', () => {
    const hovered = makeTextHover();
    hovered.element.setAttribute('data-dev-file', 'src/pages/index.tsx');
    renderHoverBar(hovered);
    openToolbar(hovered.element);

    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeNull();
  });

  it('does not render Delete for a loop-rendered element without data-dev-file', () => {
    const first: HTMLElement = document.createElement('li');
    const second: HTMLElement = document.createElement('li');
    for (const li of [first, second]) {
      li.textContent = 'Loop item';
      li.setAttribute('data-dev-id', 'loopid-delete');
      li.setAttribute('data-dev-line', '11');
      li.getBoundingClientRect = vi.fn(() => ({
        top: 100, left: 100, width: 200, height: 30, right: 300, bottom: 130, x: 100, y: 100, toJSON: () => {},
      } as DOMRect));
      document.body.appendChild(li);
    }

    renderHoverBar({ type: 'content', element: first });
    openToolbar(first);

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

const findPostMessageByType = (eventType: string) =>
  vi.mocked(safePostMessage).mock.calls.find(
    ([, msg]) => (msg as { type?: string })?.type === eventType,
  );

describe('ElementHoverBar - delete dispatch routing', () => {
  function makeContentElement(el: HTMLElement): void {
    el.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 30, right: 300, bottom: 130, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));
    document.body.appendChild(el);
  }

  it('dispatches DELETE_CONTENT_ITEM for a content-item element', () => {
    const article: HTMLElement = document.createElement('article');
    article.setAttribute('data-dev-content-list', 'home.stories');
    article.setAttribute('data-dev-content-list-index', '2');
    article.setAttribute('data-dev-item-id', 'abc123');
    article.setAttribute('data-dev-file', 'src/pages/index.tsx');
    makeContentElement(article);

    renderHoverBar({ type: 'content', element: article });
    openToolbar(article);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_CONTENT_ITEM');
    expect(call).toBeTruthy();
    const msg = call![1] as { type: string; data: { collectionKey: string; itemId: string; itemIndex: number } };
    expect(msg.data.collectionKey).toBe('home.stories');
    expect(msg.data.itemId).toBe('abc123');
    expect(msg.data.itemIndex).toBe(2);
  });

  it('dispatches DELETE_ELEMENT with skipAst for a conformable-item element (agent path)', () => {
    const div: HTMLElement = document.createElement('div');
    div.setAttribute('data-dev-conformable-array', 'features');
    div.setAttribute('data-dev-conformable-page', 'home');
    div.setAttribute('data-dev-conformable-id', 'L42C5');
    div.setAttribute('data-dev-content-list-index', '1');
    div.setAttribute('data-dev-file', 'src/pages/index.tsx');
    makeContentElement(div);

    renderHoverBar({ type: 'content', element: div });
    openToolbar(div);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_ELEMENT');
    expect(call).toBeTruthy();
    const msg = call![1] as {
      type: string;
      data: { preciseSelector: string; devContext?: unknown; elementInfo: { tagName: string }; skipAst?: boolean };
    };
    expect(msg.data.elementInfo.tagName).toBe('div');
    expect(msg.data.preciseSelector).toBe('div > img');
    expect(msg.data.devContext).toMatchObject({ devId: 'test-id' });
    expect(msg.data.skipAst).toBe(true);
  });

  it('dispatches DELETE_ELEMENT with skipAst for an agent-fallback element (agent path)', () => {
    const span: HTMLElement = document.createElement('span');
    span.setAttribute('data-dev-dynamic', 'true');
    span.setAttribute('data-dev-file', 'src/pages/index.tsx');
    span.textContent = 'Dynamic counter';
    makeContentElement(span);

    renderHoverBar({ type: 'content', element: span });
    openToolbar(span);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_ELEMENT');
    expect(call).toBeTruthy();
    const msg = call![1] as {
      type: string;
      data: { preciseSelector: string; devContext?: unknown; elementInfo: { tagName: string }; skipAst?: boolean };
    };
    expect(msg.data.elementInfo.tagName).toBe('span');
    expect(msg.data.preciseSelector).toBe('div > img');
    expect(msg.data.devContext).toMatchObject({ devId: 'test-id' });
    expect(msg.data.skipAst).toBe(true);
  });

  it('dispatches DELETE_ELEMENT for an agent-fallback element inside a content list', () => {
    const list: HTMLElement = document.createElement('ul');
    list.setAttribute('data-dev-content-list', 'home.items');
    const span: HTMLElement = document.createElement('span');
    span.setAttribute('data-dev-dynamic', 'true');
    span.setAttribute('data-dev-file', 'src/pages/index.tsx');
    span.textContent = 'Looped';
    list.appendChild(span);
    document.body.appendChild(list);
    span.getBoundingClientRect = vi.fn(() => ({
      top: 100, left: 100, width: 200, height: 30, right: 300, bottom: 130, x: 100, y: 100, toJSON: () => {},
    } as DOMRect));

    renderHoverBar({ type: 'content', element: span });
    openToolbar(span);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_ELEMENT');
    expect(call).toBeTruthy();
  });

  it('dispatches DELETE_ELEMENT with forceContainer for a container element', () => {
    const section: HTMLElement = document.createElement('section');
    section.setAttribute('data-dev-id', 'sec-123');
    section.setAttribute('data-dev-file', 'src/pages/index.tsx');
    makeContentElement(section);

    renderHoverBar({ type: 'content', element: section });
    openToolbar(section);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_ELEMENT');
    expect(call).toBeTruthy();
    const msg = call![1] as { type: string; data: { forceContainer?: boolean } };
    expect(msg.data.forceContainer).toBe(true);
  });

  it('dispatches DELETE_ELEMENT without forceContainer for a static-leaf text element', () => {
    const p: HTMLElement = document.createElement('p');
    p.setAttribute('data-dev-file', 'src/pages/index.tsx');
    p.textContent = 'Hello';
    makeContentElement(p);

    renderHoverBar({ type: 'content', element: p });
    openToolbar(p);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_ELEMENT');
    expect(call).toBeTruthy();
    const msg = call![1] as { type: string; data: { forceContainer?: boolean } };
    expect(msg.data.forceContainer).toBeUndefined();
  });
});

// Images must be classified like any other element before deletion. An <img>
// rendered from a content-backed .map() carries content-list/item-ID
// attributes and must route to its collection-aware path — not direct AST
// deletion of the shared <img> template, which would strip the image from
// every current and future list item.
describe('ElementHoverBar - image delete routing', () => {
  it('dispatches DELETE_CONTENT_ITEM for an image carrying content-list/item-ID attributes', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement({
      'data-dev-content-list': 'home.products',
      'data-dev-content-list-index': '3',
      'data-dev-item-id': 'prod-3',
      'data-dev-file': 'src/pages/index.tsx',
    });
    renderHoverBar(makeImageHover(img));
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_CONTENT_ITEM');
    expect(call).toBeTruthy();
    const msg = call![1] as { type: string; data: { collectionKey: string; itemId: string; itemIndex: number } };
    expect(msg.data.collectionKey).toBe('home.products');
    expect(msg.data.itemId).toBe('prod-3');
    expect(msg.data.itemIndex).toBe(3);
    // Must NOT fall back to raw media deletion of the shared <img> template.
    expect(findPostMessageByType('DELETE_ELEMENT')).toBeFalsy();
  });

  it('dispatches DELETE_ELEMENT for a conformable image root (AST-first path)', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement({
      'data-dev-conformable-array': 'gallery',
      'data-dev-conformable-page': 'home',
      'data-dev-conformable-id': 'L10C2',
      'data-dev-content-list-index': '1',
      'data-dev-file': 'src/pages/index.tsx',
    });
    renderHoverBar(makeImageHover(img));
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_ELEMENT');
    expect(call).toBeTruthy();
    const msg = call![1] as { type: string; data: { elementInfo: { tagName: string } } };
    expect(msg.data.elementInfo.tagName).toBe('img');
  });

  it('still dispatches DELETE_ELEMENT for a normal standalone image', () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement({ 'data-dev-file': 'src/pages/index.tsx' });
    renderHoverBar(makeImageHover(img, { imageUrl: 'https://x/y.jpg' }));
    openToolbar(img);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const call = findPostMessageByType('DELETE_ELEMENT');
    expect(call).toBeTruthy();
    const msg = call![1] as { type: string; data: { imageUrl: string | null; forceContainer?: boolean } };
    expect(msg.data.imageUrl).toBe('https://x/y.jpg');
    expect(msg.data.forceContainer).toBeUndefined();
    expect(findPostMessageByType('DELETE_CONTENT_ITEM')).toBeFalsy();
  });
});

function dispatchMediaEditLock(locked: boolean): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'MEDIA_EDIT_LOCKED', locked } }));
}

describe('ElementHoverBar - media edit lock (AIROBUILD-5037)', () => {
  it('enables Replace/Modify by default', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    renderHoverBar(makeImageHover(img));
    openToolbar(img);

    const replace = await screen.findByRole('button', { name: /Replace/ });
    const modify = screen.getByRole('button', { name: /Modify/ });
    expect(replace.getAttribute('aria-disabled')).toBeNull();
    expect(modify.getAttribute('aria-disabled')).toBeNull();
  });

  it('disables Replace/Modify when the site is locked', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    renderHoverBar(makeImageHover(img));
    openToolbar(img);

    dispatchMediaEditLock(true);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Replace/ }).getAttribute('aria-disabled')).toBe('true'),
    );
    expect(screen.getByRole('button', { name: /Modify/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('exposes the lock reason in the accessible name of the disabled buttons', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    renderHoverBar(makeImageHover(img));
    openToolbar(img);

    dispatchMediaEditLock(true);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Replace, Available when Airo finishes the current change/ }),
      ).not.toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: /Modify, Available when Airo finishes the current change/ }),
    ).not.toBeNull();
  });

  it('ignores a MEDIA_EDIT_LOCKED message from a disallowed origin', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    vi.mocked(isOriginAllowed).mockReturnValue(false);
    try {
      const img = makeImageElement();
      renderHoverBar(makeImageHover(img));
      openToolbar(img);

      dispatchMediaEditLock(true);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(screen.getByRole('button', { name: /Replace/ }).getAttribute('aria-disabled')).toBeNull();

      vi.mocked(isOriginAllowed).mockReturnValue(true);
      dispatchMediaEditLock(true);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Replace/ }).getAttribute('aria-disabled')).toBe('true'),
      );
    } finally {
      vi.mocked(isOriginAllowed).mockReturnValue(true);
    }
  });

  it('re-enables Replace/Modify when the lock clears', async () => {
    vi.stubEnv('VITE_GODADDY_STORE_ID', '');
    const img = makeImageElement();
    renderHoverBar(makeImageHover(img));
    openToolbar(img);

    dispatchMediaEditLock(true);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Replace/ }).getAttribute('aria-disabled')).toBe('true'),
    );

    dispatchMediaEditLock(false);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Replace/ }).getAttribute('aria-disabled')).toBeNull(),
    );
  });
});

describe('computePopoverPlacement', () => {
  it('returns "below" when there is enough space below', () => {
    expect(computePopoverPlacement(400, 500, 360)).toBe('below');
  });

  it('returns "above" when not enough space below but enough above', () => {
    expect(computePopoverPlacement(100, 500, 360)).toBe('above');
  });

  it('returns "below" as fallback when neither direction fits', () => {
    expect(computePopoverPlacement(100, 100, 360)).toBe('below');
  });

  it('returns "below" when space below exactly equals picker height', () => {
    expect(computePopoverPlacement(360, 200, 360)).toBe('below');
  });

  it('returns "above" when space below is 1px short', () => {
    expect(computePopoverPlacement(359, 400, 360)).toBe('above');
  });
});
