/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  isTextEditable,
  isUnresolvableContentOwned,
  isBodyTextElement,
  resolveContentKey,
  resolveOwnContentKey,
  resolveConformTarget,
  getMediaSlotPath,
  isTextElement,
  isTextBlockElement,
  isListElement,
  isContentElement,
  isClickable,
  isInsideNavSurface,
  isManagedPath,
  hasManagedDocMarkup,
  HEADING_TAGS,
  INLINE_TEXT_TAGS,
  BLOCK_TEXT_TAGS,
  TEXT_TAGS,
  LIST_TAGS,
  CONTENT_TAGS,
  MEDIA_TAGS,
  FORM_TAGS
} from '../element-detection.js';

function buildElement(html: string): HTMLElement {
  // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const element = doc.body.firstElementChild as HTMLElement | null;
  if (!element) throw new Error(`fixture produced no element: ${JSON.stringify(html)}`);
  return element;
}

describe('element-detection', () => {
  // ─── Tag set composition ──────────────────────────────────────────────────────

  describe('tag set composition', () => {
    it('HEADING_TAGS contains h1–h6', () => {
      expect([...HEADING_TAGS]).toEqual(expect.arrayContaining(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']));
      expect(HEADING_TAGS.size).toBe(6);
    });

    it('BLOCK_TEXT_TAGS is a superset of HEADING_TAGS', () => {
      for (const tag of HEADING_TAGS) {
        expect(BLOCK_TEXT_TAGS.has(tag)).toBe(true);
      }
    });

    it('TEXT_TAGS is a superset of both BLOCK_TEXT_TAGS and INLINE_TEXT_TAGS', () => {
      for (const tag of BLOCK_TEXT_TAGS) {
        expect(TEXT_TAGS.has(tag)).toBe(true);
      }
      for (const tag of INLINE_TEXT_TAGS) {
        expect(TEXT_TAGS.has(tag)).toBe(true);
      }
    });

    it('LIST_TAGS does not overlap with TEXT_TAGS', () => {
      for (const tag of LIST_TAGS) {
        expect(TEXT_TAGS.has(tag)).toBe(false);
      }
    });

    it('CONTENT_TAGS is a superset of TEXT_TAGS, LIST_TAGS, MEDIA_TAGS, and FORM_TAGS', () => {
      for (const tag of [...TEXT_TAGS, ...LIST_TAGS, ...MEDIA_TAGS, ...FORM_TAGS]) {
        expect(CONTENT_TAGS.has(tag)).toBe(true);
      }
    });
  });

  // ─── isTextElement ────────────────────────────────────────────────────────────

  describe('isTextElement', () => {
    it('returns true for inline text tags', () => {
      expect(isTextElement(buildElement('<span>text</span>'))).toBe(true);
      expect(isTextElement(buildElement('<a href="#">link</a>'))).toBe(true);
      expect(isTextElement(buildElement('<label>label</label>'))).toBe(true);
    });

    it('returns true for block text tags', () => {
      expect(isTextElement(buildElement('<p>paragraph</p>'))).toBe(true);
      expect(isTextElement(buildElement('<h1>heading</h1>'))).toBe(true);
      expect(isTextElement(buildElement('<h6>heading</h6>'))).toBe(true);
      expect(isTextElement(buildElement('<li>item</li>'))).toBe(true);
      expect(isTextElement(buildElement('<blockquote>quote</blockquote>'))).toBe(true);
    });

    it('returns false for list containers', () => {
      expect(isTextElement(buildElement('<ul><li>item</li></ul>'))).toBe(false);
      expect(isTextElement(buildElement('<ol><li>item</li></ol>'))).toBe(false);
    });

    it('returns false for media and layout elements', () => {
      expect(isTextElement(buildElement('<img src="x.png" />'))).toBe(false);
      expect(isTextElement(buildElement('<div>container</div>'))).toBe(false);
      expect(isTextElement(buildElement('<section>section</section>'))).toBe(false);
    });
  });

  // ─── isTextBlockElement ───────────────────────────────────────────────────────

  describe('isTextBlockElement', () => {
    it('returns true for headings', () => {
      for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        expect(isTextBlockElement(buildElement(`<${h}>heading</${h}>`))).toBe(true);
      }
    });

    it('returns true for block text elements', () => {
      expect(isTextBlockElement(buildElement('<p>paragraph</p>'))).toBe(true);
      expect(isTextBlockElement(buildElement('<li>item</li>'))).toBe(true);
      expect(isTextBlockElement(buildElement('<blockquote>quote</blockquote>'))).toBe(true);
    });

    it('returns false for inline text elements', () => {
      expect(isTextBlockElement(buildElement('<span>text</span>'))).toBe(false);
      expect(isTextBlockElement(buildElement('<a href="#">link</a>'))).toBe(false);
      expect(isTextBlockElement(buildElement('<label>label</label>'))).toBe(false);
    });

    it('returns false for list containers and layout elements', () => {
      expect(isTextBlockElement(buildElement('<ul><li>item</li></ul>'))).toBe(false);
      expect(isTextBlockElement(buildElement('<ol><li>item</li></ol>'))).toBe(false);
      expect(isTextBlockElement(buildElement('<div>container</div>'))).toBe(false);
    });
  });

  // ─── isListElement ────────────────────────────────────────────────────────────

  describe('isListElement', () => {
    it('returns true for <ul>', () => {
      expect(isListElement(buildElement('<ul><li>item</li></ul>'))).toBe(true);
    });

    it('returns true for <ol>', () => {
      expect(isListElement(buildElement('<ol><li>item</li></ol>'))).toBe(true);
    });

    it('returns false for list items (li)', () => {
      const doc = new DOMParser().parseFromString('<ul><li>item</li></ul>', 'text/html');
      const li = doc.querySelector('li') as HTMLElement;
      expect(isListElement(li)).toBe(false);
    });

    it('returns false for text and layout elements', () => {
      expect(isListElement(buildElement('<p>paragraph</p>'))).toBe(false);
      expect(isListElement(buildElement('<div>container</div>'))).toBe(false);
      expect(isListElement(buildElement('<h1>heading</h1>'))).toBe(false);
    });
  });

  // ─── isContentElement ─────────────────────────────────────────────────────────

  describe('isContentElement', () => {
    it('returns true for text elements', () => {
      expect(isContentElement(buildElement('<p>text</p>'))).toBe(true);
      expect(isContentElement(buildElement('<h1>heading</h1>'))).toBe(true);
      expect(isContentElement(buildElement('<span>inline</span>'))).toBe(true);
      expect(isContentElement(buildElement('<button>btn</button>'))).toBe(true);
    });

    it('returns true for list elements', () => {
      expect(isContentElement(buildElement('<ul><li>item</li></ul>'))).toBe(true);
      expect(isContentElement(buildElement('<ol><li>item</li></ol>'))).toBe(true);
    });

    it('returns true for media elements', () => {
      expect(isContentElement(buildElement('<img src="x.png" />'))).toBe(true);
      expect(isContentElement(buildElement('<video src="x.mp4"></video>'))).toBe(true);
    });

    it('returns true for form elements', () => {
      expect(isContentElement(buildElement('<input type="text" />'))).toBe(true);
      expect(isContentElement(buildElement('<textarea></textarea>'))).toBe(true);
      expect(isContentElement(buildElement('<select><option>a</option></select>'))).toBe(true);
    });
  });

  // ─── isClickable ─────────────────────────────────────────────────────────────

  describe('isClickable', () => {
    it('returns true for <a> and <button>', () => {
      expect(isClickable(buildElement('<a href="#">link</a>'))).toBe(true);
      expect(isClickable(buildElement('<button>click</button>'))).toBe(true);
    });

    it('returns true for role=button', () => {
      expect(isClickable(buildElement('<div role="button">click</div>'))).toBe(true);
    });

    it('returns false for non-interactive elements', () => {
      expect(isClickable(buildElement('<p>text</p>'))).toBe(false);
      expect(isClickable(buildElement('<div>container</div>'))).toBe(false);
      expect(isClickable(buildElement('<span>inline</span>'))).toBe(false);
    });
  });

  // ─── isInsideNavSurface ───────────────────────────────────────────────────────────────

  describe('isInsideNavSurface', () => {
    it('returns true for an <a> inside <nav>', () => {
      const nav = buildElement('<nav><a href="/about">About</a></nav>');
      const anchor = nav.querySelector('a') as HTMLElement;
      expect(isInsideNavSurface(anchor)).toBe(true);
    });

    it('returns true for a span inside <nav> (target-agnostic)', () => {
      const nav = buildElement('<nav><a href="/x"><span>label</span></a></nav>');
      const span = nav.querySelector('span') as HTMLElement;
      expect(isInsideNavSurface(span)).toBe(true);
    });

    it('returns true for an anchor inside breadcrumb <nav>', () => {
      const nav = buildElement('<nav aria-label="breadcrumb"><a href="/home">Home</a></nav>');
      const anchor = nav.querySelector('a') as HTMLElement;
      expect(isInsideNavSurface(anchor)).toBe(true);
    });

    it('returns true for the <nav> element itself', () => {
      const nav = buildElement('<nav><a>x</a></nav>');
      expect(isInsideNavSurface(nav)).toBe(true);
    });

    it('returns false for a standalone <a>', () => {
      expect(isInsideNavSurface(buildElement('<a href="#">link</a>'))).toBe(false);
    });

    it('returns false for an <a> inside <header> with no <nav>', () => {
      const header = buildElement('<header><a href="/x">link</a></header>');
      const anchor = header.querySelector('a') as HTMLElement;
      expect(isInsideNavSurface(anchor)).toBe(false);
    });

    it('returns false for a body-content <p>', () => {
      expect(isInsideNavSurface(buildElement('<p>body text</p>'))).toBe(false);
    });

    it('returns true for an item inside [role="menu"] (Radix dropdown portal)', () => {
      const menu = buildElement('<div role="menu"><a href="/x">Item</a></div>');
      const anchor = menu.querySelector('a') as HTMLElement;
      expect(isInsideNavSurface(anchor)).toBe(true);
    });

    it('returns true for an item inside [role="menubar"]', () => {
      const bar = buildElement('<div role="menubar"><a href="/x">Item</a></div>');
      const anchor = bar.querySelector('a') as HTMLElement;
      expect(isInsideNavSurface(anchor)).toBe(true);
    });

    it('returns true for an item inside [role="navigation"] without <nav>', () => {
      const region = buildElement('<div role="navigation"><a href="/x">Link</a></div>');
      const anchor = region.querySelector('a') as HTMLElement;
      expect(isInsideNavSurface(anchor)).toBe(true);
    });
  });

  // ─── isTextEditable — data-dev-dynamic guard ─────────────────────────────────

  describe('isTextEditable — data-dev-dynamic guard', () => {
    it('should reject elements with data-dev-dynamic attribute', () => {
      const element = buildElement('<p data-dev-dynamic="true">500+</p>');
      expect(isTextEditable(element, true)).toBe(false);
    });

    it('should reject elements containing a descendant with data-dev-dynamic', () => {
      const element = buildElement('<p><span data-dev-dynamic="true">500+</span></p>');
      expect(isTextEditable(element, true)).toBe(false);
    });

    it('should reject formatted descendants inside data-dev-dynamic elements', () => {
      const element = buildElement('<h1 data-dev-dynamic="true"><span data-airo-formatted-bound-text="true">Welcome</span></h1>');
      const formatted = element.querySelector('span') as HTMLElement;
      expect(isTextEditable(formatted)).toBe(false);
    });

    it('should allow plain text elements without data-dev-dynamic (with editable marker)', () => {
      const element = buildElement('<p data-dev-editable="text" data-dev-file="src/pages/index.tsx">Hello World</p>');
      expect(isTextEditable(element, true)).toBe(true);
    });

    it('should allow elements with inline formatting but no data-dev-dynamic (with editable marker)', () => {
      const element = buildElement('<p data-dev-editable="text" data-dev-file="src/pages/index.tsx"><strong>Bold text</strong></p>');
      expect(isTextEditable(element, true)).toBe(true);
    });

    it('should reject deeply nested data-dev-dynamic descendants', () => {
      const element = buildElement('<p><em><span data-dev-dynamic="true">price</span></em></p>');
      expect(isTextEditable(element, true)).toBe(false);
    });

    it('treats content-keyed elements as editable even if they also have dynamic markup around them', () => {
      const element = buildElement('<h1 data-dev-content-key="home.hero.title">Welcome</h1>');
      expect(isTextEditable(element, true)).toBe(true);
    });

    it('rejects a self-dynamic .map()-derived paragraph (no content key, no bound-text) in permissive mode', () => {
      // Repro of AIROBUILD-4362: `field.split('\n\n').map((para) => <p>{para}</p>)`
      // produces a <p> the source-mapper marks data-dev-dynamic with a data-dev-file
      // but NO content key and NO bound-text. It must not be offered for inline edit.
      const element = buildElement(
        '<p data-dev-dynamic="true" data-dev-file="src/pages/about-us.tsx">Tom has served as an expert witness for over twenty-four years.</p>',
      );
      expect(isTextEditable(element, true)).toBe(false);
    });

    it('still allows a content-keyed element in permissive mode (regression: fix must not over-block)', () => {
      const element = buildElement(
        '<span data-dev-content-key="about_us.hero.headline" data-dev-file="src/pages/about-us.tsx">About Us</span>',
      );
      expect(isTextEditable(element, true)).toBe(true);
    });

    it('allows a static editable node under a far-up dynamic ancestor (conservative)', () => {
      const wrapper: HTMLElement = buildElement(
        '<div data-dev-dynamic="true"><h2 data-dev-editable="text" data-dev-file="src/layouts/Website.tsx">What customers say</h2></div>',
      );
      const heading: HTMLElement = wrapper.querySelector('h2') as HTMLElement;
      expect(isTextEditable(heading, false)).toBe(true);
    });

    it('still blocks a self-dynamic list in conservative mode', () => {
      const element: HTMLElement = buildElement(
        '<ul data-dev-dynamic="true" data-dev-file="src/pages/index.tsx"><li>Item</li></ul>',
      );
      expect(isTextEditable(element, false)).toBe(false);
    });

    it('still blocks a node with a dynamic descendant in conservative mode', () => {
      const element: HTMLElement = buildElement(
        '<p data-dev-editable="text" data-dev-file="src/pages/index.tsx">Total <span data-dev-dynamic="true">500+</span></p>',
      );
      expect(isTextEditable(element, false)).toBe(false);
    });

    it('blocks a marker-less heading under a dynamic ancestor in conservative mode', () => {
      const wrapper: HTMLElement = buildElement(
        '<div data-dev-dynamic="true"><h3 data-dev-file="src/pages/index.tsx">Featured</h3></div>',
      );
      const heading: HTMLElement = wrapper.querySelector('h3') as HTMLElement;
      expect(isTextEditable(heading, false)).toBe(false);
    });

    it('allows a static list container under a dynamic (conditional-render) ancestor in conservative mode', () => {
      const wrapper: HTMLElement = buildElement(
        '<div data-dev-dynamic="true"><ul data-dev-file="src/pages/index.tsx"><li>Item A</li><li>Item B</li></ul></div>',
      );
      const list: HTMLElement = wrapper.querySelector('ul') as HTMLElement;
      expect(isTextEditable(list, false)).toBe(true);
    });

    it('blocks a per-item list container (map-callback root) in conservative mode', () => {
      const list: HTMLElement = buildElement(
        '<ul data-dev-content-list="products" data-dev-file="src/pages/index.tsx"><li>Item A</li><li>Item B</li></ul>',
      );
      expect(isTextEditable(list, false)).toBe(false);
    });

    it('blocks a static list nested inside a content-list item in conservative mode', () => {
      const wrapper: HTMLElement = buildElement(
        '<div data-dev-content-list="products"><div data-dev-content-list-index="0"><ul data-dev-file="src/pages/index.tsx"><li>Item A</li><li>Item B</li></ul></div></div>',
      );
      const list: HTMLElement = wrapper.querySelector('ul') as HTMLElement;
      expect(isTextEditable(list, false)).toBe(false);
    });

    it('still allows a static list container with no dynamic ancestor in conservative mode', () => {
      const list: HTMLElement = buildElement(
        '<ul data-dev-file="src/pages/index.tsx"><li>Item A</li><li>Item B</li></ul>',
      );
      expect(isTextEditable(list, false)).toBe(true);
    });
  });

  // ─── isTextEditable — data-dev-bound-text requires a content-file ancestor ────
  //
  // A data-dev-bound-text node ({expr} rendered via a render prop) is only
  // SAVEABLE when it lives under a [data-dev-content-file] ancestor: the save path
  // (useTextEditing) redirects the write to that markdown file. Today that ancestor
  // is emitted only by the blog-post component (BlogPost.tsx). Without it, the save
  // falls through to the AST editor, which rejects the {expr} child
  // (hasUnsupportedDynamicTextExpression) → open-then-400. So editability must
  // require the content-file ancestor, mirroring the save path's success condition.
  describe('isTextEditable — data-dev-bound-text requires a content-file ancestor', () => {
    const CONTENT_FILE = 'src/content/data/blog/post.md';

    it('allows a content-file-backed bound-text element with data-dev-dynamic on itself', () => {
      const parent = buildElement(
        `<div data-dev-content-file="${CONTENT_FILE}"><p data-dev-dynamic="true" data-dev-bound-text="true" data-dev-file="src/pages/blog.tsx">Paragraph text</p></div>`,
      );
      expect(isTextEditable(parent.querySelector('p') as HTMLElement, true)).toBe(true);
    });

    it('allows a content-file-backed bound-text element with inline children', () => {
      const parent = buildElement(
        `<div data-dev-content-file="${CONTENT_FILE}"><p data-dev-dynamic="true" data-dev-bound-text="true" data-dev-file="src/pages/blog.tsx">Text with <em>italic</em> and <strong>bold</strong></p></div>`,
      );
      expect(isTextEditable(parent.querySelector('p') as HTMLElement, true)).toBe(true);
    });

    it('blocks a bound-text element with NO content-file ancestor (prop-drilled copy — would 400 on save)', () => {
      // The Starbucks/Rebuild shape: <Banner headline="…"/> → <h2>{headline}</h2>.
      // Bound-text, dynamic on itself, but no markdown file to save into.
      const element = buildElement('<h2 data-dev-dynamic="true" data-dev-bound-text="true">New coconut for a cause</h2>');
      expect(isTextEditable(element, true)).toBe(false);
    });

    it('blocks a content-file-backed bound-text element that contains a descendant with data-dev-dynamic', () => {
      const parent = buildElement(
        `<div data-dev-content-file="${CONTENT_FILE}"><p data-dev-dynamic="true" data-dev-bound-text="true"><span data-dev-dynamic="true">computed</span></p></div>`,
      );
      expect(isTextEditable(parent.querySelector('p') as HTMLElement, true)).toBe(false);
    });
  });

  // ─── isTextEditable — CMS inline-edit flag gate ───────────────────────────────

  describe('isTextEditable — CMS inline-edit flag gate', () => {
    function contentKeyed(): HTMLElement {
      const el = document.createElement('p');
      el.setAttribute('data-dev-content-key', 'home.hero.title');
      el.textContent = 'Welcome';
      return el;
    }

    it('content-keyed element is NOT editable when the flag is off', () => {
      expect(isTextEditable(contentKeyed(), false)).toBe(false);
    });

    it('content-keyed element IS editable when the flag is on', () => {
      expect(isTextEditable(contentKeyed(), true)).toBe(true);
    });

    it('content-keyed element with flag off does not fall through to AST-editable', () => {
      // a plain <p> with text would be AST-editable; the content key must force false
      const el = contentKeyed();
      expect(isTextEditable(el, false)).toBe(false);
    });

    it('non-content text element (with editable marker) is editable regardless of the flag', () => {
      const el = document.createElement('p');
      el.setAttribute('data-dev-editable', 'text');
      el.setAttribute('data-dev-file', 'src/pages/index.tsx');
      el.textContent = 'Plain text';
      expect(isTextEditable(el, false)).toBe(true);
      expect(isTextEditable(el, true)).toBe(true);
    });

    it('rejects text inside a Commerce-managed product root', () => {
      const root = buildElement(`
        <article data-dev-source-origin="commerce" data-dev-commerce-product-id="sku-group-1">
          <h2>Product name</h2>
        </article>
      `);
      expect(isTextEditable(root.querySelector('h2') as HTMLElement, true)).toBe(false);
    });
  });

  // ─── isTextEditable — authoritative data-dev-editable marker ─────────────────

  describe('isTextEditable — authoritative data-dev-editable marker', () => {
    it('a static element WITH the marker is editable', () => {
      const element = buildElement('<h1 data-dev-editable="text" data-dev-file="src/pages/index.tsx">Hello</h1>');
      expect(isTextEditable(element, true)).toBe(true);
    });

    it('the SAME element WITHOUT the marker is NOT editable', () => {
      const element = buildElement('<h1>Hello</h1>');
      expect(isTextEditable(element, true)).toBe(false);
    });

    it('inline-formatting element is editable only with the marker', () => {
      expect(isTextEditable(buildElement('<p data-dev-editable="text" data-dev-file="src/pages/index.tsx"><strong>Bold</strong></p>'), true)).toBe(true);
      expect(isTextEditable(buildElement('<p><strong>Bold</strong></p>'), true)).toBe(false);
    });

    it('content-keyed elements are unaffected by the marker (content fork owns them)', () => {
      // Content-keyed nodes never carry data-dev-editable; the content fork
      // decides editability purely from the flag, regardless of the marker.
      const el = document.createElement('p');
      el.setAttribute('data-dev-content-key', 'home.hero.title');
      el.textContent = 'Welcome';
      expect(isTextEditable(el, true)).toBe(true);
      expect(isTextEditable(el, false)).toBe(false);
    });
  });

  // ─── getMediaSlotPath ─────────────────────────────────────────────────────────

  describe('getMediaSlotPath', () => {
    it('extracts the slot path from an /airo-assets/images/ URL', () => {
      expect(getMediaSlotPath('/airo-assets/images/pages/home/hero')).toBe('pages/home/hero');
    });

    it('strips query string from /airo-assets/images/ URL', () => {
      expect(getMediaSlotPath('/airo-assets/images/pages/home/hero?v=1')).toBe('pages/home/hero');
    });

    it('returns null for /assets/ URLs (not a registered media slot path)', () => {
      expect(getMediaSlotPath('/assets/images/logo.png')).toBeNull();
    });

    it('returns null for /airo-assets/uploads/ URLs', () => {
      expect(getMediaSlotPath('/airo-assets/uploads/abc123.jpg')).toBeNull();
    });

    it('returns null for external Unsplash URLs', () => {
      expect(getMediaSlotPath('https://images.unsplash.com/photo-123?w=800')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(getMediaSlotPath(null)).toBeNull();
    });

    it('extracts slot path from /airo-assets/videos/ URL', () => {
      expect(getMediaSlotPath('/airo-assets/videos/pages/home/hero')).toBe('pages/home/hero');
    });

    it('extracts slot path from /airo-assets/videos/ URL with query string', () => {
      expect(getMediaSlotPath('/airo-assets/videos/pages/home/hero?_v=123&_t=456')).toBe('pages/home/hero');
    });
  });

  // ─── resolveContentKey ────────────────────────────────────────────────────────

  describe('resolveContentKey', () => {
    it('returns null for elements without any content attribution', () => {
      expect(resolveContentKey(buildElement('<p>text</p>'))).toBeNull();
    });

    it('returns the direct key when data-dev-content-key is set', () => {
      const element = buildElement('<h1 data-dev-content-key="site.brand">Acme</h1>');
      expect(resolveContentKey(element)).toEqual({ key: 'site.brand', kind: 'copy' });
    });

    it('reads kind=richText from data-dev-content-kind', () => {
      const element = buildElement('<div data-dev-content-key="home.body" data-dev-content-kind="richText">x</div>');
      expect(resolveContentKey(element)).toEqual({ key: 'home.body', kind: 'richText' });
    });

    it('resolves a template key using the enclosing list + index', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
      <div data-dev-content-list="products">
        <div data-dev-content-list-index="0"><h3 data-dev-content-key-template="products[].name">A</h3></div>
        <div data-dev-content-list-index="3"><h3 data-dev-content-key-template="products[].name">D</h3></div>
      </div>
    `;
      const targets = root.querySelectorAll('h3');
      expect(resolveContentKey(targets[0] as HTMLElement)).toEqual({ key: 'products[0].name', kind: 'copy' });
      expect(resolveContentKey(targets[1] as HTMLElement)).toEqual({ key: 'products[3].name', kind: 'copy' });
    });

    it('returns null when a template element has no enclosing list context', () => {
      const element = buildElement('<h3 data-dev-content-key-template="products[].name">A</h3>');
      expect(resolveContentKey(element)).toBeNull();
    });

    it('resolves all three fields of a multi-field collection item at index 2', () => {
      // Mirrors the canonical S3 agent pattern:
      //   <ContentListContext field="products"> injects data-dev-content-list="products"
      //   Each child gets data-dev-content-list-index (injected by ContentListContext)
      //   source-mapper emits data-dev-content-key-template for name/description/price
      // This test locks the full attribution + resolution chain for a 3-field item.
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="products">
          <article data-dev-content-list-index="2">
            <h3 data-dev-content-key-template="products[].name">Gadget</h3>
            <p data-dev-content-key-template="products[].description">A great gadget</p>
            <span><span data-dev-content-key-template="products[].price">9.99</span></span>
          </article>
        </div>
      `;
      const nameEl = root.querySelector('h3') as HTMLElement;
      const descEl = root.querySelector('p') as HTMLElement;
      // price is on the inner wrapper span (the pre-pass wraps ${p.price} in a child span)
      const priceEl = root.querySelector('span[data-dev-content-key-template]') as HTMLElement;

      expect(resolveContentKey(nameEl)).toEqual({ key: 'products[2].name', kind: 'copy' });
      expect(resolveContentKey(descEl)).toEqual({ key: 'products[2].description', kind: 'copy' });
      expect(resolveContentKey(priceEl)).toEqual({ key: 'products[2].price', kind: 'copy' });
    });

    it('stashes data-dev-item-id from a field-less child onto the field-bearing wrapper above (split layout → [@id])', () => {
      // Manual <ContentListContext> layout: field on the wrapper, index+item-id on
      // the field-less child. Exercises the pendingId stash branch — the id is held
      // until the next field-bearing ancestor, then applied as the @id ref.
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="products">
          <article data-dev-content-list-index="2" data-dev-item-id="gizmo">
            <h3 data-dev-content-key-template="products[].name">Gizmo</h3>
          </article>
        </div>
      `;
      const nameEl = root.querySelector('h3') as HTMLElement;
      expect(resolveContentKey(nameEl)).toEqual({ key: 'products[@gizmo].name', kind: 'copy' });
    });

    it('resolves a 2-level nested key using self-describing layout (field+index on same element)', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="menu.categories" data-dev-content-list-index="0">
          <div data-dev-content-list="menu.categories[].items" data-dev-content-list-index="0">
            <span data-dev-content-key-template="menu.categories[].items[].price">$9.99</span>
          </div>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'menu.categories[0].items[0].price', kind: 'copy' });
    });

    // Backward-compat: this field-on-wrapper / index-on-child shape is what a
    // MANUAL <ContentListContext> emits — source-mapper auto-injection always
    // puts field + index on the same node (covered by the self-describing tests
    // above). The resolver must handle both layouts.
    it('resolves a 2-level nested key using nested-ContentListContext layout (field on wrapper, index on child)', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="menu.categories">
          <div data-dev-content-list-index="0">
            <div data-dev-content-list="menu.categories[].items">
              <div data-dev-content-list-index="0">
                <span data-dev-content-key-template="menu.categories[].items[].price">$9.99</span>
              </div>
            </div>
          </div>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'menu.categories[0].items[0].price', kind: 'copy' });
    });

    it('resolves a 2-level nested key with non-zero indices', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="menu.categories" data-dev-content-list-index="1">
          <div data-dev-content-list="menu.categories[].items" data-dev-content-list-index="2">
            <span data-dev-content-key-template="menu.categories[].items[].price">$9.99</span>
          </div>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'menu.categories[1].items[2].price', kind: 'copy' });
    });

    it('returns null when a template [] prefix matches no collected list field', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="other.field" data-dev-content-list-index="0">
          <span data-dev-content-key-template="menu.categories[].price">$9.99</span>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toBeNull();
    });

    it('returns null when a list field is present but no index is found anywhere', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="menu.categories">
          <span data-dev-content-key-template="menu.categories[].price">$9.99</span>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toBeNull();
    });

    it('resolves a single-level key using self-describing layout (backward compat)', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="products" data-dev-content-list-index="5">
          <span data-dev-content-key-template="products[].name">Widget</span>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'products[5].name', kind: 'copy' });
    });

    it('resolves a 3-level nested key using self-describing layout (distinct indices per level)', () => {
      // Each ancestor element carries both list field and index on the same node
      // (self-describing layout — the form source-mapper emits).
      // Distinct indices 0/1/2 prove each [] placeholder maps to the correct level.
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="a.b" data-dev-content-list-index="0">
          <div data-dev-content-list="a.b[].c" data-dev-content-list-index="1">
            <div data-dev-content-list="a.b[].c[].d" data-dev-content-list-index="2">
              <div><span data-dev-content-key-template="a.b[].c[].d[].e">X</span></div>
            </div>
          </div>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'a.b[0].c[1].d[2].e', kind: 'copy' });
    });

    it('substitutes [@id] when data-dev-item-id is present on the list element', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="items" data-dev-content-list-index="0" data-dev-item-id="burger">
          <span data-dev-content-key-template="items[].price">$9.99</span>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'items[@burger].price', kind: 'copy' });
    });

    it('falls back to [index] when data-dev-item-id is absent', () => {
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="items" data-dev-content-list-index="0">
          <span data-dev-content-key-template="items[].price">$9.99</span>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'items[0].price', kind: 'copy' });
    });

    it('resolves a 2-level nested key with outer id-anchored and inner positional', () => {
      // Mixed per-level resolution: outer level uses @id, inner level uses index.
      // Verifies that data-dev-item-id preference is applied independently at each level.
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="menu" data-dev-content-list-index="0" data-dev-item-id="burgers">
          <div data-dev-content-list="menu[].items" data-dev-content-list-index="2">
            <span data-dev-content-key-template="menu[].items[].name">Cheese</span>
          </div>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'menu[@burgers].items[2].name', kind: 'copy' });
    });

    it('resolves a 2-level nested key with inner id-anchored and outer positional', () => {
      // Mixed per-level resolution: outer level uses index, inner level uses @id.
      // Verifies that data-dev-item-id preference is applied independently at each level.
      const root = document.createElement('div');
      // nosemgrep: javascript.browser.security.insecure-document-method.insecure-document-method, godaddy.js.jquery.security.frameworks.dom-text-interpreted-as-html
      root.innerHTML = `
        <div data-dev-content-list="menu" data-dev-content-list-index="0">
          <div data-dev-content-list="menu[].items" data-dev-content-list-index="2" data-dev-item-id="cheeseburger">
            <span data-dev-content-key-template="menu[].items[].name">Cheese</span>
          </div>
        </div>
      `;
      const span = root.querySelector('span') as HTMLElement;
      expect(resolveContentKey(span)).toEqual({ key: 'menu[0].items[@cheeseburger].name', kind: 'copy' });
    });
  });

  // ─── isBodyTextElement ────────────────────────────────────────────────────────

  describe('isBodyTextElement', () => {
    it('returns true for <p>', () => {
      expect(isBodyTextElement(buildElement('<p>Hello</p>'))).toBe(true);
    });

    it('returns true for <li>', () => {
      const doc = new DOMParser().parseFromString('<ul><li>Item</li></ul>', 'text/html');
      const li = doc.querySelector('li') as HTMLElement;
      expect(isBodyTextElement(li)).toBe(true);
    });

    it('returns false for headings', () => {
      expect(isBodyTextElement(buildElement('<h1>Title</h1>'))).toBe(false);
      expect(isBodyTextElement(buildElement('<h2>Subtitle</h2>'))).toBe(false);
    });

    it('returns false for inline elements', () => {
      expect(isBodyTextElement(buildElement('<span>Text</span>'))).toBe(false);
      expect(isBodyTextElement(buildElement('<em>Italic</em>'))).toBe(false);
    });

    it('returns true for <ul> (allows un-listing)', () => {
      expect(isBodyTextElement(buildElement('<ul><li>Item</li></ul>'))).toBe(true);
    });

    it('returns true for <ol> (allows un-listing)', () => {
      expect(isBodyTextElement(buildElement('<ol><li>Item</li></ol>'))).toBe(true);
    });

    it('returns false for container elements', () => {
      expect(isBodyTextElement(buildElement('<div>Content</div>'))).toBe(false);
    });
  });

  // ─── isManagedPath ────────────────────────────────────────────────────────────

  describe('isManagedPath', () => {
    it('returns true for the privacy and terms pages (and their subpaths)', () => {
      expect(isManagedPath('/privacy')).toBe(true);
      expect(isManagedPath('/privacy/')).toBe(true);
      expect(isManagedPath('/privacy-policy')).toBe(true);
      expect(isManagedPath('/terms')).toBe(true);
      expect(isManagedPath('/terms-of-use')).toBe(true);
    });

    it('returns false for non-managed pages', () => {
      expect(isManagedPath('/')).toBe(false);
      expect(isManagedPath('/about')).toBe(false);
      expect(isManagedPath('/contact')).toBe(false);
      expect(isManagedPath('/pricing')).toBe(false);
    });
  });

  // ─── resolveConformTarget ─────────────────────────────────────────────────────

  describe('resolveConformTarget', () => {
    it('returns {page, arrayName} for the conformable root itself', () => {
      const el = document.createElement('div');
      el.setAttribute('data-dev-conformable-array', 'stats');
      el.setAttribute('data-dev-conformable-page', 'src/pages/index.tsx');
      document.body.appendChild(el);
      expect(resolveConformTarget(el)).toEqual({ page: 'src/pages/index.tsx', arrayName: 'stats' });
      el.remove();
    });

    it('returns {page, arrayName} for a child inside a conformable root', () => {
      const host = document.createElement('div');
      host.setAttribute('data-dev-conformable-array', 'features');
      host.setAttribute('data-dev-conformable-page', 'src/pages/about.tsx');
      const child = document.createElement('p');
      child.textContent = 'child';
      host.appendChild(child);
      document.body.appendChild(host);
      expect(resolveConformTarget(child)).toEqual({ page: 'src/pages/about.tsx', arrayName: 'features' });
      host.remove();
    });

    it('returns null when data-dev-conformable-page is missing', () => {
      const el = document.createElement('div');
      el.setAttribute('data-dev-conformable-array', 'stats');
      document.body.appendChild(el);
      expect(resolveConformTarget(el)).toBeNull();
      el.remove();
    });

    it('returns null when neither attribute is present', () => {
      const el = document.createElement('p');
      el.textContent = 'plain text';
      document.body.appendChild(el);
      expect(resolveConformTarget(el)).toBeNull();
      el.remove();
    });
  });

  // ─── hasManagedDocMarkup ──────────────────────────────────────────────────────

  describe('hasManagedDocMarkup', () => {
    // Parse via DOMParser (not innerHTML) into a wrapping <div> so the markup is
    // a descendant of the returned root, matching how querySelector scopes.
    function buildContainer(html: string): HTMLElement {
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
      return doc.body.firstElementChild as HTMLElement;
    }

    it('returns true when an editable compliance field span is present', () => {
      const root = buildContainer('<p>Contact <span data-field="email" data-type="email" data-editable="true">a@x.com</span></p>');
      expect(hasManagedDocMarkup(root)).toBe(true);
    });

    it('returns true when a section branch is present', () => {
      const root = buildContainer('<span data-section="children" data-section-when="true">COPPA</span>');
      expect(hasManagedDocMarkup(root)).toBe(true);
    });

    it('returns false for a plain page with no compliance markup', () => {
      const root = buildContainer('<h1>Privacy Policy</h1><p>Some hand-written legal prose.</p>');
      expect(hasManagedDocMarkup(root)).toBe(false);
    });

    it('returns false for a data-field span that is not marked editable', () => {
      const root = buildContainer('<span data-field="businessName">Acme</span>');
      expect(hasManagedDocMarkup(root)).toBe(false);
    });
  });

  // ─── authored content binding (v9 Text primitive) ──────────────────────────────

  describe('authored content binding (v9 Text primitive)', () => {
    it('treats an element with only data-dev-content-key as editable', () => {
      const el: HTMLElement = document.createElement('h1');
      el.setAttribute('data-dev-content-key', 'home.hero.title');
      el.textContent = 'We Buy Houses';

      expect(isTextEditable(el, true)).toBe(true);
    });

    it('needs no source-mapper attributes to do it', () => {
      const el: HTMLElement = document.createElement('h1');
      el.setAttribute('data-dev-content-key', 'home.hero.title');
      el.textContent = 'We Buy Houses';

      expect(el.hasAttribute('data-dev-file')).toBe(false);
      expect(el.hasAttribute('data-dev-editable')).toBe(false);
      expect(el.hasAttribute('data-dev-bound-text')).toBe(false);
      expect(isTextEditable(el, true)).toBe(true);
    });

    it('stays editable under a dynamic ancestor', () => {
      const wrapper: HTMLElement = document.createElement('div');
      wrapper.setAttribute('data-dev-dynamic', 'true');
      const el: HTMLElement = document.createElement('h1');
      el.setAttribute('data-dev-content-key', 'home.hero.title');
      el.textContent = 'We Buy Houses';
      wrapper.appendChild(el);

      expect(isTextEditable(el, true)).toBe(true);
    });

    // The content-key branch returns before the tag / hasText / hasOnlyText checks,
    // so a non-text element carrying a content key is reported text-editable. This is
    // why Media, Link and Collection use data-dev-content-media / -link / -collection
    // instead. Changing this assertion means changing that decision.
    it('reports a non-text element with a content key as text-editable', () => {
      const img: HTMLElement = document.createElement('img');
      img.setAttribute('data-dev-content-key', 'home.hero.image');

      expect(isTextEditable(img, true)).toBe(true);
    });
  });

  // ─── resolveContentKey — last-resort keyed-descendant fallback (nested <Text>) ─

  describe('resolveContentKey — last-resort keyed-descendant fallback', () => {
    function buildScheduleRow(): { li: HTMLElement; span: HTMLElement } {
      const li: HTMLElement = document.createElement('li');
      li.setAttribute('data-dev-content-list', 'home.locationSection.schedule');
      li.setAttribute('data-dev-item-id', 'day-4');
      li.setAttribute('data-dev-file', '/app/src/pages/index.tsx');
      li.setAttribute('data-dev-line', '462');
      li.setAttribute('data-dev-id', '5209dd');

      const span: HTMLElement = document.createElement('span');
      span.setAttribute('data-dev-content-key', 'home.locationSection.schedule[@day-4].location');
      span.textContent = 'Northgate Corporate Campus — 3300 Summit Ave';

      li.appendChild(span);
      return { li, span };
    }

    it('resolves the li to its sole keyed descendant, and isTextEditable routes it via the content path', () => {
      const { li } = buildScheduleRow();
      expect(resolveContentKey(li)).toEqual({
        key: 'home.locationSection.schedule[@day-4].location',
        kind: 'copy',
      });
      expect(isTextEditable(li, true)).toBe(true);
    });

    it('the span itself still resolves its own key unchanged', () => {
      const { span } = buildScheduleRow();
      expect(resolveContentKey(span)).toEqual({
        key: 'home.locationSection.schedule[@day-4].location',
        kind: 'copy',
      });
    });

    it('returns null when there are two keyed descendants (ambiguous)', () => {
      const p: HTMLElement = document.createElement('p');
      const first: HTMLElement = document.createElement('span');
      first.setAttribute('data-dev-content-key', 'a.b');
      first.textContent = 'A';
      const second: HTMLElement = document.createElement('span');
      second.setAttribute('data-dev-content-key', 'a.c');
      second.textContent = 'B';
      p.appendChild(first);
      p.appendChild(second);

      expect(resolveContentKey(p)).toBeNull();
    });

    it('returns null when two keyed descendants are nested (ambiguous), even though text equality and the single-element-child-chain both hold', () => {
      // Both keyed nodes share the same trimmed text ('text') and each level
      // has exactly one element child, so only the exact-one-keyed-descendant
      // count check can catch this — the other two guards would pass it.
      const outer: HTMLElement = document.createElement('div');
      const middle: HTMLElement = document.createElement('span');
      middle.setAttribute('data-dev-content-key', 'home.a');
      const inner: HTMLElement = document.createElement('span');
      inner.setAttribute('data-dev-content-key', 'home.b');
      inner.textContent = 'text';
      middle.appendChild(inner);
      outer.appendChild(middle);

      expect(resolveContentKey(outer)).toBeNull();
    });

    it('returns null when the keyed descendant does not cover the parent\'s full text', () => {
      const li: HTMLElement = document.createElement('li');
      li.appendChild(document.createTextNode('Prefix '));
      const span: HTMLElement = document.createElement('span');
      span.setAttribute('data-dev-content-key', 'a.b');
      span.textContent = 'value';
      li.appendChild(span);

      expect(resolveContentKey(li)).toBeNull();
    });

    it('the element\'s own key takes precedence over a descendant with a different key', () => {
      const outer: HTMLElement = document.createElement('div');
      outer.setAttribute('data-dev-content-key', 'outer.key');
      outer.textContent = 'value';
      const inner: HTMLElement = document.createElement('span');
      inner.setAttribute('data-dev-content-key', 'inner.key');
      inner.textContent = 'value';
      outer.appendChild(inner);

      expect(resolveContentKey(outer)).toEqual({ key: 'outer.key', kind: 'copy' });
    });

    it('resolves through deeper nesting (wrapper > intermediate span > keyed element)', () => {
      const wrapper: HTMLElement = document.createElement('div');
      const intermediate: HTMLElement = document.createElement('span');
      const keyed: HTMLElement = document.createElement('span');
      keyed.setAttribute('data-dev-content-key', 'deep.key');
      keyed.textContent = 'value';
      intermediate.appendChild(keyed);
      wrapper.appendChild(intermediate);

      expect(resolveContentKey(wrapper)).toEqual({ key: 'deep.key', kind: 'copy' });
    });

    it('picks up kind=richText from the descendant, not the parent', () => {
      const li: HTMLElement = document.createElement('li');
      const span: HTMLElement = document.createElement('span');
      span.setAttribute('data-dev-content-key', 'a.b');
      span.setAttribute('data-dev-content-kind', 'richText');
      span.textContent = 'value';
      li.appendChild(span);

      expect(resolveContentKey(li)).toEqual({ key: 'a.b', kind: 'richText' });
    });

    it('returns null for an element with no keyed descendant at all (no regression)', () => {
      const li: HTMLElement = document.createElement('li');
      li.textContent = 'Plain unkeyed text';

      expect(resolveContentKey(li)).toBeNull();
    });
  });

  // ─── isTextEditable — content-owned subtree must decline, never fall through ──
  //
  // resolveContentKey returning null is ambiguous on its own: it means either
  // "no content involvement" (AST heuristics correctly apply) or "this subtree
  // IS content-owned but no single key is resolvable" (must decline — falling
  // through produces accept-then-400, since the source line holds a <Text/>
  // element rather than a string literal). isTextEditable must tell these apart.

  describe('isTextEditable — content-owned subtree must decline, never fall through to AST', () => {
    function keyedDescendant(tag: string, key: string, text: string): HTMLElement {
      const el: HTMLElement = document.createElement(tag);
      el.setAttribute('data-dev-content-key', key);
      el.textContent = text;
      return el;
    }

    function sourceMappedWrapper(tag: string): HTMLElement {
      const el: HTMLElement = document.createElement(tag);
      el.setAttribute('data-dev-file', '/app/src/pages/index.tsx');
      el.setAttribute('data-dev-line', '100');
      return el;
    }

    it('gap 1 — two keyed descendants: resolves null AND is not editable (no AST fallthrough)', () => {
      const p: HTMLElement = sourceMappedWrapper('p');
      p.appendChild(keyedDescendant('span', 'home.a', 'alpha'));
      p.appendChild(keyedDescendant('span', 'home.b', 'beta'));

      expect(resolveContentKey(p)).toBeNull();
      expect(isTextEditable(p, true)).toBe(false);
    });

    it('gap 2 — keyed descendant covers only part of the text: resolves null AND is not editable', () => {
      const li: HTMLElement = sourceMappedWrapper('li');
      li.appendChild(document.createTextNode('Prefix '));
      li.appendChild(keyedDescendant('span', 'home.a', 'value'));

      expect(resolveContentKey(li)).toBeNull();
      expect(isTextEditable(li, true)).toBe(false);
    });

    it('gap 3 — non-text-node element sibling alongside the keyed descendant (e.g. <img>): resolves null AND is not editable', () => {
      const fig: HTMLElement = sourceMappedWrapper('figure');
      fig.appendChild(document.createElement('img'));
      fig.appendChild(keyedDescendant('span', 'home.caption', 'A caption'));

      expect(resolveContentKey(fig)).toBeNull();
      expect(isTextEditable(fig, true)).toBe(false);
    });

    it('gap 3 (control) — a pure single-element-child chain down to the keyed node still resolves and is editable', () => {
      const wrapper: HTMLElement = sourceMappedWrapper('div');
      const child: HTMLElement = keyedDescendant('p', 'home.body', 'Chained copy');
      wrapper.appendChild(child);

      expect(resolveContentKey(wrapper)).toEqual({ key: 'home.body', kind: 'copy' });
      expect(isTextEditable(wrapper, true)).toBe(true);
    });

    it('gap 3 (control) — an unresolvable template attribution on the element itself also declines rather than falling through', () => {
      // The element carries data-dev-content-key-template but has no enclosing
      // ContentListContext, so resolveOwnContentKey fails. It is still
      // content-owned markup and must decline, not fall through to AST.
      const el: HTMLElement = sourceMappedWrapper('h3');
      el.setAttribute('data-dev-content-key-template', 'products[].name');
      el.textContent = 'Widget';

      expect(resolveContentKey(el)).toBeNull();
      expect(isTextEditable(el, true)).toBe(false);
    });

    it('out of scope (pinned) — a keyed ancestor with click landing on an inner formatting node stays non-editable, unchanged', () => {
      // CASE 1 from the probe: the key lives on the ancestor <p>, not on/under
      // the clicked <b>. resolveContentKey(b) already correctly returns null
      // (no content attribution anywhere in b's own subtree), and isTextEditable
      // already fails safe today because b carries no data-dev-file marker. This
      // is the deliberately-out-of-scope mirror case — pinned so a future change
      // to it is deliberate, not incidental.
      const p: HTMLElement = keyedDescendant('p', 'home.a', '');
      const b: HTMLElement = document.createElement('b');
      b.textContent = 'bold text';
      p.appendChild(b);

      expect(resolveContentKey(b)).toBeNull();
      expect(isTextEditable(b, true)).toBe(false);
    });
  });

  // ─── isUnresolvableContentOwned ───────────────────────────────────────────────

  describe('isUnresolvableContentOwned', () => {
    it('returns true for two keyed descendants (ambiguous)', () => {
      const p: HTMLElement = document.createElement('p');
      const first: HTMLElement = document.createElement('span');
      first.setAttribute('data-dev-content-key', 'a.b');
      first.textContent = 'A';
      const second: HTMLElement = document.createElement('span');
      second.setAttribute('data-dev-content-key', 'a.c');
      second.textContent = 'B';
      p.appendChild(first);
      p.appendChild(second);

      expect(isUnresolvableContentOwned(p)).toBe(true);
    });

    it('returns true for a keyed descendant covering only part of the text', () => {
      const li: HTMLElement = document.createElement('li');
      li.appendChild(document.createTextNode('Prefix '));
      const span: HTMLElement = document.createElement('span');
      span.setAttribute('data-dev-content-key', 'a.b');
      span.textContent = 'value';
      li.appendChild(span);

      expect(isUnresolvableContentOwned(li)).toBe(true);
    });

    it('returns false when the element itself resolves a single content key', () => {
      const el: HTMLElement = document.createElement('h1');
      el.setAttribute('data-dev-content-key', 'home.hero.title');
      el.textContent = 'We Buy Houses';

      expect(isUnresolvableContentOwned(el)).toBe(false);
    });

    it('returns false when there is no content attribution at all', () => {
      const p: HTMLElement = document.createElement('p');
      p.textContent = 'Plain unkeyed text';

      expect(isUnresolvableContentOwned(p)).toBe(false);
    });
  });

  // ─── data-dev-content-readonly — directory-backed collection items decline, never fall through ─
  //
  // A directory-backed collection item (src/content/data/<name>/*.md) keeps its
  // data-dev-content-key so hasContentKeyAttribution still sees it — that is what
  // routes both the leaf and its ancestors to the isUnresolvableContentOwned decline
  // in isTextEditable, instead of falling through to the AST source-rewriting editor
  // (which would 400: the ancestor's source line holds a <Text/> element, not a
  // string literal).

  describe('data-dev-content-readonly (directory-backed collection items)', () => {
    function readonlyKeyedSpan(key: string, text: string): HTMLElement {
      const span: HTMLElement = document.createElement('span');
      span.setAttribute('data-dev-content-key', key);
      span.setAttribute('data-dev-content-readonly', '');
      span.textContent = text;
      return span;
    }

    it('case 1 — a readonly-marked keyed span resolves to nothing and declines', () => {
      const span: HTMLElement = readonlyKeyedSpan('data.posts[0].title', 'First Post');

      expect(resolveOwnContentKey(span)).toBeNull();
      expect(resolveContentKey(span)).toBeNull();
      expect(isUnresolvableContentOwned(span)).toBe(true);
      expect(isTextEditable(span, true)).toBe(false);
    });

    it('case 2 — an <li data-dev-file/data-dev-line> whose only child is the readonly span also declines (no AST fallthrough)', () => {
      const li: HTMLElement = document.createElement('li');
      li.setAttribute('data-dev-file', '/app/src/pages/blog.tsx');
      li.setAttribute('data-dev-line', '42');
      li.appendChild(readonlyKeyedSpan('data.posts[0].title', 'First Post'));

      expect(resolveContentKey(li)).toBeNull();
      expect(isUnresolvableContentOwned(li)).toBe(true);
      expect(isTextEditable(li, true)).toBe(false);
    });

    it('regression — a normal keyed span with no readonly marker is still editable', () => {
      const span: HTMLElement = document.createElement('span');
      span.setAttribute('data-dev-content-key', 'home.hero.title');
      span.textContent = 'Welcome';

      expect(resolveOwnContentKey(span)).toEqual({ key: 'home.hero.title', kind: 'copy' });
      expect(resolveContentKey(span)).toEqual({ key: 'home.hero.title', kind: 'copy' });
      expect(isTextEditable(span, true)).toBe(true);
    });

    it('regression — an <li> wrapping a normal (non-readonly) keyed span still resolves through it', () => {
      const li: HTMLElement = document.createElement('li');
      li.setAttribute('data-dev-file', '/app/src/pages/blog.tsx');
      li.setAttribute('data-dev-line', '42');
      const span: HTMLElement = document.createElement('span');
      span.setAttribute('data-dev-content-key', 'home.hero.title');
      span.textContent = 'Welcome';
      li.appendChild(span);

      expect(resolveContentKey(li)).toEqual({ key: 'home.hero.title', kind: 'copy' });
      expect(isTextEditable(li, true)).toBe(true);
    });
  });
});
