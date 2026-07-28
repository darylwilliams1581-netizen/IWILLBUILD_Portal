import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const _dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(_dir, "../..");

function src(rel: string): string {
  const p = join(ROOT, "src", rel);
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
}

const entry = src("server/entry.ts");

// ── API guard ─────────────────────────────────────────────────────────────────

describe("API guard", () => {
  it("has guard",      () => { expect(entry).toContain("app.use('/api'"); });
  it("401",            () => { expect(entry).toContain("Unauthorised"); });
  it("isPublicRoute",  () => { expect(entry).toContain("isPublicRoute"); });
  it("requireOwner",   () => { expect(entry).toContain("requireOwner"); });
  it("requireAdmin",   () => { expect(entry).toContain("requireAdmin"); });
});

// ── Migrate routes are registered ────────────────────────────────────────────
// Migrate routes are protected by the global /api auth guard (all non-public
// /api/* routes require a valid session).  Owner-only enforcement is applied
// inside each handler via the requireOwner middleware imported from
// auth-middleware.ts.  These tests verify the routes are registered in entry.ts
// and that the requireOwner symbol is imported (i.e. available for use).
//
// Uses String.includes() with literal substrings — no RegExp — to avoid
// catastrophic-backtracking (ReDoS) security findings.

describe("Migrate routes registered", () => {
  const routes = [
    "/api/migrate-company-settings",
    "/api/migrate-dazza-audit",
    "/api/migrate-jobs",
    "/api/migrate-team",
    "/api/migrate-fleet",
    "/api/migrate-estimates",
    "/api/migrate-files",
    "/api/migrate-form-fields",
    "/api/migrate-safety",
  ];

  for (const route of routes) {
    it(route, () => {
      expect(entry).toContain(`"${route}"`);
    });
  }
});

describe("requireOwner imported in entry", () => {
  it("requireOwner is imported", () => {
    expect(entry).toContain("requireOwner");
  });
});
