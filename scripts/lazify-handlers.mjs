/**
 * lazify-handlers.mjs
 *
 * Converts specific static handler imports in entry.ts and routes-safety.ts
 * to lazy wrappers (dynamic import on first call). This removes those modules
 * from Rollup's static module graph, reducing peak transform-phase RSS.
 *
 * Targets:
 *   entry.ts:
 *     - dazza/chat/POST (84 kB) — large AI handler, not on hot path
 *     - form-templates/seed/POST (33 kB) — admin seed endpoint
 *     - all migrate-* handlers (26 × ~5 kB each) — one-time migration ops
 *
 *   routes-safety.ts:
 *     - safety/swms/seed/POST (25 kB) — admin seed endpoint
 *     - safety/plans/seed/POST (17 kB) — admin seed endpoint
 *
 * Pattern: replace
 *   import foo from "./api/some/path";
 *   ...
 *   app.post("/api/some/path", foo);
 *
 * with:
 *   // (import removed)
 *   ...
 *   app.post("/api/some/path", async (req, res, next) => {
 *     const { default: handler } = await import("./api/some/path.js");
 *     return handler(req, res, next);
 *   });
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function lazify(filePath, targetVarPrefixes) {
  let src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  // Build map: varname -> importPath for targets
  const lazyMap = new Map(); // varname -> importPath (without extension)
  for (const line of lines) {
    const m = line.match(/^import (\w+) from "(\.\/api\/[^"]+)"/);
    if (!m) continue;
    const varname = m[1];
    const importPath = m[2];
    if (targetVarPrefixes.some(p => varname.startsWith(p))) {
      lazyMap.set(varname, importPath);
    }
  }

  console.log(`  ${filePath}: lazifying ${lazyMap.size} handlers`);

  // Remove import lines for targets
  const newLines = lines.filter(line => {
    const m = line.match(/^import (\w+) from/);
    return !(m && lazyMap.has(m[1]));
  });

  // Replace route registrations with lazy wrappers
  const result = newLines.map(line => {
    const m = line.match(/^(app\.\w+\("[^"]+",\s*)(\w+)(\);)$/);
    if (!m) return line;
    const varname = m[2];
    if (!lazyMap.has(varname)) return line;
    const importPath = lazyMap.get(varname);
    // Add .js extension for ESM compatibility in the built bundle
    const importPathJs = importPath.endsWith('.js') ? importPath : importPath + '.js';
    return `${m[1]}/* @vite-ignore */ async (req, res, next) => { try { const _m = await import("${importPathJs}"); return _m.default(req, res, next); } catch(_e) { next(_e); } }${m[3]}`;
  });

  writeFileSync(filePath, result.join('\n'), 'utf8');
  return lazyMap.size;
}

// entry.ts: lazify the heaviest handlers that are never on the hot render path
// dazza_chat_post_       — 84 KB, AI chat (not SSR-critical)
// dazza_annette_post_    — 10 KB, AI annette (not SSR-critical)
// dazza_chat_v2_post_    — AI chat v2 non-streaming
// dazza_chat_v2_stream_  — AI chat v2 streaming
// form_templates_seed_   — 34 KB, admin seed (one-time op)
// migrate_               — 28 × ~5 KB each, one-time migration ops
// owner_console_system_  — 10 KB, platform-owner only
// notifications_alerts_  — 12 KB, polling endpoint
// jobs_id_purchase_orders_idPo_pdf_ — 14 KB, PDF generation
// jobs_id_ledger_sync_   — 10 KB, accounting sync
// The <api-imports> block uses _h_ prefixed identifiers (e.g. _h_dazza_chat_post_1).
// All other handlers in entry.ts use the original naming (e.g. safety_swms_seed_post_355).
// We target both forms here so the lazify step works regardless of which block
// the handler was generated into.
const entryCount = lazify(
  join(root, 'src/server/entry.ts'),
  [
    // _h_ prefixed block (auto-generated <api-imports> section)
    '_h_dazza_chat_post_',
    '_h_dazza_annette_post_',
    '_h_dazza_chat_v2_post_',
    '_h_dazza_chat_v2_stream_post_',
    '_h_form_templates_seed_post_',
    '_h_migrate_',
    '_h_owner_console_system_ai_',
    '_h_notifications_alerts_get_',
    '_h_jobs_id_purchase_orders_',
    '_h_jobs_id_ledger_sync_',
    '_h_document_templates_id_export_',
    // Legacy naming (non-_h_ block) — kept for safety in case any of these
    // were regenerated outside the <api-imports> block
    'dazza_chat_post_',
    'dazza_annette_post_',
    'dazza_chat_v2_post_',
    'dazza_chat_v2_stream_post_',
    'form_templates_seed_post_',
    'migrate_',
    'owner_console_system_ai_',
    'notifications_alerts_get_',
    'jobs_id_purchase_orders_',
    'jobs_id_ledger_sync_',
    'document_templates_id_export_',
  ],
);

// routes-safety.ts: seed handlers are already lazified inline — no-op
const safetyCount = lazify(
  join(root, 'src/server/routes-safety.ts'),
  ['safety_plans_seed_post_', 'safety_swms_seed_post_'],
);

console.log(`\nTotal lazified: ${entryCount + safetyCount} handlers`);
