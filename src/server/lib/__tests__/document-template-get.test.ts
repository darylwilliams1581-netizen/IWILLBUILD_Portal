/**
 * GET /api/document-templates/:id — focused unit tests
 *
 * Tests exercise getDocumentTemplate() from lib/document-template-get.ts
 * directly, with all external dependencies passed as injected mocks.
 * No HTTP server, no real DB, no disk I/O.
 *
 * Groups:
 *   G1. HTML canvas rows — all new fields present and correctly shaped
 *   G2. Legacy rows — missing html/css/report columns → stable null defaults
 *   G3. Malformed import_report JSON → null (no throw)
 *   G4. Owner / member access — session and profile checks
 *   G5. Tenant isolation — company_id filter enforced in SQL
 *   G6. Missing document → 404
 *   G7. Existing non-HTML fields preserved (backward compat)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocumentTemplate } from '../document-template-get.js';
import type { TemplateGetDeps, TemplateGetInput } from '../document-template-get.js';

// ─── Row factories ────────────────────────────────────────────────────────────

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 42,
    company_id: 1,
    name: 'Test Template',
    template_type: 'swms',
    builder_json: '{"blocks":[],"systemFields":[]}',
    page_layout_json: '{}',
    theme_json: '{}',
    pdf_settings_json: null,
    source_docx_path: null,
    source_docx_name: null,
    is_active: 1,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    doc_kind: 'doc',
    requires_acknowledgement: 0,
    acknowledgement_label: null,
    acknowledgement_text: null,
    submit_label: null,
    requires_signature: 0,
    source_job_id: null,
    doc_status: 'draft',
    applied_widgets_json: null,
    source_type: null,
    html_content: null,
    import_css: null,
    import_report: null,
    source_file_name: null,
    source_sha256: null,
    source_revision: null,
    source_mime_type: null,
    ...overrides,
  };
}

function htmlRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseRow({
    source_type: 'html',
    html_content: '<div class="studio-doc" data-doc-id="42"><p>Hello</p></div>',
    import_css: '.studio-doc[data-doc-id="42"] { font-family: Arial; }',
    import_report: JSON.stringify({
      messageCount: 3,
      warnings: ['Unsupported style: CustomHeading'],
      imageCount: 1,
      pageBreakCount: 2,
      hadUnsupported: false,
    }),
    source_file_name: 'my-swms.docx',
    source_sha256: 'a'.repeat(64),
    source_revision: 1,
    source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ...overrides,
  });
}

// ─── Deps factory ─────────────────────────────────────────────────────────────

interface DepsState {
  row: Record<string, unknown> | null;
  executedSql: string;
}

function makeDeps(
  state: DepsState,
  overrides: Partial<TemplateGetDeps> = {},
): TemplateGetDeps {
  return {
    getSession: vi.fn(async () => ({ user: { id: 'user-1' } })),
    getProfile: vi.fn(async () => ({ companyId: 1 })),
    dbExecute: vi.fn(async (rawSql: string) => {
      state.executedSql = rawSql;
      if (!state.row) return [[], undefined] as [Array<Record<string, unknown>>, unknown];
      return [[state.row], undefined] as [Array<Record<string, unknown>>, unknown];
    }),
    ...overrides,
  };
}

function makeInput(overrides: Partial<TemplateGetInput> = {}): TemplateGetInput {
  return { templateId: 42, requestHeaders: {}, ...overrides };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let state: DepsState;
beforeEach(() => {
  state = { row: null, executedSql: '' };
  vi.clearAllMocks();
});

// ─── G1. HTML canvas rows ─────────────────────────────────────────────────────

describe('G1 — HTML canvas rows: all new fields present and correctly shaped', () => {
  it('returns ok=true', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
  });

  it('template.sourceType = "html"', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok && result.template.sourceType).toBe('html');
  });

  it('template.htmlContent is a non-empty string', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.template.htmlContent).toBe('string');
    expect((result.template.htmlContent as string).length).toBeGreaterThan(0);
  });

  it('template.importCss is a non-empty string containing .studio-doc', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.template.importCss).toBe('string');
    expect(result.template.importCss).toContain('.studio-doc');
  });

  it('template.importReport is a parsed object (not a string)', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.template.importReport).toBe('object');
    expect(result.template.importReport).not.toBeNull();
  });

  it('importReport has all expected fields', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.template.importReport as Record<string, unknown>;
    expect(typeof report.messageCount).toBe('number');
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(typeof report.imageCount).toBe('number');
    expect(typeof report.pageBreakCount).toBe('number');
    expect(typeof report.hadUnsupported).toBe('boolean');
  });

  it('template.sourceFileName matches the stored value', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sourceFileName).toBe('my-swms.docx');
  });

  it('template.sourceSha256 is a 64-char string', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.template.sourceSha256).toBe('string');
    expect((result.template.sourceSha256 as string).length).toBe(64);
  });

  it('template.sourceRevision is a number', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.template.sourceRevision).toBe('number');
    expect(result.template.sourceRevision).toBe(1);
  });

  it('template.sourceMimeType contains wordprocessingml', async () => {
    state.row = htmlRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sourceMimeType).toContain('wordprocessingml');
  });
});

// ─── G2. Legacy rows — missing columns → stable null defaults ─────────────────

describe('G2 — legacy rows: missing html/css/report columns → null defaults', () => {
  it('sourceType is null for a legacy row', async () => {
    state.row = baseRow({ source_type: null });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sourceType).toBeNull();
  });

  it('htmlContent is null when column is undefined (absent)', async () => {
    const row = baseRow();
    delete row.html_content;
    state.row = row;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.htmlContent).toBeNull();
  });

  it('htmlContent is null when column is empty string', async () => {
    state.row = baseRow({ html_content: '' });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.htmlContent).toBeNull();
  });

  it('importCss is null when column is absent', async () => {
    const row = baseRow();
    delete row.import_css;
    state.row = row;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.importCss).toBeNull();
  });

  it('importReport is null when column is absent', async () => {
    const row = baseRow();
    delete row.import_report;
    state.row = row;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.importReport).toBeNull();
  });

  it('sourceRevision is null when column is absent', async () => {
    const row = baseRow();
    delete row.source_revision;
    state.row = row;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sourceRevision).toBeNull();
  });

  it('sourceFileName is null when column is absent', async () => {
    const row = baseRow();
    delete row.source_file_name;
    state.row = row;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sourceFileName).toBeNull();
  });

  it('does not throw for a fully legacy row with no Phase 2 columns', async () => {
    state.row = {
      id: 1, company_id: 1, name: 'Old Doc', template_type: 'swms',
      builder_json: '{}', page_layout_json: '{}', theme_json: '{}',
      is_active: 1, doc_kind: 'doc', requires_acknowledgement: 0,
      requires_signature: 0, doc_status: 'draft',
    };
    await expect(
      getDocumentTemplate(makeInput({ templateId: 1 }), makeDeps(state)),
    ).resolves.not.toThrow();
  });
});

// ─── G3. Malformed import_report JSON → null ─────────────────────────────────

describe('G3 — malformed import_report JSON → null (no throw)', () => {
  it('returns null for truncated JSON', async () => {
    state.row = htmlRow({ import_report: '{"messageCount":3,"warnings":[' });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.importReport).toBeNull();
  });

  it('returns null for a plain string value', async () => {
    state.row = htmlRow({ import_report: 'not json at all' });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.importReport).toBeNull();
  });

  it('returns null when import_report is a JSON array', async () => {
    state.row = htmlRow({ import_report: '[1,2,3]' });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.importReport).toBeNull();
  });

  it('returns null when import_report is JSON null', async () => {
    state.row = htmlRow({ import_report: 'null' });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.importReport).toBeNull();
  });

  it('returns null when import_report is a JSON number', async () => {
    state.row = htmlRow({ import_report: '42' });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.importReport).toBeNull();
  });

  it('does not throw for any malformed value', async () => {
    const cases = ['', '{{bad}}', 'undefined', '[]', 'true'];
    for (const bad of cases) {
      state.row = htmlRow({ import_report: bad });
      await expect(
        getDocumentTemplate(makeInput(), makeDeps(state)),
      ).resolves.not.toThrow();
    }
  });
});

// ─── G4. Owner / member access ────────────────────────────────────────────────

describe('G4 — owner / member access', () => {
  it('returns status=401 when session is null', async () => {
    const result = await getDocumentTemplate(
      makeInput(),
      makeDeps(state, { getSession: async () => null }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });

  it('returns status=401 when session has no user', async () => {
    const result = await getDocumentTemplate(
      makeInput(),
      makeDeps(state, { getSession: async () => ({ user: null as unknown as { id: string } }) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });

  it('returns status=403 when profile is null', async () => {
    const result = await getDocumentTemplate(
      makeInput(),
      makeDeps(state, { getProfile: async () => null }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it('returns status=403 when profile.companyId is 0', async () => {
    const result = await getDocumentTemplate(
      makeInput(),
      makeDeps(state, { getProfile: async () => ({ companyId: 0 }) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it('returns status=400 for templateId = 0', async () => {
    const result = await getDocumentTemplate(
      makeInput({ templateId: 0 }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('returns status=400 for negative templateId', async () => {
    const result = await getDocumentTemplate(
      makeInput({ templateId: -1 }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('returns ok=true for a valid authenticated user', async () => {
    state.row = baseRow();
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
  });
});

// ─── G5. Tenant isolation ─────────────────────────────────────────────────────

describe('G5 — tenant isolation: company_id filter enforced in SQL', () => {
  it('SQL includes AND company_id = <companyId>', async () => {
    state.row = baseRow();
    await getDocumentTemplate(
      makeInput(),
      makeDeps(state, { getProfile: async () => ({ companyId: 7 }) }),
    );
    expect(state.executedSql).toContain('company_id = 7');
  });

  it('SQL includes the requested template id', async () => {
    state.row = baseRow({ id: 99 });
    await getDocumentTemplate(makeInput({ templateId: 99 }), makeDeps(state));
    expect(state.executedSql).toContain('id = 99');
  });

  it('returns 404 when DB returns empty array (simulates cross-tenant miss)', async () => {
    state.row = null;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it('response companyId matches the row company_id', async () => {
    state.row = baseRow({ company_id: 5 });
    const result = await getDocumentTemplate(
      makeInput(),
      makeDeps(state, { getProfile: async () => ({ companyId: 5 }) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.companyId).toBe(5);
  });

  it('dbExecute is called exactly once per request', async () => {
    state.row = baseRow();
    const deps = makeDeps(state);
    await getDocumentTemplate(makeInput(), deps);
    expect(vi.mocked(deps.dbExecute)).toHaveBeenCalledOnce();
  });
});

// ─── G6. Missing document → 404 ──────────────────────────────────────────────

describe('G6 — missing document returns 404', () => {
  it('returns ok=false, status=404 when DB returns empty array', async () => {
    state.row = null;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it('error message contains "not found"', async () => {
    state.row = null;
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain('not found');
  });
});

// ─── G7. Existing non-HTML fields preserved ───────────────────────────────────

describe('G7 — existing non-HTML fields preserved (backward compat)', () => {
  it('returns blocks from builder_json', async () => {
    state.row = baseRow({
      builder_json: '{"blocks":[{"id":"b1","type":"paragraph"}],"systemFields":[]}',
    });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.template.blocks)).toBe(true);
    expect((result.template.blocks as unknown[]).length).toBe(1);
  });

  it('docKind defaults to "doc" when column is null', async () => {
    state.row = baseRow({ doc_kind: null });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.docKind).toBe('doc');
  });

  it('docStatus defaults to "draft" when column is null', async () => {
    state.row = baseRow({ doc_status: null });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.docStatus).toBe('draft');
  });

  it('isActive is a boolean', async () => {
    state.row = baseRow({ is_active: 1 });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.template.isActive).toBe('boolean');
    expect(result.template.isActive).toBe(true);
  });

  it('appliedWidgets from applied_widgets_json when present', async () => {
    state.row = baseRow({ applied_widgets_json: '[{"type":"signature","id":"w1"}]' });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.template.appliedWidgets)).toBe(true);
    expect((result.template.appliedWidgets as unknown[]).length).toBe(1);
  });

  it('pdfSettings is null when column is null', async () => {
    state.row = baseRow({ pdf_settings_json: null });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.pdfSettings).toBeNull();
  });

  it('sourceType="docx" row returns htmlContent=null', async () => {
    state.row = baseRow({ source_type: 'docx', html_content: null });
    const result = await getDocumentTemplate(makeInput(), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sourceType).toBe('docx');
    expect(result.template.htmlContent).toBeNull();
  });
});
