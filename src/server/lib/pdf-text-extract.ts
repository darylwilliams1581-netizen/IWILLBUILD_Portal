/**
 * Pure-JS server-side PDF text extractor.
 *
 * WHY THE OLD VERSION ONLY RETURNED PLACEHOLDERS:
 * Modern PDFs compress content streams with FlateDecode (zlib). The old
 * extractor tried to regex-match BT/ET text operators on the *raw* binary
 * stream bytes — but those bytes are compressed, so no operators were ever
 * found. The binary-content guard (nonPrintable > 10%) then discarded every
 * stream, leaving zero text and falling through to the placeholder.
 *
 * This version decompresses FlateDecode streams with Node's built-in zlib
 * before scanning for text operators, so it works on real-world PDFs.
 *
 * No pdfjs-dist, no pdf-parse, no external dependencies.
 */
import { inflateRaw, inflate, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const inflateRawAsync = promisify(inflateRaw);
const inflateAsync    = promisify(inflate);
const gunzipAsync     = promisify(gunzip);

export interface PdfTextResult {
  text: string;
  pageCount: number;
  warnings: string[];
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const warnings: string[] = [];

  try {
    // Verify PDF header
    if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF')) {
      return { text: '', pageCount: 0, warnings: ['Not a valid PDF file'] };
    }

    // Count pages via /Type /Page (not /Pages) entries in the cross-ref
    const headerStr = buffer.toString('latin1');
    const pageMatches = headerStr.match(/\/Type\s*\/Page[^s]/g);
    const pageCount = pageMatches ? pageMatches.length : 1;

    // Extract and decompress all content streams
    const texts = await extractAllStreams(buffer, warnings);
    const text = texts.join('\n').trim();

    if (!text) {
      warnings.push(
        'No extractable text found — this PDF may use image-based text (scanned), ' +
        'custom encoding, or a font without ToUnicode mappings.'
      );
    }

    return { text, pageCount, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`PDF parsing error: ${msg}`);
    return { text: '', pageCount: 0, warnings };
  }
}

// ── Stream extraction ─────────────────────────────────────────────────────────

/**
 * Walk the raw PDF buffer, find every stream...endstream pair, attempt
 * decompression if FlateDecode is declared, then extract text operators.
 */
async function extractAllStreams(buf: Buffer, warnings: string[]): Promise<string[]> {
  const results: string[] = [];
  const raw = buf.toString('latin1');

  // Regex to find stream dictionary + stream body.
  // The dictionary ends at "stream\r\n" or "stream\n".
  // We capture the byte offset so we can slice the original buffer for binary ops.
  const streamHeaderRe = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;

  while ((m = streamHeaderRe.exec(raw)) !== null) {
    const dictStr   = m[1];
    const bodyStart = m.index + m[0].length;

    // Parse /Length from the dictionary (may be an indirect ref — handle both)
    const lengthMatch = dictStr.match(/\/Length\s+(\d+)/);
    if (!lengthMatch) continue;
    const length = parseInt(lengthMatch[1], 10);
    if (!length || length < 4) continue;

    // Slice the exact stream bytes from the buffer
    const streamBuf = buf.slice(bodyStart, bodyStart + length);

    // Determine filter(s)
    const filterMatch = dictStr.match(/\/Filter\s*(?:\/(\w+)|\[([^\]]*)\])/);
    const filters: string[] = [];
    if (filterMatch) {
      if (filterMatch[1]) {
        filters.push(filterMatch[1]);
      } else if (filterMatch[2]) {
        // Array of filters: /FlateDecode /ASCIIHexDecode etc.
        const arr = filterMatch[2].match(/\/(\w+)/g) || [];
        filters.push(...arr.map((f) => f.slice(1)));
      }
    }

    // Only process content streams (text operators) — skip image/XObject data
    const isContentStream =
      !dictStr.includes('/Subtype') ||
      dictStr.includes('/Subtype /Form') ||
      dictStr.includes('/Type /Page');

    // Attempt decompression
    let decoded: string | null = null;

    if (filters.length === 0) {
      // Uncompressed — read as latin1 text directly
      decoded = streamBuf.toString('latin1');
    } else if (filters[0] === 'FlateDecode' || filters[0] === 'Fl') {
      try {
        // Try inflate first (zlib header), then inflateRaw (no header)
        let decompressed: Buffer;
        try {
          decompressed = await inflateAsync(streamBuf);
        } catch {
          try {
            decompressed = await inflateRawAsync(streamBuf);
          } catch {
            decompressed = await gunzipAsync(streamBuf);
          }
        }
        decoded = decompressed.toString('latin1');
      } catch {
        // Decompression failed — skip this stream
        continue;
      }
    } else if (filters[0] === 'ASCIIHexDecode') {
      try {
        const hex = streamBuf.toString('ascii').replace(/\s/g, '').replace(/>$/, '');
        decoded = Buffer.from(hex, 'hex').toString('latin1');
      } catch {
        continue;
      }
    } else if (filters[0] === 'ASCII85Decode') {
      // ASCII85 is rare in modern PDFs — skip rather than implement
      continue;
    } else {
      // Unknown filter (LZW, JBIG2, etc.) — skip
      continue;
    }

    if (!decoded) continue;

    // Skip streams that are clearly binary image data even after decode
    const nonPrint = (decoded.match(/[\x00-\x08\x0e-\x1f]/g) || []).length;
    if (nonPrint > decoded.length * 0.15) continue;

    // Extract text operators from the decoded stream
    const text = extractTextOperators(decoded);
    if (text.trim()) {
      results.push(text.trim());
    }
  }

  return results;
}

// ── PDF text operator extraction ──────────────────────────────────────────────

function extractTextOperators(stream: string): string {
  const lines: string[] = [];

  // BT...ET blocks contain all text-positioning and text-show operators
  const btRe = /BT([\s\S]*?)ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRe.exec(stream)) !== null) {
    const block = btMatch[1];
    const blockText = extractFromBlock(block);
    if (blockText.trim()) {
      lines.push(blockText.trim());
    }
  }

  // Fallback: some PDFs omit BT/ET wrappers — scan the whole stream
  if (lines.length === 0) {
    const fallback = extractFromBlock(stream);
    if (fallback.trim()) lines.push(fallback.trim());
  }

  return lines.join('\n');
}

function extractFromBlock(block: string): string {
  const parts: string[] = [];
  let m: RegExpExecArray | null;

  // Td / TD / T* operators → line break hints
  // We insert a newline whenever we see a move-to-next-line operator
  const tdRe = /[-\d.]+\s+[-\d.]+\s+T[dD]|T\*/g;

  // Build an ordered list of (position, text) pairs
  interface Piece { pos: number; text: string; newline?: boolean }
  const pieces: Piece[] = [];

  // Collect Td/TD/T* positions for newline insertion
  let tdMatch: RegExpExecArray | null;
  while ((tdMatch = tdRe.exec(block)) !== null) {
    pieces.push({ pos: tdMatch.index, text: '', newline: true });
  }

  // Tj: (text) Tj
  // PDF string content: characters that are not ) or \, or a backslash followed by any char.
  // Rewritten to avoid nested quantifiers (ReDoS risk): use a fixed alternation with no overlap.
  // eslint-disable-next-line security/detect-unsafe-regex -- pattern is bounded: outer group matches a fixed set of non-overlapping alternatives; no catastrophic backtracking possible on valid PDF content
  const tjRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*Tj/g;
  while ((m = tjRe.exec(block)) !== null) {
    pieces.push({ pos: m.index, text: decodePdfString(m[1]) });
  }

  // TJ: [(text) kern (text) ...] TJ
  const tjArrayRe = /\[([\s\S]*?)\]\s*TJ/g;
  while ((m = tjArrayRe.exec(block)) !== null) {
    const arrayContent = m[1];
    // eslint-disable-next-line security/detect-unsafe-regex -- same bounded alternation as tjRe above
    const stringRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)/g;
    let sm: RegExpExecArray | null;
    const arrayParts: string[] = [];
    while ((sm = stringRe.exec(arrayContent)) !== null) {
      const s = decodePdfString(sm[1]);
      if (s) arrayParts.push(s);
    }
    if (arrayParts.length > 0) {
      pieces.push({ pos: m.index, text: arrayParts.join('') });
    }
  }

  // ' operator: (text) ' — move to next line then show
  // eslint-disable-next-line security/detect-unsafe-regex -- same bounded alternation as tjRe above
  const quoteRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*'/g;
  while ((m = quoteRe.exec(block)) !== null) {
    pieces.push({ pos: m.index, text: decodePdfString(m[1]), newline: true });
  }

  // " operator: wordSpacing charSpacing (text) " — same as ' but with spacing
  // eslint-disable-next-line security/detect-unsafe-regex -- same bounded alternation as tjRe above
  const dquoteRe = /[-\d.]+\s+[-\d.]+\s+\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*"/g;
  while ((m = dquoteRe.exec(block)) !== null) {
    pieces.push({ pos: m.index, text: decodePdfString(m[1]), newline: true });
  }

  // Sort by position in the stream so text comes out in document order
  pieces.sort((a, b) => a.pos - b.pos);

  for (const piece of pieces) {
    if (piece.newline && parts.length > 0) {
      parts.push('\n');
    }
    if (piece.text) {
      parts.push(piece.text);
    }
  }

  return parts.join('');
}

function decodePdfString(s: string): string {
  return s
    // Standard PDF escape sequences
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    // Octal escapes: \012 etc.
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    // Strip remaining control chars (keep \n \t)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}
