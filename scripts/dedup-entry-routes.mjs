#!/usr/bin/env node
/**
 * dedup-entry-routes.mjs — NO-OP (kept for publish-build.mjs compatibility)
 *
 * Architecture change (2026-07-06):
 *   - Route group files (routes-safety.ts, routes-jobs.ts, etc.) are now
 *     imported STATICALLY from entry.ts and called as registerXxxRoutes(app).
 *   - rollupOptions.input now has a SINGLE entry point (server.bundle).
 *   - This eliminates the multi-entry parallel build that caused OOM kills.
 *   - There are no longer any duplicate registrations to remove.
 *
 * This script is kept as a no-op so publish-build.mjs doesn't need changes.
 */
console.log('[dedup] Single-entry build — no duplicates to remove. Done.');
