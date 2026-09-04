/**
 * HtmlDocumentCanvas — async content loading tests (CP9B)
 * ─────────────────────────────────────────────────────────
 * Tests the race condition where htmlContent is empty at mount time
 * (parent is still fetching the template) and later becomes populated
 * with the same templateId.
 *
 * AC1  Empty htmlContent at mount → canvas is empty
 * AC2  Content arrives after mount (same templateId) → canvas is populated
 * AC3  Populated content is sanitised before DOM insertion
 * AC4  Dirty user edits are NOT overwritten when content arrives
 * AC5  templateId change resets the canvas and loads new content
 * AC6  templateId change with empty initial content → loads when content arrives
 * AC7  DOM node identity is preserved across async load (no remount)
 * AC8  Cursor is not reset during normal typing (re-render with same content)
 * AC9  Malicious stored HTML is sanitised on async load
 * AC10 Content that arrives after dirty edit is ignored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import HtmlDocumentCanvas from '../HtmlDocumentCanvas';

const TEMPLATE_ID = 42;

// Minimal fetch mock — the canvas saves via PATCH; we don't care about the
// response in these tests.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCanvas(
  overrides: Partial<React.ComponentProps<typeof HtmlDocumentCanvas>> = {},
) {
  return render(
    <HtmlDocumentCanvas
      templateId={TEMPLATE_ID}
      htmlContent=""
      importCss=""
      importReport={null}
      mode="build"
      {...overrides}
    />,
  );
}

function getRoot() {
  return document.querySelector('[data-testid="html-canvas-root"]') as HTMLDivElement;
}

// ── AC1 — Empty htmlContent at mount → canvas is empty ───────────────────────
describe('AC1 — empty htmlContent at mount', () => {
  it('canvas is empty when htmlContent is empty string at mount', () => {
    renderCanvas({ htmlContent: '' });
    const root = getRoot();
    expect(root.innerHTML.trim()).toBe('');
  });
});

// ── AC2 — Content arrives after mount (same templateId) → canvas populated ───
describe('AC2 — content arrives after mount', () => {
  it('populates canvas when htmlContent changes from empty to populated (same templateId)', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });
    const root = getRoot();
    expect(root.innerHTML.trim()).toBe('');

    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent="<p>Loaded content</p>"
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    expect(root.innerHTML).toContain('Loaded content');
  });
});

// ── AC3 — Populated content is sanitised before DOM insertion ─────────────────
describe('AC3 — content is sanitised on async load', () => {
  it('sanitises htmlContent when it arrives after mount', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });

    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent='<p>Safe</p><script>stealCookies()</script>'
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    const root = getRoot();
    expect(root.innerHTML).toContain('Safe');
    expect(root.innerHTML).not.toContain('script');
    expect(root.innerHTML).not.toContain('stealCookies');
  });

  it('sanitises event handlers in async-loaded content', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });

    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent='<img src="/api/img/1" onerror="alert(1)">'
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    const root = getRoot();
    expect(root.innerHTML).not.toContain('onerror');
    expect(root.innerHTML).not.toContain('alert');
  });
});

// ── AC4 — Dirty user edits are NOT overwritten when content arrives ───────────
describe('AC4 — dirty user edits not overwritten', () => {
  it('does not overwrite user edits when htmlContent arrives after user has typed', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });
    const root = getRoot();

    // Simulate user typing — mutate DOM and fire input to mark dirty
    act(() => {
      root.innerHTML = '<p>User typed this</p>';
      root.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Now content arrives from the server
    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent="<p>Server content</p>"
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    // User's edit must be preserved
    expect(root.innerHTML).toContain('User typed this');
    expect(root.innerHTML).not.toContain('Server content');
  });
});

// ── AC5 — templateId change resets canvas and loads new content ───────────────
describe('AC5 — templateId change resets canvas', () => {
  it('resets canvas and loads new content when templateId changes', () => {
    const { rerender } = renderCanvas({ htmlContent: '<p>Doc A</p>' });
    const rootA = getRoot();

    // Simulate user editing Doc A
    act(() => {
      rootA.innerHTML = '<p>Edited A</p>';
      rootA.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Switch to a different template
    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={99}
          htmlContent="<p>Doc B</p>"
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    const rootB = getRoot();
    expect(rootB.innerHTML).toContain('Doc B');
    expect(rootB.innerHTML).not.toContain('Edited A');
  });
});

// ── AC6 — templateId change with empty initial content → loads when arrives ───
describe('AC6 — templateId change with empty initial content', () => {
  it('loads content when it arrives after templateId change with empty initial', () => {
    const { rerender } = renderCanvas({ htmlContent: '<p>Doc A</p>' });

    // Switch to new template, initially empty (loading)
    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={99}
          htmlContent=""
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    const root = getRoot();
    expect(root.innerHTML.trim()).toBe('');

    // Content arrives for the new template
    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={99}
          htmlContent="<p>Doc B loaded</p>"
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    expect(root.innerHTML).toContain('Doc B loaded');
  });
});

// ── AC7 — DOM node identity preserved across async load ───────────────────────
describe('AC7 — DOM node identity preserved across async load', () => {
  it('uses the same DOM node before and after async content arrives', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });
    const nodeBefore = getRoot();

    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent="<p>Loaded</p>"
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    const nodeAfter = getRoot();
    // Must be the exact same DOM element — no remount
    expect(nodeBefore).toBe(nodeAfter);
  });
});

// ── AC8 — Cursor not reset during normal typing ───────────────────────────────
describe('AC8 — cursor not reset during normal typing', () => {
  it('re-render with same templateId and same content does not reset innerHTML', () => {
    const { rerender } = renderCanvas({ htmlContent: '<p>Initial</p>' });
    const root = getRoot();

    // Simulate user typing — DOM diverges from prop
    act(() => {
      root.innerHTML = '<p>User is typing here</p>';
    });

    // Parent re-renders with same templateId and same htmlContent (e.g. save cycle)
    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent="<p>Initial</p>"
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    // innerHTML must not have been reset
    expect(root.innerHTML).toContain('User is typing here');
    expect(root.innerHTML).not.toContain('Initial');
  });
});

// ── AC9 — Malicious stored HTML is sanitised on async load ────────────────────
describe('AC9 — malicious stored HTML sanitised on async load', () => {
  it('removes javascript: href from async-loaded content', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });

    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent='<a href="javascript:alert(document.cookie)">click</a>'
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    const root = getRoot();
    expect(root.innerHTML).not.toContain('javascript:');
    expect(root.innerHTML).toContain('click');
  });

  it('removes external tracking pixel from async-loaded content', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });

    act(() => {
      rerender(
        <HtmlDocumentCanvas
          templateId={TEMPLATE_ID}
          htmlContent='<img src="/api/img/1" alt="ok"><img src="https://tracker.evil.com/p.gif" alt="">'
          importCss=""
          importReport={null}
          mode="build"
        />,
      );
    });

    const root = getRoot();
    expect(root.innerHTML).not.toContain('tracker.evil.com');
    expect(root.innerHTML).toContain('/api/img/1');
  });
});

// ── AC10 — Content that arrives after dirty edit is ignored ───────────────────
describe('AC10 — content arriving after dirty edit is ignored', () => {
  it('ignores multiple subsequent content updates after user has edited', () => {
    const { rerender } = renderCanvas({ htmlContent: '' });
    const root = getRoot();

    // User edits
    act(() => {
      root.innerHTML = '<p>My work</p>';
      root.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Multiple content updates arrive (e.g. polling, re-renders)
    for (let i = 0; i < 3; i++) {
      act(() => {
        rerender(
          <HtmlDocumentCanvas
            templateId={TEMPLATE_ID}
            htmlContent={`<p>Server update ${i}</p>`}
            importCss=""
            importReport={null}
            mode="build"
          />,
        );
      });
    }

    expect(root.innerHTML).toContain('My work');
    expect(root.innerHTML).not.toContain('Server update');
  });
});
