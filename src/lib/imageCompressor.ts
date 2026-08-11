/**
 * imageCompressor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight canvas-based image compressor.
 *
 * Used by:
 *   - BugReportModal   — compress screenshots before upload (max 1280px, 0.75q)
 *   - usePhotoUploadQueue — already has normaliseToJpeg; this is the shared util
 *
 * Safe on iOS WKWebView: uses createImageBitmap + canvas.toBlob only.
 * Falls back to the original file if compression fails for any reason.
 *
 * NEVER stores base64 strings — always returns a Blob/File.
 */

export interface CompressOptions {
  /** Maximum dimension (width or height) in pixels. Default: 1920 */
  maxPx?: number;
  /** JPEG quality 0–1. Default: 0.85 */
  quality?: number;
  /** Output MIME type. Default: 'image/jpeg' */
  outputType?: 'image/jpeg' | 'image/webp';
}

/**
 * Compress an image File/Blob.
 * Returns a new File (JPEG) at most `maxPx` on the longest side.
 * Falls back to the original file if the browser cannot decode it.
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const {
    maxPx      = 1920,
    quality    = 0.85,
    outputType = 'image/jpeg',
  } = opts;

  // Skip if already small enough (< 200 KB) — not worth re-encoding
  if (file.size < 200 * 1024) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // createImageBitmap can't decode HEIC or unknown types — return as-is
    return file;
  }

  let { width, height } = bitmap;

  // Scale down if either dimension exceeds maxPx
  if (width > maxPx || height > maxPx) {
    if (width >= height) {
      height = Math.round((height / width) * maxPx);
      width  = maxPx;
    } else {
      width  = Math.round((width / height) * maxPx);
      height = maxPx;
    }
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas        = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    ctx           = canvas.getContext('2d');
  } catch {
    bitmap.close();
    return file;
  }

  if (!ctx) { bitmap.close(); return file; }

  try {
    ctx.drawImage(bitmap, 0, 0, width, height);
  } catch {
    bitmap.close();
    return file;
  }
  bitmap.close();

  return new Promise<File>((resolve) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            // Compression made it bigger (rare) — keep original
            resolve(file);
            return;
          }
          const stem = file.name.replace(/\.[^.]+$/, '');
          const ext  = outputType === 'image/webp' ? 'webp' : 'jpg';
          resolve(new File([blob], `${stem}.${ext}`, {
            type:         outputType,
            lastModified: Date.now(),
          }));
        },
        outputType,
        quality,
      );
    } catch {
      resolve(file);
    }
  });
}

/**
 * Compress specifically for bug report screenshots.
 * Smaller target: max 1280px, 0.75 quality — screenshots don't need full res.
 */
export async function compressScreenshot(file: File): Promise<File> {
  return compressImage(file, { maxPx: 1280, quality: 0.75 });
}

/**
 * Estimate the compressed size without actually compressing.
 * Returns a rough estimate based on dimensions and quality.
 * Used for storage budget checks.
 */
export function estimateCompressedSize(
  originalSize: number,
  opts: CompressOptions = {},
): number {
  const { quality = 0.85 } = opts;
  // Rough heuristic: JPEG at 0.85q ≈ 30–40% of raw PNG, ~60% of original JPEG
  return Math.round(originalSize * quality * 0.5);
}
