/**
 * Server-side HTML sanitiser for DocumentBuilder content.
 *
 * Isomorphic — runs in Node (no DOM, no window). Uses a regex-based tag
 * scanner rather than a DOM parser. Designed to be conservative: when in
 * doubt, strip the element but preserve its text children.
 *
 * Preserves:
 *   headings (h1–h6), paragraphs, div, span, br, hr
 *   tables (table/thead/tbody/tr/th/td) with colspan/rowspan
 *   lists (ul/ol/li)
 *   inline formatting (b/i/u/em/strong/s/del/ins/strike/sup/sub)
 *   blockquote, pre, code
 *   anchors (href: https/http/mailto/# only)
 *   images (src: /api/... or same-origin relative paths only — no external URLs)
 *   safe inline styles (font, color, border, padding, margin, width, height,
 *     white-space, word-break, overflow-wrap, line-height, letter-spacing)
 *   page-break divs (class="page-break")
 *
 * Removes entirely (tag + all content):
 *   script, style, noscript, template, iframe, frame, frameset,
 *   object, embed, applet, base, link, meta, title, svg, math
 *
 * Removes tag but preserves text children:
 *   any other disallowed element
 *
 * Strips from every element:
 *   all event-handler attributes (on*)
 *   javascript: and vbscript: URLs in href/src/action/formaction
 *   data: URLs except data:image/* (and even those are blocked in src)
 *   unsafe CSS: url(), expression(), javascript:, data:, vbscript:
 *   id/name attributes that could clobber DOM globals
 *   srcdoc, formaction, action, ping, xlink:href
 *
 * Image URL policy (server-side, conservative):
 *   Allowed: /api/... (internal document image API)
 *            / (same-origin relative paths)
 *   Blocked: http:// (plain HTTP — tracking pixel risk)
 *            https:// (external — tracking pixel risk)
 *            blob: (client-only, meaningless server-side)
 *            data: (all forms)
 *            javascript: / vbscript:
 *
 * This is intentionally more restrictive than the client-side sanitiser
 * (sanitiseHtml.ts) which allows https: for display. The server-side
 * sanitiser runs on content destined for Gotenberg (headless Chromium) where
 * external network requests are a concrete exfiltration risk.
 */

// ── Tags dropped with all their content ──────────────────────────────────────

const DROP_WITH_CONTENT_RE = /^(script|style|noscript|template|iframe|frame|frameset|object|embed|applet|base|link|meta|title|svg|math)$/i;

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
  a:         new Set(['href', 'title', 'target', 'rel']),
  span:      new Set(['style', 'class', 'data-sys-field']),
  div:       new Set(['style', 'class']),
  p:         new Set(['style', 'class']),
  table:     new Set(['style', 'class']),
  thead:     new Set(['style', 'class']),
  tbody:     new Set(['style', 'class']),
  tr:        new Set(['style', 'class']),
  td:        new Set(['colspan', 'rowspan', 'style', 'class']),
  th:        new Set(['colspan', 'rowspan', 'style', 'class']),
  img:       new Set(['src', 'alt', 'width', 'height', 'style', 'class']),
  h1:        new Set(['style', 'class']),
  h2:        new Set(['style', 'class']),
  h3:        new Set(['style', 'class']),
  h4:        new Set(['style', 'class']),
  h5:        new Set(['style', 'class']),
  h6:        new Set(['style', 'class']),
  ul:        new Set(['style', 'class']),
  ol:        new Set(['style', 'class']),
  li:        new Set(['style', 'class']),
  blockquote: new Set(['style', 'class']),
  pre:       new Set(['style', 'class']),
  code:      new Set(['style', 'class']),
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
    // Reset UNSAFE_CSS_VALUE lastIndex (global flag)
    UNSAFE_CSS_VALUE.lastIndex = 0;
    if (UNSAFE_CSS_VALUE.test(val)) continue;
    safe.push(`${prop}: ${val}`);
  }
  return safe.join('; ');
}

// ── URL validation ────────────────────────────────────────────────────────────

const SAFE_HREF   = /^(https?:|mailto:|#)/i;
const UNSAFE_URL  = /^(javascript:|vbscript:|data:)/i;

/**
 * Validate an img src for server-side use (Gotenberg context).
 * Only same-origin relative paths and /api/... are permitted.
 * External https/http, blob, and data URLs are all blocked.
 */
function isSafeImgSrc(val: string): boolean {
  const trimmed = val.trim();
  if (UNSAFE_URL.test(trimmed)) return false;
  // Must start with / (same-origin) — external https/http blocked
  if (trimmed.startsWith('/')) return true;
  return false;
}

// ── Attribute parser ──────────────────────────────────────────────────────────
// Parses key="value", key='value', key=value, key (boolean) from a raw
// attribute string. Returns an array of [name, value] pairs.

function parseAttrs(attrStr: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  // Tokenise: name="val" | name='val' | name=val | name
  const re = /([a-zA-Z][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    const val  = m[2] ?? m[3] ?? m[4] ?? '';
    result.push([name, val]);
  }
  return result;
}

// ── Tag scanner ───────────────────────────────────────────────────────────────
// Tokenises HTML into text nodes, open tags, close tags, and self-closing tags.

type Token =
  | { type: 'text';  value: string }
  | { type: 'open';  tag: string; attrs: Array<[string, string]>; selfClose: boolean }
  | { type: 'close'; tag: string };

function tokenise(html: string): Token[] {
  const tokens: Token[] = [];
  // Matches: comments, CDATA, doctype, tags, text
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)(\/?)\s*>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[5] !== undefined) {
      // Text node
      tokens.push({ type: 'text', value: m[5] });
    } else if (m[2] !== undefined) {
      const isClose    = m[1] === '/';
      const tag        = m[2].toLowerCase();
      const attrStr    = m[3] ?? '';
      const selfClose  = m[4] === '/';
      if (isClose) {
        tokens.push({ type: 'close', tag });
      } else {
        tokens.push({ type: 'open', tag, attrs: parseAttrs(attrStr), selfClose });
      }
    }
    // comments, CDATA, DOCTYPE — silently dropped
  }
  return tokens;
}

// ── Main sanitiser ────────────────────────────────────────────────────────────

/**
 * Sanitise an HTML string on the server (Node, no DOM).
 * Safe for use before inserting stored content into Gotenberg HTML payloads.
 */
export function sanitiseHtmlServer(dirty: string): string {
  if (!dirty) return '';

  const tokens = tokenise(dirty);
  const out: string[] = [];

  // Stack tracks open DROP_WITH_CONTENT elements — while depth > 0 suppress all output
  let dropDepth = 0;
  // Stack of open allowed tags (for proper nesting)
  const openStack: string[] = [];

  // Void elements — never emit a close tag
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  for (const tok of tokens) {
    if (tok.type === 'text') {
      if (dropDepth > 0) continue;
      // Escape text content
      out.push(
        tok.value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;'),
      );
      continue;
    }

    if (tok.type === 'close') {
      const tag = tok.tag;
      if (DROP_WITH_CONTENT_RE.test(tag)) {
        if (dropDepth > 0) dropDepth--;
        continue;
      }
      if (dropDepth > 0) continue;
      if (ALLOWED_TAGS.has(tag) && !VOID_ELEMENTS.has(tag)) {
        // Only emit close if we have a matching open on the stack
        const idx = openStack.lastIndexOf(tag);
        if (idx !== -1) {
          openStack.splice(idx, 1);
          out.push(`</${tag}>`);
        }
      }
      continue;
    }

    // tok.type === 'open'
    const tag = tok.tag;

    if (DROP_WITH_CONTENT_RE.test(tag)) {
      if (!tok.selfClose) dropDepth++;
      continue;
    }

    if (dropDepth > 0) continue;

    if (!ALLOWED_TAGS.has(tag)) {
      // Disallowed but not dangerous — skip tag, keep children (text will flow through)
      continue;
    }

    // Build safe attribute string
    const allowedForTag = ALLOWED_ATTRS[tag] ?? new Set<string>();
    const safeAttrs: string[] = [];

    for (const [name, val] of tok.attrs) {
      // Block all event handlers
      if (name.startsWith('on')) continue;
      // Block DOM-clobbering and dangerous attrs
      if (['id', 'name', 'srcdoc', 'formaction', 'action', 'ping', 'xlink:href'].includes(name)) continue;
      if (!allowedForTag.has(name)) continue;

      if (name === 'href') {
        const trimmed = val.trim();
        if (UNSAFE_URL.test(trimmed)) continue;
        if (!SAFE_HREF.test(trimmed)) continue;
        safeAttrs.push(`href="${escAttr(trimmed)}"`);
        continue;
      }

      if (name === 'src') {
        if (!isSafeImgSrc(val)) continue;
        safeAttrs.push(`src="${escAttr(val.trim())}"`);
        continue;
      }

      if (name === 'style') {
        const safeStyle = sanitiseCssStyle(val);
        if (safeStyle) safeAttrs.push(`style="${escAttr(safeStyle)}"`);
        continue;
      }

      if (name === 'target') {
        // Only allow _blank; force rel noopener
        if (val === '_blank') safeAttrs.push('target="_blank"');
        continue;
      }

      if (name === 'rel') {
        // Will be forced below for anchors
        continue;
      }

      // colspan, rowspan, alt, width, height, class, data-sys-field, title
      safeAttrs.push(`${name}="${escAttr(val)}"`);
    }

    // Force rel on anchors
    if (tag === 'a') {
      safeAttrs.push('rel="noopener noreferrer"');
    }

    const attrStr = safeAttrs.length ? ' ' + safeAttrs.join(' ') : '';

    if (VOID_ELEMENTS.has(tag) || tok.selfClose) {
      out.push(`<${tag}${attrStr}>`);
    } else {
      out.push(`<${tag}${attrStr}>`);
      openStack.push(tag);
    }
  }

  // Close any unclosed tags in reverse order
  for (let i = openStack.length - 1; i >= 0; i--) {
    out.push(`</${openStack[i]}>`);
  }

  return out.join('');
}

function escAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
