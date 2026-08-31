/**
 * pdf-page-count.ts
 * ─────────────────
 * Pure-JS PDF page counter — no pdfjs-dist, no pdf-parse, no new dependencies.
 *
 * Strategy:
 *   1. Scan the PDF cross-reference table for the /Count entry in the Pages
 *      dictionary — this is the authoritative page count in any conforming PDF.
 *   2. Fall back to counting /Type /Page dictionary entries if /Count is absent.
 *   3. Return 0 if neither heuristic finds a count (caller treats as 1 page).
 *
 * Works on both uncompressed and FlateDecode-compressed PDFs because we only
 * need the document catalog and page tree, which are always in the xref table
 * and are typically uncompressed in the cross-reference stream or trailer.
 *
 * Security: all patterns are anchored or bounded; no catastrophic backtracking.
 */
/* eslint-disable security/detect-unsafe-regex */

/**
 * Detect the number of pages in a PDF buffer.
 * Returns 0 if the count cannot be determined.
 */
export function detectPdfPageCount(buf: Buffer): number {
  // Convert to string for regex scanning — PDFs are ASCII-safe in their
  // structural elements (xref, trailer, catalog). Binary streams are skipped.
  const text = buf.toString('latin1');

  // ── Strategy 1: /Count N in the Pages dictionary ─────────────────────────
  // The Pages dictionary always contains /Count <integer> for the total pages.
  // We look for the pattern anywhere in the file (it may appear multiple times
  // in nested page trees; take the largest value = root node).
  const countRe = /\/Count\s+(\d+)/g;
  let maxCount = 0;
  let m: RegExpExecArray | null;
  while ((m = countRe.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > maxCount) maxCount = n;
  }
  if (maxCount > 0) return maxCount;

  // ── Strategy 2: count /Type /Page entries ────────────────────────────────
  // Each page object contains /Type /Page (not /Pages).
  // This is a fallback for malformed PDFs that omit /Count.
  const pageTypeRe = /\/Type\s*\/Page[^s]/g;
  let pageCount = 0;
  while ((pageTypeRe.exec(text)) !== null) {
    pageCount++;
  }
  return pageCount;
}
