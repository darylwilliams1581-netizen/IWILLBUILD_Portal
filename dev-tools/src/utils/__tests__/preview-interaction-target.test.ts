/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePreviewInteractionTarget } from '../preview-interaction-target';

describe('resolvePreviewInteractionTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('ignores buttons and links', () => {
    const button = document.createElement('button');
    button.textContent = 'Go';
    document.body.appendChild(button);
    expect(
      resolvePreviewInteractionTarget(button, 0, 0, {
        forDoubleClick: true,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('ignore');

    const anchor = document.createElement('a');
    anchor.href = '#';
    anchor.textContent = 'Link';
    document.body.appendChild(anchor);
    expect(
      resolvePreviewInteractionTarget(anchor, 0, 0, {
        forDoubleClick: true,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('ignore');
  });

  it('ignores nav surfaces', () => {
    const nav = document.createElement('nav');
    const span = document.createElement('span');
    span.textContent = 'Home';
    nav.appendChild(span);
    document.body.appendChild(nav);
    expect(
      resolvePreviewInteractionTarget(span, 0, 0, {
        forDoubleClick: false,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('ignore');
  });

  it('returns affordance for single-click on heading element', () => {
    const h1 = document.createElement('h1');
    h1.setAttribute('data-dev-editable', 'text');
    h1.setAttribute('data-dev-file', 'src/pages/index.tsx');
    h1.textContent = 'Hello';
    document.body.appendChild(h1);
    expect(
      resolvePreviewInteractionTarget(h1, 0, 0, {
        forDoubleClick: false,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('affordance');
  });

  it('returns enter-edit for double-click on marked heading', () => {
    const h1 = document.createElement('h1');
    h1.setAttribute('data-dev-editable', 'text');
    h1.setAttribute('data-dev-file', 'src/pages/index.tsx');
    h1.textContent = 'Hello';
    document.body.appendChild(h1);
    const result = resolvePreviewInteractionTarget(h1, 0, 0, {
      forDoubleClick: true,
      cmsInlineEditEnabled: true,
    });
    expect(result.action).toBe('enter-edit');
    if (result.action === 'enter-edit') {
      expect(result.elementKind).toBe('text');
      expect(result.selector.length).toBeGreaterThan(0);
    }
  });

  it('returns native-text-select for double-click on formatting inline', () => {
    const p = document.createElement('p');
    p.setAttribute('data-dev-editable', 'text');
    p.setAttribute('data-dev-file', 'src/pages/index.tsx');
    const strong = document.createElement('strong');
    strong.textContent = 'Bold';
    p.appendChild(strong);
    document.body.appendChild(p);
    expect(
      resolvePreviewInteractionTarget(strong, 0, 0, {
        forDoubleClick: true,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('native-text-select');
  });

  it('returns native-text-select for double-click on code inside editable block', () => {
    const p = document.createElement('p');
    p.setAttribute('data-dev-editable', 'text');
    p.setAttribute('data-dev-file', 'src/pages/index.tsx');
    const code = document.createElement('code');
    code.textContent = 'npm test';
    p.appendChild(code);
    document.body.appendChild(p);
    expect(
      resolvePreviewInteractionTarget(code, 0, 0, {
        forDoubleClick: true,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('native-text-select');
  });

  it('returns enter-edit for double-click on image', () => {
    const img = document.createElement('img');
    img.src = 'https://example.com/x.png';
    document.body.appendChild(img);
    const result = resolvePreviewInteractionTarget(img, 0, 0, {
      forDoubleClick: true,
      cmsInlineEditEnabled: true,
    });
    expect(result.action).toBe('enter-edit');
    if (result.action === 'enter-edit') {
      expect(result.elementKind).toBe('image');
      expect(result.selector.length).toBeGreaterThan(0);
    }
  });

  it('returns enter-edit with elementKind content for double-click on an unmarked hoverable list item', () => {
    const li = document.createElement('li');
    li.textContent = 'Item one';
    document.body.appendChild(li);
    const result = resolvePreviewInteractionTarget(li, 0, 0, {
      forDoubleClick: true,
      cmsInlineEditEnabled: true,
    });
    expect(result.action).toBe('enter-edit');
    if (result.action === 'enter-edit') {
      expect(result.elementKind).toBe('content');
      expect(result.selector.length).toBeGreaterThan(0);
    }
  });

  it('returns affordance for single-click on image with no editable container', () => {
    const img = document.createElement('img');
    img.src = 'https://example.com/x.png';
    document.body.appendChild(img);
    expect(
      resolvePreviewInteractionTarget(img, 0, 0, {
        forDoubleClick: false,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('affordance');
  });

  it('returns enter-edit for double-click on content-keyed heading', () => {
    const h1 = document.createElement('h1');
    h1.setAttribute('data-dev-content-key', 'heroTitle');
    h1.textContent = 'Welcome';
    document.body.appendChild(h1);
    const result = resolvePreviewInteractionTarget(h1, 0, 0, {
      forDoubleClick: true,
      cmsInlineEditEnabled: true,
    });
    expect(result.action).toBe('enter-edit');
    if (result.action === 'enter-edit') {
      expect(result.elementKind).toBe('text');
    }
  });

  it('returns affordance for single-click on content-keyed heading', () => {
    const h1 = document.createElement('h1');
    h1.setAttribute('data-dev-content-key', 'heroTitle');
    h1.textContent = 'Welcome';
    document.body.appendChild(h1);
    expect(
      resolvePreviewInteractionTarget(h1, 0, 0, {
        forDoubleClick: false,
        cmsInlineEditEnabled: true,
      }).action,
    ).toBe('affordance');
  });

  it('returns enter-edit with elementKind content (not text) when cmsInlineEditEnabled is false', () => {
    const h1 = document.createElement('h1');
    h1.setAttribute('data-dev-content-key', 'heroTitle');
    h1.textContent = 'Welcome';
    document.body.appendChild(h1);
    const result = resolvePreviewInteractionTarget(h1, 0, 0, {
      forDoubleClick: true,
      cmsInlineEditEnabled: false,
    });
    expect(result.action).toBe('enter-edit');
    if (result.action === 'enter-edit') {
      expect(result.elementKind).toBe('content');
    }
  });
});
