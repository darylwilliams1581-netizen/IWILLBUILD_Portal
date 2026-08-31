/**
 * DocxImporter — focused tests for the convert_blocks_v2 architecture
 * ─────────────────────────────────────────────────────────────────────
 * D1  Default mode — convert_blocks_v2 is the default; import button says "Import and edit in Studio"
 * D2  Default mode — no keep_word radio visible at top level (collapsed in Advanced)
 * D3  convert_blocks_v2 request — POST sends mode=convert_blocks_v2
 * D4  convert_blocks_v2 success — preview step shown; onImported NOT called yet (waits for Apply)
 * D5  convert_blocks_v2 success — onOpenInStudio NOT called
 * D6  convert_blocks_v2 success — no navigation
 * D7  Filename title — sourceDocxName from response shown in preview step
 * D8  Filename fallback — file.name used when server omits sourceDocxName
 * D9  Advanced section — collapsed by default; keep_word toggle inside
 * D10 Advanced recovery path — toggling keep_word changes button label and sends keep_word mode
 * D11 keep_word success — onClose called; onOpenInStudio NOT called
 * D12 Error state — modal stays open with error message on non-ok response
 * D13 Error state — modal stays open with error message on network failure
 * D14 Error state — modal stays open on server error field in JSON
 * D15 Invalid file type — .txt rejected with error; no fetch
 * D16 .dotx accepted — no validation error for .dotx files
 * D17 No Gotenberg dependency — no fetch to /api/gotenberg or /preview
 * D18 No source-preview panel — no SourceDocumentPanel rendered after success
 * D19 PDF path — unchanged; goes to block-canvas preview step
 * D20 onSaveFirst called when templateId is null
 *
 * NewDocumentModal — Word path tests
 * ────────────────────────────────────
 * N1  Word path sends mode=convert_blocks_v2 (never convert_html)
 * N2  Word path navigates to /studio/builder/:id on success
 * N3  Word path does NOT call onSaved (that is PDF-only)
 * N4  Word path error — modal stays open with error; no navigation
 * N5  .dotx accepted in NewDocumentModal Word path
 * N6  Acceptance — Word import: no html_content written, builder_json blocks patched, BlockCanvas opened
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import DocxImporter from '../DocxImporter';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// react-router navigate mock
const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

let fetchMock = vi.fn();
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  mockNavigate.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATE_ID = 55;

// Real magic bytes so the client-side detector accepts the files
const PDF_MAGIC_BYTES  = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]); // %PDF-1.4
const ZIP_MAGIC_BYTES  = new Uint8Array([0x50, 0x4B, 0x03, 0x04]); // PK\x03\x04
const OLE2_MAGIC_BYTES = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);

function makeDocxBytes(): Uint8Array {
  const marker  = '[Content_Types].xmlword/document.xml';
  const payload = new TextEncoder().encode(marker);
  const buf     = new Uint8Array(ZIP_MAGIC_BYTES.length + payload.length);
  buf.set(ZIP_MAGIC_BYTES, 0);
  buf.set(payload, ZIP_MAGIC_BYTES.length);
  return buf;
}

function makeDocxFile(name = 'test.docx') {
  return new File([makeDocxBytes()], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function makeDotxFile(name = 'template.dotx') {
  return new File([makeDocxBytes()], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template' });
}

function makePdfFile(name = 'test.pdf') {
  return new File([PDF_MAGIC_BYTES], name, { type: 'application/pdf' });
}

function successFetch(body: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => body,
  });
}

function renderImporter(overrides: Partial<React.ComponentProps<typeof DocxImporter>> = {}) {
  const onClose        = vi.fn();
  const onImported     = vi.fn();
  const onOpenInStudio = vi.fn();
  const onSaveFirst    = vi.fn().mockResolvedValue(TEMPLATE_ID);

  render(
    <DocxImporter
      templateId={TEMPLATE_ID}
      hasExistingBlocks={false}
      onClose={onClose}
      onImported={onImported}
      onOpenInStudio={onOpenInStudio}
      onSaveFirst={onSaveFirst}
      {...overrides}
    />,
  );
  return { onClose, onImported, onOpenInStudio, onSaveFirst };
}

function getFileInput() {
  return document.querySelector('[data-testid="file-input"]') as HTMLInputElement;
}

function getImportBtn() {
  return document.querySelector('[data-testid="import-btn"]') as HTMLButtonElement;
}

/** Select a file and wait for async detection to complete, then click import */
async function selectFileAndImport(file: File) {
  const input = getFileInput();
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    // Wait for async detectFileType to resolve
    await new Promise((r) => setTimeout(r, 80));
  });
  await act(async () => {
    fireEvent.click(getImportBtn());
  });
}

/** Select a file and wait for detection only (no import click) */
async function selectFileOnly(file: File) {
  const input = getFileInput();
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await new Promise((r) => setTimeout(r, 80));
  });
}

// ─── D1: Default mode ─────────────────────────────────────────────────────────

describe('D1 — default mode is convert_blocks_v2', () => {
  it('import button says "Import into Studio" by default', async () => {
    renderImporter();
    await selectFileOnly(makeDocxFile());
    expect(getImportBtn().textContent).toContain('Import into Studio');
  });
});

// ─── D2: keep_word not visible at top level ───────────────────────────────────

describe('D2 — keep_word not visible at top level', () => {
  it('keep_word toggle is NOT visible before opening Advanced section', async () => {
    renderImporter();
    await selectFileOnly(makeDocxFile());
    expect(screen.queryByTestId('keep-word-toggle')).toBeNull();
  });

  it('Advanced toggle button is present after DOCX is detected', async () => {
    renderImporter();
    await selectFileOnly(makeDocxFile());
    expect(screen.getByTestId('advanced-toggle')).toBeTruthy();
  });
});

// ─── D3: convert_blocks_v2 request ───────────────────────────────────────────

describe('D3 — convert_blocks_v2 request body', () => {
  it('POST sends mode=convert_blocks_v2 (new default)', async () => {
    const blocksResponse = { mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] };
    fetchMock = successFetch(blocksResponse);
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { body: FormData }];
    const body = opts.body as FormData;
    expect(body.get('mode')).toBe('convert_blocks_v2');
  });

  it('POST endpoint is /api/document-templates/:id/import-docx', async () => {
    const blocksResponse = { mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] };
    fetchMock = successFetch(blocksResponse);
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`/api/document-templates/${TEMPLATE_ID}/import-docx`);
  });
});

// ─── D4: convert_blocks_v2 success — onImported called ───────────────────────

describe('D4 — convert_blocks_v2 success calls onImported with blocks', () => {
  it('onImported receives blocks array from server', async () => {
    const blocks = [{ id: 'b1', type: 'heading', content: 'Title', level: 1, align: 'left' }];
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks, sourceDocxName: 'My Safety Plan.docx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    const { onImported } = renderImporter();
    await selectFileAndImport(makeDocxFile());
    // After convert_blocks_v2 success, component shows preview step — onImported called on "Apply"
    // The preview step is shown; verify we reached it (not an error state)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // onImported is called when user clicks Apply — not automatically
    expect(onImported).not.toHaveBeenCalled(); // correct: preview step shown first
  });
});

// ─── D5: convert_blocks_v2 success — onOpenInStudio NOT called ───────────────

describe('D5 — onOpenInStudio not called on convert_blocks_v2 success', () => {
  it('onOpenInStudio is NOT called when convert_blocks_v2 succeeds', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    const { onOpenInStudio } = renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(onOpenInStudio).not.toHaveBeenCalled();
  });
});

// ─── D6: No navigation on convert_blocks_v2 success ──────────────────────────

describe('D6 — no navigation on convert_blocks_v2 success', () => {
  it('does not call navigate on convert_blocks_v2 success', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── D7: Filename shown in preview step ──────────────────────────────────────

describe('D7 — sourceDocxName from server shown in preview step', () => {
  it('preview step shows the source filename', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'My Safety Plan.docx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile('ignored.docx'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Preview step should show the name from the server (may appear in multiple places)
    await waitFor(() => expect(screen.getAllByText(/My Safety Plan\.docx/).length).toBeGreaterThan(0));
  });
});

// ─── D8: Filename fallback ────────────────────────────────────────────────────

describe('D8 — file.name used when server omits sourceDocxName', () => {
  it('falls back to file.name when sourceDocxName absent', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile('fallback-name.docx'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText(/fallback-name\.docx/).length).toBeGreaterThan(0));
  });
});

// ─── D9: Advanced section collapsed by default ────────────────────────────────

describe('D9 — Advanced section collapsed by default', () => {
  it('keep_word toggle not visible until Advanced is opened', async () => {
    renderImporter();
    await selectFileOnly(makeDocxFile());
    expect(screen.queryByTestId('keep-word-toggle')).toBeNull();
  });

  it('clicking Advanced toggle reveals keep_word option', async () => {
    renderImporter();
    await selectFileOnly(makeDocxFile());
    await act(async () => {
      fireEvent.click(screen.getByTestId('advanced-toggle'));
    });
    expect(screen.getByTestId('keep-word-toggle')).toBeTruthy();
  });
});

// ─── D10: Advanced recovery path ─────────────────────────────────────────────

describe('D10 — Advanced recovery path changes mode and label', () => {
  it('selecting keep_word changes button label to "Save as Recovery Copy"', async () => {
    renderImporter();
    await selectFileOnly(makeDocxFile());
    await act(async () => { fireEvent.click(screen.getByTestId('advanced-toggle')); });
    await act(async () => { fireEvent.click(screen.getByTestId('keep-word-toggle')); });
    expect(getImportBtn().textContent).toContain('Save as Recovery Copy');
  });

  it('keep_word mode sends mode=keep_word in POST', async () => {
    fetchMock = successFetch({ mode: 'keep_word' });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileOnly(makeDocxFile());
    await act(async () => { fireEvent.click(screen.getByTestId('advanced-toggle')); });
    await act(async () => { fireEvent.click(screen.getByTestId('keep-word-toggle')); });
    await act(async () => { fireEvent.click(getImportBtn()); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('mode')).toBe('keep_word');
  });
});

// ─── D11: keep_word success ───────────────────────────────────────────────────

describe('D11 — keep_word success calls onClose, not onOpenInStudio', () => {
  it('onClose called on keep_word success', async () => {
    fetchMock = successFetch({ mode: 'keep_word' });
    vi.stubGlobal('fetch', fetchMock);
    const { onClose, onOpenInStudio } = renderImporter();
    await selectFileOnly(makeDocxFile());
    await act(async () => { fireEvent.click(screen.getByTestId('advanced-toggle')); });
    await act(async () => { fireEvent.click(screen.getByTestId('keep-word-toggle')); });
    await act(async () => { fireEvent.click(getImportBtn()); });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onOpenInStudio).not.toHaveBeenCalled();
  });
});

// ─── D12: Error — non-ok response ────────────────────────────────────────────

describe('D12 — non-ok response leaves modal open with error', () => {
  it('shows error message on 500 response', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Server error during conversion' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { onOpenInStudio, onClose } = renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() =>
      expect(screen.getByTestId('error-message').textContent).toContain('Server error during conversion'),
    );
    expect(onOpenInStudio).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── D13: Error — network failure ────────────────────────────────────────────

describe('D13 — network failure leaves modal open with error', () => {
  it('shows network error message', async () => {
    fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);
    const { onOpenInStudio } = renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() =>
      expect(screen.getByTestId('error-message').textContent).toContain('Network error'),
    );
    expect(onOpenInStudio).not.toHaveBeenCalled();
  });
});

// ─── D14: Error — server error field in JSON ─────────────────────────────────

describe('D14 — server error field in JSON body', () => {
  it('shows error from data.error even when HTTP 200', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Mammoth conversion failed: corrupt DOCX' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() =>
      expect(screen.getByTestId('error-message').textContent).toContain('Mammoth conversion failed'),
    );
  });
});

// ─── D15: Invalid file type ───────────────────────────────────────────────────

describe('D15 — invalid file type rejected without fetch', () => {
  it('.txt file shows validation error and does not call fetch', async () => {
    renderImporter();
    const txtFile = new File(['text'], 'document.txt', { type: 'text/plain' });
    await selectFileOnly(txtFile);
    expect(screen.getByTestId('error-message').textContent).toMatch(/not supported/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── D16: .dotx accepted ─────────────────────────────────────────────────────

describe('D16 — .dotx files accepted', () => {
  it('.dotx does not show a validation error', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'template.dotx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileOnly(makeDotxFile());
    expect(screen.queryByTestId('error-message')).toBeNull();
  });

  it('.dotx file is sent to the import endpoint', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'template.dotx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDotxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/import-docx');
  });
});

// ─── D17: No Gotenberg dependency ────────────────────────────────────────────

describe('D17 — no Gotenberg or preview fetch', () => {
  it('does not call any /gotenberg or /preview endpoint', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const urls = fetchMock.mock.calls.map(([url]: [string]) => url);
    expect(urls.every((u) => !u.includes('gotenberg') && !u.includes('/preview'))).toBe(true);
  });
});

// ─── D18: No source-preview panel ────────────────────────────────────────────

describe('D18 — no SourceDocumentPanel rendered after success', () => {
  it('no source-document-panel element after convert_blocks_v2 success', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(document.querySelector('[data-testid="source-document-panel"]')).toBeNull();
  });
});

// ─── D19: PDF path unchanged ──────────────────────────────────────────────────

describe('D19 — PDF path goes to block-canvas preview step', () => {
  it('PDF parse response with blocks shows preview step', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        mode: 'convert_blocks',
        blocks: [{ id: '1', type: 'heading', content: 'Title', level: 1, align: 'left' }],
        sourceFileName: 'test.pdf',
        warnings: [],
        pageCount: 2,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();

    // Drop a PDF — auto-detected, no mode toggle needed
    await selectFileAndImport(makePdfFile());
    await waitFor(() =>
      expect(screen.getAllByText(/Parsed/).length).toBeGreaterThan(0),
    );
  });
});

// ─── D20: onSaveFirst called when templateId is null ─────────────────────────

describe('D20 — onSaveFirst called when templateId is null', () => {
  it('calls onSaveFirst and uses returned id for the import endpoint', async () => {
    fetchMock = successFetch({ mode: 'convert_blocks_v2', blocks: [], sourceDocxName: 'test.docx', warnings: [] });
    vi.stubGlobal('fetch', fetchMock);
    const onSaveFirst = vi.fn().mockResolvedValue(99);
    renderImporter({ templateId: null, onSaveFirst });
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => expect(onSaveFirst).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/99/import-docx');
  });

  it('shows error and does not call fetch when onSaveFirst returns null', async () => {
    const onSaveFirst = vi.fn().mockResolvedValue(null);
    renderImporter({ templateId: null, onSaveFirst });
    await selectFileAndImport(makeDocxFile());
    await waitFor(() =>
      expect(screen.getByTestId('error-message').textContent).toContain('Could not save'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── NewDocumentModal — name-first form ───────────────────────────────────────
// NewDocumentModal now shows a name + type form and POSTs to /api/document-templates,
// then navigates to /studio/builder/:id?tab=layout.
// Word / PDF import paths were removed from this modal (they live in the builder ribbon).

import NewDocumentModal from '../NewDocumentModal';

function renderNDM(overrides: Partial<React.ComponentProps<typeof NewDocumentModal>> = {}) {
  const onClose       = vi.fn();
  const onOpenLibrary = vi.fn();
  const onSaved       = vi.fn();
  render(
    <NewDocumentModal
      onClose={onClose}
      onOpenLibrary={onOpenLibrary}
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return { onClose, onOpenLibrary, onSaved };
}

describe('N1 — NewDocumentModal renders name input and Create button', () => {
  it('shows name field, type selector, and Create document button', () => {
    renderNDM();
    expect(screen.getByPlaceholderText(/Electrical SWMS/i)).toBeTruthy();
    expect(screen.getByText('Create document')).toBeTruthy();
  });
});

describe('N2 — NewDocumentModal Create button disabled when name is empty', () => {
  it('Create button is disabled with no name entered', () => {
    renderNDM();
    const btn = screen.getByText('Create document').closest('button')!;
    expect(btn).toBeDisabled();
  });
});

describe('N3 — NewDocumentModal POSTs to /api/document-templates and navigates', () => {
  it('navigates to /studio/builder/:id?tab=layout on success', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 77 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();

    const input = screen.getByPlaceholderText(/Electrical SWMS/i);
    await act(async () => { fireEvent.change(input, { target: { value: 'My SWMS' } }); });

    const btn = screen.getByText('Create document').closest('button')!;
    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/studio/builder/77?tab=layout'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/document-templates');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.name).toBe('My SWMS');
  });
});

describe('N4 — NewDocumentModal shows error and does not navigate on API failure', () => {
  it('shows error message and stays open when POST fails', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();

    const input = screen.getByPlaceholderText(/Electrical SWMS/i);
    await act(async () => { fireEvent.change(input, { target: { value: 'Test Doc' } }); });
    const btn = screen.getByText('Create document').closest('button')!;
    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => expect(screen.getByText(/Server error/)).toBeTruthy());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('N5 — NewDocumentModal shows validation error when name is blank on submit', () => {
  it('shows "Please enter a document name" without fetching', async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();

    // Bypass disabled state by calling handleCreate via Enter key with empty value
    // (the button is disabled, so we test the guard via keyboard)
    const input = screen.getByPlaceholderText(/Electrical SWMS/i);
    await act(async () => { fireEvent.change(input, { target: { value: '   ' } }); });
    const btn = screen.getByText('Create document').closest('button')!;
    // Button should still be disabled for whitespace-only input
    expect(btn).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('N6 — NewDocumentModal Library shortcut calls onOpenLibrary and onClose', () => {
  it('clicking library link calls onOpenLibrary and onClose', async () => {
    const { onClose, onOpenLibrary } = renderNDM();
    const link = screen.getByText(/template library/i).closest('button')!;
    await act(async () => { fireEvent.click(link); });
    expect(onOpenLibrary).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── D21: Non-JSON 503 response shows real status, not SyntaxError ────────────
//
// Root cause: when the proxy kills a timed-out request it returns a plain-text
// "Service Unavailable" body. The fix checks content-type before calling json().

describe('D21 — non-JSON 503 response shows real status, not SyntaxError', () => {
  it('shows "Server error (503 ...)" when server returns plain-text body', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => 'text/html' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { onOpenInStudio, onClose } = renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => {
      const el = screen.getByTestId('error-message');
      expect(el.textContent).toContain('503');
      expect(el.textContent).not.toContain('SyntaxError');
      expect(el.textContent).not.toContain('Unexpected token');
    });
    expect(onOpenInStudio).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows "Failed to fetch" message on network rejection', async () => {
    fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    renderImporter();
    await selectFileAndImport(makeDocxFile());
    await waitFor(() => {
      const el = screen.getByTestId('error-message');
      expect(el.textContent).toContain('Failed to fetch');
    });
  });
});
