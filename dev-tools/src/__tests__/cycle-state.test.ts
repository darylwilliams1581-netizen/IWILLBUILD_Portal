import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Module-scoped singleton state — reset via a fresh module instance per test
// so `currentCycleId`/`cycleHasError` from one test can't leak into the next.
async function freshCycleState() {
  vi.resetModules();
  return import('../cycle-state');
}

describe('cycle-state', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('hasCurrentCycleErrored starts false for a fresh module instance', async () => {
    const { hasCurrentCycleErrored } = await freshCycleState();
    expect(hasCurrentCycleErrored()).toBe(false);
  });

  it('markCurrentCycleErrored flags the current cycle', async () => {
    const { markCurrentCycleErrored, hasCurrentCycleErrored } = await freshCycleState();
    markCurrentCycleErrored();
    expect(hasCurrentCycleErrored()).toBe(true);
  });

  it('advanceCycleId resets cycleHasError for the new cycle', async () => {
    const { advanceCycleId, markCurrentCycleErrored, hasCurrentCycleErrored } = await freshCycleState();
    markCurrentCycleErrored();
    expect(hasCurrentCycleErrored()).toBe(true);

    advanceCycleId();

    expect(hasCurrentCycleErrored()).toBe(false);
  });

  it('advanceCycleId returns a strictly greater id than the previous cycle', async () => {
    const { advanceCycleId, getCurrentCycleId } = await freshCycleState();
    const before = getCurrentCycleId();

    const after = advanceCycleId();

    expect(after).toBeGreaterThan(before);
    expect(getCurrentCycleId()).toBe(after);
  });

  it('advanceCycleId stays monotonic across two advances within the same millisecond', async () => {
    const { advanceCycleId } = await freshCycleState();
    const first = advanceCycleId();
    const second = advanceCycleId();

    expect(second).toBeGreaterThan(first);
  });

  it('advanceCycleId stays monotonic even if the wall clock goes backwards', async () => {
    const { advanceCycleId, getCurrentCycleId } = await freshCycleState();
    const before = getCurrentCycleId();

    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(before - 10_000);
    const after = advanceCycleId();

    expect(after).toBeGreaterThan(before);
    dateNowSpy.mockRestore();
  });
});
