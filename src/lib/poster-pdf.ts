/**
 * poster-pdf.ts
 *
 * Client-side PDF export for safety posters.
 *
 * Flow:
 *   1. Wait for fonts to be ready.
 *   2. Capture the rendered poster DOM element as a PNG via html-to-image
 *      at 2× pixel ratio so text is crisp.
 *   3. Embed the PNG into a single A4 page using pdf-lib, centred and
 *      scaled to fill the page while preserving the poster's aspect ratio.
 *   4. Trigger a browser download with the supplied filename.
 *
 * This is the ONLY PDF generation path for safety posters.
 * There is no server-side visual renderer — the React component IS the
 * single source of truth for the poster design.
 */

export async function downloadPosterAsPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  // Lazy-import heavy libs so they don't bloat the initial bundle
  const [{ toPng }, { PDFDocument }] = await Promise.all([
    import('html-to-image'),
    import('pdf-lib'),
  ]);

  // Wait for web fonts so text renders correctly in the capture
  await document.fonts.ready;

  // Capture at 2× for retina-quality output
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    // Ensure the full poster is captured even if it overflows its container
    width: element.scrollWidth,
    height: element.scrollHeight,
    style: {
      // Remove any transform scale applied for the preview viewport
      transform: 'none',
      transformOrigin: 'top left',
    },
  });

  // A4 in points (72 pt/inch)
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 24; // pt padding on all sides

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Decode the PNG and embed it
  const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Scale to fill the printable area while preserving aspect ratio
  const maxW = PAGE_W - MARGIN * 2;
  const maxH = PAGE_H - MARGIN * 2;
  const { width: imgW, height: imgH } = pngImage;
  const scale = Math.min(maxW / imgW, maxH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;

  // Centre on the page
  const x = (PAGE_W - drawW) / 2;
  const y = (PAGE_H - drawH) / 2;

  page.drawImage(pngImage, { x, y, width: drawW, height: drawH });

  const pdfBytes = await pdfDoc.save();

  // Trigger download
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
