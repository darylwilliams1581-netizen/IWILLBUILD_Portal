/**
 * Shared HTML sanitiser for DocumentBuilder blocks.
 *
 * Strips script tags, event handlers, javascript: hrefs, data: URIs, and
 * unsafe CSS properties while preserving safe formatting markup and the
 * inline styles produced by the contextual formatting system.
 *
 * Safe CSS properties (allowlist):
 *   font-size, font-weight, font-style, text-decoration, text-align,
 *   vertical-align, color, background-color,
 *   border, border-color, border-width, border-style,
 *   border-top/right/bottom/left (and their -color/-width/-style variants),
 *   padding, padding-*, margin, margin-*,
 *   width, min-width, max-width, height, min-height, max-height,
 *   white-space, word-break, overflow-wrap
 *
 * Unsafe patterns stripped from style values:
 *   url(...), expression(...), javascript:, data:, vbscript:
 */

// ── Safe CSS property prefix allowlist ───────────────────────────────────────

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
];

const UNSAFE_CSS_VALUE = /url\s*\(|expression\s*\(|javascript\s*:|data\s*:|vbscript\s*:/gi;

/**
 * Sanitise a raw CSS style string, keeping only safe properties and stripping
 * unsafe value patterns. Returns a clean style string (may be empty).
 */
export function sanitiseCssStyle(raw: string): string {
  if (!raw) return '';
  // Parse individual declarations
  const declarations = raw.split(';').map((d) => d.trim()).filter(Boolean);
  const safe: string[] = [];
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx < 0) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val  = decl.slice(colonIdx + 1).trim();
    // Check against allowlist
    const allowed = SAFE_CSS_PREFIXES.some((prefix) => prop === prefix || prop.startsWith(prefix + '-'));
    if (!allowed) continue;
    // Strip unsafe value patterns
    if (UNSAFE_CSS_VALUE.test(val)) continue;
    safe.push(`${prop}: ${val}`);
  }
  return safe.join('; ');
}

// ── HTML sanitiser ────────────────────────────────────────────────────────────

export function sanitiseHtml(dirty: string): string {
  if (!dirty) return '';
  if (typeof window === 'undefined') {
    // SSR path — strip all tags as a safe fallback.
    return dirty.replace(/<[^>]*>/g, '');
  }
  const ALLOWED_TAGS = new Set([
    'b', 'i', 'u', 'em', 'strong', 'strike', 's', 'del', 'ins',
    'br', 'p', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'sup', 'sub',
  ]);
  const ALLOWED_ATTRS: Record<string, string[]> = {
    a:      ['href', 'title', 'target', 'rel'],
    span:   ['style', 'class', 'data-sys-field', 'contenteditable'],
    div:    ['style', 'class'],
    p:      ['style', 'class'],
    table:  ['style', 'class'],
    thead:  ['style', 'class'],
    tbody:  ['style', 'class'],
    tr:     ['style', 'class'],
    td:     ['colspan', 'rowspan', 'style', 'class'],
    th:     ['colspan', 'rowspan', 'style', 'class'],
  };
  const SAFE_HREF = /^(https?:|mailto:|#)/i;

  const doc = new DOMParser().parseFromString(dirty, 'text/html');

  function clean(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      const frag = document.createDocumentFragment();
      el.childNodes.forEach((child) => {
        const cleaned = clean(child);
        if (cleaned) frag.appendChild(cleaned);
      });
      return frag;
    }

    const safe = document.createElement(tag);
    const allowedForTag = ALLOWED_ATTRS[tag] ?? [];
    for (const attr of allowedForTag) {
      const val = el.getAttribute(attr);
      if (val === null) continue;
      if (attr === 'href' && !SAFE_HREF.test(val.trim())) continue;
      if (attr === 'style') {
        const safeStyle = sanitiseCssStyle(val);
        if (safeStyle) safe.setAttribute('style', safeStyle);
        continue;
      }
      safe.setAttribute(attr, val);
    }
    if (tag === 'a') safe.setAttribute('rel', 'noopener noreferrer');

    el.childNodes.forEach((child) => {
      const cleaned = clean(child);
      if (cleaned) safe.appendChild(cleaned);
    });

    return safe;
  }

  const frag = document.createDocumentFragment();
  doc.body.childNodes.forEach((child) => {
    const cleaned = clean(child);
    if (cleaned) frag.appendChild(cleaned);
  });

  const wrapper = document.createElement('div');
  wrapper.appendChild(frag);
  return wrapper.innerHTML;
}
