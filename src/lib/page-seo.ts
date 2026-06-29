/**
 * page-seo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared helpers for building consistent SEO / AEO metadata across all pages.
 *
 * Usage:
 *   import { pageMeta, jsonLd } from '@/lib/page-seo';
 *   const meta = pageMeta('/dashboard', 'Dashboard', 'Manage your jobs…');
 *   const ld   = jsonLd.webPage(meta);
 */

export const SITE = 'https://iwillbuild.com';
export const SITE_NAME = 'IWILLBUILD';
export const OG_IMAGE = `${SITE}/og-image.png`;

// ── Meta builder ──────────────────────────────────────────────────────────────

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  ogType: string;
}

export function pageMeta(
  path: string,
  title: string,
  description: string,
  opts?: { ogType?: string; ogImage?: string }
): PageMeta {
  const canonical = new URL(path, SITE).href;
  return {
    title: `${title} — ${SITE_NAME}`,
    description,
    canonical,
    ogTitle: `${title} — ${SITE_NAME}`,
    ogDescription: description,
    ogImage: opts?.ogImage ?? OG_IMAGE,
    ogUrl: canonical,
    ogType: opts?.ogType ?? 'website',
  };
}

// ── JSON-LD factories ─────────────────────────────────────────────────────────

export const jsonLd = {
  /** Generic WebPage node — suitable for most portal/app pages */
  webPage(meta: PageMeta, extra?: Record<string, unknown>) {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${meta.canonical}#webpage`,
      name: meta.title,
      description: meta.description,
      url: meta.canonical,
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#app` },
      ...extra,
    };
  },

  /** SoftwareApplication node — for feature/tool pages */
  softwareApp(name: string, description: string, url: string) {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          name,
          url,
          isPartOf: { '@id': `${SITE}/#website` },
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${url}#app`,
          name,
          description,
          url,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
        },
      ],
    };
  },

  /** ItemList node — for list/register pages */
  itemList(name: string, description: string, url: string) {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          name,
          url,
          isPartOf: { '@id': `${SITE}/#website` },
        },
        {
          '@type': 'ItemList',
          '@id': `${url}#list`,
          name,
          description,
          url,
        },
      ],
    };
  },
};
