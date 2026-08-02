/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { insertPlainTextOnPaste, insertLineBreakOnEnter } from '../contenteditable-paste';

function makeClipboardEvent(data: Record<string, string> | null) {
  let prevented = false;
  return {
    clipboardData: data === null ? null : { getData: (type: string): string => data[type] ?? '' },
    preventDefault() {
      prevented = true;
    },
    wasPrevented: () => prevented,
  };
}

function setupEditable(initial: string): HTMLElement {
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.textContent = initial;
  document.body.appendChild(el);
  return el;
}

function placeCaretAtEnd(el: HTMLElement): void {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectAllContents(el: HTMLElement): void {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretInText(node: Text, offset: number): void {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function makeKeyEvent(key: string) {
  let prevented = false;
  return {
    key,
    preventDefault() {
      prevented = true;
    },
    wasPrevented: () => prevented,
  };
}

describe('insertPlainTextOnPaste', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('prevents the default browser paste', () => {
    const el = setupEditable('hello');
    placeCaretAtEnd(el);
    const event = makeClipboardEvent({ 'text/plain': 'x' });
    insertPlainTextOnPaste(event as unknown as ClipboardEvent);
    expect(event.wasPrevented()).toBe(true);
  });

  it('inserts plain text at the caret', () => {
    const el = setupEditable('hello ');
    placeCaretAtEnd(el);
    insertPlainTextOnPaste(makeClipboardEvent({ 'text/plain': 'world' }) as unknown as ClipboardEvent);
    expect(el.textContent).toBe('hello world');
  });

  it('replaces the selected range with the pasted text', () => {
    const el = setupEditable('REPLACE ME');
    selectAllContents(el);
    insertPlainTextOnPaste(makeClipboardEvent({ 'text/plain': 'clean' }) as unknown as ClipboardEvent);
    expect(el.textContent).toBe('clean');
  });

  it('inserts only text content, no markup, from an HTML-only paste', () => {
    const el = setupEditable('');
    placeCaretAtEnd(el);
    insertPlainTextOnPaste(
      makeClipboardEvent({
        'text/html': '<span style="color:red">a <b>b</b></span><span class="Apple-converted-space"> </span>',
      }) as unknown as ClipboardEvent,
    );
    expect(el.textContent).toBe('a b ');
    expect(el.querySelector('span, b')).toBeNull();
  });

  it('preserves the selection and inserts nothing for a non-text (e.g. image) paste', () => {
    const el = setupEditable('keepme');
    selectAllContents(el);
    // clipboardData is present but has neither text/plain nor text/html (image-only).
    const event = makeClipboardEvent({});
    insertPlainTextOnPaste(event as unknown as ClipboardEvent);
    expect(el.textContent).toBe('keepme'); // selected text must NOT be destroyed
    expect(event.wasPrevented()).toBe(true); // non-text paste is blocked, not inserted
  });

  it('does nothing when the event carries no clipboard data', () => {
    const el = setupEditable('untouched');
    placeCaretAtEnd(el);
    const event = makeClipboardEvent(null);
    insertPlainTextOnPaste(event as unknown as ClipboardEvent);
    expect(event.wasPrevented()).toBe(false);
    expect(el.textContent).toBe('untouched');
  });
});

describe('insertLineBreakOnEnter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('ignores non-Enter keys without preventing default (typing still works)', () => {
    const el = setupEditable('hello');
    placeCaretInText(el.firstChild as Text, 5);
    const event = makeKeyEvent('a');
    insertLineBreakOnEnter(event as unknown as KeyboardEvent);
    expect(event.wasPrevented()).toBe(false);
    expect(el.textContent).toBe('hello');
  });

  it('prevents the default block insertion on Enter', () => {
    const el = setupEditable('hello');
    placeCaretInText(el.firstChild as Text, 5);
    const event = makeKeyEvent('Enter');
    insertLineBreakOnEnter(event as unknown as KeyboardEvent);
    expect(event.wasPrevented()).toBe(true);
  });

  it('does nothing when there is no selection', () => {
    const el = setupEditable('hello');
    window.getSelection()?.removeAllRanges();
    insertLineBreakOnEnter(makeKeyEvent('Enter') as unknown as KeyboardEvent);
    expect(el.textContent).toBe('hello');
  });

  it('inserts a newline in place at the caret, preserving the original text node', () => {
    const el = setupEditable('line1');
    const originalNode = el.firstChild; // React's tracked text node
    placeCaretInText(el.firstChild as Text, 5);
    insertLineBreakOnEnter(makeKeyEvent('Enter') as unknown as KeyboardEvent);
    // No block/split nodes: same single text node, identity preserved.
    expect(el.childNodes.length).toBe(1);
    expect(el.firstChild).toBe(originalNode);
    expect(el.querySelector('div, br')).toBeNull();
    expect(el.textContent).toBe('line1\n');
  });

  it('inserts a newline mid-text without splitting the node', () => {
    const el = setupEditable('ab');
    const textNode = el.firstChild as Text;
    placeCaretInText(textNode, 1);
    insertLineBreakOnEnter(makeKeyEvent('Enter') as unknown as KeyboardEvent);
    expect(el.childNodes.length).toBe(1);
    expect(el.firstChild).toBe(textNode);
    expect(el.textContent).toBe('a\nb');
  });

  it('replaces a selection with the newline', () => {
    const el = setupEditable('REPLACE');
    selectAllContents(el);
    insertLineBreakOnEnter(makeKeyEvent('Enter') as unknown as KeyboardEvent);
    expect(el.textContent).toBe('\n');
  });

  it('inserts a newline text node when the caret is not inside a text node', () => {
    const el = setupEditable('');
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    insertLineBreakOnEnter(makeKeyEvent('Enter') as unknown as KeyboardEvent);
    expect(el.textContent).toBe('\n');
    expect(el.querySelector('div, br')).toBeNull();
  });
});
