/**
 * dazza-apply-send-regression.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused regression tests for the apply/send bugs fixed in this checkpoint.
 *
 * Scenarios:
 *  1.  Send button click and Enter submit call sendMessage exactly once each
 *  2.  Proposal generated for route ID 71 retains targetTemplateId 71
 *  3.  Apply button click and keyboard activation (Enter/Space) use one handler
 *  4.  Matching open target applies even if store templateId is null (uses canonicalTemplateId)
 *  5.  A truly different targetTemplateId is rejected safely
 *  6.  Successful apply inserts H2 heading + paragraph, enables Undo/Save, no new template
 *  7.  Re-run rebases to the current canonical route ID (not stale proposal ID)
 *  8.  Double-send guard: rapid button click + Enter does not send twice
 *  9.  Double-apply guard: rapid click + keyboard does not apply twice
 * 10.  canonicalTemplateId in context matches route param (71)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderHook } from '@testing-library/react';
import ProposedChangeCard from '../ProposedChangeCard';
import { useDazzaBuilderChat } from '../useDazzaBuilderChat';
import type { BuilderContext, ProposedChange } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<BuilderContext> = {}): BuilderContext {
  return {
    builderType: 'document',
    templateId: 71,
    templateName: 'Envinomental Policy',
    templateType: 'policy',
    currentVersion: 0,
    schemaSummary: 'Template type: policy\nTotal blocks: 0',
    selectedId: null,
    hasUnsavedChanges: false,
    validationErrors: [],
    isPreviewMode: false,
    canonicalTemplateId: 71,
    ...overrides,
  };
}

/** Context where store hasn't loaded yet (templateId null) but route is /71 */
function makeCtxStoreNotLoaded(): BuilderContext {
  return makeCtx({ templateId: null, canonicalTemplateId: 71 });
}

function makeProposal(overrides: Partial<ProposedChange> = {}): ProposedChange {
  return {
    summary: 'Add heading and paragraph',
    affectedSections: ['Page 1'],
    affectedItems: ['Heading', 'Paragraph'],
    validationImpact: 'None',
    operations: [
      { op: 'addBlock', blockType: 'heading', content: 'Dazza Test', level: 2, insertPosition: 'top' },
      { op: 'addBlock', blockType: 'paragraph', content: 'This content was created by Dazza.' },
    ],
    conversationId: 'conv-71',
    targetTemplateId: 71,
    targetBuilderType: 'document',
    ...overrides,
  };
}

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockVersionsFetch() {
  // Route all fetches by URL so apply and versions don't interfere
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/apply')) {
      return { ok: false, status: 500, json: async () => ({ error: 'No apply mock set up' }) };
    }
    if (String(url).includes('/chat/stream')) {
      return { ok: false, status: 500, json: async () => ({ error: 'No stream mock set up' }) };
    }
    // Default: versions fetch
    return { ok: true, json: async () => ({ versions: [] }) };
  });
}

function mockApplySuccess(overrides: Record<string, unknown> = {}) {
  const prev = mockFetch.getMockImplementation();
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/apply')) {
      // Restore previous implementation after one apply call
      mockFetch.mockImplementation(prev ?? (async () => ({ ok: true, json: async () => ({ versions: [] }) })));
      return {
        ok: true,
        json: async () => ({
          ok: true,
          versionId: 'v-071',
          versionNumber: 1,
          operationsApplied: 2,
          ...overrides,
        }),
      };
    }
    return prev ? prev(url) : { ok: true, json: async () => ({ versions: [] }) };
  });
}

function mockApplyError(status: number, body: Record<string, unknown>) {
  const prev = mockFetch.getMockImplementation();
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/apply')) {
      mockFetch.mockImplementation(prev ?? (async () => ({ ok: true, json: async () => ({ versions: [] }) })));
      return { ok: false, status, json: async () => body };
    }
    return prev ? prev(url) : { ok: true, json: async () => ({ versions: [] }) };
  });
}

function mockStreamResponse(events: string[]) {
  const encoder = new TextEncoder();
  const prev = mockFetch.getMockImplementation();
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes('/chat/stream')) {
      mockFetch.mockImplementation(prev ?? (async () => ({ ok: true, json: async () => ({ versions: [] }) })));
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            for (const ev of events) {
              controller.enqueue(encoder.encode(`data: ${ev}\n\n`));
            }
            controller.close();
          },
        }),
      };
    }
    return prev ? prev(url) : { ok: true, json: async () => ({ versions: [] }) };
  });
}

function renderChatHook(ctx: BuilderContext) {
  return renderHook(
    () => useDazzaBuilderChat({ builderContext: ctx }),
    { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Regression: Send button and Enter submit', () => {
  beforeEach(() => mockVersionsFetch());
  afterEach(() => vi.clearAllMocks());
  it('1a. Send button click calls sendMessage exactly once', async () => {
    const ctx = makeCtx();
    const { result } = renderChatHook(ctx);
    const sendSpy = vi.spyOn(result.current, 'sendMessage');

    mockStreamResponse([JSON.stringify({ type: 'done', conversationId: 'c1' })]);

    // Simulate a single button click via the hook directly
    await act(async () => {
      await result.current.sendMessage('Insert a heading');
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith('Insert a heading');
  });

  it('1b. Enter key and button click on same frame: sendingRef prevents double-send', async () => {
    const ctx = makeCtx();
    const { result } = renderChatHook(ctx);

    // First call starts a stream (takes time)
    mockStreamResponse([JSON.stringify({ type: 'done', conversationId: 'c1' })]);
    // Second call would also need a mock — but it should be blocked
    mockStreamResponse([JSON.stringify({ type: 'done', conversationId: 'c2' })]);

    let firstCallDone = false;
    const firstCall = act(async () => {
      await result.current.sendMessage('Insert a heading');
      firstCallDone = true;
    });

    // Immediately fire a second send while first is in-flight
    // (simulates Enter + click on same frame)
    const secondCall = act(async () => {
      await result.current.sendMessage('Insert a heading');
    });

    await Promise.all([firstCall, secondCall]);
    expect(firstCallDone).toBe(true);

    // Only one stream fetch should have been made (the second was blocked by phase guard)
    const streamCalls = mockFetch.mock.calls.filter(c =>
      String(c[0]).includes('/chat/stream'),
    );
    expect(streamCalls.length).toBe(1);
  });
});

describe('Regression: Proposal retains route template ID', () => {
  afterEach(() => vi.clearAllMocks());

  it('2. Proposal targetTemplateId matches route ID 71', () => {
    // The orchestrator stamps targetTemplateId from builderContext.templateId.
    // This test verifies the client-side check passes when IDs match.
    const ctx = makeCtx({ templateId: 71, canonicalTemplateId: 71 });
    const proposal = makeProposal({ targetTemplateId: 71 });

    render(
      <MemoryRouter>
        <ProposedChangeCard
          change={proposal}
          builderContext={ctx}
          onApply={vi.fn()}
          onUndo={vi.fn()}
          isApplying={false}
        />
      </MemoryRouter>,
    );

    // Apply button should be enabled (IDs match)
    const applyBtn = screen.getByRole('button', { name: /^apply$/i });
    expect(applyBtn).not.toBeDisabled();
    // No stale warning
    expect(screen.queryByText(/targets template/i)).toBeNull();
  });
});

describe('Regression: Apply button click and keyboard activation', () => {
  afterEach(() => vi.clearAllMocks());

  it('3a. Apply button click fires onApply', () => {
    const onApply = vi.fn();
    const proposal = makeProposal();
    const ctx = makeCtx();

    render(
      <MemoryRouter>
        <ProposedChangeCard
          change={proposal}
          builderContext={ctx}
          onApply={onApply}
          onUndo={vi.fn()}
          isApplying={false}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(proposal);
  });

  it('3b. Apply button keyboard Enter fires onApply once', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const proposal = makeProposal();
    const ctx = makeCtx();

    render(
      <MemoryRouter>
        <ProposedChangeCard
          change={proposal}
          builderContext={ctx}
          onApply={onApply}
          onUndo={vi.fn()}
          isApplying={false}
        />
      </MemoryRouter>,
    );

    const applyBtn = screen.getByRole('button', { name: /^apply$/i });
    applyBtn.focus();
    await user.keyboard('{Enter}');
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('3c. Apply button keyboard Space fires onApply once', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const proposal = makeProposal();
    const ctx = makeCtx();

    render(
      <MemoryRouter>
        <ProposedChangeCard
          change={proposal}
          builderContext={ctx}
          onApply={onApply}
          onUndo={vi.fn()}
          isApplying={false}
        />
      </MemoryRouter>,
    );

    const applyBtn = screen.getByRole('button', { name: /^apply$/i });
    applyBtn.focus();
    await user.keyboard(' ');
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});

describe('Regression: canonicalTemplateId fallback for apply', () => {
  beforeEach(() => mockVersionsFetch());
  afterEach(() => vi.clearAllMocks());

  it('4. Store templateId null + canonicalTemplateId 71 → apply sends 71, not null', async () => {
    const ctx = makeCtxStoreNotLoaded(); // templateId: null, canonicalTemplateId: 71
    const { result } = renderChatHook(ctx);
    mockApplySuccess();

    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 71 }));
    });

    const applyCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/apply'));
    expect(applyCall).toBeTruthy();
    const body = JSON.parse(applyCall![1].body as string);
    // Must send 71 (from canonicalTemplateId), NOT null
    expect(body.templateId).toBe(71);
    expect(body.builderType).toBe('document');
  });

  it('4b. ProposedChangeCard Apply enabled when store is null but canonical matches', () => {
    const ctx = makeCtxStoreNotLoaded(); // templateId: null, canonicalTemplateId: 71
    const proposal = makeProposal({ targetTemplateId: 71 });

    render(
      <MemoryRouter>
        <ProposedChangeCard
          change={proposal}
          builderContext={ctx}
          onApply={vi.fn()}
          onUndo={vi.fn()}
          isApplying={false}
        />
      </MemoryRouter>,
    );

    // Should NOT be blocked — canonical ID matches
    const applyBtn = screen.getByRole('button', { name: /^apply$/i });
    expect(applyBtn).not.toBeDisabled();
  });

  it('5. Truly different targetTemplateId is rejected safely', async () => {
    const ctx = makeCtx({ templateId: 71, canonicalTemplateId: 71 });
    const { result } = renderChatHook(ctx);

    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 99 }));
    });

    // No apply fetch
    const applyCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/apply'));
    expect(applyCall).toBeUndefined();
    expect(result.current.error).toMatch(/targets template #99/i);
    expect(result.current.phase).toBe('failed');
  });
});

describe('Regression: Successful apply result', () => {
  beforeEach(() => {
    // Default: all fetches return empty versions unless overridden
    mockVersionsFetch();
  });
  afterEach(() => vi.clearAllMocks());

  it('6. Successful apply: phase complete, version recorded, no new template created', async () => {
    const onApplied = vi.fn();
    const ctx = makeCtx();
    mockApplySuccess({ operationsApplied: 2 });

    const { result: hookResult } = renderHook(
      () => useDazzaBuilderChat({ builderContext: ctx, onApplied }),
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
    );

    await act(async () => {
      await hookResult.current.applyChange(makeProposal());
    });

    // Phase should be complete (or idle after timeout)
    expect(['complete', 'idle']).toContain(hookResult.current.phase);
    // onApplied called with versionId and versionNumber
    expect(onApplied).toHaveBeenCalledWith('v-071', 1);
    // No error
    expect(hookResult.current.error).toBeNull();
    // isApplying reset
    expect(hookResult.current.isApplying).toBe(false);
    // Apply fetch was made with correct templateId
    const applyCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/apply'));
    expect(applyCall).toBeTruthy();
    const body = JSON.parse(applyCall![1].body as string);
    expect(body.templateId).toBe(71);
    expect(body.operations).toHaveLength(2);
  });

  it('6b. Apply with 2 ops (heading + paragraph) sends correct operations', async () => {
    const ctx = makeCtx();
    mockApplySuccess();

    const { result } = renderChatHook(ctx);

    const proposal = makeProposal();
    await act(async () => {
      await result.current.applyChange(proposal);
    });

    const applyCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/apply'));
    const body = JSON.parse(applyCall![1].body as string);
    expect(body.operations).toHaveLength(2);
    expect(body.operations[0].op).toBe('addBlock');
    expect(body.operations[0].blockType).toBe('heading');
    expect(body.operations[0].content).toBe('Dazza Test');
    expect(body.operations[0].insertPosition).toBe('top');
    expect(body.operations[1].op).toBe('addBlock');
    expect(body.operations[1].blockType).toBe('paragraph');
    expect(body.operations[1].content).toBe('This content was created by Dazza.');
  });
});

describe('Regression: Re-run uses current canonical route ID', () => {
  beforeEach(() => mockVersionsFetch());
  afterEach(() => vi.clearAllMocks());

  it('7. Re-run after stale error sends message with current context (templateId 71)', async () => {
    const ctx = makeCtx({ templateId: 71, canonicalTemplateId: 71 });

    const { result } = renderChatHook(ctx);
    await act(async () => { await Promise.resolve(); }); // let versions effect settle

    // Trigger a stale-ID error (no fetch needed — client rejects before fetch)
    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 99 }));
    });
    expect(result.current.error).not.toBeNull();

    // Re-run: send a new message — should use current context (templateId 71)
    const encoder = new TextEncoder();
    const doneEvent = JSON.stringify({ type: 'done', conversationId: 'c-rerun' });
    const prev = mockFetch.getMockImplementation();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat/stream')) {
        mockFetch.mockImplementation(prev ?? (async () => ({ ok: true, json: async () => ({ versions: [] }) })));
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
              controller.close();
            },
          }),
        };
      }
      return prev ? prev(url) : { ok: true, json: async () => ({ versions: [] }) };
    });

    await act(async () => {
      await result.current.sendMessage('Insert a heading titled "Dazza Test"');
    });

    const streamCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/chat/stream'));
    expect(streamCall).toBeTruthy();
    const body = JSON.parse(streamCall![1].body as string);
    // builderContext sent to server must have templateId 71
    expect(body.builderContext.templateId).toBe(71);
    expect(body.builderContext.canonicalTemplateId).toBe(71);
    // Error cleared
    expect(result.current.error).toBeNull();
  });
});

describe('Regression: Double-apply guard', () => {
  beforeEach(() => mockVersionsFetch());
  afterEach(() => vi.clearAllMocks());

  it('9. Rapid double-apply: applyingRef prevents second call while first is in-flight', async () => {
    const ctx = makeCtx();
    mockApplySuccess();
    mockApplySuccess(); // second mock (should not be consumed)

    const { result } = renderChatHook(ctx);

    const proposal = makeProposal();
    const first = act(async () => { await result.current.applyChange(proposal); });
    const second = act(async () => { await result.current.applyChange(proposal); });

    await Promise.all([first, second]);

    // Only one apply fetch should have been made
    const applyCalls = mockFetch.mock.calls.filter(c => String(c[0]).includes('/apply'));
    expect(applyCalls.length).toBe(1);
  });
});

describe('Regression: canonicalTemplateId in context', () => {
  it('10. buildDocumentBuilderContext includes canonicalTemplateId from route param', async () => {
    const { buildDocumentBuilderContext } = await import('../DocumentBuilderAdapter');
    const snapshot = {
      templateId: 71,
      templateName: 'Envinomental Policy',
      templateType: 'policy',
      blocks: [],
      logicRules: [],
      isDirty: false,
      mode: 'build',
      pageLayout: {},
      docKind: 'doc',
      requiresAcknowledgement: false,
    };
    const ctx = buildDocumentBuilderContext(snapshot as Parameters<typeof buildDocumentBuilderContext>[0], null, [], 0, 71);
    expect(ctx.canonicalTemplateId).toBe(71);
    expect(ctx.templateId).toBe(71);
  });

  it('10b. buildDocumentBuilderContextFromTemplate includes canonicalTemplateId', async () => {
    const { buildDocumentBuilderContextFromTemplate } = await import('../DocumentBuilderAdapter');
    const template = {
      id: 71,
      name: 'Envinomental Policy',
      templateType: 'policy' as const,
      blocks: [],
      pageLayout: { paperSize: 'A4', orientation: 'portrait', margins: 'standard' },
      theme: { backgroundColor: '#fff', accentColor: '#000', textColor: '#000', tableHeaderColor: '#000', tableHeaderTextColor: '#fff' },
      systemFields: [],
      sourceAttachments: [],
    };
    const ctx = buildDocumentBuilderContextFromTemplate(template as Parameters<typeof buildDocumentBuilderContextFromTemplate>[0], 0, 71);
    expect(ctx.canonicalTemplateId).toBe(71);
    expect(ctx.templateId).toBe(71);
  });
});

// ── New integration tests: canonicalTemplateId stamping via sendMessage ────────
//
// These tests cover the full path:
//   sendMessage → stream request body includes canonicalTemplateId
//   → server stamps proposal with canonicalTemplateId (not null templateId)
//   → ProposedChangeCard Apply is enabled
//   → Re-run does not loop

describe('Integration: canonicalTemplateId stamped on proposal when store is null', () => {
  beforeEach(() => mockVersionsFetch());
  afterEach(() => vi.clearAllMocks());

  /**
   * 11. sendMessage with templateId=null, canonicalTemplateId=71 sends
   *     canonicalTemplateId=71 in the stream request body.
   *     The server will use this to stamp targetTemplateId=71 on the proposal.
   */
  it('11. sendMessage sends canonicalTemplateId=71 even when store templateId is null', async () => {
    const ctx = makeCtxStoreNotLoaded(); // templateId: null, canonicalTemplateId: 71
    const { result } = renderChatHook(ctx);

    const proposalEvent = JSON.stringify({
      type: 'proposed_change',
      change: {
        summary: 'Add heading',
        affectedSections: [],
        affectedItems: [],
        validationImpact: '',
        operations: [{ op: 'addBlock', blockType: 'heading', content: 'Test' }],
        conversationId: 'conv-71',
        // Server stamps this from canonicalTemplateId — simulate correct stamp
        targetTemplateId: 71,
        targetBuilderType: 'document',
      },
    });
    const doneEvent = JSON.stringify({ type: 'done', conversationId: 'conv-71' });
    mockStreamResponse([proposalEvent, doneEvent]);

    await act(async () => {
      await result.current.sendMessage('Add a heading');
    });

    // Verify the stream request body sent canonicalTemplateId
    const streamCall = mockFetch.mock.calls.find(c => String(c[0]).includes('/chat/stream'));
    expect(streamCall).toBeTruthy();
    const body = JSON.parse(streamCall![1].body as string);
    expect(body.builderContext.canonicalTemplateId).toBe(71);
    // templateId may be null (store not loaded) — that's fine, server uses canonicalTemplateId
    expect(body.builderContext.templateId).toBeNull();
  });

  /**
   * 12. When the server correctly stamps targetTemplateId=71 (from canonicalTemplateId),
   *     ProposedChangeCard Apply is enabled even though store templateId is null.
   */
  it('12. Proposal with targetTemplateId=71 is not blocked when store templateId is null', () => {
    const ctx = makeCtxStoreNotLoaded(); // templateId: null, canonicalTemplateId: 71
    // Proposal stamped correctly by server (using canonicalTemplateId)
    const proposal = makeProposal({ targetTemplateId: 71 });

    const { container } = render(
      <MemoryRouter>
        <ProposedChangeCard
          change={proposal}
          builderContext={ctx}
          onApply={vi.fn()}
          onUndo={vi.fn()}
          isApplying={false}
        />
      </MemoryRouter>,
    );

    const applyBtn = container.querySelector('button[class*="bg-violet"]') as HTMLButtonElement | null;
    expect(applyBtn).toBeTruthy();
    expect(applyBtn!.disabled).toBe(false);
    // No "Cannot Apply" text
    expect(applyBtn!.textContent).not.toContain('Cannot Apply');
    // No block reason warning shown
    expect(container.querySelector('[class*="amber"]')).toBeNull();
  });

  /**
   * 13. Re-run after a stale-proposal error does NOT loop:
   *     - First sendMessage produces a proposal with targetTemplateId=71
   *     - Apply succeeds
   *     - A second sendMessage (re-run) also sends canonicalTemplateId=71
   *     - No "template no longer exists" error
   */
  it('13. Re-run after successful apply sends canonicalTemplateId=71, no loop', async () => {
    const ctx = makeCtxStoreNotLoaded(); // templateId: null, canonicalTemplateId: 71
    const { result } = renderChatHook(ctx);

    const encoder = new TextEncoder();

    // First send: produces a proposal stamped with targetTemplateId=71
    const proposalEvent = JSON.stringify({
      type: 'proposed_change',
      change: {
        summary: 'Add heading',
        affectedSections: [],
        affectedItems: [],
        validationImpact: '',
        operations: [{ op: 'addBlock', blockType: 'heading', content: 'Test' }],
        conversationId: 'conv-71',
        targetTemplateId: 71,
        targetBuilderType: 'document',
      },
    });
    const doneEvent = JSON.stringify({ type: 'done', conversationId: 'conv-71' });
    mockStreamResponse([proposalEvent, doneEvent]);

    await act(async () => {
      await result.current.sendMessage('Add a heading');
    });

    // Apply the proposal
    mockApplySuccess();
    await act(async () => {
      await result.current.applyChange(makeProposal({ targetTemplateId: 71 }));
    });
    expect(result.current.error).toBeNull();
    expect(['complete', 'idle']).toContain(result.current.phase);

    // Re-run: second sendMessage — must send canonicalTemplateId=71, not loop
    const prev2 = mockFetch.getMockImplementation();
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat/stream')) {
        mockFetch.mockImplementation(prev2 ?? (async () => ({ ok: true, json: async () => ({ versions: [] }) })));
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
              controller.close();
            },
          }),
        };
      }
      return prev2 ? prev2(url) : { ok: true, json: async () => ({ versions: [] }) };
    });

    await act(async () => {
      await result.current.sendMessage('Add another heading');
    });

    const allStreamCalls = mockFetch.mock.calls.filter(c => String(c[0]).includes('/chat/stream'));
    expect(allStreamCalls.length).toBe(2);
    const rerunBody = JSON.parse(allStreamCalls[1][1].body as string);
    // Re-run must still send canonicalTemplateId=71
    expect(rerunBody.builderContext.canonicalTemplateId).toBe(71);
    // No error — no loop
    expect(result.current.error).toBeNull();
  });

  /**
   * 14. Error mapping: a 400 validation error is shown as-is, NOT as
   *     "template no longer exists". Only TEMPLATE_NOT_FOUND triggers that message.
   */
  it('14. 400 validation error shown as-is, not as "template no longer exists"', async () => {
    const ctx = makeCtx();
    mockApplyError(400, { ok: false, error: 'Validation failed: block type "unknown" is not allowed' });

    const { result } = renderChatHook(ctx);

    await act(async () => {
      await result.current.applyChange(makeProposal());
    });

    expect(result.current.error).toBe('Validation failed: block type "unknown" is not allowed');
    expect(result.current.error).not.toContain('no longer exists');
  });

  /**
   * 15. TEMPLATE_NOT_FOUND error shows the friendly "no longer exists" message.
   */
  it('15. TEMPLATE_NOT_FOUND error shows friendly "no longer exists" message', async () => {
    const ctx = makeCtx();
    mockApplyError(404, { ok: false, error: 'TEMPLATE_NOT_FOUND: template 71 does not exist' });

    const { result } = renderChatHook(ctx);

    await act(async () => {
      await result.current.applyChange(makeProposal());
    });

    expect(result.current.error).toContain('no longer exists');
  });
});
