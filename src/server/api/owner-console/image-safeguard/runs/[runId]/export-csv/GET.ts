/**
 * GET /api/owner-console/image-safeguard/runs/:runId/export.csv
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B5 — Authenticated CSV export of all findings for a completed scan run.
 *
 * Produces a UTF-8 CSV (with BOM for Excel compatibility) containing one row
 * per finding in the specified run.  The export is bounded at 1,000 rows; if
 * more findings exist the request is rejected with export_too_large so the
 * caller always receives a complete, accurate report — never a silent truncation.
 *
 * SECURITY:
 *  - requirePlatformOwner middleware applied in entry.ts.
 *  - runId validated against strict canonical UUID pattern (8-4-4-4-12).
 *  - Run must exist and have run_status = 'completed'.
 *  - No R2 contact of any kind — DB query only.
 *  - R2 keys are NEVER returned; only derived fields (original_name, job_number,
 *    job_name, site_address) are included in the CSV.
 *  - Job data resolved via: finding_keys.r2_key → job_photos.filename → jobs.
 *  - Reviewer name resolved via: findings.reviewer_id → user.name.
 *  - Formula injection neutralised: values matching leading whitespace followed
 *    by =, +, -, @ and values beginning with tab/CR/LF are prefixed with a
 *    single quote before CSV quoting.
 *  - Content-Type: text/csv; charset=utf-8
 *  - Content-Disposition: attachment with a server-generated safe filename.
 *  - Cache-Control: private, no-store
 *  - X-Content-Type-Options: nosniff
 *
 * AUDIT:
 *  - Export audit record written to platform_activity_log BEFORE the response
 *    is sent.  If the audit INSERT fails the request is rejected with 500 —
 *    no unaudited CSV is ever released.
 *
 * RESPONSES:
 *  200  text/csv (UTF-8 BOM + header row + finding rows)
 *  400  { error: 'invalid_run_id' }
 *  404  { error: 'run_not_found' }
 *  409  { error: 'run_not_complete', message: '...' }
 *  413  { error: 'export_too_large', message: '...' }
 *  500  { error: 'export_failed' }
 *  500  { error: 'audit_failed' }   ← audit INSERT failed; CSV not released
 *
 * COLUMNS (13):
 *  1.  Scan ID
 *  2.  Scan date
 *  3.  Company
 *  4.  Job number
 *  5.  Job name
 *  6.  Site location
 *  7.  Sanitised filename
 *  8.  Result
 *  9.  Approximate face count
 *  10. Review decision
 *  11. Reviewer
 *  12. Review date
 *  13. Internal note
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getAuth } from '../../../../../../../lib/auth/auth.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum rows returned.  If the run has more findings we reject — never truncate. */
const MAX_ROWS = 1_000;

/**
 * Strict canonical UUID pattern: 8-4-4-4-12 hex digits, lowercase only.
 * Rejects the looser /^[0-9a-f-]{36}$/i used elsewhere — that pattern accepts
 * strings like "------------------------------------" or misplaced hyphens.
 */
const STRICT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ── CSV helpers ───────────────────────────────────────────────────────────────

/**
 * Neutralise spreadsheet formula injection.
 *
 * A value is unsafe when, after stripping leading whitespace and control
 * characters, it begins with =, +, -, or @.  Values that begin with a literal
 * tab (\t), carriage return (\r), or line feed (\n) are also unsafe because
 * some spreadsheet parsers treat them as formula prefixes.
 *
 * Unsafe values are prefixed with a single quote (') before CSV quoting.
 * The quote is visible in the cell but prevents formula execution.
 */
function neutraliseFormula(raw: string): string {
  // Direct tab / CR / LF at position 0
  if (raw.length > 0 && (raw[0] === '\t' || raw[0] === '\r' || raw[0] === '\n')) {
    return "'" + raw;
  }
  // Strip leading whitespace and ASCII control characters (U+0000–U+001F),
  // then check for formula starters.
  // We avoid a control-character range in the regex literal (no-control-regex)
  // by using a character-code check instead.
  let i = 0;
  while (i < raw.length) {
    const code = raw.charCodeAt(i);
    // Whitespace (space, tab, CR, LF, FF, VT) or ASCII control (0x00–0x1F)
    if (code <= 0x1F || code === 0x20) {
      i++;
    } else {
      break;
    }
  }
  const firstNonWs = i < raw.length ? raw[i] : '';
  if (firstNonWs !== '' && '=+-@'.includes(firstNonWs)) {
    return "'" + raw;
  }
  return raw;
}

/**
 * Always-quoted CSV field.
 *
 * 1. Coerce to string (null/undefined → empty string).
 * 2. Neutralise formula injection.
 * 3. Escape embedded double-quotes by doubling them (RFC 4180).
 * 4. Wrap in double-quotes.
 */
function esc(v: unknown): string {
  const s = neutraliseFormula(String(v ?? ''));
  return `"${s.replace(/"/g, '""')}"`;
}

// ── Row type returned by the SQL query ────────────────────────────────────────

interface FindingRow {
  // finding fields
  finding_id:     string;
  result:         string;
  face_count:     number;
  reviewed:       number;   // TINYINT(1) — 0 or 1
  reviewer_note:  string | null;
  reviewed_at:    string | null;
  scanned_at:     string;
  // run fields
  run_id:         string;
  finished_at:    string | null;
  // company
  company_name:   string | null;
  // job (may be null when no job_photos row matches)
  job_number:     string | null;
  job_name:       string | null;
  site_address:   string | null;
  original_name:  string | null;
  // reviewer user
  reviewer_name:  string | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // ── 1. Validate runId ────────────────────────────────────────────────────
    // Strict canonical UUID: 8-4-4-4-12 lowercase hex digits only.
    // No normalisation — uppercase, misplaced hyphens, and non-canonical forms
    // are rejected outright rather than silently accepted.
    const rawRunId = String(req.params.runId ?? '').trim();
    if (!STRICT_UUID_RE.test(rawRunId)) {
      return res.status(400).json({ error: 'invalid_run_id' });
    }
    const runId = rawRunId;

    // ── 2. Verify run exists and is completed ────────────────────────────────
    const runRows = await db.execute(sql`
      SELECT id, run_status, finished_at
      FROM image_safeguard_scan_runs
      WHERE id = ${runId}
      LIMIT 1
    `);

    const run = (runRows as unknown as Array<{
      id: string;
      run_status: string;
      finished_at: string | null;
    }>)[0];

    if (!run) {
      return res.status(404).json({ error: 'run_not_found' });
    }

    if (run.run_status !== 'completed') {
      return res.status(409).json({
        error: 'run_not_complete',
        message: 'Export is only available for completed scan runs.',
      });
    }

    // ── 3. Count findings — enforce MAX_ROWS before fetching ────────────────
    // Fetch MAX_ROWS + 1 rows.  If we get MAX_ROWS + 1 back, the run has more
    // than MAX_ROWS findings and we reject rather than silently truncate.
    const findingRows = await db.execute(sql`
      SELECT
        f.id              AS finding_id,
        f.result,
        f.face_count,
        f.reviewed,
        f.reviewer_note,
        f.reviewed_at,
        f.scanned_at,
        r.id              AS run_id,
        r.finished_at,
        c.name            AS company_name,
        j.job_number,
        j.name            AS job_name,
        j.address         AS site_address,
        jp.original_name,
        u.name            AS reviewer_name
      FROM image_safeguard_findings f
      INNER JOIN image_safeguard_scan_runs r
        ON r.id = f.scan_run_id
      LEFT JOIN companies c
        ON c.id = f.company_id
      -- Resolve job via the server-side key table (key never returned to client)
      LEFT JOIN image_safeguard_finding_keys k
        ON k.finding_id = f.id
      LEFT JOIN job_photos jp
        ON jp.filename = k.r2_key
        AND jp.company_id = f.company_id
      LEFT JOIN jobs j
        ON j.id = jp.job_id
      -- Reviewer name from BetterAuth user table
      LEFT JOIN user u
        ON u.id = f.reviewer_id
      WHERE f.scan_run_id = ${runId}
      ORDER BY f.scanned_at ASC, f.id ASC
      LIMIT ${MAX_ROWS + 1}
    `);

    const rows = findingRows as unknown as FindingRow[];

    if (rows.length > MAX_ROWS) {
      return res.status(413).json({
        error: 'export_too_large',
        message: `This run has more than ${MAX_ROWS} findings. Export is not available for runs of this size.`,
      });
    }

    // ── 4. Resolve initiator for audit ───────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    const exporterId = session?.user?.id ?? 'unknown';

    // ── 5. Audit BEFORE releasing the CSV ────────────────────────────────────
    // If the audit INSERT fails we return 500 — no unaudited CSV is released.
    const now = new Date().toISOString();
    try {
      await db.execute(sql`
        INSERT INTO platform_activity_log
          (id, company_id, user_id, action, resource_type, resource_id, metadata, created_at)
        VALUES
          (${randomUUID()}, 0, ${exporterId},
           'safeguard_run_csv_export',
           'scan_run', ${runId},
           ${JSON.stringify({ rowCount: rows.length, exportedAt: now })},
           ${now})
      `);
    } catch {
      return res.status(500).json({ error: 'audit_failed' });
    }

    // ── 6. Build CSV ─────────────────────────────────────────────────────────
    const HEADERS = [
      'Scan ID',
      'Scan date',
      'Company',
      'Job number',
      'Job name',
      'Site location',
      'Sanitised filename',
      'Result',
      'Approximate face count',
      'Review decision',
      'Reviewer',
      'Review date',
      'Internal note',
    ];

    const csvLines: string[] = [
      HEADERS.map(esc).join(','),
    ];

    for (const row of rows) {
      // Sanitise filename: basename only, no path separators
      const rawFilename = String(row.original_name ?? '');
      const safeFilename = rawFilename
        .replace(/[/\\]/g, '_')   // strip path separators
        .replace(/\.\./g, '_')    // strip traversal sequences
        .slice(0, 255);           // cap length

      csvLines.push([
        esc(row.run_id),
        esc(row.finished_at ?? ''),
        esc(row.company_name ?? ''),
        esc(row.job_number ?? ''),
        esc(row.job_name ?? ''),
        esc(row.site_address ?? ''),
        esc(safeFilename),
        esc(row.result),
        esc(row.face_count),
        esc(row.reviewed ? 'Yes' : 'No'),
        esc(row.reviewer_name ?? ''),
        esc(row.reviewed_at ?? ''),
        esc(row.reviewer_note ?? ''),
      ].join(','));
    }

    const csv = csvLines.join('\n');

    // ── 7. Safe filename for Content-Disposition ─────────────────────────────
    // Uses only the first 8 chars of the run ID (opaque, no user input) and
    // the current date — no user-supplied data in the filename.
    const dateStr = now.slice(0, 10); // YYYY-MM-DD
    const safeDispositionFilename = `image-safeguard-run-${runId.slice(0, 8)}-${dateStr}.csv`;

    // ── 8. Send response ─────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDispositionFilename}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // UTF-8 BOM for Excel compatibility, consistent with other CSV exports
    return res.status(200).send('\uFEFF' + csv);

  } catch {
    return res.status(500).json({ error: 'export_failed' });
  }
}
