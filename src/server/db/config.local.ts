/**
 * Local-dev DB config shim.
 *
 * Priority order:
 *   1. Production loader (./config) — works when /local/config.json exists
 *      (builder sandbox, Nomad container, CI with mounted secrets).
 *   2. Environment variables — for local developer machines and Playwright runs.
 *      Set these in .env.local or your shell before running `npm run dev`:
 *        DB_HOST=127.0.0.1
 *        DB_PORT=3306
 *        DB_USER=root
 *        DB_PASSWORD=yourpassword
 *        DB_NAME=iwillbuild
 *   3. Throws a clear, actionable error when neither source is available.
 *
 * NOTE: This file is intentionally NOT marked immutable — it is the local-dev
 * companion to the immutable config.ts and is safe to edit.
 */
import type { DatabaseCredentials } from "./config";

export function getDatabaseCredentials(): DatabaseCredentials {
  // ── 1. Try the production loader (builder / Nomad) ──────────────────────
  try {
    // Dynamic require so a missing /local/config.json doesn't crash at import
    // time — only at call time, where we can catch it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDatabaseCredentials: prod } = require("./config");
    return prod() as DatabaseCredentials;
  } catch {
    // /local/config.json absent — fall through to env vars
  }

  // ── 2. Fall back to environment variables ───────────────────────────────
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (DB_HOST && DB_USER && DB_PASSWORD && DB_NAME) {
    return {
      host: DB_HOST,
      port: parseInt(DB_PORT ?? "3306", 10),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    };
  }

  // ── 3. Neither available — clear actionable error ───────────────────────
  throw new Error(
    "\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "  DB CONFIG MISSING — local dev requires one of:\n\n" +
    "  Option A: create .env.local in the project root\n" +
    "    DB_HOST=127.0.0.1\n" +
    "    DB_PORT=3306\n" +
    "    DB_USER=root\n" +
    "    DB_PASSWORD=yourpassword\n" +
    "    DB_NAME=iwillbuild\n\n" +
    "  Option B: mount /local/config.json (production format)\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  );
}
