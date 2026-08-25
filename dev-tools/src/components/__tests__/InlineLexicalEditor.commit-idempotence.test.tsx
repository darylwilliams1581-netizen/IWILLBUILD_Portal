/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import type { MutableRefObject } from 'react';
import InlineLexicalEditor from '../InlineLexicalEditor';

function makeExternalCommitRef(): MutableRefObject<(() => void) | null> {
  return { current: null };
}

function makeTargetElement(text: string): HTMLElement {
  const el = document.createElement('p');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('InlineLexicalEditor - CommitPlugin idempotence', () => {
  // Three independent owners can invoke commit for one user gesture: the
  // outside-mousedown listener, useTrackElement's off-screen handler, and
  // useTextEditing.stopEditing(true) via externalCommitRef. A session must
  // only ever save once.
  it('calls onCommit exactly once when externalCommitRef is invoked twice', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const externalCommitRef = makeExternalCommitRef();
    const targetElement = makeTargetElement('Hello world');

    render(
      createElement(InlineLexicalEditor, {
        initialHtml: 'Hello world',
        computedStyles: {},
        onCommit,
        onCancel,
        targetElement,
        externalCommitRef,
      }),
    );

    expect(externalCommitRef.current).not.toBeNull();
    externalCommitRef.current!();
    externalCommitRef.current!();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('calls onCommit exactly once for outside-mousedown + externalCommitRef in the same gesture', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const externalCommitRef = makeExternalCommitRef();
    const targetElement = makeTargetElement('Hello world');

    render(
      createElement(InlineLexicalEditor, {
        initialHtml: 'Hello world',
        computedStyles: {},
        onCommit,
        onCancel,
        targetElement,
        externalCommitRef,
      }),
    );

    // Simulates the real-world race: InlineLexicalEditor's own outside-click
    // listener and useTextEditing.stopEditing(true) both fire for one click.
    fireEvent.mouseDown(document.body);
    externalCommitRef.current?.();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
