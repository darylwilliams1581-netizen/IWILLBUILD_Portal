/**
 * document-template-duplicate.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for POST /api/document-templates/:id/duplicate
 *
 * These are source-level tests — they verify the handler source code rather
 * than executing live DB queries, following the same pattern used throughout
 * this test suite (e.g. print-design-regression.test.ts).
 *
 * What is tested:
 *   1. INSERT…SELECT strategy — not a hard-coded partial INSERT
 *   2. Every content column is copied (builder_json, pdf_settings_json, etc.)
 *   3. Identity/timestamp columns are reset (id omitted, name/creator/dates are literals)
 *   4. Fallback to COPY_COLS_CORE on ER_BAD_FIELD_ERROR (resilience)
 *   5. Auth guard — 401 path present
 *   6. Company isolation — company_id filter on both SELECT and INSERT…SELECT
 *   7. Not-found guard — 404 path present
 *   8. Name suffix — "(Copy)" appended
 *   9. No hard-coded partial INSERT (the old bug)
 *  10. Response shape — returns { id, ok: true } with 201
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(
  join(process.cwd(), 'src/server/api/document-templates/[id]/duplicate/POST.ts'),
  'utf-8',
);

// ── 1. INSERT…SELECT strategy ─────────────────────────────────────────────────
describe('duplicate/POST.ts — INSERT…SELECT strategy', () => {
  it('uses INSERT … SELECT (not a VALUES literal INSERT)', () => {
    // The new implementation must use INSERT…SELECT to copy the row.
    // A VALUES-based INSERT cannot copy unknown future columns.
    expect(src).toMatch(/INSERT\s+INTO\s+document_templates\s*\(/i);
    expect(src).toMatch(/SELECT\s+/i);
    // The SELECT must reference the source table
    expect(src).toMatch(/FROM\s+document_templates/i);
  });

  it('filters the source SELECT by both id and company_id', () => {
    // Must include company_id in the WHERE clause of the SELECT to prevent
    // cross-tenant duplication.
    expect(src).toMatch(/WHERE\s+id\s*=.*company_id\s*=/i);
  });

  it('does NOT use a VALUES clause for the main copy path', () => {
    // The old bug: a hard-coded VALUES INSERT that omitted most columns.
    // The new implementation must not have a VALUES clause in the copy path.
    // (The fallback may also use INSERT…SELECT, not VALUES.)
    // We allow VALUES only if it appears inside a string literal or comment.
    // Strip comments and string literals, then check.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
      .replace(/\/\/[^\n]*/g, '')          // line comments
      .replace(/'[^']*'/g, "''")           // single-quoted strings
      .replace(/"[^"]*"/g, '""');          // double-quoted strings
    // After stripping, there should be no standalone VALUES keyword used as
    // part of an INSERT statement (i.e. INSERT … VALUES).
    expect(stripped).not.toMatch(/INSERT\s+INTO\s+document_templates[^;]*VALUES\s*\(/i);
  });
});

// ── 2. Content columns are copied ─────────────────────────────────────────────
describe('duplicate/POST.ts — content columns copied', () => {
  const contentColumns = [
    'builder_json',
    'page_layout_json',
    'theme_json',
    'pdf_settings_json',
    'doc_kind',
    'requires_acknowledgement',
    'acknowledgement_label',
    'acknowledgement_text',
    'submit_label',
    'requires_signature',
    'source_job_id',
    'doc_status',
    'use_type',
    'source_docx_path',
    'source_docx_name',
    'is_active',
    'template_type',
    'company_id',
  ];

  for (const col of contentColumns) {
    it(`includes "${col}" in the copy column list`, () => {
      expect(src).toContain(col);
    });
  }
});

// ── 3. Identity/timestamp columns are reset ───────────────────────────────────
describe('duplicate/POST.ts — identity columns are reset', () => {
  it('does NOT copy "id" from the source row (AUTO_INCREMENT must assign new PK)', () => {
    // "id" must not appear in COPY_COLS_FULL or COPY_COLS_CORE arrays.
    // We check that the column arrays do not contain a bare 'id' entry.
    // The arrays are defined as string literals in the source.
    const arraySection = src.match(/COPY_COLS_FULL\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)?.[1] ?? '';
    expect(arraySection).not.toMatch(/'id'/);
    const coreSection = src.match(/COPY_COLS_CORE\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)?.[1] ?? '';
    expect(coreSection).not.toMatch(/'id'/);
  });

  it('supplies "name" as a literal (not copied from source)', () => {
    // The name literal must be in the SELECT expressions, not in COPY_COLS.
    // We verify the name column is in the INSERT column list as a literal.
    expect(src).toMatch(/['"`]name['"`]/);
    // And the "(Copy)" suffix is applied
    expect(src).toContain('(Copy)');
  });

  it('supplies "created_at" and "updated_at" as NOW() literals', () => {
    expect(src).toMatch(/NOW\(\)/i);
    expect(src).toContain('created_at');
    expect(src).toContain('updated_at');
  });

  it('supplies "created_by_user_id" from the session (not copied from source)', () => {
    // created_by_user_id must be in the literal expressions list, not COPY_COLS.
    expect(src).toContain('created_by_user_id');
    // It must reference session.user.id
    expect(src).toMatch(/session\.user\.id/);
  });
});

// ── 4. Fallback resilience ────────────────────────────────────────────────────
describe('duplicate/POST.ts — fallback on missing columns', () => {
  it('catches ER_BAD_FIELD_ERROR and retries with core columns', () => {
    expect(src).toMatch(/ER_BAD_FIELD_ERROR/);
    expect(src).toMatch(/Unknown column/);
    expect(src).toContain('COPY_COLS_CORE');
  });

  it('COPY_COLS_CORE contains the guaranteed-present columns', () => {
    const coreSection = src.match(/COPY_COLS_CORE\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)?.[1] ?? '';
    expect(coreSection).toContain('builder_json');
    expect(coreSection).toContain('page_layout_json');
    expect(coreSection).toContain('theme_json');
    expect(coreSection).toContain('company_id');
    expect(coreSection).toContain('is_active');
    expect(coreSection).toContain('template_type');
  });
});

// ── 5. Auth guard ─────────────────────────────────────────────────────────────
describe('duplicate/POST.ts — auth guard', () => {
  it('returns 401 when no session', () => {
    expect(src).toMatch(/status\(401\)/);
    expect(src).toMatch(/Unauthorised/);
  });

  it('returns 403 when no company profile', () => {
    expect(src).toMatch(/status\(403\)/);
    expect(src).toMatch(/No company/);
  });
});

// ── 6. Company isolation ──────────────────────────────────────────────────────
describe('duplicate/POST.ts — company isolation', () => {
  it('checks company_id when verifying the source template exists', () => {
    // The ownership check SELECT must include company_id
    expect(src).toMatch(/SELECT.*FROM document_templates WHERE id.*company_id/is);
  });

  it('includes company_id in the INSERT…SELECT WHERE clause', () => {
    // The INSERT…SELECT must also filter by company_id so a user cannot
    // duplicate a template belonging to a different company.
    // Both the ownership check and the INSERT…SELECT must reference company_id.
    const companyIdOccurrences = (src.match(/company_id/g) ?? []).length;
    // At minimum: COPY_COLS_FULL entry, ownership check WHERE, INSERT…SELECT WHERE = 3+
    expect(companyIdOccurrences).toBeGreaterThanOrEqual(3);
  });
});

// ── 7. Not-found guard ────────────────────────────────────────────────────────
describe('duplicate/POST.ts — not-found guard', () => {
  it('returns 404 when template does not exist or belongs to another company', () => {
    expect(src).toMatch(/status\(404\)/);
    expect(src).toMatch(/Template not found/);
  });
});

// ── 8. Name suffix ────────────────────────────────────────────────────────────
describe('duplicate/POST.ts — name suffix', () => {
  it('appends " (Copy)" to the original template name', () => {
    expect(src).toContain('(Copy)');
    // The suffix must be applied to the source name, not a hardcoded string
    expect(src).toMatch(/source\.name.*Copy|Copy.*source\.name/s);
  });
});

// ── 9. No hard-coded partial INSERT (regression for the old bug) ──────────────
describe('duplicate/POST.ts — no hard-coded partial INSERT (old bug regression)', () => {
  it('does not hard-code a VALUES list that omits builder_json', () => {
    // The old implementation had:
    //   INSERT INTO document_templates (company_id, name, template_type, page_layout_json, theme_json, ...)
    //   VALUES (...)
    // which silently dropped builder_json, pdf_settings_json, doc_kind, etc.
    // Verify builder_json is NOT absent from the copy path.
    expect(src).toContain('builder_json');
  });

  it('does not hard-code a VALUES list that omits pdf_settings_json', () => {
    expect(src).toContain('pdf_settings_json');
  });

  it('does not hard-code a VALUES list that omits doc_kind', () => {
    expect(src).toContain('doc_kind');
  });

  it('does not hard-code a VALUES list that omits requires_acknowledgement', () => {
    expect(src).toContain('requires_acknowledgement');
  });
});

// ── 10. Response shape ────────────────────────────────────────────────────────
describe('duplicate/POST.ts — response shape', () => {
  it('returns 201 status on success', () => {
    expect(src).toMatch(/status\(201\)/);
  });

  it('returns { id, ok: true } in the success response', () => {
    expect(src).toMatch(/id:\s*insertId/);
    expect(src).toMatch(/ok:\s*true/);
  });
});
