/**
 * Minimal pure-JS PDF text extractor.
 *
 * Reads raw text streams from the PDF binary without any external dependencies.
 * Handles the most common PDF text operators: Tj, TJ, ', ".
 * Works for text-based PDFs; scanned/image PDFs will return empty text.
 *
 * No pdfjs-dist, no pdf-parse — zero bundle impact.
 */

export interface PdfTextResult {
  text: string;
  pageCount: number;
  warnings: string[];
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const warnings: string[] = [];

  try {
    const raw = buffer.toString('latin1');

    // Verify it's a PDF
    if (!raw.startsWith('%PDF')) {
      return { text: '', pageCount: 0, warnings: ['Not a valid PDF file'] };
    }

    // Count pages via /Type /Page entries
    const pageMatches = raw.match(/\/Type\s*\/Page[^s]/g);
    const pageCount = pageMatches ? pageMatches.length : 1;

    // Extract all content streams
    const text = extractTextFromStreams(raw);

    if (!text.trim()) {
      warnings.push('No extractable text found — this may be a scanned or image-only PDF.');
    }

    return { text, pageCount, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: '', pageCount: 0, warnings: [`PDF parsing error: ${msg}`] };
  }
}

function extractTextFromStreams(raw: string): string {
  const parts: string[] = [];

  // Find all stream...endstream blocks
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch: RegExpExecArray | null;

  while ((streamMatch = streamRe.exec(raw)) !== null) {
    const streamData = streamMatch[1];

    // Skip binary/compressed streams (contain non-printable chars heavily)
    const nonPrintable = (streamData.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) || []).length;
    if (nonPrintable > streamData.length * 0.1) continue;

    // Extract text from PDF content stream operators
    const streamText = extractTextOperators(streamData);
    if (streamText.trim()) {
      parts.push(streamText);
    }
  }

  return parts.join('\n');
}

function extractTextOperators(stream: string): string {
  const lines: string[] = [];
  let current = '';

  // Match text blocks: BT ... ET
  const btRe = /BT([\s\S]*?)ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRe.exec(stream)) !== null) {
    const block = btMatch[1];
    const blockText = extractFromBlock(block);
    if (blockText.trim()) {
      lines.push(blockText);
    }
  }

  // Also try extracting Tj/TJ outside BT/ET (some PDFs omit them)
  if (lines.length === 0) {
    current = extractFromBlock(stream);
    if (current.trim()) lines.push(current);
  }

  return lines.join('\n');
}

function extractFromBlock(block: string): string {
  const parts: string[] = [];

  // Tj operator: (text) Tj
  const tjRe = /\(([^)]*(?:\)[^)]*)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRe.exec(block)) !== null) {
    parts.push(decodePdfString(m[1]));
  }

  // TJ operator: [(text) spacing (text) ...] TJ
  const tjArrayRe = /\[([\s\S]*?)\]\s*TJ/g;
  while ((m = tjArrayRe.exec(block)) !== null) {
    const arrayContent = m[1];
    const stringRe = /\(([^)]*(?:\)[^)]*)*)\)/g;
    let sm: RegExpExecArray | null;
    const arrayParts: string[] = [];
    while ((sm = stringRe.exec(arrayContent)) !== null) {
      arrayParts.push(decodePdfString(sm[1]));
    }
    if (arrayParts.length > 0) {
      parts.push(arrayParts.join(''));
    }
  }

  // ' operator: (text) ' — same as Tj but also moves to next line
  const quoteRe = /\(([^)]*(?:\)[^)]*)*)\)\s*'/g;
  while ((m = quoteRe.exec(block)) !== null) {
    parts.push('\n' + decodePdfString(m[1]));
  }

  return parts.join('');
}

function decodePdfString(s: string): string {
  // Unescape PDF string escape sequences
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    // Remove non-printable chars except newlines/tabs
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}
