/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { classifyDeleteStrategy } from '../delete-strategy.js';

vi.mock('../formatOverrideMessages', () => ({
  isLoopRenderedElement: (el: HTMLElement): boolean => el.hasAttribute('data-dev-loop-rendered'),
}));

vi.mock('../commerce-managed-content', () => ({
  isCommerceManagedContent: (el: HTMLElement): boolean => el.getAttribute('data-dev-source-origin') === 'commerce',
}));

function el(html: string): HTMLElement {
  const wrapper: HTMLDivElement = document.createElement('div');
  // Test-only DOM fixtures built from static literal HTML, never user input.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
  wrapper.innerHTML = html;
  return wrapper.firstElementChild as HTMLElement;
}

function nested(outerHtml: string, selector: string): HTMLElement {
  const wrapper: HTMLDivElement = document.createElement('div');
  // Test-only DOM fixtures built from static literal HTML, never user input.
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
  wrapper.innerHTML = outerHtml;
  return wrapper.querySelector(selector) as HTMLElement;
}

describe('classifyDeleteStrategy', () => {
  describe('blocked scenarios', () => {
    it('returns null for commerce-managed elements', () => {
      const element: HTMLElement = el('<p data-dev-source-origin="commerce" data-dev-file="src/pages/index.tsx">Buy</p>');
      expect(classifyDeleteStrategy(element)).toBeNull();
    });

    it('returns null for elements with no data-dev-file and no recognized tag', () => {
      const element: HTMLElement = el('<custom-element>Hello</custom-element>');
      expect(classifyDeleteStrategy(element)).toBeNull();
    });
  });

  describe('content-item strategy', () => {
    it('classifies element with data-dev-content-list and data-dev-item-id', () => {
      const element: HTMLElement = el(
        '<article data-dev-content-list="home.stories" data-dev-content-list-index="2" data-dev-item-id="abc123" data-dev-file="src/pages/index.tsx"></article>'
      );
      const result = classifyDeleteStrategy(element);
      expect(result).toEqual({
        type: 'content-item',
        collectionKey: 'home.stories',
        itemId: 'abc123',
        itemIndex: 2,
      });
    });

    it('classifies element with data-dev-content-list and itemIndex but no itemId (primitive array)', () => {
      const element: HTMLElement = el(
        '<button data-dev-content-list="home.rankings.tabs" data-dev-content-list-index="1" data-dev-file="src/pages/index.tsx">Tab</button>'
      );
      const result = classifyDeleteStrategy(element);
      expect(result).toEqual({
        type: 'content-item',
        collectionKey: 'home.rankings.tabs',
        itemId: null,
        itemIndex: 1,
      });
    });

    it('does NOT classify content-key-template children inside a content-list as content-item', () => {
      const element: HTMLElement = nested(
        '<article data-dev-content-list="home.stories" data-dev-content-list-index="0" data-dev-item-id="xyz">' +
          '<h3 data-dev-content-key-template="home.stories[].title" data-dev-file="src/pages/index.tsx">Title</h3>' +
        '</article>',
        'h3'
      );
      const result = classifyDeleteStrategy(element);
      // h3 has its own content-key-template binding — it should NOT trigger full
      // item deletion (which would delete the entire story record).
      expect(result).toEqual({ type: 'agent-fallback' });
    });

    it('classifies a nested media element inside a content-list root as content-item', () => {
      const element: HTMLElement = nested(
        '<article data-dev-content-list="home.gallery" data-dev-content-list-index="2" data-dev-item-id="photo-3">' +
          '<img data-dev-file="src/pages/index.tsx" src="/img.jpg" />' +
        '</article>',
        'img'
      );
      const result = classifyDeleteStrategy(element);
      expect(result).toEqual({
        type: 'content-item',
        collectionKey: 'home.gallery',
        itemId: 'photo-3',
        itemIndex: 2,
      });
    });

    it('resolves nested bracket notation: home.pricing[].features → home.pricing[0].features', () => {
      const element: HTMLElement = nested(
        '<article data-dev-content-list="home.pricing" data-dev-content-list-index="2" data-dev-item-id="parent-id">' +
          '<li data-dev-content-list="home.pricing[].features" data-dev-content-list-index="1" data-dev-file="src/pages/index.tsx">Feature</li>' +
        '</article>',
        'li'
      );
      const result = classifyDeleteStrategy(element);
      expect(result).toEqual({
        type: 'content-item',
        collectionKey: 'home.pricing[2].features',
        itemId: null,
        itemIndex: 1,
      });
    });

    it('does not leak parent itemId into nested primitive array deletions', () => {
      const element: HTMLElement = nested(
        '<article data-dev-content-list="home.pricing" data-dev-content-list-index="0" data-dev-item-id="parent-id">' +
          '<li data-dev-content-list="home.pricing[].features" data-dev-content-list-index="3" data-dev-file="src/pages/index.tsx">Feature</li>' +
        '</article>',
        'li'
      );
      const result = classifyDeleteStrategy(element);
      // itemId should be null (not "parent-id") because the li's contentListEl !== the itemId-bearing article
      expect(result?.type).toBe('content-item');
      if (result?.type === 'content-item') {
        expect(result.itemId).toBeNull();
        expect(result.itemIndex).toBe(3);
      }
    });

    it('resolves deeply nested brackets: a[].b[].items', () => {
      const element: HTMLElement = nested(
        '<div data-dev-content-list="a" data-dev-content-list-index="1">' +
          '<div data-dev-content-list="a[].b" data-dev-content-list-index="2">' +
            '<li data-dev-content-list="a[].b[].items" data-dev-content-list-index="0" data-dev-file="src/pages/index.tsx">Item</li>' +
          '</div>' +
        '</div>',
        'li'
      );
      const result = classifyDeleteStrategy(element);
      expect(result).toEqual({
        type: 'content-item',
        collectionKey: 'a[1].b[2].items',
        itemId: null,
        itemIndex: 0,
      });
    });
  });

  describe('conformable-item strategy', () => {
    it('classifies element with data-dev-conformable-array', () => {
      const element: HTMLElement = el(
        '<div data-dev-conformable-array="features" data-dev-conformable-page="home" data-dev-conformable-id="L42C5" data-dev-content-list-index="2" data-dev-file="src/pages/index.tsx"></div>'
      );
      const result = classifyDeleteStrategy(element);
      expect(result).toEqual({
        type: 'conformable-item',
        page: 'home',
        arrayName: 'features',
        conformId: 'L42C5',
        itemIndex: 2,
      });
    });
  });

  describe('container strategy', () => {
    it('classifies div with data-dev-id as container', () => {
      const element: HTMLElement = el('<div data-dev-id="abc123" data-dev-file="src/pages/index.tsx"></div>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'container' });
    });

    it('classifies section with data-dev-id as container', () => {
      const element: HTMLElement = el('<section data-dev-id="def456" data-dev-file="src/pages/index.tsx"></section>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'container' });
    });

    it('does not classify container tag without data-dev-id', () => {
      const element: HTMLElement = el('<div data-dev-file="src/pages/index.tsx"></div>');
      // No data-dev-id → not container, falls through to agent-fallback (has data-dev-file)
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'agent-fallback' });
    });

    it('does not classify a loop-rendered container as container (routes to agent-fallback)', () => {
      const element: HTMLElement = el('<div data-dev-id="9d67f8" data-dev-loop-rendered="true" data-dev-file="src/pages/index.tsx"></div>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'agent-fallback' });
    });
  });

  describe('static-leaf strategy', () => {
    it('classifies a plain p element as static-leaf', () => {
      const element: HTMLElement = el('<p data-dev-file="src/pages/index.tsx">Hello</p>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'static-leaf' });
    });

    it('classifies h1-h6 as static-leaf', () => {
      const element: HTMLElement = el('<h2 data-dev-file="src/pages/index.tsx">Title</h2>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'static-leaf' });
    });

    it('classifies img as static-leaf', () => {
      const element: HTMLElement = el('<img data-dev-file="src/pages/index.tsx" src="foo.jpg" />');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'static-leaf' });
    });

    it('classifies button as static-leaf', () => {
      const element: HTMLElement = el('<button data-dev-file="src/pages/index.tsx">Click</button>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'static-leaf' });
    });

    it('does NOT classify loop-rendered element as static-leaf', () => {
      const element: HTMLElement = el('<p data-dev-loop-rendered="true" data-dev-file="src/pages/index.tsx">Item</p>');
      // Falls to agent-fallback
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'agent-fallback' });
    });

    it('does NOT classify dynamic element as static-leaf', () => {
      const element: HTMLElement = el('<span data-dev-dynamic="true" data-dev-file="src/pages/index.tsx">01</span>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'agent-fallback' });
    });

    it('does NOT classify element with data-dev-content-key-template as static-leaf', () => {
      const element: HTMLElement = el(
        '<p data-dev-content-key-template="home.stories[].title" data-dev-file="src/pages/index.tsx">Title</p>'
      );
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'agent-fallback' });
    });
  });

  describe('agent-fallback strategy', () => {
    it('classifies element with data-dev-file that matches no other strategy', () => {
      const element: HTMLElement = el('<span data-dev-dynamic="true" data-dev-file="src/pages/index.tsx">Dynamic</span>');
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'agent-fallback' });
    });

    it('classifies template-internal element (content-key-template) as agent-fallback', () => {
      const element: HTMLElement = el(
        '<h3 data-dev-content-key-template="home.analysis.stories[].title" data-dev-file="src/pages/index.tsx">Title</h3>'
      );
      expect(classifyDeleteStrategy(element)).toEqual({ type: 'agent-fallback' });
    });
  });

  describe('priority ordering', () => {
    it('content-item takes priority over container tag', () => {
      // An article that is also a content-list item
      const element: HTMLElement = el(
        '<article data-dev-content-list="home.stories" data-dev-content-list-index="0" data-dev-item-id="id1" data-dev-id="abc" data-dev-file="src/pages/index.tsx"></article>'
      );
      const result = classifyDeleteStrategy(element);
      expect(result?.type).toBe('content-item');
    });

    it('content-item takes priority over static-leaf tag', () => {
      // A button that is a content-list item (primitive array like tabs)
      const element: HTMLElement = el(
        '<button data-dev-content-list="home.tabs" data-dev-content-list-index="0" data-dev-file="src/pages/index.tsx">Tab 1</button>'
      );
      const result = classifyDeleteStrategy(element);
      expect(result?.type).toBe('content-item');
    });

    it('conformable takes priority over container', () => {
      const element: HTMLElement = el(
        '<div data-dev-conformable-array="items" data-dev-conformable-page="home" data-dev-content-list-index="0" data-dev-id="abc" data-dev-file="src/pages/index.tsx"></div>'
      );
      const result = classifyDeleteStrategy(element);
      expect(result?.type).toBe('conformable-item');
    });
  });
});
