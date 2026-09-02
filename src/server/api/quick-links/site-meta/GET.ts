/**
 * GET /api/quick-links/site-meta?url=https://example.com
 *
 * Fetches the target page server-side (bypassing browser CORS) and extracts:
 *   - favicon: best icon URL found (apple-touch-icon > favicon > og:image)
 *   - ogImage: og:image content URL
 *   - title: <title> text (useful for auto-filling label)
 *
 * Returns 200 with { favicon, ogImage, title } — all fields may be null.
 * Returns 400 if url param is missing/invalid.
 * Returns 200 with nulls if the remote fetch fails (non-critical).
 *
 * Auth: session required (same pattern as other API routes).
 */

import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';

// Max bytes to read from the remote page before giving up
const MAX_BYTES = 80_000;
// Fetch timeout
const FETCH_TIMEOUT_MS = 6_000;

function resolveUrl(base: string, href: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extractMeta(html: string, pageUrl: string): {
  favicon: string | null;
  ogImage: string | null;
  title: string | null;
} {
  // ── title ──────────────────────────────────────────────────────────────────
  const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : null;

  // ── og:image ───────────────────────────────────────────────────────────────
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const ogImage = ogMatch ? resolveUrl(pageUrl, ogMatch[1]) : null;

  // ── favicon candidates ─────────────────────────────────────────────────────
  // Priority: apple-touch-icon (180px) > shortcut icon > icon > og:image
  const linkRe = /<link([^>]+)>/gi;
  let match: RegExpExecArray | null;
  let appleTouchIcon: string | null = null;
  let shortcutIcon: string | null = null;
  let genericIcon: string | null = null;

  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[1];
    const relMatch = tag.match(/rel=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!relMatch || !hrefMatch) continue;
    const rel = relMatch[1].toLowerCase();
    const href = hrefMatch[1];
    if (rel.includes('apple-touch-icon') && !appleTouchIcon) {
      appleTouchIcon = resolveUrl(pageUrl, href);
    } else if (rel.includes('shortcut') && rel.includes('icon') && !shortcutIcon) {
      shortcutIcon = resolveUrl(pageUrl, href);
    } else if (rel === 'icon' && !genericIcon) {
      genericIcon = resolveUrl(pageUrl, href);
    }
  }

  const favicon = appleTouchIcon ?? shortcutIcon ?? genericIcon ?? ogImage ?? null;

  return { favicon, ogImage, title };
}

export default async function handler(req: Request, res: Response) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: req.headers as Headers });
  if (!session?.user) {
    res.status(401).json({ error: 'Unauthorised' });
    return;
  }

  // ── Validate url param ─────────────────────────────────────────────────────
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl) {
    res.status(400).json({ error: 'url query param required' });
    return;
  }

  let pageUrl: string;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
    pageUrl = u.href;
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // ── Fetch remote page ──────────────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const remote = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IWIllBUILDBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    });
    clearTimeout(timer);

    if (!remote.ok) {
      // Non-critical — return nulls
      res.json({ favicon: null, ogImage: null, title: null });
      return;
    }

    // Read only the first MAX_BYTES — we only need the <head>
    const reader = remote.body?.getReader();
    if (!reader) {
      res.json({ favicon: null, ogImage: null, title: null });
      return;
    }

    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      bytes += value.byteLength;
    }
    reader.cancel().catch(() => {});

    const html = new TextDecoder('utf-8', { fatal: false }).decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc);
        merged.set(c, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    const meta = extractMeta(html, pageUrl);
    res.json(meta);
  } catch {
    // Timeout, network error, etc. — non-critical
    res.json({ favicon: null, ogImage: null, title: null });
  }
}
