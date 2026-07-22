/**
 * files-view.ts
 * Helpers for inline file viewing and image detection.
 * Kept separate from files-api.ts to avoid str_replace conflicts.
 */

/** Returns the inline-view URL for a file (used for image thumbnails/preview). */
export function fileViewUrl(id: number): string {
  const parts = ['/api', 'files', String(id), 'download?inline=1'];
  return parts.join('/');
}

/** Returns true for image MIME types we support as thumbnails. */
export function isImageMime(mime: string): boolean {
  return /^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime);
}
