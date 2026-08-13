import { describe, expect, it } from "vitest";

import { runMediaAudit } from "../domAudit";

describe("domAudit media", function packageTests() {
  it("captures missing src for turtle key mismatch symptom", async function missingSrc() {
    document.body.innerHTML = `
      <main>
        <img data-slot="pages/turtles/t-1" />
        <img src="/airo-assets/images/logo/brand" />
      </main>
    `;
    const loaded = document.querySelector('img[src]') as HTMLImageElement;
    Object.defineProperty(loaded, "complete", { configurable: true, get: () => true });
    Object.defineProperty(loaded, "naturalWidth", { configurable: true, get: () => 120 });

    const result = await runMediaAudit({ quietMs: 1 });
    expect(result.eligibleCount).toBe(2);
    expect(result.checkedCount).toBe(1);
    expect(result.failures).toEqual([
      { reason: "missing_src", failureCount: 1 },
    ]);
  });

  it("does not count still-loading images as checked", async function incomplete() {
    document.body.innerHTML = `
      <main>
        <img src="/airo-assets/images/pages/home/hero" data-slot="pages/home/hero" />
      </main>
    `;
    const img = document.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "complete", { configurable: true, get: () => false });
    Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => 0 });

    const result = await runMediaAudit({ settleTimeoutMs: 20, quietMs: 1 });
    expect(result.eligibleCount).toBe(1);
    expect(result.checkedCount).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it("counts zero natural size only after load completes", async function zeroSize() {
    document.body.innerHTML = `
      <main>
        <img src="/airo-assets/images/pages/home/hero" data-slot="pages/home/hero" />
      </main>
    `;
    const img = document.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "complete", { configurable: true, get: () => true });
    Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => 0 });

    const result = await runMediaAudit({ settleTimeoutMs: 20, quietMs: 1 });
    expect(result.eligibleCount).toBe(1);
    expect(result.checkedCount).toBe(1);
    expect(result.failures).toEqual([
      { reason: "zero_natural_size", failureCount: 1 },
    ]);
  });

  it("includes images added during settle", async function hmrInsert() {
    document.body.innerHTML = `
      <main>
        <img src="/airo-assets/images/pages/home/hero" data-slot="pages/home/hero" />
      </main>
    `;
    const first = document.querySelector("img") as HTMLImageElement;
    Object.defineProperty(first, "complete", { configurable: true, get: () => true });
    Object.defineProperty(first, "naturalWidth", { configurable: true, get: () => 200 });

    const pending = runMediaAudit({ settleTimeoutMs: 100, quietMs: 20 });
    setTimeout(function insert() {
      const added = document.createElement("img");
      added.setAttribute("src", "/airo-assets/images/pages/home/secondary");
      added.setAttribute("data-slot", "pages/home/secondary");
      Object.defineProperty(added, "complete", { configurable: true, get: () => true });
      Object.defineProperty(added, "naturalWidth", { configurable: true, get: () => 100 });
      document.querySelector("main")?.appendChild(added);
    }, 10);
    const result = await pending;
    expect(result.eligibleCount).toBe(2);
    expect(result.checkedCount).toBe(2);
    expect(result.failures).toEqual([]);
  });

  it("waits for load before counting a checked image", async function waitsForLoad() {
    document.body.innerHTML = `
      <main>
        <img src="/airo-assets/images/pages/home/hero" data-slot="pages/home/hero" />
      </main>
    `;
    const img = document.querySelector("img") as HTMLImageElement;
    let complete = false;
    Object.defineProperty(img, "complete", { configurable: true, get: () => complete });
    Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => (complete ? 200 : 0) });

    const pending = runMediaAudit({ settleTimeoutMs: 5_000, quietMs: 1 });
    queueMicrotask(function finish() {
      complete = true;
      img.dispatchEvent(new Event("load"));
    });
    const result = await pending;
    expect(result.checkedCount).toBe(1);
    expect(result.failures).toEqual([]);
  });
});
