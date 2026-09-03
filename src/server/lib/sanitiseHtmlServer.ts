/**
 * Server-side HTML sanitiser for DocumentBuilder content.
 *
 * Uses parse5 (already a transitive dependency — no new package required) to
 * parse HTML into a spec-compliant parse tree, then walks the tree applying a
 * strict allowlist — the same policy as the client-side sanitiseHtml.ts.
 *
 * Why parse5 and not a regex tokeniser:
 *   HTML is not a regular language. A regex scanner cannot correctly handle
 *   nested tags, attribute quoting edge-cases, CDATA sections, or the many
 *   browser-specific parsing quirks that attackers exploit. parse5 implements
 *   the HTML5 parsing algorithm (the same spec browsers follow), so the tree
 *   it produces matches what Gotenberg's Chromium would produce — making the
 *   sanitiser's view of the document identical to the renderer's view.
 *
 * Why parse5 instead of jsdom:
 *   jsdom is 11.2 MB on disk and causes an OOM kill during the SSR Rollup
 *   build. parse5 is the HTML5 parser jsdom uses internally; using it directly
 *   gives the same parsing guarantees at ~200 KB. parse5 is already present as
 *   a transitive dependency — no new package is added.
 *
 * Parser: parse5 (HTML5 spec parser) — already in node_modules as a transitive
 * dep of jsdom and vitest. No new dependency added.
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

import { parseFragment, serialize } from 'parse5';

// parse5 tree node types (inline to avoid import path issues with .js extensions)
interface P5TextNode   { nodeName: '#text'; value: string; parentNode: unknown }
interface P5CommentNode { nodeName: '#comment'; data: string; parentNode: unknown }
interface P5Element {
  nodeName: string;
  tagName: string;
  attrs: Array<{ name: string; value: string; namespace?: string; prefix?: string }>;
  namespaceURI: string;
  childNodes: P5Node[];
  parentNode: unknown;
  sourceCodeLocation?: unknown;
}
type P5Node = P5TextNode | P5CommentNode | P5Element | { nodeName: string; parentNode: unknown };

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

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:          new Set(['href', 'title', 'target', 'rel']),
  span:       new Set(['style', 'class', 'data-sys-field']),
  div:        new Set(['style', 'class']),
  p:          new Set(['style', 'class']),
  table:      new Set(['style', 'class']),
  thead:      new Set(['style', 'class']),
  tbody:      new Set(['style', 'class']),
  tr:         new Set(['style', 'class']),
  td:         new Set(['colspan', 'rowspan', 'style', 'class']),
  th:         new Set(['colspan', 'rowspan', 'style', 'class']),
  img:        new Set(['src', 'alt', 'width', 'height', 'style', 'class']),
  h1:         new Set(['style', 'class']),
  h2:         new Set(['style', 'class']),
  h3:         new Set(['style', 'class']),
  h4:         new Set(['style', 'class']),
  h5:         new Set(['style', 'class']),
  h6:         new Set(['style', 'class']),
  ul:         new Set(['style', 'class']),
  ol:         new Set(['style', 'class']),
  li:         new Set(['style', 'class']),
  blockquote: new Set(['style', 'class']),
  pre:        new Set(['style', 'class']),
  code:       new Set(['style', 'class']),
};

// ── Dangerous attribute names (always stripped regardless of tag) ─────────────

const DANGEROUS_ATTRS = new Set([
  'id', 'name', 'srcdoc', 'formaction', 'action', 'ping', 'xlink:href',
]);

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

// ── parse5 tree walker ────────────────────────────────────────────────────────

/**
 * Recursively clean a parse5 node, returning a safe replacement node
 * or an array of replacement nodes (for unwrapped elements), or null to drop.
 *
 * parse5 tree nodes:
 *   - Text:    { nodeName: '#text', value: string }
 *   - Comment: { nodeName: '#comment' }
 *   - Element: { nodeName: tagName, tagName: string, attrs: [{name, value}], childNodes: P5Node[] }
 */
function cleanNode(node: P5Node): P5Node | P5Node[] | null {
  // Text nodes — keep as-is (parse5 has already HTML-decoded them)
  if (node.nodeName === '#text') {
    return node;
  }

  // Drop comments, processing instructions, document-type nodes
  if (node.nodeName.startsWith('#')) {
    return null;
  }

  const el = node as P5Element;
  const tag = el.tagName.toLowerCase();

  // Drop dangerous elements and their entire subtree
  if (DROP_WITH_CONTENT.has(tag)) return null;

  if (!ALLOWED_TAGS.has(tag)) {
    // Disallowed but not dangerous — unwrap: keep children, drop the tag
    const cleaned: P5Node[] = [];
    for (const child of el.childNodes) {
      const result = cleanNode(child);
      if (result === null) continue;
      if (Array.isArray(result)) cleaned.push(...result);
      else cleaned.push(result);
    }
    return cleaned.length > 0 ? cleaned : null;
  }

  // Build a clean element with only allowed attributes
  const allowedForTag = ALLOWED_ATTRS[tag] ?? new Set<string>();
  const safeAttrs: Array<{ name: string; value: string }> = [];

  for (const attr of el.attrs) {
    const attrName = attr.name.toLowerCase();
    const val = attr.value;

    // Strip all event handlers
    if (attrName.startsWith('on')) continue;

    // Strip dangerous attrs
    if (DANGEROUS_ATTRS.has(attrName)) continue;

    // Only keep attrs in the allowlist for this tag
    if (!allowedForTag.has(attrName)) continue;

    if (attrName === 'href') {
      const t = val.trim();
      if (UNSAFE_URL.test(t)) continue;
      if (!SAFE_HREF.test(t)) continue;
      safeAttrs.push({ name: 'href', value: t });
      continue;
    }

    if (attrName === 'src') {
      if (!isSafeImgSrc(val)) continue;
      safeAttrs.push({ name: 'src', value: val.trim() });
      continue;
    }

    if (attrName === 'style') {
      const safeStyle = sanitiseCssStyle(val);
      if (safeStyle) safeAttrs.push({ name: 'style', value: safeStyle });
      continue;
    }

    if (attrName === 'target') {
      if (val === '_blank') safeAttrs.push({ name: 'target', value: '_blank' });
      continue;
    }

    if (attrName === 'rel') {
      // Forced below for anchors; skip here
      continue;
    }

    // colspan, rowspan, alt, width, height, class, data-sys-field, title
    safeAttrs.push({ name: attrName, value: val });
  }

  // Force rel on all anchors
  if (tag === 'a') {
    safeAttrs.push({ name: 'rel', value: 'noopener noreferrer' });
  }

  // Recurse into children
  const safeChildren: P5Node[] = [];
  for (const child of el.childNodes) {
    const result = cleanNode(child);
    if (result === null) continue;
    if (Array.isArray(result)) safeChildren.push(...result);
    else safeChildren.push(result);
  }

  // Return a clean element node in parse5's default tree format
  const safeEl: P5Element = {
    nodeName: tag,
    tagName: tag,
    attrs: safeAttrs,
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    childNodes: [],
    parentNode: null,
  };

  // Wire up parent references (parse5 requires them for serialisation)
  for (const child of safeChildren) {
    (child as P5Node & { parentNode: P5Element }).parentNode = safeEl;
    safeEl.childNodes.push(child);
  }

  return safeEl;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sanitise an HTML string on the server using parse5's HTML5 parser.
 *
 * The input is parsed into a parse5 fragment tree (no script execution,
 * no resource loading). The tree is walked with a strict allowlist. The
 * sanitised tree is serialised back to an HTML string via parse5's serialiser.
 *
 * Safe for use before inserting stored content into Gotenberg HTML payloads
 * or any server-rendered HTML response.
 */
export function sanitiseHtmlServer(dirty: string): string {
  if (!dirty) return '';

  // parseFragment parses as a body context — no implicit html/head/body wrapper
  const fragment = parseFragment(dirty);

  const safeChildren: P5Node[] = [];
  for (const child of fragment.childNodes) {
    // parse5's ChildNode is structurally compatible with P5Node but the types
    // diverge at the library boundary.  Cast through unknown at this single
    // entry point — all subsequent tree-walking uses the local P5Node union.
    const result = cleanNode(child as unknown as P5Node);
    if (result === null) continue;
    if (Array.isArray(result)) safeChildren.push(...result);
    else safeChildren.push(result);
  }

  // Build a clean fragment for serialisation.
  // The childNodes field uses our local P5Node union rather than parse5's
  // internal ChildNode type.  The two types are structurally identical at
  // runtime; we narrow through `unknown` at this single serialisation boundary
  // so the rest of the function stays fully typed.
  const safeFragment: { nodeName: '#document-fragment'; childNodes: P5Node[] } = {
    nodeName: '#document-fragment' as const,
    childNodes: safeChildren,
  };

  // Wire parent references on top-level children
  for (const child of safeChildren) {
    (child as P5Node & { parentNode: unknown }).parentNode = safeFragment;
  }

  // Cast through unknown at the parse5 library boundary — P5Node is
  // structurally compatible with parse5's ChildNode but the nominal types
  // diverge.  This is the only cast needed; all tree-walking above is typed.
  type SerializeArg = Parameters<typeof serialize>[0];
  // @ts-expect-error — parse5's serialize() overloads require ParentNode but
  // our P5Node union is structurally identical.  The cast is safe: every node
  // we pass has the required nodeName/childNodes shape.
  return serialize(safeFragment as SerializeArg);
}
