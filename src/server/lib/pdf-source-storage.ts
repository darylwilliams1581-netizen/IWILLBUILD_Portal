/**
 * pdf-source-storage.ts
 * ─────────────────────
 * Store an imported PDF once to persistent storage and return a stable
 * storage key + download URL. Used by the import-pdf route so all
 * pdf_page blocks for the same document share one stored source.
 *
 * Storage: /shared-storage/public/assets/uploads/pdf-imports/
 * Public URL: /airo-assets/uploads/pdf-imports/<slug>
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

const UPLOAD_DIR = '/shared-storage/public/assets/uploads/pdf-imports';
const PUBLIC_BASE = '/airo-assets/uploads/pdf-imports';

export interface PdfSourceResult {
  /** Stable key used in PdfPageBlock.storageKey */
  storageKey: string;
  /** Public URL for the download link shown in the block */
  downloadUrl: string;
}

/**
 * Save the PDF buffer to persistent storage.
 * Returns a storageKey (relative path within UPLOAD_DIR) and a public URL.
 * Throws on write failure — callers should handle and return 500.
 */
export async function savePdfSource(
  buf: Buffer,
  opts: { companyId: number; templateId: number; originalName: string },
): Promise<PdfSourceResult> {
  const safeName = opts.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const slug = `${opts.companyId}-${opts.templateId}-${nanoid(8)}-${safeName}`;
  const dir = path.join(UPLOAD_DIR, String(opts.companyId));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, slug);
  await fs.writeFile(filePath, buf);
  const storageKey = `${opts.companyId}/${slug}`;
  const downloadUrl = `${PUBLIC_BASE}/${opts.companyId}/${slug}`;
  return { storageKey, downloadUrl };
}

/**
 * Resolve a download URL from a storageKey.
 * Used when re-rendering pdf_page blocks that were saved before downloadUrl
 * was stored on the block itself.
 */
export function getPdfDownloadUrl(storageKey: string): string {
  return `${PUBLIC_BASE}/${storageKey}`;
}
