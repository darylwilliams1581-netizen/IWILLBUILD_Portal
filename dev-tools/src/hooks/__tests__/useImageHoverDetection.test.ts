/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { createRef } from 'react';

import { useImageHoverDetection } from '../useImageHoverDetection';

type EditingState = { editingElement: HTMLElement | null; saveStatus?: string };

function makeEditingRef(saveStatus: string = 'idle') {
  const ref = createRef<EditingState>() as { current: EditingState };
  ref.current = { editingElement: null, saveStatus };
  return ref;
}

function fireClick(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function fireMouseOver(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
}

describe('useImageHoverDetection hover path', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('shows outline target on hover without opening the toolbar', () => {
    const h1 = document.createElement('h1');
    h1.textContent = 'Hello';
    document.body.appendChild(h1);

    const editingRef = makeEditingRef();
    const { result } = renderHook(() => useImageHoverDetection(true, editingRef));

    fireMouseOver(h1);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.hoveredElement?.element).toBe(h1);
    expect(result.current.toolbarMode).toBe(false);
  });
});

describe('useImageHoverDetection click path', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('resolves a click on a <span> inside an <h1> to the <h1>', () => {
    const h1 = document.createElement('h1');
    h1.appendChild(document.createTextNode('Hello '));
    const span = document.createElement('span');
    span.textContent = 'world';
    h1.appendChild(span);
    document.body.appendChild(h1);

    const editingRef = makeEditingRef();
    const { result } = renderHook(() => useImageHoverDetection(true, editingRef));

    fireClick(span);

    expect(result.current.hoveredElement?.type).toBe('content');
    expect(result.current.hoveredElement?.element).toBe(h1);
    expect(result.current.toolbarMode).toBe(true);
  });

  it('opens the bar on a <p> that contains an <a>', () => {
    const p = document.createElement('p');
    p.appendChild(document.createTextNode('Visit '));
    const a = document.createElement('a');
    a.href = '/x';
    a.textContent = 'link';
    p.appendChild(a);
    document.body.appendChild(p);

    const editingRef = makeEditingRef();
    const { result } = renderHook(() => useImageHoverDetection(true, editingRef));

    fireClick(p);

    expect(result.current.hoveredElement?.type).toBe('content');
    expect(result.current.hoveredElement?.element).toBe(p);
    expect(result.current.toolbarMode).toBe(true);
  });

  it('does not open the bar while saveStatus is "saving"', () => {
    const h1 = document.createElement('h1');
    h1.textContent = 'Saving in flight';
    document.body.appendChild(h1);

    const editingRef = makeEditingRef('saving');
    const { result } = renderHook(() => useImageHoverDetection(true, editingRef));

    fireClick(h1);

    expect(result.current.hoveredElement).toBeNull();
    expect(result.current.toolbarMode).toBe(false);
  });

  it('clears the pending hover commit when the mouse reaches the dev-tools bar', () => {
    vi.useFakeTimers();
    try {
      const h1 = document.createElement('h1');
      h1.textContent = 'Wildflowers';
      const p = document.createElement('p');
      p.textContent = 'Each arrangement is a one-of-a-kind creation.';
      const bar = document.createElement('div');
      bar.setAttribute('data-airo-dev-tools', '');
      bar.className = 'edit-mode-hover-bar';
      document.body.append(h1, p, bar);

      const editingRef = makeEditingRef();
      const { result } = renderHook(() => useImageHoverDetection(true, editingRef));

      act(() => {
        p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      expect(result.current.toolbarMode).toBe(true);
      expect(result.current.hoveredElement?.element).toBe(p);

      act(() => {
        h1.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      act(() => {
        bar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current.toolbarMode).toBe(true);
      expect(result.current.hoveredElement?.element).toBe(p);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not open the bar on a link inside a <nav>', () => {
    const nav = document.createElement('nav');
    const a = document.createElement('a');
    a.href = '/x';
    a.textContent = 'Home';
    nav.appendChild(a);
    document.body.appendChild(nav);

    const editingRef = makeEditingRef();
    const { result } = renderHook(() => useImageHoverDetection(true, editingRef));

    fireClick(a);

    expect(result.current.hoveredElement).toBeNull();
    expect(result.current.toolbarMode).toBe(false);
  });
});

describe('useImageHoverDetection toolbar dismiss', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function renderWithOpenToolbar() {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Body';
    document.body.appendChild(paragraph);

    const editingRef = makeEditingRef();
    const rendered = renderHook(
      ({ active }: { active: boolean }) => useImageHoverDetection(active, editingRef),
      { initialProps: { active: true } },
    );

    fireClick(paragraph);
    expect(rendered.result.current.toolbarMode).toBe(true);
    return { ...rendered, paragraph };
  }

  it('keeps the toolbar open on in-document mouseout while toolbar is open', () => {
    const h1 = document.createElement('h1');
    h1.textContent = 'Title';
    document.body.appendChild(h1);

    const { result, paragraph } = renderWithOpenToolbar();
    act(() => {
      paragraph.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: h1 }));
    });

    expect(result.current.toolbarMode).toBe(true);
    expect(result.current.hoveredElement?.element).toBe(paragraph);
  });

  it('keeps the toolbar open when the pointer leaves the document, and tracks it (AIROBUILD-5123)', () => {
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');

    const { result, paragraph } = renderWithOpenToolbar();
    act(() => {
      paragraph.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }));
    });

    expect(result.current.toolbarMode).toBe(true);
    expect(result.current.hoveredElement?.element).toBe(paragraph);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRACK_EVENT',
        kind: 'impression',
        eid: 'devtools.toolbar.persist_pointer_out',
        properties: { surface: 'text' },
      }),
      expect.anything(),
    );
  });

  it('fires the persist impression once per toolbar-open session, not per crossing (AIROBUILD-5123)', () => {
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');
    const persistImpressions = (): number =>
      postMessageSpy.mock.calls.filter(
        ([message]) => (message as { eid?: string }).eid === 'devtools.toolbar.persist_pointer_out',
      ).length;

    const { result, paragraph } = renderWithOpenToolbar();
    const crossDocumentEdge = (): void => {
      act(() => {
        paragraph.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }));
      });
    };

    crossDocumentEdge();
    crossDocumentEdge();
    crossDocumentEdge();
    expect(result.current.toolbarMode).toBe(true);
    expect(persistImpressions()).toBe(1);

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    fireClick(paragraph);
    crossDocumentEdge();
    expect(persistImpressions()).toBe(2);
  });

  it('keeps the toolbar open when the pointer leaves the toolbar itself', () => {
    vi.useFakeTimers();
    const { result, paragraph } = renderWithOpenToolbar();

    act(() => {
      result.current.handleBarMouseLeave();
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current.toolbarMode).toBe(true);
    expect(result.current.hoveredElement?.element).toBe(paragraph);
    vi.useRealTimers();
  });

  it('keeps the toolbar open when the document becomes hidden', () => {
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    const { result, paragraph } = renderWithOpenToolbar();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.toolbarMode).toBe(true);
    expect(result.current.hoveredElement?.element).toBe(paragraph);

    visibilitySpy.mockRestore();
  });

  it('dismisses the toolbar on Escape', () => {
    const { result } = renderWithOpenToolbar();

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(result.current.toolbarMode).toBe(false);
    expect(result.current.hoveredElement).toBeNull();
  });

  it('leaves Escape to the focused input so quick edit keeps its own dismissal', () => {
    const { result } = renderWithOpenToolbar();
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(result.current.toolbarMode).toBe(true);
  });

  it('drops the anchor when edit mode turns off so re-entering starts clean', () => {
    const { result, rerender } = renderWithOpenToolbar();

    rerender({ active: false });
    rerender({ active: true });

    expect(result.current.toolbarMode).toBe(false);
    expect(result.current.hoveredElement).toBeNull();
  });
});
