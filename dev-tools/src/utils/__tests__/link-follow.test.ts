/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  followClickableElement,
  formatLinkDisplayUrl,
  resolveExternalNavigationHref,
  resolveFollowTarget,
} from '../link-follow.js';

function buildElement(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const element = doc.body.firstElementChild as HTMLElement | null;
  if (!element) throw new Error(`fixture produced no element: ${JSON.stringify(html)}`);
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('link-follow', function packageTests() {
  describe('#formatLinkDisplayUrl', function formatTests() {
    it('shows domain + first path segment for long external URLs', function truncate() {
      expect(formatLinkDisplayUrl('https://loom.com/share/c587cabe155a499fa63ae88fe0d61d23'))
        .toBe('loom.com · /share');
      expect(formatLinkDisplayUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'))
        .toBe('youtube.com · /watch');
      expect(formatLinkDisplayUrl('https://www.instagram.com/reel/CxYzAbcDefGhIj'))
        .toBe('instagram.com · /reel');
    });

    it('shows compact URL for short external links', function shortExternal() {
      expect(formatLinkDisplayUrl('https://example.com/pricing')).toBe('example.com/pricing');
      expect(formatLinkDisplayUrl('https://www.example.com/pricing')).toBe('example.com/pricing');
    });

    it('shows friendly page name for internal links', function internalPage() {
      expect(formatLinkDisplayUrl('/contact')).toBe('Contact');
      expect(formatLinkDisplayUrl('/about-us')).toBe('About Us');
      expect(formatLinkDisplayUrl('/')).toBe('Home');
    });

    it('includes hash fragments in the friendly name', function hashFragment() {
      expect(formatLinkDisplayUrl('#contact')).toBe('Contact');
      expect(formatLinkDisplayUrl('/about#team')).toBe('About');
    });
  });

  describe('#resolveFollowTarget', function resolveTests() {
    it('returns link target for anchors', function anchor() {
      const anchor = buildElement('<a href="https://example.com/pricing">Pricing</a>');
      expect(resolveFollowTarget(anchor)).toEqual({
        kind: 'link',
        href: 'https://example.com/pricing',
        displayUrl: 'example.com/pricing',
      });
    });

    it('returns button target for buttons without href', function button() {
      const button = buildElement('<button type="button">Go</button>');
      expect(resolveFollowTarget(button)).toEqual({ kind: 'button' });
    });

    it('returns button target for onclick-only elements', function onclick() {
      const div = buildElement('<div onclick="void(0)">Act</div>');
      expect(resolveFollowTarget(div)).toEqual({ kind: 'button' });
    });
  });

  describe('#followClickableElement', function followTests() {
    it('assigns location for same-window anchors', function assign() {
      const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
      const anchor = buildElement('<a href="/contact">Contact</a>');

      expect(followClickableElement(anchor)).toBe(true);
      expect(assignSpy).toHaveBeenCalledWith(`${window.location.origin}/contact`);
    });

    it('clicks buttons when no anchor is present', function clickButton() {
      const button = buildElement('<button type="button">Go</button>');
      const clickSpy = vi.spyOn(button, 'click');

      expect(followClickableElement(button)).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('#resolveExternalNavigationHref', function externalNavTests() {
    it('returns the absolute href for a cross-origin anchor', function external() {
      const anchor = buildElement('<a href="https://play.google.com/store/books/details?id=abc">Buy</a>');
      expect(resolveExternalNavigationHref(anchor)).toBe(
        'https://play.google.com/store/books/details?id=abc',
      );
    });

    it('resolves the anchor from a nested child click target', function nestedChild() {
      const anchor = buildElement('<a href="https://example.com/pricing"><span>Pricing</span></a>');
      const span = anchor.querySelector('span') as HTMLElement;
      expect(resolveExternalNavigationHref(span)).toBe('https://example.com/pricing');
    });

    it('returns null for same-origin (in-app) navigation', function sameOrigin() {
      // A relative href resolves against jsdom's default document origin
      // (http://localhost), which equals window.location.origin here — so this
      // genuinely exercises the same-origin comparison, not a masked no-op.
      const anchor = buildElement('<a href="/contact">Contact</a>');
      expect(resolveExternalNavigationHref(anchor)).toBeNull();
    });

    it('returns null for hash-only links', function hashOnly() {
      const anchor = buildElement('<a href="#section">Jump</a>');
      expect(resolveExternalNavigationHref(anchor)).toBeNull();
    });

    it('returns null for mailto: and tel: schemes', function nonHttp() {
      expect(resolveExternalNavigationHref(buildElement('<a href="mailto:a@b.com">Email</a>'))).toBeNull();
      expect(resolveExternalNavigationHref(buildElement('<a href="tel:+15551234567">Call</a>'))).toBeNull();
    });

    it('returns null for anchors without an href', function noHref() {
      expect(resolveExternalNavigationHref(buildElement('<a>No href</a>'))).toBeNull();
    });

    it('returns null when the click is not on or inside an anchor', function nonAnchor() {
      expect(resolveExternalNavigationHref(buildElement('<button type="button">Go</button>'))).toBeNull();
    });
  });
});
