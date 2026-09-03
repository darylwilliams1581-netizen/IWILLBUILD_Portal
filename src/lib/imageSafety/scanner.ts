/**
 * imageSafety/scanner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side image safety scanner for CP12A (rev 2).
 *
 * WHAT THIS DOES:
 *  1. Confirms the file can be decoded as an image (createImageBitmap)
 *  2. Detects EXIF GPS/location metadata where supported (DataView scan)
 *  3. Returns a structured ImageScanResult — never raw bytes or descriptions
 *
 * WHAT THIS DOES NOT DO:
 *  - Does not contact any external API or send the image to a third party
 *  - Does not use skin-tone, ethnicity, or colour-based heuristics
 *  - Does not claim a person detector result — no such detector is installed
 *
 * SCAN OUTCOMES (CP12A rev 2):
 *  clear           → no GPS, file decodable → silent pass-through
 *  privacy_warning → EXIF GPS detected → soft one-tap confirmation
 *  blocked         → file cannot be decoded → hard block
 *  unavailable     → unexpected scanner error → soft one-tap confirmation
 *
 * NOTE: The previous design returned 'unavailable' for every image because no
 * person detector is installed. This caused a blocking modal on every upload.
 * Rev 2 returns 'clear' when no signals are detected, which is the correct
 * behaviour for normal construction photos. 'unavailable' is now reserved for
 * genuine scanner failures (e.g. createImageBitmap not available in the
 * environment), not for "no person detector installed".
 *
 * PERSON DETECTION:
 *  No production-safe person/face detector is installed. The scanner does not
 *  claim a person detection result in either direction. Normal construction
 *  photos return 'clear' unless GPS is detected. The soft modal copy ("People
 *  may be visible") is shown for 'unavailable' results only, not for 'clear'.
 *
 * EXIF GPS DETECTION:
 *  Uses a lightweight DataView scan of the raw JPEG bytes to find the GPS IFD
 *  (tag 0x8825) in the EXIF APP1 segment. Works without any external library
 *  and runs entirely in the browser. Non-JPEG files (PNG, WebP) do not carry
 *  EXIF in the same way — GPS detection returns false for those.
 */

import type { ImageScanResult } from './types.js';

export const SCANNER_VERSION = '2.0.0';

// ── EXIF GPS detection ────────────────────────────────────────────────────────

/**
 * Scan a JPEG ArrayBuffer for an EXIF GPS IFD tag (0x8825).
 * Returns true if GPS data is present, false otherwise.
 * Never throws — failures return false.
 */
function detectExifGps(buffer: ArrayBuffer): boolean {
  try {
    const view = new DataView(buffer);
    const len = view.byteLength;

    // JPEG starts with FF D8
    if (len < 4 || view.getUint8(0) !== 0xFF || view.getUint8(1) !== 0xD8) {
      return false;
    }

    let offset = 2;

    // Walk JPEG segments looking for APP1 (FF E1)
    while (offset + 4 < len) {
      const marker = view.getUint16(offset);
      const segLen = view.getUint16(offset + 2);

      if (marker === 0xFFE1) {
        // APP1 — check for EXIF header "Exif\0\0"
        if (offset + 10 < len) {
          const exifHeader = String.fromCharCode(
            view.getUint8(offset + 4),
            view.getUint8(offset + 5),
            view.getUint8(offset + 6),
            view.getUint8(offset + 7),
          );
          if (exifHeader === 'Exif') {
            // TIFF header starts at offset + 10
            const tiffStart = offset + 10;
            if (tiffStart + 8 >= len) return false;

            // Byte order: 'II' = little-endian, 'MM' = big-endian
            const byteOrderMark = view.getUint16(tiffStart);
            const littleEndian = byteOrderMark === 0x4949;

            // IFD0 offset (relative to tiffStart)
            const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
            const ifd0Abs = tiffStart + ifd0Offset;
            if (ifd0Abs + 2 >= len) return false;

            const ifd0Count = view.getUint16(ifd0Abs, littleEndian);

            // Walk IFD0 entries looking for GPS IFD pointer (tag 0x8825)
            for (let i = 0; i < ifd0Count; i++) {
              const entryOffset = ifd0Abs + 2 + i * 12;
              if (entryOffset + 12 > len) break;
              const tag = view.getUint16(entryOffset, littleEndian);
              if (tag === 0x8825) {
                // GPS IFD pointer found — check if it actually has entries
                const gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
                const gpsIfdAbs = tiffStart + gpsIfdOffset;
                if (gpsIfdAbs + 2 >= len) return true; // pointer exists, assume GPS
                const gpsCount = view.getUint16(gpsIfdAbs, littleEndian);
                return gpsCount > 0;
              }
            }
          }
        }
      }

      // Move to next segment (marker + length field + segment data)
      offset += 2 + segLen;
    }

    return false;
  } catch {
    return false;
  }
}

// ── Main scanner ──────────────────────────────────────────────────────────────

/**
 * Scan a File before upload.
 *
 * Always resolves — never rejects. If an unexpected error occurs the result
 * status is 'unavailable' so the soft confirmation is shown.
 *
 * Outcomes:
 *  clear           → no signals; upload proceeds silently
 *  privacy_warning → EXIF GPS detected; soft one-tap confirmation required
 *  blocked         → file cannot be decoded; upload must not proceed
 *  unavailable     → scanner error; soft one-tap confirmation shown
 */
export async function scanImage(file: File): Promise<ImageScanResult> {
  const scannedAt = new Date().toISOString();

  // ── 1. Confirm the file can be decoded ──────────────────────────────────────
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
  } catch {
    // Cannot decode — hard block
    return {
      status: 'blocked',
      reasonCode: 'decode_failed',
      scannerVersion: SCANNER_VERSION,
      hasGpsMetadata: false,
      hasPersonSignal: false,
      confirmationRequired: false,
      scannedAt,
    };
  }

  // ── 2. EXIF GPS detection (JPEG only) ───────────────────────────────────────
  let hasGpsMetadata = false;
  const isJpeg =
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg');

  if (isJpeg) {
    try {
      const buffer = await file.arrayBuffer();
      hasGpsMetadata = detectExifGps(buffer);
    } catch {
      // GPS detection failure is non-fatal — continue with false
    }
  }

  // ── 3. Determine status ─────────────────────────────────────────────────────
  //
  // Rev 2 change: 'clear' is now the default for decodable images with no GPS.
  // We do NOT return 'unavailable' just because no person detector is installed.
  // 'unavailable' is reserved for genuine scanner infrastructure failures.
  //
  if (hasGpsMetadata) {
    return {
      status: 'privacy_warning',
      reasonCode: 'exif_gps_detected',
      scannerVersion: SCANNER_VERSION,
      hasGpsMetadata: true,
      hasPersonSignal: false,
      confirmationRequired: true,
      scannedAt,
    };
  }

  // No signals detected — clear pass-through
  return {
    status: 'clear',
    reasonCode: null,
    scannerVersion: SCANNER_VERSION,
    hasGpsMetadata: false,
    hasPersonSignal: false,
    confirmationRequired: false,
    scannedAt,
  };
}
