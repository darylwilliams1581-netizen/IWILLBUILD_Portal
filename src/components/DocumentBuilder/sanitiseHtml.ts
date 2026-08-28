/**
 * Shared HTML sanitiser for DocumentBuilder blocks.
 * Strips script tags, event handlers, javascript: hrefs, and data: URIs
 * while preserving safe formatting markup.
 */
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
    span:   ['style', 'class'],
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
        const safeStyle = val.replace(/url\s*\(|expression\s*\(/gi, '');
        safe.setAttribute('style', safeStyle);
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
