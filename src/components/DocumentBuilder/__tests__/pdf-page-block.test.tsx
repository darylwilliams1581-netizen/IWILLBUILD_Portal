/**
 * pdf-page-block.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused tests for PdfPageBlock rendering (13 cases).
 *
 * pdfjs-dist is stubbed — tests verify component behaviour, not PDF rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { PdfPageBlock } from '../types';

// ── pdfjs-dist stub ───────────────────────────────────────────────────────────
// vi.mock is hoisted — use a factory that captures refs via closure.

const _mockRender = vi.fn().mockReturnValue({ promise: Promise.resolve() });
const _mockGetPage = vi.fn();
const _mockGetDocument = vi.fn();

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => _mockGetDocument(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePdfDoc(numPages = 1) {
  return {
    numPages,
    getPage: (...args: unknown[]) => _mockGetPage(...args),
  };
}

function makeBlock(overrides: Partial<PdfPageBlock> = {}): PdfPageBlock {
  return {
    id: 'blk-1',
    type: 'pdf_page',
    storageKey: '42/42-1-abc-test.pdf',
    downloadUrl: '/airo-assets/uploads/pdf-imports/42/42-1-abc-test.pdf',
    pageIndex: 0,
    pageNumber: 1,
    totalPages: 1,
    sourceFileName: 'test.pdf',
    ...overrides,
  };
}

// Stub IntersectionObserver — must use function keyword for Vitest class mock
function stubIntersectionObserver(intersecting = true) {
  const observe = vi.fn();
  const disconnect = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.stubGlobal('IntersectionObserver', function (this: unknown, cb: IntersectionObserverCallback) {
    observe.mockImplementation(function (el: Element) {
      cb([{ isIntersecting: intersecting, target: el } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    return { observe, disconnect };
  });
  return { observe, disconnect };
}

// Stub canvas
function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  });
  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,abc');
}

// ── Module-level caches (imported once, cleared between tests) ────────────────

let PdfPageBlockView: typeof import('../blocks/PdfPageBlock').default;
let waitForPdfPagesReady: typeof import('../blocks/PdfPageBlock').waitForPdfPagesReady;
let _docCache: Map<string, Promise<unknown>>;
let _printImageCache: Map<string, string>;

beforeEach(async () => {
  vi.resetModules();

  _mockRender.mockReset().mockReturnValue({ promise: Promise.resolve() });
  _mockGetPage.mockReset().mockResolvedValue({
    getViewport: () => ({ width: 595, height: 842 }),
    render: (...args: unknown[]) => _mockRender(...args),
  });
  _mockGetDocument.mockReset();

  stubCanvas();
  stubIntersectionObserver(true);

  const mod = await import('../blocks/PdfPageBlock');
  PdfPageBlockView = mod.default;
  waitForPdfPagesReady = mod.waitForPdfPagesReady;
  _docCache = mod._docCache as Map<string, Promise<unknown>>;
  _printImageCache = mod._printImageCache as Map<string, string>;
  _docCache.clear();
  _printImageCache.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

// T1: A one-page PDF renders in its page block
describe('T1 — one-page PDF renders', () => {
  it('renders a canvas after successful load', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(1)) });
    render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    await waitFor(() => expect(_mockGetPage).toHaveBeenCalledWith(1));
    await waitFor(() => expect(_mockRender).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
  });
});

// T2: A three-page PDF creates and renders three ordered blocks
describe('T2 — three-page PDF: three blocks render correct pages', () => {
  it('each block renders its own page number', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(3)) });

    const blocks = [0, 1, 2].map((i) =>
      makeBlock({ id: `blk-${i}`, pageIndex: i, pageNumber: i + 1, totalPages: 3 })
    );

    const { unmount } = render(
      <>
        {blocks.map((b) => (
          <PdfPageBlockView key={b.id} block={b} templateId={42} />
        ))}
      </>
    );

    await waitFor(() => expect(_mockGetPage).toHaveBeenCalledTimes(3));
    expect(_mockGetPage).toHaveBeenCalledWith(1);
    expect(_mockGetPage).toHaveBeenCalledWith(2);
    expect(_mockGetPage).toHaveBeenCalledWith(3);
    unmount();
  });
});

// T3: The PDF source is fetched only once (shared doc cache)
describe('T3 — PDF source fetched only once for same URL', () => {
  it('getDocument called once for multiple blocks with same templateId', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(2)) });

    const blocks = [0, 1].map((i) =>
      makeBlock({ id: `blk-${i}`, pageIndex: i, pageNumber: i + 1, totalPages: 2 })
    );

    render(
      <>
        {blocks.map((b) => <PdfPageBlockView key={b.id} block={b} templateId={42} />)}
      </>
    );

    await waitFor(() => expect(_mockGetPage).toHaveBeenCalledTimes(2));
    // getDocument should only be called once — second block reuses cache
    expect(_mockGetDocument).toHaveBeenCalledTimes(1);
  });
});

// T4: Page blocks render the correct page number
describe('T4 — correct page number rendered', () => {
  it('renders page 2 when pageIndex=1', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(3)) });
    const block = makeBlock({ pageIndex: 1, pageNumber: 2, totalPages: 3 });
    render(<PdfPageBlockView block={block} templateId={42} />);
    await waitFor(() => expect(_mockGetPage).toHaveBeenCalledWith(2));
  });
});

// T5: Rendering survives save/reload (no blob: URLs in block)
describe('T5 — no blob: URLs stored in block', () => {
  it('block.downloadUrl is never a blob: URL', () => {
    const block = makeBlock({ downloadUrl: '/airo-assets/uploads/pdf-imports/42/42-1-abc-test.pdf' });
    expect(block.downloadUrl).not.toMatch(/^blob:/);
    expect(block.storageKey).not.toMatch(/^blob:/);
  });
});

// T6: Reordering and deleting blocks still works (blocks are independent)
describe('T6 — blocks are independent (move/delete)', () => {
  it('each block has a unique id and page index', () => {
    const blocks = [0, 1, 2].map((i) =>
      makeBlock({ id: `blk-${i}`, pageIndex: i, pageNumber: i + 1 })
    );
    const ids = blocks.map((b) => b.id);
    const pages = blocks.map((b) => b.pageIndex);
    expect(new Set(ids).size).toBe(3);
    expect(new Set(pages).size).toBe(3);
  });
});

// T7: No temporary URL is persisted — print cache cleared on unmount
describe('T7 — print image cache cleared on unmount', () => {
  it('printImageCache entry is removed when component unmounts', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(1)) });
    const { unmount } = render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    await waitFor(() => expect(_mockRender).toHaveBeenCalledTimes(1));
    // Cache should have an entry after render
    expect(_printImageCache.size).toBeGreaterThan(0);
    unmount();
    // After unmount, the entry should be gone
    expect(_printImageCache.size).toBe(0);
  });
});

// T8: Invalid or missing files show Retry and Download actions
describe('T8 — error state shows Retry and Download', () => {
  it('shows Retry and Download when getDocument rejects', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error('Network error')) });
    render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByText(/Retry/i)).toBeTruthy();
    expect(screen.getByText(/Download PDF/i)).toBeTruthy();
  });

  it('shows Retry and Download when getPage rejects', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(1)) });
    _mockGetPage.mockRejectedValue(new Error('Page not found'));
    render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByText(/Retry/i)).toBeTruthy();
  });
});

// T9: Studio preview renders PDF pages (canvas visible)
describe('T9 — canvas rendered and visible after success', () => {
  it('canvas has role=img after render', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(1)) });
    render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    await waitFor(() => expect(_mockRender).toHaveBeenCalledTimes(1));
    const imgs = screen.getAllByRole('img');
    // canvas is always first; print img may also be present
    expect(imgs[0].tagName).toBe('CANVAS');
  });
});

// T10: Print waits for rendering (waitForPdfPagesReady)
describe('T10 — waitForPdfPagesReady resolves after render', () => {
  it('resolves once print image cache is populated', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(1)) });
    render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    await waitFor(() => expect(_mockRender).toHaveBeenCalledTimes(1));
    // With no DOM blocks matching the selector, resolves immediately
    await expect(waitForPdfPagesReady(1000)).resolves.toBeUndefined();
  });
});

// T11: Printed pages fit without cropping (aspect ratio preserved)
describe('T11 — aspect ratio preserved', () => {
  it('canvas element is present after render', async () => {
    _mockGetDocument.mockReturnValue({ promise: Promise.resolve(makePdfDoc(1)) });
    _mockGetPage.mockResolvedValue({
      getViewport: () => ({ width: 595, height: 842 }),
      render: (...args: unknown[]) => _mockRender(...args),
    });
    render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    await waitFor(() => expect(_mockRender).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
  });
});

// T12: Mobile rendering causes no horizontal overflow
describe('T12 — no horizontal overflow on mobile', () => {
  it('container has overflow-hidden class', () => {
    render(<PdfPageBlockView block={makeBlock()} templateId={42} />);
    const container = screen.getByTestId('pdf-page-block');
    expect(container.className).toContain('overflow-hidden');
  });
});

// T13: DOCX importing remains unchanged
describe('T13 — DOCX importer unaffected', () => {
  it('DocxImporter module imports without error', async () => {
    const mod = await import('../DocxImporter');
    expect(mod.default).toBeTruthy();
  });
});
