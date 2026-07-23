/**
 * Customer-facing airo-video-slots.js re-implements Safari autoplay helpers from
 * autoplay-video.ts (dev-tools can't ship into standalone preview loads).
 * This file asserts the shared contract so the copies stay in lockstep.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BG_VIDEO_FILL_STYLE } from "../autoplay-video";

const publicScript: string = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../public/airo-video-slots.js"),
  "utf8",
);

describe("airo-video-slots.js Safari autoplay parity", function parityTests() {
  it("ships the same background fill style as autoplay-video.ts", function fillStyle() {
    expect(publicScript).toContain(BG_VIDEO_FILL_STYLE);
  });

  it("mirrors configureAutoplayVideo Safari attributes and readyState gate", function configureParity() {
    expect(publicScript).toContain("video.setAttribute('muted', '')");
    expect(publicScript).toContain("video.setAttribute('playsinline', '')");
    expect(publicScript).toContain("video.setAttribute('webkit-playsinline', '')");
    expect(publicScript).toContain("video.defaultMuted = true");
    expect(publicScript).toContain("video.preload = 'auto'");
    // HAVE_CURRENT_DATA === 2 — must not always attach loadeddata when already ready
    expect(publicScript).toMatch(/if \(video\.readyState >= 2\)/);
    expect(publicScript).toContain("video.addEventListener('loadeddata', kick, { once: true })");
    expect(publicScript).toContain("requestAnimationFrame(kick)");
  });

  it("mirrors prepareBackgroundVideoHost Safari clear-bg contract", function hostParity() {
    expect(publicScript).toContain("data-airo-bg-video-clear-bg");
    expect(publicScript).toContain("el.style.setProperty('background-color', 'transparent', 'important')");
    expect(publicScript).toMatch(/if \(pos === 'static'\) el\.style\.position = 'relative'/);
  });
});
