/**
 * Auto-detect import modal — focused tests
 * ─────────────────────────────────────────────────────────────────────────────
 * A1  No Word/PDF tabs are shown
 * A2  One drop zone accepts DOCX and PDF
 * A3  Real PDF is automatically detected and routed to import-pdf
 * A4  Real DOCX is automatically detected and routed to import-docx
 * A5  MIME type alone is not trusted — detection uses bytes
 * A6  Renamed PDF with .docx extension is rejected
 * A7  Renamed DOCX with .pdf extension is rejected
 * A8  Corrupt ZIP/DOCX is rejected
 * A9  Invalid PDF signature is rejected
 * A10 Old .doc gets the conversion guidance message
 * A11 Unsupported files are rejected
 * A12 Failure keeps the modal open and does not navigate
 * A13 Failure creates no partial document or assets (fetch not called on bad file)
 * A14 Import cannot be submitted twice (button disabled while importing)
 * A15 Long filenames do not cause horizontal scrolling (overflow-wrap style)
 * A16 Existing DOCX and PDF importer regression — server routes are unchanged
 *
 * Detection tests (detectFileType unit)
 * ──────────────────────────────────────
 * D1  PDF magic bytes → type 'pdf'
 * D2  DOCX ZIP magic + required entries → type 'docx'
 * D3  PDF bytes with .docx extension → error (mismatch)
 * D4  DOCX bytes with .pdf extension → error (mismatch)
 * D5  OLE2 magic (.doc) → type 'doc' with guidance message
 * D6  Random bytes → type 'unknown'
 * D7  ZIP without word/document.xml → error (damaged)
 * D8  Correct MIME but wrong bytes → still detected by bytes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import DocxImporter from '../DocxImporter';
import { detectFileType } from '../detectFileType';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PDF_MAGIC  = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]); // %PDF-1.4
const ZIP_MAGIC  = new Uint8Array([0x50, 0x4B, 0x03, 0x04]); // PK\x03\x04
const OLE2_MAGIC = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);

/** Build a minimal fake DOCX buffer (ZIP magic + required filenames as ASCII) */
function makeFakeDocxBuffer(): Uint8Array {
  const marker = '[Content_Types].xmlword/document.xml';
  const payload = new TextEncoder().encode(marker);
  const buf = new Uint8Array(ZIP_MAGIC.length + payload.length);
  buf.set(ZIP_MAGIC, 0);
  buf.set(payload, ZIP_MAGIC.length);
  return buf;
}

/** Build a corrupt ZIP (ZIP magic but no OOXML entries) */
function makeCorruptZipBuffer(): Uint8Array {
  const payload = new TextEncoder().encode('random zip content without ooxml');
  const buf = new Uint8Array(ZIP_MAGIC.length + payload.length);
  buf.set(ZIP_MAGIC, 0);
  buf.set(payload, ZIP_MAGIC.length);
  return buf;
}

function makeFile(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): File {
  return new File([bytes], name, { type: mime });
}

function makePdfFile(name = 'test.pdf'): File {
  return makeFile(name, PDF_MAGIC, 'application/pdf');
}

function makeDocxFile(name = 'test.docx'): File {
  return makeFile(name, makeFakeDocxBuffer(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

// ─── Default props ─────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<Parameters<typeof DocxImporter>[0]> = {}) {
  return {
    templateId:       1,
    hasExistingBlocks: false,
    onClose:          vi.fn(),
    onImported:       vi.fn(),
    onOpenInStudio:   vi.fn(),
    onSaveFirst:      vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

// ─── Mock fetch ───────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Utility: drop a file onto the drop zone ──────────────────────────────────

async function dropFile(file: File) {
  const dropZone = screen.getByTestId('drop-zone');
  await act(async () => {
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    // Allow the async detectFileType to resolve
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function selectFile(file: File) {
  const input = screen.getByTestId('file-input') as HTMLInputElement;
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 50));
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// A1 — No Word/PDF tabs
// ═════════════════════════════════════════════════════════════════════════════

describe('A1 — No Word/PDF tabs', () => {
  it('does not render a Word tab button', () => {
    render(<DocxImporter {...makeProps()} />);
    expect(screen.queryByText(/Word \(\.docx\)/i)).toBeNull();
    expect(screen.queryByText(/PDF \(\.pdf\)/i)).toBeNull();
  });

  it('does not render a mode toggle', () => {
    render(<DocxImporter {...makeProps()} />);
    // The old toggle had data-testid="mode-toggle" or similar — confirm absent
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A2 — One drop zone accepts DOCX and PDF
// ═════════════════════════════════════════════════════════════════════════════

describe('A2 — Single drop zone', () => {
  it('renders exactly one drop zone', () => {
    render(<DocxImporter {...makeProps()} />);
    expect(screen.getAllByTestId('drop-zone')).toHaveLength(1);
  });

  it('file input accepts .docx, .dotx and .pdf', () => {
    render(<DocxImporter {...makeProps()} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    expect(input.accept).toContain('.docx');
    expect(input.accept).toContain('.dotx');
    expect(input.accept).toContain('.pdf');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A3 — Real PDF detected and routed to import-pdf
// ═════════════════════════════════════════════════════════════════════════════

describe('A3 — PDF auto-detection and routing', () => {
  it('shows PDF detected badge after dropping a PDF', async () => {
    render(<DocxImporter {...makeProps()} />);
    await dropFile(makePdfFile());
    expect(screen.getByTestId('type-badge')).toHaveTextContent(/PDF detected/i);
  });

  it('calls import-pdf endpoint when importing a PDF', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ blocks: [], sourceFileName: 'test.pdf', pageCount: 1, warnings: [] }),
    });

    render(<DocxImporter {...makeProps()} />);
    await dropFile(makePdfFile());

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-btn'));
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('import-pdf'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('import-docx'),
      expect.anything(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A4 — Real DOCX detected and routed to import-docx
// ═════════════════════════════════════════════════════════════════════════════

describe('A4 — DOCX auto-detection and routing', () => {
  it('shows Word document detected badge after dropping a DOCX', async () => {
    render(<DocxImporter {...makeProps()} />);
    await dropFile(makeDocxFile());
    expect(screen.getByTestId('type-badge')).toHaveTextContent(/Word document detected/i);
  });

  it('calls import-docx endpoint when importing a DOCX', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        mode: 'convert_blocks_v2',
        blocks: [],
        sourceDocxName: 'test.docx',
        warnings: [],
      }),
    });

    render(<DocxImporter {...makeProps()} />);
    await dropFile(makeDocxFile());

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-btn'));
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('import-docx'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('import-pdf'),
      expect.anything(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A5 — MIME type alone is not trusted
// ═════════════════════════════════════════════════════════════════════════════

describe('A5 — MIME type not trusted', () => {
  it('detects PDF by bytes even when MIME says application/octet-stream', async () => {
    const file = makeFile('mystery.pdf', PDF_MAGIC, 'application/octet-stream');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('type-badge')).toHaveTextContent(/PDF detected/i);
  });

  it('detects DOCX by bytes even when MIME says text/plain', async () => {
    const file = makeFile('mystery.docx', makeFakeDocxBuffer(), 'text/plain');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('type-badge')).toHaveTextContent(/Word document detected/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A6 — Renamed PDF with .docx extension is rejected
// ═════════════════════════════════════════════════════════════════════════════

describe('A6 — Renamed PDF (.docx extension) rejected', () => {
  it('shows mismatch error and does not show type badge', async () => {
    const file = makeFile('sneaky.docx', PDF_MAGIC, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('error-message')).toHaveTextContent(/do not match its extension/i);
    expect(screen.queryByTestId('type-badge')).toBeNull();
  });

  it('does not call fetch when a mismatched file is dropped', async () => {
    const file = makeFile('sneaky.docx', PDF_MAGIC);
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A7 — Renamed DOCX with .pdf extension is rejected
// ═════════════════════════════════════════════════════════════════════════════

describe('A7 — Renamed DOCX (.pdf extension) rejected', () => {
  it('shows mismatch error', async () => {
    const file = makeFile('sneaky.pdf', makeFakeDocxBuffer(), 'application/pdf');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('error-message')).toHaveTextContent(/do not match its extension/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A8 — Corrupt ZIP/DOCX is rejected
// ═════════════════════════════════════════════════════════════════════════════

describe('A8 — Corrupt ZIP/DOCX rejected', () => {
  it('shows damaged error for a ZIP without OOXML entries', async () => {
    const file = makeFile('broken.docx', makeCorruptZipBuffer());
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('error-message')).toHaveTextContent(/damaged or incomplete/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A9 — Invalid PDF signature is rejected
// ═════════════════════════════════════════════════════════════════════════════

describe('A9 — Invalid PDF signature rejected', () => {
  it('shows damaged error for a .pdf file with wrong bytes', async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const file = makeFile('broken.pdf', garbage, 'application/pdf');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('error-message')).toHaveTextContent(/damaged or unsupported/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A10 — Old .doc gets conversion guidance
// ═════════════════════════════════════════════════════════════════════════════

describe('A10 — Old .doc conversion guidance', () => {
  it('shows .docx conversion message for OLE2 .doc files', async () => {
    const file = makeFile('old.doc', OLE2_MAGIC, 'application/msword');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('error-message')).toHaveTextContent(/Save the document as \.docx/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A11 — Unsupported files rejected
// ═════════════════════════════════════════════════════════════════════════════

describe('A11 — Unsupported files rejected', () => {
  it('rejects a .txt file with unsupported message', async () => {
    const file = makeFile('notes.txt', new TextEncoder().encode('hello world'), 'text/plain');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('error-message')).toHaveTextContent(/not supported/i);
  });

  it('rejects a .xlsx file', async () => {
    // XLSX is also a ZIP but without word/document.xml
    const file = makeFile('data.xlsx', makeCorruptZipBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    expect(screen.getByTestId('error-message')).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A12 — Failure keeps modal open and does not navigate
// ═════════════════════════════════════════════════════════════════════════════

describe('A12 — Failure keeps modal open', () => {
  it('keeps modal open when server returns an error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Server exploded' }),
    });

    const props = makeProps();
    render(<DocxImporter {...props} />);
    await dropFile(makePdfFile());

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-btn'));
      await new Promise((r) => setTimeout(r, 100));
    });

    // Modal still visible
    expect(screen.getByTestId('drop-zone')).toBeTruthy();
    // Error shown
    expect(screen.getByTestId('error-message')).toHaveTextContent(/Server exploded/i);
    // onClose NOT called
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('keeps modal open when server returns non-JSON (HTML error page)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => 'text/html' },
    });

    const props = makeProps();
    render(<DocxImporter {...props} />);
    await dropFile(makePdfFile());

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-btn'));
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(screen.getByTestId('error-message')).toHaveTextContent(/503/i);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A13 — Failure creates no partial document or assets
// ═════════════════════════════════════════════════════════════════════════════

describe('A13 — No partial document on failure', () => {
  it('does not call fetch at all when a bad file is dropped', async () => {
    const file = makeFile('bad.docx', PDF_MAGIC); // mismatch
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);
    // Import button should be disabled (no valid detectedType)
    const btn = screen.getByTestId('import-btn');
    expect(btn).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call onSaveFirst when a bad file is dropped', async () => {
    const props = makeProps({ templateId: null });
    const file = makeFile('bad.txt', new TextEncoder().encode('garbage'));
    render(<DocxImporter {...props} />);
    await dropFile(file);
    expect(props.onSaveFirst).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A14 — Import cannot be submitted twice
// ═════════════════════════════════════════════════════════════════════════════

describe('A14 — No double submission', () => {
  it('disables import button while importing', async () => {
    let resolveImport!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolveImport = r; }));

    render(<DocxImporter {...makeProps()} />);
    await dropFile(makePdfFile());

    const btn = screen.getByTestId('import-btn');
    await act(async () => { fireEvent.click(btn); });

    // Button should be disabled while the fetch is pending
    expect(btn).toBeDisabled();

    // Resolve to clean up
    resolveImport({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ blocks: [], sourceFileName: 'test.pdf', pageCount: 1, warnings: [] }),
    });
  });

  it('import button is disabled before a file is selected', () => {
    render(<DocxImporter {...makeProps()} />);
    expect(screen.getByTestId('import-btn')).toBeDisabled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A15 — Long filenames do not cause horizontal scrolling
// ═════════════════════════════════════════════════════════════════════════════

describe('A15 — Long filenames wrap correctly', () => {
  it('applies overflow-wrap style to the filename element', async () => {
    const longName = 'A'.repeat(120) + '.docx';
    const file = makeFile(longName, makeFakeDocxBuffer());
    render(<DocxImporter {...makeProps()} />);
    await dropFile(file);

    const nameEl = screen.getByTestId('file-name');
    expect(nameEl).toBeTruthy();
    // Check the style attribute or class contains overflow-wrap
    const style = nameEl.getAttribute('style') ?? '';
    const cls   = nameEl.className ?? '';
    expect(style.includes('overflow-wrap') || cls.includes('break-words') || cls.includes('overflow-wrap')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A16 — Existing DOCX and PDF importer regression
// ═════════════════════════════════════════════════════════════════════════════

describe('A16 — Existing importer routes unchanged', () => {
  it('DOCX import still posts to /api/document-templates/:id/import-docx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] }),
    });

    render(<DocxImporter {...makeProps({ templateId: 42 })} />);
    await dropFile(makeDocxFile());

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-btn'));
      await new Promise((r) => setTimeout(r, 100));
    });

    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toMatch(/\/api\/document-templates\/42\/import-docx/);
  });

  it('PDF import still posts to /api/document-templates/:id/import-pdf', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ blocks: [], sourceFileName: 'test.pdf', pageCount: 2, warnings: [] }),
    });

    render(<DocxImporter {...makeProps({ templateId: 99 })} />);
    await dropFile(makePdfFile());

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-btn'));
      await new Promise((r) => setTimeout(r, 100));
    });

    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toMatch(/\/api\/document-templates\/99\/import-pdf/);
  });

  it('DOCX import sends mode=convert_blocks_v2 by default', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] }),
    });

    render(<DocxImporter {...makeProps()} />);
    await dropFile(makeDocxFile());

    await act(async () => {
      fireEvent.click(screen.getByTestId('import-btn'));
      await new Promise((r) => setTimeout(r, 100));
    });

    const [, opts] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    const body = opts.body as FormData;
    expect(body.get('mode')).toBe('convert_blocks_v2');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D1–D8 — detectFileType unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe('detectFileType unit tests', () => {
  it('D1 — PDF magic bytes → type pdf', async () => {
    const file = makeFile('doc.pdf', PDF_MAGIC, 'application/pdf');
    const result = await detectFileType(file);
    expect(result.type).toBe('pdf');
    expect(result.error).toBeUndefined();
  });

  it('D2 — DOCX ZIP magic + required entries → type docx', async () => {
    const file = makeFile('doc.docx', makeFakeDocxBuffer());
    const result = await detectFileType(file);
    expect(result.type).toBe('docx');
    expect(result.error).toBeUndefined();
  });

  it('D3 — PDF bytes with .docx extension → mismatch error', async () => {
    const file = makeFile('sneaky.docx', PDF_MAGIC);
    const result = await detectFileType(file);
    expect(result.type).toBe('unknown');
    expect(result.error).toMatch(/do not match/i);
  });

  it('D4 — DOCX bytes with .pdf extension → mismatch error', async () => {
    const file = makeFile('sneaky.pdf', makeFakeDocxBuffer());
    const result = await detectFileType(file);
    expect(result.type).toBe('unknown');
    expect(result.error).toMatch(/do not match/i);
  });

  it('D5 — OLE2 magic (.doc) → type doc with guidance', async () => {
    const file = makeFile('old.doc', OLE2_MAGIC);
    const result = await detectFileType(file);
    expect(result.type).toBe('doc');
    expect(result.error).toMatch(/Save the document as \.docx/i);
  });

  it('D6 — Random bytes → type unknown', async () => {
    const garbage = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01, 0x02, 0x03]);
    const file = makeFile('garbage.bin', garbage);
    const result = await detectFileType(file);
    expect(result.type).toBe('unknown');
    expect(result.error).toBeTruthy();
  });

  it('D7 — ZIP without word/document.xml → damaged error', async () => {
    const file = makeFile('broken.docx', makeCorruptZipBuffer());
    const result = await detectFileType(file);
    expect(result.type).toBe('unknown');
    expect(result.error).toMatch(/damaged or incomplete/i);
  });

  it('D8 — Correct MIME but wrong bytes → detected by bytes not MIME', async () => {
    // MIME says PDF but bytes are DOCX
    const file = makeFile('tricky.pdf', makeFakeDocxBuffer(), 'application/pdf');
    const result = await detectFileType(file);
    // Extension is .pdf, bytes are DOCX (ZIP) → mismatch
    expect(result.type).toBe('unknown');
    expect(result.error).toMatch(/do not match/i);
  });
});
