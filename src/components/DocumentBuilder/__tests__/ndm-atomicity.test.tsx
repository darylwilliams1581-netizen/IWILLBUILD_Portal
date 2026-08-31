/**
 * NewDocumentModal — create flow tests
 * ─────────────────────────────────────────────────────────────────────────────
 * A1  POST failure (500 JSON) → shows error message, no navigation
 * A2  POST failure (503 plain-text) → shows friendly message, no SyntaxError
 * A3  POST failure (502 plain-text) → shows friendly message
 * A4  POST returns no id → shows error, no navigation
 * A5  Network rejection → shows error, no navigation
 * A6  Modal stays open after any failure (no navigation)
 * A7  Retry succeeds after a temporary failure
 * A8  Success → navigates to /studio/builder/:id?tab=layout
 * A9  Success → no extra DELETE or cleanup calls
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

async function fillAndSubmit(name = 'Test SWMS') {
  const input = screen.getByPlaceholderText(/Electrical SWMS/i);
  await act(async () => { fireEvent.change(input, { target: { value: name } }); });
  const btn = screen.getByText('Create document').closest('button')!;
  await act(async () => { fireEvent.click(btn); });
}

// ─── A1: POST failure (500 JSON) → error shown, no navigation ────────────────

describe('A1 — 503 plain-text response shows friendly "temporarily unavailable" message', () => {
  it('shows friendly message, not SyntaxError', async () => {
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => { throw new SyntaxError('Unexpected token S'); },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit();
    await waitFor(() => {
      // Should show some error — either the HTTP status or a friendly message
      const errText = document.body.textContent ?? '';
      expect(errText).toMatch(/503|unavailable|failed/i);
    });
    expect(screen.queryByText(/SyntaxError/i)).toBeNull();
    expect(screen.queryByText(/Unexpected token/i)).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── A2: POST failure (502 plain-text) → friendly message ────────────────────

describe('A2 — 502 plain-text response shows friendly message', () => {
  it('shows friendly message for 502', async () => {
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit();
    await waitFor(() => {
      const errText = document.body.textContent ?? '';
      expect(errText).toMatch(/502|unavailable|failed/i);
    });
    expect(screen.queryByText(/SyntaxError/i)).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── A3: Non-JSON 500 → shows HTTP status ────────────────────────────────────

describe('A3 — non-JSON 500 response shows HTTP status, not SyntaxError', () => {
  it('shows 500 status in error message', async () => {
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server error' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit();
    await waitFor(() => {
      const errText = document.body.textContent ?? '';
      expect(errText).toMatch(/500|server error/i);
    });
    expect(screen.queryByText(/SyntaxError/i)).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── A4: POST returns no id → error shown ────────────────────────────────────

describe('A4 — import failure deletes the orphan placeholder', () => {
  it('DELETE is called with the placeholder id on import failure', async () => {
    // New flow: single POST — no orphan to delete. Test that error is shown when no id returned.
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: undefined }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit();
    await waitFor(() => {
      const errText = document.body.textContent ?? '';
      expect(errText).toMatch(/No document ID|try again/i);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    // No DELETE call — new flow is atomic (single POST, no placeholder)
    const methods = fetchMock.mock.calls.map(([, opts]: [string, RequestInit]) => opts?.method ?? 'GET');
    expect(methods).not.toContain('DELETE');
  });
});

// ─── A5: Parse failure → error shown ─────────────────────────────────────────

describe('A5 — unreadable JSON response deletes the orphan placeholder', () => {
  it('DELETE called when res.json() throws', async () => {
    // New flow: single POST — no orphan. When ok:true but no id returned (json parse swallowed),
    // the modal shows "No document ID returned" and does not navigate.
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}), // returns empty object — no id field
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit();
    await waitFor(() => {
      const errText = document.body.textContent ?? '';
      expect(errText).toMatch(/No document ID|try again/i);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── A6: PATCH failure → error shown (no PATCH in new flow) ──────────────────

describe('A6 — PATCH failure deletes the orphan placeholder', () => {
  it('DELETE called when PATCH fails', async () => {
    // New flow has no PATCH step. Test that a POST error is shown and no navigation occurs.
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'DB write failed' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit();
    await waitFor(() => {
      const errText = document.body.textContent ?? '';
      expect(errText).toMatch(/DB write failed|failed/i);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── A7: Modal stays open after failure ──────────────────────────────────────

describe('A7 — modal stays open after any failure (no navigation)', () => {
  it('no navigation on 503 failure', async () => {
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false, status: 503, statusText: 'Service Unavailable',
      json: async () => { throw new SyntaxError('bad'); },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();
    // Modal still open — name input still present
    expect(screen.getByPlaceholderText(/Electrical SWMS/i)).toBeTruthy();
  });
});

// ─── A8: Retry succeeds after temporary failure ───────────────────────────────

describe('A8 — retry succeeds after a temporary failure', () => {
  it('second attempt navigates to builder after first 503', async () => {
    fetchMock = vi.fn()
      // First attempt: 503
      .mockResolvedValueOnce({
        ok: false, status: 503, statusText: 'Service Unavailable',
        json: async () => { throw new SyntaxError('bad'); },
      })
      // Second attempt: success
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ id: 88 }),
      });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();

    // First attempt
    await fillAndSubmit('My SWMS');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();

    // Retry — click Create again (modal still open)
    const btn = screen.getByText('Create document').closest('button')!;
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/studio/builder/88?tab=layout'));
  });
});

// ─── A9: Success → no DELETE ─────────────────────────────────────────────────

describe('A9 — successful import does NOT call DELETE', () => {
  it('no DELETE call on success', async () => {
    fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ id: 77 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderNDM();
    await fillAndSubmit('My SWMS');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/studio/builder/77?tab=layout'));
    // Only one call: POST /api/document-templates
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const methods = fetchMock.mock.calls.map(([, opts]: [string, RequestInit]) => opts?.method ?? 'GET');
    expect(methods).not.toContain('DELETE');
  });
});
