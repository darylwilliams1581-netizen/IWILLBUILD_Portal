/**
 * dazza-top-insertion-order.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test for insertPosition:'top' batch ordering.
 *
 * ROOT CAUSE:
 *   When multiple addBlock operations all use insertPosition:'top', the old
 *   code called blocks.unshift(newBlock) for each one.  unshift() always
 *   inserts at index 0, so each successive block displaces the previous one:
 *
 *     op[0] heading  → [heading]
 *     op[1] paragraph → [paragraph, heading]   ← reversed!
 *
 * FIX:
 *   A topInsertCursor starts at 0 and increments after each top-insertion.
 *   blocks.splice(topInsertCursor++, 0, newBlock) places each block at the
 *   next position after the previous one, preserving proposal order:
 *
 *     op[0] heading  → splice(0) → [heading]
 *     op[1] paragraph → splice(1) → [heading, paragraph]  ✓
 *
 * Tests:
 *   1. Two top-insertions: [heading, paragraph] stays [heading, paragraph]
 *   2. Three top-insertions: [h1, h2, h3] stays [h1, h2, h3]
 *   3. Mixed: top-insertions followed by append — tops land first in order,
 *      appends follow in order
 *   4. Re-run idempotency: applying the same two-op batch to a non-empty
 *      template still places heading before paragraph at the top
 *   5. Source guard: document-adapter.ts must NOT contain bare unshift() on
 *      the blocks array (the fix must be in place)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Source guard ──────────────────────────────────────────────────────────────
const adapterSrc = readFileSync(
  join(process.cwd(), 'src/server/lib/dazza-builder/document-adapter.ts'),
  'utf-8',
);

// ── Minimal block builder (mirrors operations.ts buildBlock logic) ─────────────
function makeBlock(id: string, type: string, content: string): Record<string, unknown> {
  return { id, type, content };
}

// ── Core insertion logic extracted for unit testing ───────────────────────────
// This mirrors the exact logic in document-adapter.ts applyDocumentOperations.
// If the adapter changes, update this mirror.
function applyAddBlockOps(
  existingBlocks: Array<Record<string, unknown>>,
  ops: Array<{
    block: Record<string, unknown>;
    afterBlockId?: string;
    beforeBlockId?: string;
    insertPosition?: string;
  }>,
): Array<Record<string, unknown>> {
  const blocks = [...existingBlocks];
  let topInsertCursor = 0;

  for (const op of ops) {
    const newBlock = op.block;
    const { afterBlockId, beforeBlockId, insertPosition } = op;

    if (afterBlockId) {
      const idx = blocks.findIndex(b => b.id === afterBlockId);
      blocks.splice(idx >= 0 ? idx + 1 : blocks.length, 0, newBlock);
    } else if (beforeBlockId) {
      const idx = blocks.findIndex(b => b.id === beforeBlockId);
      blocks.splice(idx >= 0 ? idx : 0, 0, newBlock);
    } else if (insertPosition === 'top') {
      blocks.splice(topInsertCursor, 0, newBlock);
      topInsertCursor++;
    } else {
      blocks.push(newBlock);
    }
  }

  return blocks;
}

// ── Test 1: Two top-insertions preserve proposal order ────────────────────────
describe('insertPosition:top — two-op batch', () => {
  it('1. [heading, paragraph] proposal → canvas order is [heading, paragraph]', () => {
    const result = applyAddBlockOps([], [
      { block: makeBlock('b1', 'heading', 'Dazza Test'), insertPosition: 'top' },
      { block: makeBlock('b2', 'paragraph', 'This content was created by Dazza.'), insertPosition: 'top' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('b1');
    expect(result[0].type).toBe('heading');
    expect(result[1].id).toBe('b2');
    expect(result[1].type).toBe('paragraph');
  });

  it('1b. reversed proposal [paragraph, heading] → canvas order is [paragraph, heading]', () => {
    const result = applyAddBlockOps([], [
      { block: makeBlock('b1', 'paragraph', 'First'), insertPosition: 'top' },
      { block: makeBlock('b2', 'heading', 'Second'), insertPosition: 'top' },
    ]);

    expect(result[0].id).toBe('b1');
    expect(result[1].id).toBe('b2');
  });
});

// ── Test 2: Three top-insertions preserve proposal order ─────────────────────
describe('insertPosition:top — three-op batch', () => {
  it('2. [h1, h2, h3] proposal → canvas order is [h1, h2, h3]', () => {
    const result = applyAddBlockOps([], [
      { block: makeBlock('h1', 'heading', 'Title'), insertPosition: 'top' },
      { block: makeBlock('h2', 'heading', 'Subtitle'), insertPosition: 'top' },
      { block: makeBlock('h3', 'paragraph', 'Body'), insertPosition: 'top' },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('h1');
    expect(result[1].id).toBe('h2');
    expect(result[2].id).toBe('h3');
  });
});

// ── Test 3: Mixed top + append ────────────────────────────────────────────────
describe('insertPosition:top mixed with default append', () => {
  it('3. top-insertions land first in order; appends follow in order', () => {
    const result = applyAddBlockOps([], [
      { block: makeBlock('t1', 'heading', 'Top 1'), insertPosition: 'top' },
      { block: makeBlock('a1', 'paragraph', 'Append 1') },          // default append
      { block: makeBlock('t2', 'paragraph', 'Top 2'), insertPosition: 'top' },
      { block: makeBlock('a2', 'paragraph', 'Append 2') },          // default append
    ]);

    // Expected: [t1, t2, a1, a2]
    // t1 → splice(0) → [t1]          cursor=1
    // a1 → push      → [t1, a1]
    // t2 → splice(1) → [t1, t2, a1]  cursor=2
    // a2 → push      → [t1, t2, a1, a2]
    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('t1');
    expect(result[1].id).toBe('t2');
    expect(result[2].id).toBe('a1');
    expect(result[3].id).toBe('a2');
  });
});

// ── Test 4: Re-run on non-empty template ──────────────────────────────────────
describe('insertPosition:top — re-run on existing blocks', () => {
  it('4. heading lands before paragraph at top even when template already has blocks', () => {
    const existing = [
      makeBlock('existing-1', 'paragraph', 'Pre-existing block'),
    ];

    const result = applyAddBlockOps(existing, [
      { block: makeBlock('new-1', 'heading', 'Dazza Test'), insertPosition: 'top' },
      { block: makeBlock('new-2', 'paragraph', 'Created by Dazza.'), insertPosition: 'top' },
    ]);

    // Expected: [new-1 heading, new-2 paragraph, existing-1]
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('new-1');
    expect(result[0].type).toBe('heading');
    expect(result[1].id).toBe('new-2');
    expect(result[1].type).toBe('paragraph');
    expect(result[2].id).toBe('existing-1');
  });
});

// ── Test 5: Source guard — no bare unshift on blocks ─────────────────────────
describe('document-adapter.ts source guard', () => {
  it('5. does NOT use blocks.unshift() for top-insertion (the reversed-order bug)', () => {
    // The fix replaces blocks.unshift(newBlock) with blocks.splice(topInsertCursor, 0, newBlock).
    // If unshift is present on the blocks array it means the fix was reverted.
    expect(adapterSrc).not.toMatch(/blocks\.unshift\s*\(/);
  });

  it('5b. uses topInsertCursor for top-insertion ordering', () => {
    expect(adapterSrc).toMatch(/topInsertCursor/);
  });

  it('5c. uses splice with topInsertCursor for top-insertion', () => {
    expect(adapterSrc).toMatch(/splice\s*\(\s*topInsertCursor/);
  });
});
