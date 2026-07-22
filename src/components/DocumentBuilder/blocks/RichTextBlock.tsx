import { useRef, useEffect } from 'react';
import { useDocumentStore } from '../useDocumentStore';
import type { RichTextBlock } from '../types';

interface Props {
  block: RichTextBlock;
  columnsBlockId?: string;
  columnId?: string;
}

/**
 * Sanitise an HTML string using the browser's DOMParser.
 * Strips script tags, event handlers, javascript: hrefs, and data: URIs
 * while preserving safe formatting markup (b, i, u, em, strong, a, br, p, ul, ol, li, etc.).
 */
function sanitiseHtml(dirty: string): string {
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
    a:    ['href', 'title', 'target', 'rel'],
    span: ['style', 'class'],
    div:  ['style', 'class'],
    p:    ['style', 'class'],
    td:   ['colspan', 'rowspan', 'style'],
    th:   ['colspan', 'rowspan', 'style'],
  };
  const SAFE_HREF = /^(https?:|mailto:|#)/i;

  const doc = new DOMParser().parseFromString(dirty, 'text/html');

  function clean(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Replace disallowed element with its text content only
      const frag = document.createDocumentFragment();
      el.childNodes.forEach((child) => {
        const cleaned = clean(child);
        if (cleaned) frag.appendChild(cleaned);
      });
      return frag;
    }

    const safe = document.createElement(tag);

    // Copy allowed attributes only
    const allowedForTag = ALLOWED_ATTRS[tag] ?? [];
    for (const attr of allowedForTag) {
      const val = el.getAttribute(attr);
      if (val === null) continue;
      if (attr === 'href' && !SAFE_HREF.test(val.trim())) continue;
      if (attr === 'style') {
        // Strip url() and expression() from inline styles
        const safeStyle = val.replace(/url\s*\(|expression\s*\(/gi, '');
        safe.setAttribute('style', safeStyle);
        continue;
      }
      safe.setAttribute(attr, val);
    }
    // Force safe link attributes
    if (tag === 'a') {
      safe.setAttribute('rel', 'noopener noreferrer');
    }

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

export default function RichTextBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();
  const ref = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<RichTextBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  // Sync external html changes into the contenteditable without losing cursor
  useEffect(() => {
    if (ref.current && mode === 'edit') {
      if (ref.current.innerHTML !== block.html) {
        // eslint-disable-next-line no-unsanitized/property -- value is passed through sanitiseHtml before assignment
        ref.current.innerHTML = sanitiseHtml(block.html);
      }
    }
  }, [block.html, mode]);

  const safeHtml = sanitiseHtml(block.html);

  if (mode === 'edit') {
    return (
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => update({ html: sanitiseHtml(e.currentTarget.innerHTML) })}
        className="outline-none py-2 cursor-text leading-relaxed prose prose-sm max-w-none rounded transition-colors focus:bg-slate-50/60 hover:bg-slate-50/40"
        style={{ minHeight: block.minHeight ?? '4em' }}
        data-placeholder="Click to type…"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return (
    <div
      className="py-2 leading-relaxed prose prose-sm max-w-none"
      style={{ minHeight: block.minHeight ?? undefined }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
