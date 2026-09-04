/**
 * Regression tests — TextBlock and HeadingBlock contentEditable editing
 *
 * Root cause fixed (identical to TableBlock / RichTextBlock):
 *   dangerouslySetInnerHTML on a focused contentEditable caused React to
 *   unconditionally replace the DOM's content on every parent re-render
 *   (triggered by select, inspector changes, autosave). This restored deleted
 *   characters, reset the caret, and caused a browser scroll-to-focus jump.
 *
 * Fix pattern (both blocks):
 *   - No dangerouslySetInnerHTML on edit-mode contentEditables.
 *   - Initial textContent set imperatively via ref callback (once at mount).
 *     textContent is used (not innerHTML) because both blocks store plain text,
 *     which also eliminates any XSS surface entirely.
 *   - External value synced via useEffect only when element is NOT focused.
 *   - Commit (updateBlock) fires on blur only.
 *
 * Tests assert:
 *   1. Initial content renders correctly.
 *   2. Deleted text stays deleted after a parent re-render.
 *   3. The same DOM node remains focused after a parent re-render.
 *   4. Blur commits the final value exactly once.
 *   5. External value syncs when element is NOT focused.
 *   6. External value does NOT sync when element IS focused.
 *   7. Multiple rapid re-renders don't corrupt focused content.
 *   8. Preview/fill mode renders read-only (no contentEditable).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../sanitiseHtml', () => ({
  sanitiseHtml: (s: string) => s,
}));

const mockUpdateBlock = vi.fn();
const mockUpdateBlockInColumn = vi.fn();
let mockMode = 'edit';

vi.mock('../useDocumentStore', () => ({
  useDocumentStore: (selector?: (s: unknown) => unknown) => {
    const store = {
      mode: mockMode,
      updateBlock: mockUpdateBlock,
      updateBlockInColumn: mockUpdateBlockInColumn,
    };
    return typeof selector === 'function' ? selector(store) : store;
  },
  newId: () => `id-${Math.random().toString(36).slice(2, 8)}`,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTextBlock(content = 'Hello world', overrides = {}) {
  return {
    id: 'text-block-1',
    type: 'text' as const,
    content,
    align: 'left' as const,
    fontSize: 'base',
    bold: false,
    italic: false,
    ...overrides,
  };
}

function makeHeadingBlock(content = 'My Heading', overrides = {}) {
  return {
    id: 'heading-block-1',
    type: 'heading' as const,
    content,
    level: 2,
    align: 'left' as const,
    color: undefined,
    ...overrides,
  };
}

// ── TextBlock tests ───────────────────────────────────────────────────────────

describe('TextBlock — contentEditable editing regression', () => {
  beforeEach(() => {
    mockMode = 'edit';
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders initial content on mount', async () => {
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container } = render(<TextBlockView block={makeTextBlock('Hello world')} />);
    const el = container.querySelector('[contenteditable]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('Hello world');
  });

  it('deleted text stays deleted after a parent re-render', async () => {
    const block = makeTextBlock('Hello world');
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container, rerender } = render(<TextBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'Hello';

    await act(async () => { rerender(<TextBlockView block={block} />); });

    expect(el.textContent).toBe('Hello');
    expect(el.textContent).not.toContain('world');
  });

  it('the focused element remains the same DOM node after a parent re-render', async () => {
    const block = makeTextBlock();
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container, rerender } = render(<TextBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    const nodeBeforeRerender = document.activeElement;

    await act(async () => { rerender(<TextBlockView block={block} />); });

    expect(document.activeElement).toBe(nodeBeforeRerender);
  });

  it('calls updateBlock exactly once on blur with the final text', async () => {
    const block = makeTextBlock('Hello world');
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container } = render(<TextBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'Updated text';
    await act(async () => { fireEvent.blur(el); });

    expect(mockUpdateBlock).toHaveBeenCalledTimes(1);
    const patch = mockUpdateBlock.mock.calls[0][1] as { content: string };
    expect(patch.content).toBe('Updated text');
  });

  it('syncs external content change when element is NOT focused', async () => {
    const block = makeTextBlock('Original');
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container, rerender } = render(<TextBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    expect(document.activeElement).not.toBe(el);

    const updatedBlock = makeTextBlock('Externally updated');
    await act(async () => { rerender(<TextBlockView block={updatedBlock} />); });

    expect(el.textContent).toBe('Externally updated');
  });

  it('does NOT sync external content when element IS focused', async () => {
    const block = makeTextBlock('Original');
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container, rerender } = render(<TextBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'User is typing…';

    const updatedBlock = makeTextBlock('External override');
    await act(async () => { rerender(<TextBlockView block={updatedBlock} />); });

    expect(el.textContent).toBe('User is typing…');
  });

  it('handles 10 rapid re-renders without corrupting focused content', async () => {
    const block = makeTextBlock();
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container, rerender } = render(<TextBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'Typing fast';

    for (let i = 0; i < 10; i++) {
      await act(async () => { rerender(<TextBlockView block={block} />); });
    }

    expect(el.textContent).toBe('Typing fast');
  });

  it('renders a plain <p> in preview mode (no contentEditable)', async () => {
    mockMode = 'preview';
    const { default: TextBlockView } = await import('../blocks/TextBlock');
    const { container } = render(<TextBlockView block={makeTextBlock('Hello')} />);
    expect(container.querySelector('[contenteditable]')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('Hello');
  });
});

// ── HeadingBlock tests ────────────────────────────────────────────────────────

describe('HeadingBlock — contentEditable editing regression', () => {
  beforeEach(() => {
    mockMode = 'edit';
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders initial heading content on mount', async () => {
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container } = render(<HeadingBlockView block={makeHeadingBlock('My Heading')} />);
    const el = container.querySelector('[contenteditable]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('My Heading');
  });

  it('deleted text stays deleted after a parent re-render', async () => {
    const block = makeHeadingBlock('My Heading');
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container, rerender } = render(<HeadingBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'My';

    await act(async () => { rerender(<HeadingBlockView block={block} />); });

    expect(el.textContent).toBe('My');
    expect(el.textContent).not.toContain('Heading');
  });

  it('the focused element remains the same DOM node after a parent re-render', async () => {
    const block = makeHeadingBlock();
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container, rerender } = render(<HeadingBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    const nodeBeforeRerender = document.activeElement;

    await act(async () => { rerender(<HeadingBlockView block={block} />); });

    expect(document.activeElement).toBe(nodeBeforeRerender);
  });

  it('calls updateBlock exactly once on blur with the final text', async () => {
    const block = makeHeadingBlock('My Heading');
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container } = render(<HeadingBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'New Heading';
    await act(async () => { fireEvent.blur(el); });

    expect(mockUpdateBlock).toHaveBeenCalledTimes(1);
    const patch = mockUpdateBlock.mock.calls[0][1] as { content: string };
    expect(patch.content).toBe('New Heading');
  });

  it('syncs external content change when element is NOT focused', async () => {
    const block = makeHeadingBlock('Original');
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container, rerender } = render(<HeadingBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    expect(document.activeElement).not.toBe(el);

    const updatedBlock = makeHeadingBlock('Externally updated');
    await act(async () => { rerender(<HeadingBlockView block={updatedBlock} />); });

    expect(el.textContent).toBe('Externally updated');
  });

  it('does NOT sync external content when element IS focused', async () => {
    const block = makeHeadingBlock('Original');
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container, rerender } = render(<HeadingBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'User is typing…';

    const updatedBlock = makeHeadingBlock('External override');
    await act(async () => { rerender(<HeadingBlockView block={updatedBlock} />); });

    expect(el.textContent).toBe('User is typing…');
  });

  it('handles 10 rapid re-renders without corrupting focused content', async () => {
    const block = makeHeadingBlock();
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container, rerender } = render(<HeadingBlockView block={block} />);

    const el = container.querySelector('[contenteditable]') as HTMLElement;
    await act(async () => { el.focus(); });
    el.textContent = 'Typing fast';

    for (let i = 0; i < 10; i++) {
      await act(async () => { rerender(<HeadingBlockView block={block} />); });
    }

    expect(el.textContent).toBe('Typing fast');
  });

  it('renders the correct heading tag in preview mode (no contentEditable)', async () => {
    mockMode = 'preview';
    const { default: HeadingBlockView } = await import('../blocks/HeadingBlock');
    const { container } = render(<HeadingBlockView block={makeHeadingBlock('Section Title', { level: 2 })} />);
    expect(container.querySelector('[contenteditable]')).toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('Section Title');
  });
});
