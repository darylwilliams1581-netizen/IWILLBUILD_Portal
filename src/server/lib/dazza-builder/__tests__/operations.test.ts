/**
 * operations.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for buildBlock() and sanitiseBlockUpdate() in operations.ts.
 *
 * Focus: image block — the case that was missing before this fix, causing
 * "[object Object]" to render when Dazza inserted an image block.
 *
 * The manual "Advanced → PPE Banner" action creates:
 *   { type: "image", src: "/airo-assets/images/safety-badges/ppe-banner-strip",
 *     alt: "PPE Required — Personal Protective Equipment",
 *     size: "full", align: "center", preserveAspectRatio: true }
 *
 * buildBlock() must produce the same schema from a Dazza addBlock operation.
 */

import { describe, it, expect } from 'vitest';
import { buildBlock, sanitiseBlockUpdate } from '../operations.js';
import type { BuilderOperation } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOp(overrides: Partial<BuilderOperation>): BuilderOperation {
  return { op: 'addBlock', ...overrides };
}

// ── buildBlock — image case ───────────────────────────────────────────────────

describe('buildBlock — image block', () => {

  it('1. PPE Banner: correct op shape produces exact manual-action schema', () => {
    const op = makeOp({
      blockType: 'image',
      src: '/airo-assets/images/safety-badges/ppe-banner-strip',
      alt: 'PPE Required — Personal Protective Equipment',
      size: 'full',
      align: 'center',
      preserveAspectRatio: true,
    });

    const block = buildBlock(op);

    expect(block.type).toBe('image');
    expect(block.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
    expect(block.alt).toBe('PPE Required — Personal Protective Equipment');
    expect(block.size).toBe('full');
    expect(block.align).toBe('center');
    expect(block.preserveAspectRatio).toBe(true);
    // id must be present (nanoid)
    expect(typeof block.id).toBe('string');
    expect((block.id as string).length).toBeGreaterThan(0);
  });

  it('2. Image block has NO content field — never "[object Object]"', () => {
    const op = makeOp({
      blockType: 'image',
      src: '/airo-assets/images/safety-badges/ppe-banner-strip',
      alt: 'PPE Required — Personal Protective Equipment',
      size: 'full',
      align: 'center',
      preserveAspectRatio: true,
    });

    const block = buildBlock(op);

    // The content field must not exist on an image block
    expect('content' in block).toBe(false);
    // And definitely not "[object Object]"
    expect(JSON.stringify(block)).not.toContain('[object Object]');
  });

  it('3. Image block with object in content field — content discarded, src used', () => {
    // Old broken Dazza shape: image data stuffed into content as an object
    const op = makeOp({
      blockType: 'image',
      content: { src: '/some/path', alt: 'broken' } as unknown as string,
      src: '/airo-assets/images/safety-badges/ppe-banner-strip',
      alt: 'PPE Required — Personal Protective Equipment',
    });

    const block = buildBlock(op);

    // src from op.src wins; object content is discarded
    expect(block.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
    expect('content' in block).toBe(false);
    expect(JSON.stringify(block)).not.toContain('[object Object]');
  });

  it('4. Image block with only object content and no src — src is empty string, not "[object Object]"', () => {
    // Worst-case old broken shape: no op.src, content is an object
    const op = makeOp({
      blockType: 'image',
      content: { src: '/some/path', alt: 'broken' } as unknown as string,
    });

    const block = buildBlock(op);

    // src falls back to '' (object content discarded)
    expect(block.src).toBe('');
    expect('content' in block).toBe(false);
    expect(JSON.stringify(block)).not.toContain('[object Object]');
  });

  it('5. Image block with string content (plain URL) — accepted as src fallback', () => {
    // Acceptable fallback: Dazza puts a plain URL string in content instead of src
    const op = makeOp({
      blockType: 'image',
      content: '/airo-assets/images/safety-badges/ppe-banner-strip',
    });

    const block = buildBlock(op);

    expect(block.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
    expect('content' in block).toBe(false);
  });

  it('6. Image block defaults: size=full, align=center, preserveAspectRatio=true', () => {
    const op = makeOp({
      blockType: 'image',
      src: '/airo-assets/images/safety-badges/risk-matrix',
    });

    const block = buildBlock(op);

    expect(block.size).toBe('full');
    expect(block.align).toBe('center');
    expect(block.preserveAspectRatio).toBe(true);
  });

  it('7. preserveAspectRatio: false is respected', () => {
    const op = makeOp({
      blockType: 'image',
      src: '/airo-assets/images/safety-badges/ppe-banner-strip',
      preserveAspectRatio: false,
    });

    const block = buildBlock(op);

    expect(block.preserveAspectRatio).toBe(false);
  });

  it('8. Each image block gets a unique id', () => {
    const op = makeOp({ blockType: 'image', src: '/airo-assets/images/safety-badges/ppe-banner-strip' });
    const a = buildBlock(op);
    const b = buildBlock(op);
    expect(a.id).not.toBe(b.id);
  });

});

// ── buildBlock — other types unaffected ───────────────────────────────────────

describe('buildBlock — other block types unaffected by image fix', () => {

  it('9. heading block still works', () => {
    const block = buildBlock(makeOp({ blockType: 'heading', content: 'Test Heading', level: 2 }));
    expect(block.type).toBe('heading');
    expect(block.content).toBe('Test Heading');
    expect(block.level).toBe(2);
  });

  it('10. text block still works', () => {
    const block = buildBlock(makeOp({ blockType: 'text', content: 'Hello world' }));
    expect(block.type).toBe('text');
    expect(block.content).toBe('Hello world');
  });

  it('11. banner block uses title/body schema (not content)', () => {
    const block = buildBlock(makeOp({ blockType: 'banner', variant: 'warning', title: 'Watch out', body: 'Be careful' }));
    expect(block.type).toBe('banner');
    expect(block.variant).toBe('warning');
    expect(block.title).toBe('Watch out');
    expect(block.body).toBe('Be careful');
    // content field must NOT exist on a banner block
    expect('content' in block).toBe(false);
  });

  it('12. divider block still works', () => {
    const block = buildBlock(makeOp({ blockType: 'divider', style: 'dashed', thickness: 2 }));
    expect(block.type).toBe('divider');
    expect(block.style).toBe('dashed');
    expect(block.thickness).toBe(2);
  });

  it('13. unknown block type falls back to content string (not [object Object])', () => {
    const block = buildBlock(makeOp({ blockType: 'unknown_future_type', content: 'some text' }));
    expect(block.content).toBe('some text');
    expect(JSON.stringify(block)).not.toContain('[object Object]');
  });

});

// ── sanitiseBlockUpdate — image fields in allowlist ───────────────────────────

describe('sanitiseBlockUpdate — image fields', () => {

  it('14. src is in the allowlist', () => {
    const op: BuilderOperation = {
      op: 'updateBlock',
      blockId: 'abc',
      src: '/airo-assets/images/safety-badges/ppe-banner-strip',
    };
    const out = sanitiseBlockUpdate(op);
    expect(out.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
  });

  it('15. alt is in the allowlist', () => {
    const op: BuilderOperation = { op: 'updateBlock', blockId: 'abc', alt: 'New alt text' };
    const out = sanitiseBlockUpdate(op);
    expect(out.alt).toBe('New alt text');
  });

  it('16. size is in the allowlist', () => {
    const op: BuilderOperation = { op: 'updateBlock', blockId: 'abc', size: 'medium' };
    const out = sanitiseBlockUpdate(op);
    expect(out.size).toBe('medium');
  });

  it('17. preserveAspectRatio is in the allowlist', () => {
    const op: BuilderOperation = { op: 'updateBlock', blockId: 'abc', preserveAspectRatio: false };
    const out = sanitiseBlockUpdate(op);
    expect(out.preserveAspectRatio).toBe(false);
  });

  it('18. arbitrary keys are still blocked', () => {
    const op: BuilderOperation = {
      op: 'updateBlock',
      blockId: 'abc',
      src: '/airo-assets/images/safety-badges/ppe-banner-strip',
      dangerousKey: 'bad',
      injectedScript: '<script>alert(1)</script>',
    };
    const out = sanitiseBlockUpdate(op);
    expect('dangerousKey' in out).toBe(false);
    expect('injectedScript' in out).toBe(false);
    // src is still allowed
    expect(out.src).toBe('/airo-assets/images/safety-badges/ppe-banner-strip');
  });

  it('19. align is in the allowlist (was already there)', () => {
    const op: BuilderOperation = { op: 'updateBlock', blockId: 'abc', align: 'center' };
    const out = sanitiseBlockUpdate(op);
    expect(out.align).toBe('center');
  });

});
