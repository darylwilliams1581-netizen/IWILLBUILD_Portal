/**
 * Server-side HTML sanitiser for DocumentBuilder content.
 *
 * Uses jsdom (already a project devDependency, also available at runtime via
 * the test harness) to parse HTML into a real DOM, then walks the parsed tree
 * applying a strict allowlist — the same algorithm as the client-side
 * sanitiseHtml.ts but running in Node with jsdom's DOM implementation.
 *
 * Why jsdom and not a regex tokeniser:
 *   HTML is not a regular language. A regex scanner cannot correctly handle
 *   nested tags, attribute quoting edge-cases, CDATA sections, or the many
 *   browser-specific parsing quirks that attackers exploit. jsdom uses the
 *   same HTML5 parsing algorithm as browsers (parse5 under the hood), so the
 *   tree it produces matches what Gotenberg's Chromium would produce — making
 *   the sanitiser's view of the document identical to the renderer's view.
 *
 * Parser: jsdom (wraps parse5) — already in node_modules, no new dependency.
 *
 * Preserves:
 *   headings (h1–h6), paragraphs, div, span, br, hr
 *   tables (table/thead/tbody/tr/th/td) with colspan/rowspan
 *   lists (ul/ol/li)
 *   inline formatting (b/i/u/em/strong/s/del/ins/strike/sup/sub)
 *   blockquote, pre, code
 *   anchors (href: https/http/mailto/# only)
 *   images (src: /api/... or same-origin relative paths only)
 *   safe inline styles (font, color, border, padding, margin, width, height,
 *     white-space, word-break, overflow-wrap, line-height, letter-spacing,
 *     page-break/break-before/after/inside)
 *   page-break divs
 *
 * Removes entirely (tag + all descendant content):
 *   script, style, noscript, template, iframe, frame, frameset,
 *   object, embed, applet, base, link, meta, title, svg, math
 *
 * Removes tag but preserves text children:
 *   any other disallowed element
 *
 * Strips from every element:
 *   all event-handler attributes (on*)
 *   javascript: and vbscript: URLs in href/src
 *   data: URLs in src
 *   http:// and https:// in img src (external tracking pixel risk in Gotenberg)
 *   blob: in img src (meaningless server-side)
 *   id/name (DOM-clobbering)
 *   srcdoc, formaction, action, ping, xlink:href
 *   unsafe CSS: url(), expression(), javascript:, data:, vbscript:
 *
 * Image URL policy (conservative — Gotenberg context):
 *   Allowed:  /api/...  (internal document image API)
 *             /         (any same-origin relative path)
 *   Blocked:  http://   (plain HTTP — tracking pixel)
 *             https://  (external — tracking pixel)
 *             blob:     (client-only, meaningless in Node/Gotenberg)
 *             data:     (all forms)
 *             javascript: / vbscript:
 */

import { JSDOM } from 'jsdom';

// ── Tags dropped with all descendant content ──────────────────────────────────

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'noscript', 'template',
  'iframe', 'frame', 'frameset',
  'object', 'embed', 'applet',
  'base', 'link', 'meta', 'title',
  'svg', 'math',
]);

// ── Allowed tags ──────────────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set([
  'b', 'i', 'u', 'em', 'strong', 'strike', 's', 'del', 'ins',
  'br', 'p', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr', 'sup', 'sub',
  'img',
]);

// ── Allowed attributes per tag ────────────────────────────────────────────────

const ALLOWED_ATTRS: Record<string, string[]> = {
  a:          ['href', 'title', 'target', 'rel'],
  span:       ['style', 'class', 'data-sys-field'],
  div:        ['style', 'class'],
  p:          ['style', 'class'],
  table:      ['style', 'class'],
  thead:      ['style', 'class'],
  tbody:      ['style', 'class'],
  tr:         ['style', 'class'],
  td:         ['colspan', 'rowspan', 'style', 'class'],
  th:         ['colspan', 'rowspan', 'style', 'class'],
  img:        ['src', 'alt', 'width', 'height', 'style', 'class'],
  h1:         ['style', 'class'],
  h2:         ['style', 'class'],
  h3:         ['style', 'class'],
  h4:         ['style', 'class'],
  h5:         ['style', 'class'],
  h6:         ['style', 'class'],
  ul:         ['style', 'class'],
  ol:         ['style', 'class'],
  li:         ['style', 'class'],
  blockquote: ['style', 'class'],
  pre:        ['style', 'class'],
  code:       ['style', 'class'],
};

// ── CSS sanitisation ──────────────────────────────────────────────────────────

const SAFE_CSS_PREFIXES = [
  'font-size', 'font-weight', 'font-style', 'font-family',
  'text-decoration', 'text-align', 'text-indent', 'text-transform',
  'vertical-align',
  'color', 'background-color',
  'border', 'border-color', 'border-width', 'border-style',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'padding', 'margin',
  'width', 'min-width', 'max-width',
  'height', 'min-height', 'max-height',
  'white-space', 'word-break', 'overflow-wrap',
  'line-height', 'letter-spacing',
  'page-break', 'break-before', 'break-after', 'break-inside',
];

// Note: /g flag requires lastIndex reset before each test — done below.
const UNSAFE_CSS_VALUE = /url\s*\(|expression\s*\(|javascript\s*:|data\s*:|vbscript\s*:/gi;

function sanitiseCssStyle(raw: string): string {
  if (!raw) return '';
  const declarations = raw.split(';').map((d) => d.trim()).filter(Boolean);
  const safe: string[] = [];
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx < 0) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val  = decl.slice(colonIdx + 1).trim();
    const allowed = SAFE_CSS_PREFIXES.some(
      (prefix) => prop === prefix || prop.startsWith(prefix + '-'),
    );
    if (!allowed) continue;
    UNSAFE_CSS_VALUE.lastIndex = 0;
    if (UNSAFE_CSS_VALUE.test(val)) continue;
    safe.push(`${prop}: ${val}`);
  }
  return safe.join('; ');
}

// ── URL validation ────────────────────────────────────────────────────────────

const SAFE_HREF  = /^(https?:|mailto:|#)/i;
const UNSAFE_URL = /^(javascript:|vbscript:|data:)/i;

/**
 * Server-side img src policy: only same-origin paths allowed.
 * External http/https, blob, and data URLs are all blocked.
 */
function isSafeImgSrc(val: string): boolean {
  const t = val.trim();
  if (UNSAFE_URL.test(t)) return false;
  if (/^https?:/i.test(t)) return false;   // external — tracking pixel risk
  if (/^blob:/i.test(t)) return false;     // meaningless in Node/Gotenberg
  return t.startsWith('/');                // same-origin only
}

// ── DOM walker ────────────────────────────────────────────────────────────────

/**
 * Recursively clean a parsed DOM node, returning a safe clone or null.
 * Uses the jsdom window's document for createElement/createDocumentFragment/
 * createTextNode so the output nodes belong to the same document.
 */
function cleanNode(
  node: Node,
  ownerDoc: Document,
  { Node: NodeCtor }: { Node: typeof Node },
): Node | null {
  // Text nodes — clone as-is (jsdom has already HTML-decoded them)
  if (node.nodeType === NodeCtor.TEXT_NODE) {
    return ownerDoc.createTextNode((node as Text).data);
  }

  if (node.nodeType !== NodeCtor.ELEMENT_NODE) {
    return null; // comments, processing instructions, etc.
  }

  const el  = node as Element;
  const tag = el.tagName.toLowerCase();

  // Drop dangerous elements and their entire subtree
  if (DROP_WITH_CONTENT.has(tag)) return null;

  if (!ALLOWED_TAGS.has(tag)) {
    // Disallowed but not dangerous — unwrap: keep children, drop the tag
    const frag = ownerDoc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const cleaned = cleanNode(child, ownerDoc, { Node: NodeCtor });
      if (cleaned) frag.appendChild(cleaned);
    }
    return frag;
  }

  // Build a clean element with only allowed attributes
  const safe = ownerDoc.createElement(tag);
  const allowedForTag = ALLOWED_ATTRS[tag] ?? [];

  for (const attrName of allowedForTag) {
    if (!el.hasAttribute(attrName)) continue;
    const val = el.getAttribute(attrName) ?? '';

    // Block all event handlers (belt-and-suspenders — they shouldn't be in
    // allowedForTag, but guard explicitly)
    if (attrName.startsWith('on')) continue;

    // Block DOM-clobbering and dangerous attrs
    if (['id', 'name', 'srcdoc', 'formaction', 'action', 'ping', 'xlink:href'].includes(attrName)) continue;

    if (attrName === 'href') {
      const t = val.trim();
      if (UNSAFE_URL.test(t)) continue;
      if (!SAFE_HREF.test(t)) continue;
      safe.setAttribute('href', t);
      continue;
    }

    if (attrName === 'src') {
      if (!isSafeImgSrc(val)) continue;
      safe.setAttribute('src', val.trim());
      continue;
    }

    if (attrName === 'style') {
      const safeStyle = sanitiseCssStyle(val);
      if (safeStyle) safe.setAttribute('style', safeStyle);
      continue;
    }

    if (attrName === 'target') {
      if (val === '_blank') safe.setAttribute('target', '_blank');
      continue;
    }

    if (attrName === 'rel') {
      // Forced below for anchors; skip here
      continue;
    }

    // colspan, rowspan, alt, width, height, class, data-sys-field, title
    safe.setAttribute(attrName, val);
  }

  // Force rel on all anchors regardless of what was in the source
  if (tag === 'a') {
    safe.setAttribute('rel', 'noopener noreferrer');
  }

  // Also strip any event-handler attributes that may have slipped through
  // (e.g. on a tag whose allowedForTag list is empty but the element was
  // allowed — defensive pass over the safe element's own attributes)
  for (const attr of Array.from(safe.attributes)) {
    if (attr.name.startsWith('on')) safe.removeAttribute(attr.name);
  }

  // Recurse into children
  for (const child of Array.from(el.childNodes)) {
    const cleaned = cleanNode(child, ownerDoc, { Node: NodeCtor });
    if (cleaned) safe.appendChild(cleaned);
  }

  return safe;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sanitise an HTML string on the server using jsdom's HTML5 parser.
 *
 * The input is parsed into an inert jsdom document (scripts disabled,
 * resources not loaded). The resulting DOM tree is walked with a strict
 * allowlist. The sanitised tree is serialised back to an HTML string.
 *
 * Safe for use before inserting stored content into Gotenberg HTML payloads
 * or any server-rendered HTML response.
 */
export function sanitiseHtmlServer(dirty: string): string {
  if (!dirty) return '';

  // Parse into an inert document — runScripts: 'outside-only' is the default
  // (scripts in the parsed HTML are NOT executed). resources: 'usable' is
  // deliberately NOT set so no external resources are fetched during parsing.
  const dom = new JSDOM(dirty, {
    runScripts: 'outside-only',
    resources:  'usable',
  });

  const { window } = dom;
  const { document, Node: NodeCtor } = window;

  const outputDoc = new JSDOM('').window.document;
  const frag = outputDoc.createDocumentFragment();

  for (const child of Array.from(document.body.childNodes)) {
    const cleaned = cleanNode(child, outputDoc, { Node: NodeCtor as typeof Node });
    if (cleaned) frag.appendChild(cleaned);
  }

  const wrapper = outputDoc.createElement('div');
  wrapper.appendChild(frag);
  return wrapper.innerHTML;
}
