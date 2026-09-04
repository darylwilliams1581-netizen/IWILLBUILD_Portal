/**
 * Utilities for safely handling photo/media URLs in form print/PDF contexts.
 * Prevents HTML login-redirect pages from being embedded as images.
 */

import { isFileApiUrl } from './string-scanners.js';

/**
 * Returns true only if the URL is a valid app file API path.
 * Rejects raw JSON strings, HTML paths, and other non-file values.
 *
 * Delegates to the shared linear scanner in string-scanners.ts — no regex.
 */
export function isValidFileApiUrl(url: unknown): url is string {
  return isFileApiUrl(url);
}

/**
 * Parses a photo field answer value into a deduplicated array of file API URLs.
 * Handles: string URL, JSON-encoded array, plain array.
 * Deduplicates by URL string.
 */
export function parsePhotoUrls(value: unknown): string[] {
  if (!value) return [];
  let urls: string[] = [];
  if (Array.isArray(value)) {
    urls = value.filter((v): v is string => typeof v === 'string');
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        urls = parsed.filter((v): v is string => typeof v === 'string');
      } else {
        urls = [value];
      }
    } catch {
      urls = [value];
    }
  }
  // Deduplicate by URL
  const seen = new Set<string>();
  return urls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  }).filter(isValidFileApiUrl);
}

/**
 * Checks whether a data URL result from FileReader is a genuine image.
 * Returns false for text/html or other non-image content.
 */
export function isImageDataUrl(result: string): boolean {
  // data:image/... is the only acceptable prefix
  return typeof result === 'string' && result.includes(':image/');
}
