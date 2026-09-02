/** Server-side completed-form PDF generation with embedded photo bytes. */
import type {
  PDFDocument as PDFDocumentType,
  PDFFont,
  PDFImage,
  PDFPage,
  RGB,
} from 'pdf-lib';

export interface FormPdfField {
  id: number;
  label: string;
  fieldType: string;
  required?: boolean | null;
  settingsJson?: string | null;
}

export interface FormPdfImage {
  bytes: Uint8Array;
  mimeType: string;
  fullBytes?: Uint8Array;   // full-resolution bytes for the appendix
  fullMimeType?: string;
  label?: string;           // field label for appendix heading
}

export interface FormSubmissionPdfData {
  title: string;
  status: string;
  companyName?: string;
  jobNumber?: string;
  jobName?: string;
  jobAddress?: string;
  completedBy?: string;
  completedAt?: string;
  footerText?: string;
  disclaimer?: string;
  fields: FormPdfField[];
  answers: Record<string, unknown>;
  fieldImages?: Record<string, FormPdfImage[]>;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 46;
const HEADER_H = 78;
const FOOTER_H = 34;
const CONTENT_W = PAGE_W - MARGIN * 2;

function printable(value: unknown): string {
  return String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/[^\x20-\x7E\n\r\t]/g, '?');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = printable(text).split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
          current = word;
        } else {
          let chunk = '';
          for (const char of word) {
            const next = chunk + char;
            if (font.widthOfTextAtSize(next, size) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk = next;
            }
          }
          current = chunk;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

function fitImage(image: PDFImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

function formatAnswer(field: FormPdfField, value: unknown): string {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return 'No answer';
  }
  if (field.fieldType === 'yes_no') return String(value).toLowerCase() === 'yes' ? 'Yes' : 'No';
  if (field.fieldType === 'checkbox') return value === true ? 'Checked' : 'Unchecked';
  if (Array.isArray(value)) return value.map(printable).join(', ');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (field.fieldType === 'location') {
      if (obj.address) return printable(obj.address);
      if (obj.lat !== undefined && obj.lng !== undefined) return `${printable(obj.lat)}, ${printable(obj.lng)}`;
    }
    if (field.fieldType === 'signature') {
      if (Array.isArray(obj.signers)) {
        const names = obj.signers.map((signer) => printable((signer as Record<string, unknown>).name)).filter(Boolean);
        return names.length ? `Signed by ${names.join(', ')}` : 'Signature captured';
      }
      return obj.name ? `Signed by ${printable(obj.name)}` : 'Signature captured';
    }
    try { return printable(JSON.stringify(obj)); } catch { return 'Recorded'; }
  }
  return printable(value);
}

async function embedImage(doc: PDFDocumentType, input: FormPdfImage): Promise<PDFImage | null> {
  try {
    const mime = input.mimeType.toLowerCase();
    if (mime.includes('png')) return await doc.embedPng(input.bytes);
    if (mime.includes('jpeg') || mime.includes('jpg')) return await doc.embedJpg(input.bytes);
    try { return await doc.embedJpg(input.bytes); } catch { return await doc.embedPng(input.bytes); }
  } catch {
    return null;
  }
}

export async function generateFormSubmissionPdf(data: FormSubmissionPdfData): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const PURPLE = rgb(0.486, 0.227, 0.929);
  const DARK = rgb(0.059, 0.090, 0.165);
  const SLATE = rgb(0.286, 0.333, 0.412);
  const MUTED = rgb(0.392, 0.455, 0.545);
  const LIGHT = rgb(0.945, 0.957, 0.976);
  const BORDER = rgb(0.886, 0.910, 0.941);
  const WHITE = rgb(1, 1, 1);
  const GREEN = rgb(0.024, 0.588, 0.412);

  const pages: PDFPage[] = [];
  // addPage() is called before any drawing; the assertion keeps that runtime
  // invariant explicit without forcing an unused placeholder page.
  let page!: PDFPage;
  let y = 0;

  function drawHeader(target: PDFPage) {
    // Printer-friendly header: 3pt accent rule + plain dark text on white
    target.drawLine({ start: { x: 0, y: PAGE_H - 3 }, end: { x: PAGE_W, y: PAGE_H - 3 }, thickness: 3, color: PURPLE });
    target.drawText(printable(data.title).slice(0, 72), {
      x: MARGIN, y: PAGE_H - 28, font: bold, size: 16, color: DARK,
    });
    if (data.companyName) {
      target.drawText(printable(data.companyName).slice(0, 60), {
        x: MARGIN, y: PAGE_H - 46, font: regular, size: 8.5, color: MUTED,
      });
    }
    // Status — text prefix, no filled badge
    const status = printable(data.status || 'Completed').toUpperCase();
    const statusW = bold.widthOfTextAtSize(status, 9);
    target.drawText(status, {
      x: PAGE_W - MARGIN - statusW, y: PAGE_H - 28, font: bold, size: 9, color: GREEN,
    });
    // Thin separator rule
    target.drawLine({ start: { x: MARGIN, y: PAGE_H - HEADER_H }, end: { x: PAGE_W - MARGIN, y: PAGE_H - HEADER_H }, thickness: 0.5, color: BORDER });
  }

  function addPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    drawHeader(page);
    y = PAGE_H - HEADER_H - 24;
  }

  function ensureSpace(height: number) {
    if (y - height < FOOTER_H + 18) addPage();
  }

  function drawLines(lines: string[], options: {
    x?: number; size?: number; color?: RGB; font?: PDFFont; maxWidth?: number; lineHeight?: number;
  } = {}) {
    const x = options.x ?? MARGIN;
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const color = options.color ?? DARK;
    const maxWidth = options.maxWidth ?? CONTENT_W;
    const lineHeight = options.lineHeight ?? size + 4;
    const wrapped = lines.flatMap((line) => wrapText(line, font, size, maxWidth));
    ensureSpace(Math.max(lineHeight, wrapped.length * lineHeight));
    for (const line of wrapped) {
      page.drawText(line || ' ', { x, y, font, size, color });
      y -= lineHeight;
    }
  }

  addPage();

  // Submission metadata.
  const metadata = [
    data.jobNumber ? `Job: ${data.jobNumber}${data.jobName ? ` - ${data.jobName}` : ''}` : (data.jobName ? `Job: ${data.jobName}` : ''),
    data.jobAddress ? `Site: ${data.jobAddress}` : '',
    data.completedBy ? `Completed by: ${data.completedBy}` : '',
    data.completedAt ? `Date: ${data.completedAt}` : '',
  ].filter(Boolean);
  if (metadata.length) {
    const metaHeight = metadata.length * 15 + 18;
    page.drawRectangle({ x: MARGIN, y: y - metaHeight + 8, width: CONTENT_W, height: metaHeight, color: LIGHT, borderColor: BORDER, borderWidth: 0.7 });
    y -= 8;
    for (const line of metadata) {
      drawLines([line], { x: MARGIN + 12, size: 9, color: SLATE, maxWidth: CONTENT_W - 24, lineHeight: 15 });
    }
    y -= 10;
  }

  for (const field of data.fields) {
    if (field.fieldType === 'page_break') {
      addPage();
      continue;
    }
    if (field.fieldType === 'section') {
      ensureSpace(34);
      page.drawRectangle({ x: MARGIN, y: y - 19, width: CONTENT_W, height: 23, color: LIGHT });
      page.drawText(printable(field.label).toUpperCase(), { x: MARGIN + 8, y: y - 11, font: bold, size: 9, color: SLATE });
      y -= 34;
      continue;
    }
    if (field.fieldType === 'instruction' || field.fieldType === 'instruction_image') {
      const lines = wrapText(field.label, italic, 9, CONTENT_W - 20);
      const height = lines.length * 13 + 18;
      ensureSpace(height);
      page.drawRectangle({ x: MARGIN, y: y - height + 8, width: CONTENT_W, height, color: rgb(0.937, 0.965, 1), borderColor: rgb(0.75, 0.85, 0.98), borderWidth: 0.7 });
      y -= 6;
      drawLines(lines, { x: MARGIN + 10, size: 9, color: SLATE, font: italic, maxWidth: CONTENT_W - 20, lineHeight: 13 });
      y -= 10;
      continue;
    }

    const value = data.answers[String(field.id)];
    const imageInputs = data.fieldImages?.[String(field.id)] ?? [];
    const isImageField = field.fieldType === 'photo' || field.fieldType === 'signature';

    ensureSpace(44);
    page.drawText(`${printable(field.label).toUpperCase()}${field.required ? ' *' : ''}`, {
      x: MARGIN, y, font: bold, size: 8.5, color: MUTED,
    });
    y -= 17;

    if (isImageField && imageInputs.length > 0) {
      const embedded = (await Promise.all(imageInputs.map((image) => embedImage(doc, image)))).filter((image): image is PDFImage => image !== null);
      if (embedded.length > 0) {
        if (field.fieldType === 'photo') {
          // ── Inline thumbnails: 3 per row, small ──
          const THUMB_COLS = 3;
          const THUMB_GAP = 8;
          const THUMB_W = (CONTENT_W - THUMB_GAP * (THUMB_COLS - 1)) / THUMB_COLS;
          const THUMB_H = THUMB_W * 0.75;
          for (let index = 0; index < embedded.length; index += THUMB_COLS) {
            ensureSpace(THUMB_H + 10);
            for (let col = 0; col < THUMB_COLS; col++) {
              const image = embedded[index + col];
              if (!image) continue;
              const x = MARGIN + col * (THUMB_W + THUMB_GAP);
              page.drawRectangle({ x, y: y - THUMB_H, width: THUMB_W, height: THUMB_H, color: WHITE, borderColor: BORDER, borderWidth: 0.8 });
              const fitted = fitImage(image, THUMB_W - 4, THUMB_H - 4);
              page.drawImage(image, {
                x: x + (THUMB_W - fitted.width) / 2,
                y: y - THUMB_H + (THUMB_H - fitted.height) / 2,
                width: fitted.width,
                height: fitted.height,
              });
            }
            y -= THUMB_H + 8;
          }
          const photoCount = embedded.length;
          drawLines([`${photoCount} photo${photoCount === 1 ? '' : 's'} — full size at end of document`], { size: 8, color: MUTED, font: italic, lineHeight: 12 });
        } else {
          // signatures: single column
          const columns = 1;
          const gap = 12;
          const boxWidth = Math.min(300, CONTENT_W);
          const boxHeight = 100;
          for (let index = 0; index < embedded.length; index += columns) {
            ensureSpace(boxHeight + 14);
            for (let column = 0; column < columns; column++) {
              const image = embedded[index + column];
              if (!image) continue;
              const x = MARGIN + column * (boxWidth + gap);
              page.drawRectangle({ x, y: y - boxHeight, width: boxWidth, height: boxHeight, color: WHITE, borderColor: BORDER, borderWidth: 0.8 });
              const fitted = fitImage(image, boxWidth - 8, boxHeight - 8);
              page.drawImage(image, {
                x: x + (boxWidth - fitted.width) / 2,
                y: y - boxHeight + (boxHeight - fitted.height) / 2,
                width: fitted.width,
                height: fitted.height,
              });
            }
            y -= boxHeight + 12;
          }
          const caption = formatAnswer(field, value);
          if (caption !== 'Signature captured') {
            drawLines([caption], { size: 9, color: SLATE, lineHeight: 13 });
          }
        }
      } else {
        drawLines(['Image could not be embedded'], { size: 9, color: MUTED, font: italic, lineHeight: 14 });
      }
    } else if (field.fieldType === 'photo') {
      const hasPhotoAnswer = value !== null && value !== undefined && value !== '';
      drawLines([hasPhotoAnswer ? 'Photo could not be loaded' : 'No photo'], { size: 9, color: MUTED, font: italic, lineHeight: 14 });
    } else {
      drawLines([formatAnswer(field, value)], { size: 10.5, color: DARK, lineHeight: 15 });
    }

    y -= 9;
    ensureSpace(10);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.55, color: BORDER });
    y -= 15;
  }

  if (data.disclaimer) {
    ensureSpace(50);
    drawLines(['Disclaimer'], { font: bold, size: 8.5, color: MUTED, lineHeight: 14 });
    drawLines([data.disclaimer], { size: 8.5, color: MUTED, lineHeight: 12 });
  }

  // ── Photo appendix: full-size images, one per page, clean header ─────────────
  const photoFields = data.fields.filter((f) => f.fieldType === 'photo');

  // Collect unique images — deduplicate by bytes reference (same object = same fetch)
  const appendixEntries: Array<{ label: string; image: PDFImage }> = [];
  const embeddedSet = new Set<Uint8Array>();
  for (const field of photoFields) {
    const images = data.fieldImages?.[String(field.id)] ?? [];
    for (const img of images) {
      // Use fullBytes for appendix if available, else fall back to thumb bytes
      const srcBytes = img.fullBytes ?? img.bytes;
      const srcMime = img.fullMimeType ?? img.mimeType;
      // Skip if we've already embedded this exact buffer (deduplication)
      if (embeddedSet.has(srcBytes)) continue;
      embeddedSet.add(srcBytes);
      const embedded = await embedImage(doc, { bytes: srcBytes, mimeType: srcMime });
      if (embedded) appendixEntries.push({ label: field.label, image: embedded });
    }
  }

  if (appendixEntries.length > 0) {
    // Appendix pages use a lighter header (no purple band — just a title bar)
    function addAppendixPage(pageTitle: string) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(page);
      page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: LIGHT });
      page.drawText(printable(pageTitle).slice(0, 72), {
        x: MARGIN, y: PAGE_H - 35, font: bold, size: 14, color: SLATE,
      });
      page.drawText('PHOTO APPENDIX', {
        x: MARGIN, y: PAGE_H - 55, font: regular, size: 8.5, color: MUTED,
      });
      y = PAGE_H - HEADER_H - 24;
    }

    const FULL_W = CONTENT_W;
    // Max height for a single image: full content area minus label row
    const MAX_IMG_H = PAGE_H - HEADER_H - FOOTER_H - 50;

    for (const { label, image } of appendixEntries) {
      // Each photo gets its own fresh page — no overflow, no blank pages
      addAppendixPage(printable(data.title));

      // Label
      page.drawText(printable(label).toUpperCase(), {
        x: MARGIN, y, font: bold, size: 8.5, color: MUTED,
      });
      y -= 16;

      // Scale image to fit within the available area
      const dims = image.scale(1);
      const ratio = Math.min(FULL_W / dims.width, MAX_IMG_H / dims.height, 1);
      const drawW = dims.width * ratio;
      const drawH = dims.height * ratio;

      const imgX = MARGIN + (FULL_W - drawW) / 2;
      page.drawRectangle({ x: imgX - 2, y: y - drawH - 2, width: drawW + 4, height: drawH + 4, color: WHITE, borderColor: BORDER, borderWidth: 0.8 });
      page.drawImage(image, { x: imgX, y: y - drawH, width: drawW, height: drawH });
      y -= drawH + 12;
    }
  }

  pages.forEach((target, index) => {
    target.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE_W - MARGIN, y: 30 }, thickness: 0.55, color: BORDER });
    target.drawText(printable(data.footerText || data.companyName || 'IWIllBUILD'), {
      x: MARGIN, y: 16, font: regular, size: 7.5, color: MUTED,
    });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    target.drawText(pageLabel, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(pageLabel, 7.5), y: 16, font: regular, size: 7.5, color: MUTED,
    });
  });

  return doc.save();
}
