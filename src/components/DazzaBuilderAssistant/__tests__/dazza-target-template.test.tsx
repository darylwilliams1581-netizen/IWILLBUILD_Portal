/**
 * dazza-target-template.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for Dazza Builder target-template handling.
 *
 * Scenarios:
 *  1.  Current-template editing — proposal targets open template → Apply enabled
 *  2.  Missing targetTemplateId field (legacy/malformed proposal) → Apply blocked
 *  3.  Nonexistent / stale template ID — proposal targets different ID → Apply blocked
 *  4.  Builder type mismatch — proposal targets wrong builder → Apply blocked
 *  5.  New-template creation — targetTemplateId null + createNewTemplate first → Apply enabled
 *  6.  New-template creation — targetTemplateId null but NO createNewTemplate → Apply blocked
 *  7.  applyChange: current-template — sends correct templateId to server
 *  8.  applyChange: new-template — sends null templateId, navigates on success
 *  9.  applyChange: stale ID — client rejects before fetch
 * 10.  applyChange: server returns 404 — error shown, proposal retained
 * 11.  applyChange: server returns 422 validation error — error shown
 * 12.  Truthful messaging — Apply button says "Apply" not "Applied" before click
 * 13.  Apply button shows "Applying…" while in-flight
 * 14.  Apply button shows "Cannot Apply" when blocked
 * 15.  Error is cleared on new sendMessage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ProposedChangeCard from '../ProposedChangeCard';
import { renderHook } from '@testing-library/react';
import { useDazzaBuilderChat } from '../useDazzaBuilderChat';
import type { BuilderContext, ProposedChange } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDocContext(overrides: Partial<BuilderContext> = {}): BuilderContext {
  return {
    builderType: 'document',
    templateId: 42,
    templateName: 'Test SWMS',
    templateType: 'swms',
    currentVersion: 3,
    schemaSummary: 'Template type: swms\nTotal blocks: 5',
    selectedId: null,
    hasUnsavedChanges: false,
    validationErrors: [],
    isPreviewMode: false,
    ...overrides,
  };
}

function makeListContext(overrides: Partial<BuilderContext> = {}): BuilderContext {
  return {
    builderType: 'document',
    templateId: null,
    templateName: 'Documents',
    templateType: 'list',
    currentVersion: 0,
    schemaSummary: 'Viewing the documents list — no template open.',
    selectedId: null,
    hasUnsavedChanges: false,
    validationErrors: [],
    isPreviewMode: false,
    ...overrides,
  };
}

function makeProposal(overrides: Partial<ProposedChange> = {}): ProposedChange {
  return {
    summary: 'Add a heading block',
    affectedSections: ['Page 1'],
    affectedItems: ['Heading'],
    validationImpact: 'None',
    operations: [{ op: 'addBlock', blockType: 'heading', content: 'Section 1', level: 1 }],
    conversationId: 'conv-abc',
    targetTemplateId: 42,
    targetBuilderType: 'document',
    ...overrides,
  };
}

function makeNewTemplateProposal(overrides: Partial<ProposedChange> = {}): ProposedChange {
  return {
    summary: 'Create new EMP template',
    affectedSections: ['All'],
    affectedItems: ['createNewTemplate'],
    validationImpact: 'None',
    operations: [
      { op: 'createNewTemplate', name: 'Environmental Management Plan', templateType: 'emp', docStatus: 'draft', docKind: 'doc' },
      { op: 'addBlock', blockType: 'heading', content: 'Purpose', level: 1 },
    ],
    conversationId: 'conv-new',
    targetTemplateId: null,
    targetBuilderType: 'document',
    ...overrides,
  };
}

function renderCard(
  change: ProposedChange,
  ctx: BuilderContext,
  onApply = vi.fn(),
  onUndo = vi.fn(),
  isApplying = false,
) {
  return render(
    <MemoryRouter>
      <ProposedChangeCard
        change={change}
        builderContext={ctx}
        onApply={onApply}
        onUndo={onUndo}
        isApplying={isApplying}
      />
    </MemoryRouter>,
  );
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockApplySuccess(overrides: Record<string, unknown> = {}) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ok: true, versionId: 'v-001', versionNumber: 4, operationsApplied: 1, ...overrides }),
  });
}

function mockApplyError(status: number, body: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  });
}

// ── ProposedChangeCard tests ──────────────────────────────────────────────────

describe('ProposedChangeCard — Apply button state', () => {
  afterEach(() => vi.clearAllMocks());

  it('1. Current-template editing — Apply enabled when IDs match', () => {
    const ctx = makeDocContext({ templateId: 42 });
    const change = makeProposal({ targetTemplateId: 42, targetBuilderType: 'document' });
    renderCard(change, ctx);
    const btn = screen.getByRole('button', { name: /^apply$/i });
    expect(btn).not.toBeDisabled();
  });

  it('2. Missing targetTemplateId (undefined/legacy) — Apply blocked', () => {
    const ctx = makeDocContext({ templateId: 42 });
    // Simulate a legacy proposal without the new fields — targetTemplateId will be undefined
    const change = {
      ...makeProposal(),
      targetTemplateId: undefined as unknown as number | null,
      targetBuilderType: undefined as unknown as 'document',
    };
    renderCard(change, ctx);
    // undefined !== 42 → blocked
    const btn = screen.getByRole('button', { name: /cannot apply/i });
    expect(btn).toBeDisabled();
  });

  it('3. Stale template ID — proposal targets #99, open is #42 → Apply blocked', () => {
    const ctx = makeDocContext({ templateId: 42 });
    const change = makeProposal({ targetTemplateId: 99 });
    renderCard(change, ctx);
    const btn = screen.getByRole('button', { name: /cannot apply/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/targets template #99/i)).toBeTruthy();
  });

  it('4. Builder type mismatch — proposal targets form, context is document → Apply blocked', () => {
    const ctx = makeDocContext();
    const change = makeProposal({ targetBuilderType: 'form' });
    renderCard(change, ctx);
    const btn = screen.getByRole('button', { name: /cannot apply/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/targets "form" builder/i)).toBeTruthy();
  });

  it('5. New-template creation — null targetTemplateId + createNewTemplate first → Apply enabled', () => {
    const ctx = makeListContext();
    const change = makeNewTemplateProposal();
    renderCard(change, ctx);
    const btn = screen.getByRole('button', { name: /^apply$/i });
    expect(btn).not.toBeDisabled();
  });

  it('6. Null targetTemplateId but NO createNewTemplate op → Apply blocked', () => {
    const ctx = makeListContext();
    const change = makeProposal({
      targetTemplateId: null,
      operations: [{ op: 'addBlock', blockType: 'heading', content: 'Oops' }],
    });
    renderCard(change, ctx);
    const btn = screen.getByRole('button', { name: /cannot apply/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/no template is open/i)).toBeTruthy();
  });

  it('12. Truthful messaging — button says "Apply" not "Applied" before click', () => {
    const ctx = makeDocContext();
    const change = makeProposal();
    renderCard(change, ctx);
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeTruthy();
    expect(screen.queryByText(/applied/i)).toBeNull();
  });

  it('13. Apply button shows "Applying…" while isApplying=true', () => {
    const ctx = makeDocContext();
    const change = makeProposal();
    renderCard(change, ctx, vi.fn(), vi.fn(), true);
    expect(screen.getByRole('button', { name: /applying/i })).toBeDisabled();
  });

  it('14. Apply button shows "Cannot Apply" when blocked', () => {
    const ctx = makeDocContext({ templateId: 42 });
    const change = makeProposal({ targetTemplateId: 99 });
    renderCard(change, ctx);
    expect(screen.getByRole('button', { name: /cannot apply/i })).toBeDisabled();
  });
});

// ── useDazzaBuilderChat.applyChange tests ─────────────────────────────────────

function renderChatHook(ctx: BuilderContext) {
  return renderHook(
    () => useDazzaBuilderChat({ builderContext: ctx }),
    { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
  );
}

describe('useDazzaBuilderChat — applyChange', () => {
  beforeEach(() => {
    // Default: versions fetch returns empty
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ versions: [] }) });
  });
  afterEach(() => vi.clearAllMocks());

  it('7. Current-template — sends correct templateId to server', async () => {
    const ctx = makeDocContext({ templateId: 42 });
    const { result } = renderChatHook(ctx);
    mockApplySuccess();

    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 42 }));
    });

    const applyCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/apply'));
    expect(applyCall).toBeTruthy();
    const body = JSON.parse(applyCall![1].body as string);
    expect(body.templateId).toBe(42);
    expect(body.builderType).toBe('document');
  });

  it('8. New-template — sends null templateId, navigates on success', async () => {
    const ctx = makeListContext();
    const { result } = renderChatHook(ctx);
    mockApplySuccess({ newTemplateId: 55, newTemplateName: 'EMP' });

    await act(async () => {
      await result.current.applyChange(makeNewTemplateProposal());
    });

    const applyCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/apply'));
    expect(applyCall).toBeTruthy();
    const body = JSON.parse(applyCall![1].body as string);
    expect(body.templateId).toBeNull();
    // Phase should be complete (navigation happens after timeout)
    expect(result.current.phase).toBe('complete');
  });

  it('9. Stale ID — client rejects before fetch', async () => {
    const ctx = makeDocContext({ templateId: 42 });
    const { result } = renderChatHook(ctx);

    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 99 }));
    });

    // No apply fetch should have been made
    const applyCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/apply'));
    expect(applyCall).toBeUndefined();
    expect(result.current.error).toMatch(/targets template #99/i);
    expect(result.current.phase).toBe('failed');
  });

  it('10. Server returns 404 — error shown, phase is failed', async () => {
    const ctx = makeDocContext({ templateId: 42 });
    const { result } = renderChatHook(ctx);
    mockApplyError(404, { ok: false, error: 'Template not found: document template #42 does not exist.' });

    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 42 }));
    });

    expect(result.current.error).toMatch(/template not found/i);
    expect(result.current.phase).toBe('failed');
    // pendingChange is not set by applyChange directly — it's set by the SSE stream.
    // After a server error, the hook does NOT clear it (so any previously streamed
    // proposal remains visible). Since no stream ran in this test, it stays null.
    // The important thing is the error is shown and phase is failed.
    expect(result.current.isApplying).toBe(false);
  });

  it('11. Server returns 422 validation error — error shown', async () => {
    const ctx = makeDocContext({ templateId: 42 });
    const { result } = renderChatHook(ctx);
    mockApplyError(422, { ok: false, error: 'Validation failed', validationErrors: ['Unknown block type: magic_block'] });

    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 42 }));
    });

    expect(result.current.error).toMatch(/validation failed/i);
    expect(result.current.phase).toBe('failed');
  });

  it('15. Error is cleared when sendMessage is called', async () => {
    const ctx = makeDocContext({ templateId: 42 });
    const { result } = renderChatHook(ctx);

    // Inject an error via stale-ID rejection
    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 99 }));
    });
    expect(result.current.error).not.toBeNull();

    // Mock the SSE stream response for sendMessage
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done","conversationId":"c1"}\n\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce({ ok: true, body: { getReader: () => stream.getReader() } });

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    // Error should be cleared at the start of sendMessage
    // (it's cleared synchronously before the fetch, so after the call it's null)
    expect(result.current.error).toBeNull();
  });
});
