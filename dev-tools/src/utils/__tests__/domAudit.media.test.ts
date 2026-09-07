import { describe, expect, it } from "vitest";

import { runDomAudit, runMediaAudit } from "../domAudit";

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

describe("runDomAudit scoped mode", function scopedTests() {
  it("returns no issues when slot url matches img src exactly", function slotFound() {
    const slotUrl: string = "/airo-assets/images/pages/home/hero";
    document.body.innerHTML = `<img src="${slotUrl}" />`;
    const img = document.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "complete", { configurable: true, get: () => true });
    Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => 150 });

    const issues = runDomAudit([], [slotUrl]);
    expect(issues).toHaveLength(0);
  });

  it("reports broken-image when slot url is not found in the DOM", function slotMissing() {
    document.body.innerHTML = `<img src="/airo-assets/images/pages/home/other" />`;

    const issues = runDomAudit([], ["/airo-assets/images/pages/home/hero"]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("broken-image");
    expect(issues[0]!.detail).toMatch(/not rendered/);
  });

  it("reports broken-image when img is complete but naturalWidth is 0", function failedLoad() {
    const slotUrl: string = "/airo-assets/images/pages/home/hero";
    document.body.innerHTML = `<img src="${slotUrl}" />`;
    const img = document.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "complete", { configurable: true, get: () => true });
    Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => 0 });
    // Ensure src is not a data: URL so the naturalWidth=0 guard fires.
    Object.defineProperty(img, "src", { configurable: true, get: () => `http://localhost${slotUrl}` });

    const issues = runDomAudit([], [slotUrl]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe("broken-image");
  });

  it("returns no issues for a background-image CSS match", function backgroundMatch() {
    const slotUrl: string = "/airo-assets/images/pages/home/hero";
    document.body.innerHTML = `<div style="background-image: url('${slotUrl}')"></div>`;

    const issues = runDomAudit([], [slotUrl]);
    expect(issues).toHaveLength(0);
  });
});

describe("runDomAudit unscoped mode", function unscopedTests() {
  it("reports broken-image for img without src attribute", function missingSrcAttr() {
    document.body.innerHTML = `<img alt="hero" />`;

    const issues = runDomAudit([]);
    const brokenImages = issues.filter((i) => i.type === "broken-image");
    expect(brokenImages).toHaveLength(1);
    expect(brokenImages[0]!.detail).toMatch(/undefined/);
  });

  it("reports broken-image for img with empty src attribute", function emptySrc() {
    document.body.innerHTML = `<img src="" alt="hero" />`;

    const issues = runDomAudit([]);
    const brokenImages = issues.filter((i) => i.type === "broken-image");
    expect(brokenImages).toHaveLength(1);
    expect(brokenImages[0]!.detail).toMatch(/empty string/);
  });
});
