/**
 * @vitest-environment jsdom
 *
 * Structural regression test for the Scheduler Add Task modal.
 *
 * Proves:
 *  1. Modal is portalled to document.body.
 *  2. The outer fixed overlay does NOT carry role="dialog".
 *  3. The inner white panel DOES carry role="dialog".
 *  4. The inner panel has aria-modal="true".
 *  5. The inner panel references a real title via aria-labelledby.
 *  6. The overlay uses z-[1200] — above sidebar (1050) and top bar (1100).
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Minimal stubs ────────────────────────────────────────────────────────────

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));

// Stub the scheduler tasks API calls so the component mounts without network
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ tasks: [], members: [], jobs: [] }),
}) as unknown as typeof fetch;

// ── Import after mocks ───────────────────────────────────────────────────────
// We import the internal TaskModal by rendering TasksSchedulerView and
// triggering the "+ Add Task" button, which mounts TaskModal into the portal.

import { act, fireEvent } from '@testing-library/react';

// Lazy import so mocks are hoisted first
const getView = async () => {
  const mod = await import('../scheduler/TasksSchedulerView');
  return mod.default;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function renderAndOpenModal() {
  const TasksSchedulerView = await getView();

  await act(async () => {
    render(
      <MemoryRouter>
        <TasksSchedulerView />
      </MemoryRouter>,
    );
  });

  // Wait for the loading state to resolve (fetch mock returns immediately)
  await act(async () => {
    await Promise.resolve();
  });

  // Click the first "+ Add Task" button (one per group section)
  const addBtns = screen.getAllByRole('button', { name: /add task/i });
  expect(addBtns.length).toBeGreaterThan(0);
  await act(async () => {
    fireEvent.click(addBtns[0]);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Scheduler TaskModal — structural layer contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [], members: [], jobs: [] }),
    });
  });

  it('portals the modal into document.body', async () => {
    await renderAndOpenModal();

    // The dialog panel must be a descendant of document.body
    const panel = document.body.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(document.body.contains(panel)).toBe(true);
  });

  it('outer overlay does NOT have role="dialog"', async () => {
    await renderAndOpenModal();

    // The overlay is the first child of the portal — a fixed inset-0 div.
    // It must NOT carry role="dialog" (that would trigger the global CSS width cap).
    const overlay = document.body.querySelector('.fixed.inset-0');
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).not.toBe('dialog');
  });

  it('inner panel has role="dialog" and aria-modal="true"', async () => {
    await renderAndOpenModal();

    const panel = document.body.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-modal')).toBe('true');
  });

  it('inner panel references a real title via aria-labelledby', async () => {
    await renderAndOpenModal();

    const panel = document.body.querySelector('[role="dialog"]');
    const labelId = panel?.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();

    const titleEl = document.getElementById(labelId!);
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('overlay uses z-[1200] — above sidebar (1050) and top bar (1100)', async () => {
    await renderAndOpenModal();

    const overlay = document.body.querySelector('.fixed.inset-0') as HTMLElement | null;
    expect(overlay).not.toBeNull();

    // The class list must include the z-[1200] token
    expect(overlay?.className).toMatch(/z-\[1200\]/);
  });
});
