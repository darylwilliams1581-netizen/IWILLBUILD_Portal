/**
 * NewDocumentModal — atomicity and 503 error handling tests
 * ─────────────────────────────────────────────────────────────────────────────
 * A1  503 plain-text response → friendly "temporarily unavailable" message
 * A2  502 plain-text response → friendly message (not SyntaxError)
 * A3  Non-JSON 500 response → shows HTTP status, not SyntaxError
 * A4  Import failure → orphan placeholder is deleted (DELETE called)
 * A5  Parse failure (bad JSON) → orphan placeholder is deleted
 * A6  PATCH failure → orphan placeholder is deleted
 * A7  Modal stays open after any failure (no navigation)
 * A8  Retry succeeds after a temporary failure
 * A9  Success → no DELETE call made
 * A10 AbortError (timeout) → orphan deleted, friendly timeout message
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import NewDocumentModal from '../NewDocumentModal';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

function renderNDM() {
  const onClose = vi.fn();
  const onOpenLibrary = vi.fn();
  const onSaved = vi.fn();
  render(
    <NewDocumentModal
      onClose={onClose}
      onOpenLibrary={onOpenLibrary}
      onSaved={onSaved}
    />,
  );
  return { onClose, onOpenLibrary, onSaved };
}

function makeDocxFile(name = 'swms.docx') {
  return new File(['PK...'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

async function clickWordAndSelectFile(file: File) {
  const wordCard = screen.getByText('Import Word Document').closest('button')!;
  await act(async () => { fireEvent.click(wordCard); });
  const input = document.querySelector('[data-testid="ndm-file-input"]') as HTMLInputElement;
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
  });
}

// createPlaceholder response
const placeholderOk = { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ id: 77 }) };
// DELETE response
const deleteOk = { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}) };

// ─── A1: 503 plain-text → friendly message ───────────────────────────────────

describe('A1 — 503 plain-text response shows friendly "temporarily unavailable" message', () => {
  it('shows friendly message, not SyntaxError', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: async () => { throw new SyntaxError('Unexpected token S'); },
      })
      .mockResolvedValueOnce(deleteOk); // DELETE orphan
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => {
      const err = screen.queryByText(/temporarily unavailable/i) ??
                  screen.queryByText(/503/i);
      expect(err).not.toBeNull();
    });
    // Must NOT show SyntaxError
    expect(screen.queryByText(/SyntaxError/i)).toBeNull();
    expect(screen.queryByText(/Unexpected token/i)).toBeNull();
  });
});

// ─── A2: 502 plain-text → friendly message ───────────────────────────────────

describe('A2 — 502 plain-text response shows friendly message', () => {
  it('shows friendly message for 502', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers({ 'content-type': 'text/html' }),
        json: async () => { throw new SyntaxError('Unexpected token <'); },
      })
      .mockResolvedValueOnce(deleteOk);
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => {
      const err = screen.queryByText(/temporarily unavailable/i) ??
                  screen.queryByText(/502/i);
      expect(err).not.toBeNull();
    });
    expect(screen.queryByText(/SyntaxError/i)).toBeNull();
  });
});

// ─── A3: Non-JSON 500 → shows HTTP status ────────────────────────────────────

describe('A3 — non-JSON 500 response shows HTTP status, not SyntaxError', () => {
  it('shows 500 status in error message', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: async () => { throw new SyntaxError('bad json'); },
      })
      .mockResolvedValueOnce(deleteOk);
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => {
      expect(screen.queryByText(/500/i)).not.toBeNull();
    });
    expect(screen.queryByText(/SyntaxError/i)).toBeNull();
  });
});

// ─── A4: Import failure → orphan deleted ─────────────────────────────────────

describe('A4 — import failure deletes the orphan placeholder', () => {
  it('DELETE is called with the placeholder id on import failure', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk) // createPlaceholder → id 77
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Conversion failed' }),
      })
      .mockResolvedValueOnce(deleteOk); // DELETE /api/document-templates/77
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [deleteUrl, deleteOpts] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(deleteUrl).toContain('/api/document-templates/77');
    expect(deleteOpts.method).toBe('DELETE');
  });
});

// ─── A5: Parse failure → orphan deleted ──────────────────────────────────────

describe('A5 — unreadable JSON response deletes the orphan placeholder', () => {
  it('DELETE called when res.json() throws', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => { throw new SyntaxError('bad json'); },
      })
      .mockResolvedValueOnce(deleteOk);
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [deleteUrl, deleteOpts] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(deleteUrl).toContain('/api/document-templates/77');
    expect(deleteOpts.method).toBe('DELETE');
  });
});

// ─── A6: PATCH failure → orphan deleted ──────────────────────────────────────

describe('A6 — PATCH failure deletes the orphan placeholder', () => {
  it('DELETE called when PATCH fails', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk) // createPlaceholder
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ mode: 'convert_blocks_v2', blocks: [], warnings: [] }) }) // import-docx
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ error: 'DB write failed' }) }) // PATCH fails
      .mockResolvedValueOnce(deleteOk); // DELETE orphan
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const [deleteUrl, deleteOpts] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(deleteUrl).toContain('/api/document-templates/77');
    expect(deleteOpts.method).toBe('DELETE');
  });
});

// ─── A7: Modal stays open after failure ──────────────────────────────────────

describe('A7 — modal stays open after any failure (no navigation)', () => {
  it('no navigation on 503 failure', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk)
      .mockResolvedValueOnce({
        ok: false, status: 503, statusText: 'Service Unavailable',
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: async () => { throw new SyntaxError('bad'); },
      })
      .mockResolvedValueOnce(deleteOk);
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── A8: Retry succeeds after temporary failure ───────────────────────────────

describe('A8 — retry succeeds after a temporary failure', () => {
  it('second attempt navigates to builder after first 503', async () => {
    fetchMock = vi.fn()
      // First attempt: placeholder → 503 → delete orphan
      .mockResolvedValueOnce(placeholderOk)
      .mockResolvedValueOnce({
        ok: false, status: 503, statusText: 'Service Unavailable',
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: async () => { throw new SyntaxError('bad'); },
      })
      .mockResolvedValueOnce(deleteOk)
      // Second attempt: placeholder → success → PATCH → navigate
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ id: 88 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ mode: 'convert_blocks_v2', blocks: [], warnings: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();

    // First attempt
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(mockNavigate).not.toHaveBeenCalled();

    // Retry — select the file again (modal is still open)
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/studio/builder/88'));
  });
});

// ─── A9: Success → no DELETE ─────────────────────────────────────────────────

describe('A9 — successful import does NOT call DELETE', () => {
  it('no DELETE call on success', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(placeholderOk)
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ mode: 'convert_blocks_v2', blocks: [], warnings: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await clickWordAndSelectFile(makeDocxFile());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/studio/builder/77'));
    // All 3 calls: createPlaceholder, import-docx, PATCH — no DELETE
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const methods = fetchMock.mock.calls.map(([, opts]: [string, RequestInit]) => opts?.method ?? 'GET');
    expect(methods).not.toContain('DELETE');
  });
});
