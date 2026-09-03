/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { generatePreciseSelector } from '../../utils/element-helpers';
import {
  AFFORDANCE_AUTO_HIDE_MS,
  AFFORDANCE_DELAY_MS,
  PREVIEW_EDIT_AFFORDANCE_EID,
  PREVIEW_EDIT_ENTER_EDIT_EID,
  usePreviewEditInteraction,
} from '../usePreviewEditInteraction';
import { send, trackEventBus } from '../../utils/eventBus';

vi.mock('../../utils/eventBus', () => ({
  send: vi.fn(),
  trackEventBus: {
    click: vi.fn(),
    impression: vi.fn(),
  },
}));

const framedParent: Window = { postMessage: vi.fn() } as unknown as Window;

const PREVIEW_EDIT_ON = {
  previewActive: true,
  editInteractionEnabled: true,
  cmsInlineEditEnabled: true,
} as const;

function appendEditableHeading(text: string = 'Hello'): HTMLHeadingElement {
  const heading: HTMLHeadingElement = document.createElement('h1');
  heading.setAttribute('data-dev-editable', 'text');
  heading.setAttribute('data-dev-file', 'src/pages/index.tsx');
  heading.textContent = text;
  document.body.appendChild(heading);
  return heading;
}

function dispatchMouse(
  node: EventTarget,
  type: 'click' | 'dblclick',
  clientX: number,
  clientY: number,
): MouseEvent {
  const event: MouseEvent = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  node.dispatchEvent(event);
  return event;
}

describe('usePreviewEditInteraction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: framedParent,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: window,
    });
  });

  it('shows affordance 250ms after a single click on editable content', () => {
    const heading: HTMLHeadingElement = appendEditableHeading();
    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    act(() => {
      dispatchMouse(heading, 'click', 40, 60);
    });
    expect(result.current.affordance).toBeNull();

    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS - 1);
    });
    expect(result.current.affordance).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.affordance).toEqual({ x: 40, y: 60 });
    expect(send).not.toHaveBeenCalled();
    expect(trackEventBus.impression).toHaveBeenCalledExactlyOnceWith(PREVIEW_EDIT_AFFORDANCE_EID);
  });

  it('does not show affordance when a second click arrives before 250ms', () => {
    const heading: HTMLHeadingElement = appendEditableHeading();
    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    act(() => {
      dispatchMouse(heading, 'click', 10, 12);
      dispatchMouse(heading, 'click', 10, 12);
    });

    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });
    expect(result.current.affordance).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(trackEventBus.impression).not.toHaveBeenCalled();
  });

  it('never shows affordance or sends on button clicks', () => {
    const button: HTMLButtonElement = document.createElement('button');
    button.textContent = 'Go';
    document.body.appendChild(button);
    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    act(() => {
      dispatchMouse(button, 'click', 8, 9);
      dispatchMouse(button, 'dblclick', 8, 9);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS + AFFORDANCE_AUTO_HIDE_MS);
    });

    expect(result.current.affordance).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(trackEventBus.click).not.toHaveBeenCalled();
    expect(trackEventBus.impression).not.toHaveBeenCalled();
  });

  it('sends PREVIEW_ENTER_EDIT on editable dblclick and never shows affordance', () => {
    const heading: HTMLHeadingElement = appendEditableHeading();
    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    let dblclick: MouseEvent;
    act(() => {
      dispatchMouse(heading, 'click', 22, 33);
      dispatchMouse(heading, 'click', 22, 33);
      dblclick = dispatchMouse(heading, 'dblclick', 22, 33);
    });

    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });

    expect(result.current.affordance).toBeNull();
    expect(dblclick!.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'PREVIEW_ENTER_EDIT',
      selector: generatePreciseSelector(heading),
      elementKind: 'text',
      clientX: 22,
      clientY: 33,
    });
    expect(trackEventBus.click).toHaveBeenCalledExactlyOnceWith(PREVIEW_EDIT_ENTER_EDIT_EID, {
      elementKind: 'text',
    });
    expect(trackEventBus.impression).not.toHaveBeenCalled();
  });

  it('does not send PREVIEW_ENTER_EDIT on text-direct dblclick', () => {
    const paragraph: HTMLParagraphElement = document.createElement('p');
    paragraph.setAttribute('data-dev-editable', 'text');
    paragraph.setAttribute('data-dev-file', 'src/pages/index.tsx');
    const strong: HTMLElement = document.createElement('strong');
    strong.textContent = 'Bold';
    paragraph.appendChild(strong);
    document.body.appendChild(paragraph);

    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    let dblclick: MouseEvent;
    act(() => {
      dispatchMouse(strong, 'click', 5, 6);
      dispatchMouse(strong, 'click', 5, 6);
      dblclick = dispatchMouse(strong, 'dblclick', 5, 6);
    });

    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });

    expect(result.current.affordance).toBeNull();
    expect(dblclick!.defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(trackEventBus.click).not.toHaveBeenCalled();
  });

  it('does not send PREVIEW_ENTER_EDIT on Text-node dblclick inside editable p', () => {
    const paragraph: HTMLParagraphElement = document.createElement('p');
    paragraph.setAttribute('data-dev-editable', 'text');
    paragraph.setAttribute('data-dev-file', 'src/pages/index.tsx');
    paragraph.textContent = 'Hello world';
    document.body.appendChild(paragraph);
    const textNode: ChildNode | null = paragraph.firstChild;
    if (!(textNode instanceof Text)) {
      throw new Error('expected a Text node');
    }

    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    let dblclick: MouseEvent;
    act(() => {
      dispatchMouse(textNode, 'click', 5, 6);
      dispatchMouse(textNode, 'click', 5, 6);
      dblclick = dispatchMouse(textNode, 'dblclick', 5, 6);
    });

    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });

    expect(result.current.affordance).toBeNull();
    expect(dblclick!.defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('is inert when the preview is a standalone tab', () => {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: window,
    });
    const heading: HTMLHeadingElement = appendEditableHeading();
    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    act(() => {
      dispatchMouse(heading, 'click', 1, 2);
      dispatchMouse(heading, 'dblclick', 1, 2);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS + AFFORDANCE_AUTO_HIDE_MS);
    });

    expect(result.current.affordance).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it(`auto-hides affordance ${AFFORDANCE_AUTO_HIDE_MS}ms after it appears`, () => {
    const heading: HTMLHeadingElement = appendEditableHeading();
    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    act(() => {
      dispatchMouse(heading, 'click', 15, 18);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });
    expect(result.current.affordance).toEqual({ x: 15, y: 18 });

    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_AUTO_HIDE_MS - 1);
    });
    expect(result.current.affordance).toEqual({ x: 15, y: 18 });

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.affordance).toBeNull();
  });

  it('does not enter edit when preview is active but edit interaction is off', () => {
    const heading: HTMLHeadingElement = appendEditableHeading();
    const { result } = renderHook(() =>
      usePreviewEditInteraction({
        previewActive: true,
        editInteractionEnabled: false,
        cmsInlineEditEnabled: true,
      }),
    );

    act(() => {
      dispatchMouse(heading, 'click', 1, 2);
      dispatchMouse(heading, 'dblclick', 1, 2);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS + AFFORDANCE_AUTO_HIDE_MS);
    });

    expect(result.current.affordance).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('opens external http(s) links when edit interaction is off', () => {
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = 'https://example.com/docs';
    anchor.textContent = 'Docs';
    document.body.appendChild(anchor);
    const { result } = renderHook(() =>
      usePreviewEditInteraction({
        previewActive: true,
        editInteractionEnabled: false,
        cmsInlineEditEnabled: true,
      }),
    );

    let click: MouseEvent;
    act(() => {
      click = dispatchMouse(anchor, 'click', 1, 1);
    });

    expect(click!.defaultPrevented).toBe(true);
    expect(result.current.affordance).toBeNull();
    expect(send).toHaveBeenCalledWith({
      type: 'OPEN_EXTERNAL_URL',
      url: 'https://example.com/docs',
    });
  });

  it('does not intercept clicks when preview is inactive', () => {
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = 'https://example.com/pricing';
    anchor.textContent = 'Pricing';
    document.body.appendChild(anchor);
    const heading: HTMLHeadingElement = appendEditableHeading();
    const { result } = renderHook(() =>
      usePreviewEditInteraction({
        previewActive: false,
        editInteractionEnabled: true,
        cmsInlineEditEnabled: true,
      }),
    );

    act(() => {
      dispatchMouse(anchor, 'click', 1, 1);
      dispatchMouse(heading, 'click', 1, 2);
      dispatchMouse(heading, 'dblclick', 1, 2);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS + AFFORDANCE_AUTO_HIDE_MS);
    });

    expect(result.current.affordance).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('dismisses a visible affordance on click away, popstate, and SPA pushState', () => {
    const heading: HTMLHeadingElement = appendEditableHeading();
    const away: HTMLButtonElement = document.createElement('button');
    away.textContent = 'Other';
    document.body.appendChild(away);
    const { result } = renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    act(() => {
      dispatchMouse(heading, 'click', 3, 4);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });
    expect(result.current.affordance).toEqual({ x: 3, y: 4 });

    act(() => {
      dispatchMouse(away, 'click', 100, 100);
    });
    expect(result.current.affordance).toBeNull();

    act(() => {
      dispatchMouse(heading, 'click', 7, 8);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });
    expect(result.current.affordance).toEqual({ x: 7, y: 8 });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.affordance).toBeNull();

    act(() => {
      dispatchMouse(heading, 'click', 9, 10);
    });
    act(() => {
      vi.advanceTimersByTime(AFFORDANCE_DELAY_MS);
    });
    expect(result.current.affordance).toEqual({ x: 9, y: 10 });

    act(() => {
      history.pushState(null, '', '/about');
    });
    expect(result.current.affordance).toBeNull();
  });

  it('opens external http(s) links via OPEN_EXTERNAL_URL', () => {
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = 'https://example.com/pricing';
    anchor.textContent = 'Pricing';
    document.body.appendChild(anchor);
    renderHook(() =>
      usePreviewEditInteraction(PREVIEW_EDIT_ON),
    );

    let click: MouseEvent;
    act(() => {
      click = dispatchMouse(anchor, 'click', 1, 1);
    });

    expect(click!.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledWith({
      type: 'OPEN_EXTERNAL_URL',
      url: 'https://example.com/pricing',
    });
  });
});
