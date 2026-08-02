import { getPlainTextFromClipboard } from './paste-plain-text';

/**
 * Paste handler for the legacy contentEditable editing path: replaces the
 * clipboard's rich markup with plain text inserted at the caret, so inline
 * styles and nested spans from Word, Pages, Apple Notes, or email never enter
 * the edited element (AIROBUILD-2429).
 */
export function insertPlainTextOnPaste(event: ClipboardEvent): void {
  if (!event.clipboardData) return;
  event.preventDefault();
  const text = getPlainTextFromClipboard(event.clipboardData);
  // No plain text to insert (e.g. an image-only paste). Bail before mutating —
  // deleteContents() here would destroy the user's selection for nothing.
  if (!text) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  range.deleteContents(); // replace any selected text
  const node = document.createTextNode(text);
  range.insertNode(node);

  // Place the caret immediately after the inserted text.
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Enter handler for the legacy contentEditable path: insert a "\n" at the caret
 * instead of the browser's default block insertion (`<div>`/`<br>`). Those block
 * nodes are created directly in the React-managed element and linger as
 * untracked siblings after the save's re-render — corrupting the element so the
 * next click lands on the `<br>`-segment path and fails ("Edit not applied").
 * `insertData` mutates the existing text node in place (no split, no new node),
 * so React's tracked node keeps its identity; `white-space: pre-line` renders
 * the "\n" as a line break.
 */
export function insertLineBreakOnEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  range.deleteContents(); // replace any selected text
  const container = range.startContainer;
  if (container.nodeType === Node.TEXT_NODE) {
    const textNode = container as Text;
    const offset = range.startOffset;
    textNode.insertData(offset, '\n');
    range.setStart(textNode, offset + 1);
  } else {
    const node = document.createTextNode('\n');
    range.insertNode(node);
    range.setStartAfter(node);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
