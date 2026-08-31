/**
 * PATCH /api/document-templates/:id — focused unit tests
 *
 * Tests exercise patchDocumentTemplate() and validateAndSanitiseCss() from
 * lib/document-template-patch.ts directly, with all external dependencies
 * passed as injected mocks.  No HTTP server, no real DB, no disk I/O.
 *
 * Groups:
 *   G1.  Valid HTML canvas saves — cell edits, added/deleted table rows
 *   G2.  Safe scoped CSS — accepted and stored verbatim
 *   G3.  Sanitiser stripping — XSS in htmlContent is removed
 *   G4.  Rejected global CSS — @import, global selectors, javascript: url
 *   G5.  Recovery metadata preserved — import_report / source_* never touched
 *   G6.  Tenant isolation — company_id filter in SELECT and UPDATE
 *   G7.  Legacy / non-HTML documents — block-canvas save path unchanged
 *   G8.  Auth and input validation — 401 / 403 / 400 / 404
 *   G9.  validateAndSanitiseCss unit tests (pure function)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  patchDocumentTemplate,
  validateAndSanitiseCss,
} from '../document-template-patch.js';
import type { PatchDeps, PatchInput } from '../document-template-patch.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOC_ID = 42;
const COMPANY_ID = 1;
const SCOPE = `.studio-doc[data-doc-id="${DOC_ID}"]`;

function makeHtmlOwnerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: DOC_ID, source_type: 'html', ...overrides };
}

function makeLegacyOwnerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: DOC_ID, source_type: null, ...overrides };
}

interface DepsState {
  ownerRow: Record<string, unknown> | null;
  executedSelects: string[];
  executedUpdates: string[];
  updateError?: Error;
}

function makeDeps(state: DepsState, overrides: Partial<PatchDeps> = {}): PatchDeps {
  return {
    getSession: vi.fn(async () => ({ user: { id: 'user-1' } })),
    getProfile: vi.fn(async () => ({ companyId: COMPANY_ID })),
    dbSelect: vi.fn(async (sql: string) => {
      state.executedSelects.push(sql);
      if (!state.ownerRow) return [[], undefined] as [Array<Record<string, unknown>>, unknown];
      return [[state.ownerRow], undefined] as [Array<Record<string, unknown>>, unknown];
    }),
    dbUpdate: vi.fn(async (sql: string) => {
      state.executedUpdates.push(sql);
      if (state.updateError) throw state.updateError;
    }),
    ...overrides,
  };
}

function makeInput(body: PatchInput['body'] = {}, id = DOC_ID): PatchInput {
  return { templateId: id, requestHeaders: {}, body };
}

let state: DepsState;
beforeEach(() => {
  state = { ownerRow: null, executedSelects: [], executedUpdates: [] };
  vi.clearAllMocks();
});

// ─── G1. Valid HTML canvas saves ─────────────────────────────────────────────

describe('G1 — valid HTML canvas saves', () => {
  it('returns ok=true for a simple cell text edit', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<div class="studio-doc"><p>Hello world</p></div>' }),
      makeDeps(state),
    );
    expect(result.ok).toBe(true);
  });

  it('UPDATE SQL contains html_content', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>Cell edit</p>' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('html_content');
  });

  it('UPDATE SQL contains import_css when provided', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const css = `${SCOPE} { color: red; }`;
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: css }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('import_css');
  });

  it('UPDATE SQL sets rendered_pdf_key = NULL to invalidate cached PDF', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('rendered_pdf_key = NULL');
  });

  it('UPDATE SQL always includes updated_at = NOW()', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('updated_at = NOW()');
  });

  it('handles added table row — HTML with extra <tr> is accepted', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const html = `<table><tbody><tr><td>Row 1</td></tr><tr><td>Row 2 (added)</td></tr></tbody></table>`;
    const result = await patchDocumentTemplate(makeInput({ htmlContent: html }), makeDeps(state));
    expect(result.ok).toBe(true);
    expect(state.executedUpdates[0]).toContain('html_content');
  });

  it('handles deleted table row — HTML with fewer <tr> is accepted', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const html = `<table><tbody><tr><td>Only row</td></tr></tbody></table>`;
    const result = await patchDocumentTemplate(makeInput({ htmlContent: html }), makeDeps(state));
    expect(result.ok).toBe(true);
  });

  it('accepts empty htmlContent string (clears the canvas)', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(makeInput({ htmlContent: '' }), makeDeps(state));
    expect(result.ok).toBe(true);
  });

  it('dbUpdate is called exactly once', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const deps = makeDeps(state);
    await patchDocumentTemplate(makeInput({ htmlContent: '<p>x</p>' }), deps);
    expect(vi.mocked(deps.dbUpdate)).toHaveBeenCalledOnce();
  });
});

// ─── G2. Safe scoped CSS ──────────────────────────────────────────────────────

describe('G2 — safe scoped CSS is accepted', () => {
  it('accepts CSS scoped to the document root', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const css = `${SCOPE} { font-size: 12pt; }\n${SCOPE} p { margin: 0; }`;
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: css }),
      makeDeps(state),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts CSS with descendant combinators', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const css = `${SCOPE} table td { border: 1px solid #ccc; }`;
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: css }),
      makeDeps(state),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts empty importCss string', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: '' }),
      makeDeps(state),
    );
    expect(result.ok).toBe(true);
  });

  it('stored CSS appears in UPDATE SQL', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const css = `${SCOPE} { color: blue; }`;
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: css }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('import_css');
  });
});

// ─── G3. Sanitiser stripping ──────────────────────────────────────────────────

describe('G3 — sanitiser strips unsafe HTML constructs', () => {
  it('strips <script> tags from htmlContent', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const deps = makeDeps(state);
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>Hello</p><script>alert(1)</script>' }),
      deps,
    );
    const updateSql = state.executedUpdates[0] ?? '';
    expect(updateSql).not.toContain('<script>');
    expect(updateSql).not.toContain('alert(1)');
  });

  it('strips on* event handlers from htmlContent', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p onclick="evil()">Click me</p>' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).not.toContain('onclick');
  });

  it('strips javascript: href from <a> tags', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<a href="javascript:alert(1)">link</a>' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).not.toContain('javascript:');
  });

  it('strips HTML comments', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p><!-- hidden --></p>' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).not.toContain('<!--');
  });

  it('returns ok=true even when stripping occurs (sanitise, not reject)', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p onclick="x()">text</p><script>bad()</script>' }),
      makeDeps(state),
    );
    expect(result.ok).toBe(true);
  });
});

// ─── G4. Rejected global CSS ─────────────────────────────────────────────────

describe('G4 — rejected global CSS returns 400', () => {
  it('rejects @import', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `@import url('evil.css'); ${SCOPE} { color: red; }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.error).toContain('@import');
  });

  it('rejects CSS with html selector', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `html { background: red; }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('rejects CSS with body selector', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `body { margin: 0; }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('rejects CSS with * selector', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `* { box-sizing: border-box; }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('rejects CSS with :root selector', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `:root { --color: red; }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('rejects CSS rule not scoped to document root', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `.other-class { color: red; }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('rejects javascript: url() in CSS', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `${SCOPE} { background: url("javascript:alert(1)"); }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('rejects @charset', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `@charset "UTF-8"; ${SCOPE} { color: red; }` }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('does NOT call dbUpdate when CSS is rejected', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const deps = makeDeps(state);
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: `body { color: red; }` }),
      deps,
    );
    expect(vi.mocked(deps.dbUpdate)).not.toHaveBeenCalled();
  });
});

// ─── G5. Recovery metadata preserved ─────────────────────────────────────────

describe('G5 — recovery metadata is never overwritten by a canvas save', () => {
  const PROTECTED_COLS = [
    'import_report',
    'source_file_name',
    'source_sha256',
    'source_revision',
    'source_mime_type',
    'source_file_key',
  ];

  for (const col of PROTECTED_COLS) {
    it(`UPDATE SQL does not touch ${col}`, async () => {
      state.ownerRow = makeHtmlOwnerRow();
      await patchDocumentTemplate(
        makeInput({ htmlContent: '<p>updated cell</p>' }),
        makeDeps(state),
      );
      expect(state.executedUpdates[0]).not.toContain(col);
    });
  }

  it('UPDATE SQL does not contain import_report even when htmlContent changes', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>new content</p>', importCss: `${SCOPE} { color: red; }` }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).not.toContain('import_report');
  });
});

// ─── G6. Tenant isolation ─────────────────────────────────────────────────────

describe('G6 — tenant isolation', () => {
  it('SELECT includes company_id filter', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state, { getProfile: async () => ({ companyId: 7 }) }),
    );
    expect(state.executedSelects[0]).toContain('company_id = 7');
  });

  it('UPDATE includes company_id filter', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state, { getProfile: async () => ({ companyId: 7 }) }),
    );
    expect(state.executedUpdates[0]).toContain('company_id = 7');
  });

  it('returns 404 when SELECT returns empty (cross-tenant miss)', async () => {
    state.ownerRow = null;
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it('SELECT includes the template id', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }, 99),
      makeDeps(state),
    );
    expect(state.executedSelects[0]).toContain('id = 99');
  });
});

// ─── G7. Legacy / non-HTML documents ─────────────────────────────────────────

describe('G7 — legacy / non-HTML documents use block-canvas save path', () => {
  it('returns ok=true for a block-canvas save', async () => {
    state.ownerRow = makeLegacyOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ blocks: [{ id: 'b1', type: 'paragraph' }] }),
      makeDeps(state),
    );
    expect(result.ok).toBe(true);
  });

  it('UPDATE SQL contains builder_json for a block-canvas save', async () => {
    state.ownerRow = makeLegacyOwnerRow();
    await patchDocumentTemplate(
      makeInput({ blocks: [{ id: 'b1', type: 'paragraph' }] }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('builder_json');
  });

  it('UPDATE SQL does NOT contain html_content for a block-canvas save', async () => {
    state.ownerRow = makeLegacyOwnerRow();
    await patchDocumentTemplate(
      makeInput({ blocks: [] }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).not.toContain('html_content');
  });

  it('ignores htmlContent on a non-HTML document (uses block path)', async () => {
    state.ownerRow = makeLegacyOwnerRow();
    // htmlContent is provided but source_type is null → block path runs
    await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>ignored</p>', blocks: [] }),
      makeDeps(state),
    );
    // block path: builder_json present, html_content absent
    expect(state.executedUpdates[0]).toContain('builder_json');
    expect(state.executedUpdates[0]).not.toContain('html_content');
  });

  it('saves docStatus on a legacy document', async () => {
    state.ownerRow = makeLegacyOwnerRow();
    await patchDocumentTemplate(
      makeInput({ blocks: [], docStatus: 'published' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('doc_status');
  });

  it('saves name on a legacy document', async () => {
    state.ownerRow = makeLegacyOwnerRow();
    await patchDocumentTemplate(
      makeInput({ blocks: [], name: 'Updated Name' }),
      makeDeps(state),
    );
    expect(state.executedUpdates[0]).toContain('name');
  });
});

// ─── G8. Auth and input validation ───────────────────────────────────────────

describe('G8 — auth and input validation', () => {
  it('returns 401 when session is null', async () => {
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state, { getSession: async () => null }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });

  it('returns 403 when profile is null', async () => {
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state, { getProfile: async () => null }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it('returns 400 for templateId = 0', async () => {
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }, 0),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('returns 400 when htmlContent is not a string', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: 42 as unknown as string }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('returns 400 when importCss is not a string', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>', importCss: 99 as unknown as string }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('returns 400 when body has no fields to update', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    const result = await patchDocumentTemplate(makeInput({}), makeDeps(state));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('returns 404 when template not found', async () => {
    state.ownerRow = null;
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it('returns 500 when dbUpdate throws unexpectedly', async () => {
    state.ownerRow = makeHtmlOwnerRow();
    state.updateError = new Error('DB connection lost');
    const result = await patchDocumentTemplate(
      makeInput({ htmlContent: '<p>x</p>' }),
      makeDeps(state),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(500);
  });
});

// ─── G9. validateAndSanitiseCss unit tests ────────────────────────────────────

describe('G9 — validateAndSanitiseCss (pure function)', () => {
  it('returns ok=true for empty string', () => {
    expect(validateAndSanitiseCss('', DOC_ID).ok).toBe(true);
  });

  it('returns ok=true for whitespace-only string', () => {
    expect(validateAndSanitiseCss('   ', DOC_ID).ok).toBe(true);
  });

  it('returns ok=true for a well-scoped rule', () => {
    const r = validateAndSanitiseCss(`${SCOPE} { color: red; }`, DOC_ID);
    expect(r.ok).toBe(true);
  });

  it('strips expression() in place and returns ok=true', () => {
    const r = validateAndSanitiseCss(`${SCOPE} { width: expression(alert(1)); }`, DOC_ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.css).not.toContain('expression(');
    expect(r.css).toContain('/* stripped */');
  });

  it('strips data: url() for non-image schemes in place', () => {
    const r = validateAndSanitiseCss(`${SCOPE} { background: url("data:text/html,<h1>x</h1>"); }`, DOC_ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.css).not.toContain('data:text/html');
  });

  it('preserves data:image/ url() (legitimate inline image)', () => {
    const r = validateAndSanitiseCss(`${SCOPE} { background: url("data:image/png;base64,abc"); }`, DOC_ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.css).toContain('data:image/png');
  });

  it('returns ok=false for @import', () => {
    expect(validateAndSanitiseCss(`@import url('x.css');`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for @charset', () => {
    expect(validateAndSanitiseCss(`@charset "UTF-8";`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for javascript: url()', () => {
    expect(validateAndSanitiseCss(`${SCOPE} { background: url("javascript:alert(1)"); }`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for vbscript:', () => {
    expect(validateAndSanitiseCss(`${SCOPE} { background: url("vbscript:msgbox(1)"); }`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for html selector', () => {
    expect(validateAndSanitiseCss(`html { background: red; }`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for body selector', () => {
    expect(validateAndSanitiseCss(`body { margin: 0; }`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for * selector', () => {
    expect(validateAndSanitiseCss(`* { box-sizing: border-box; }`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for :root selector', () => {
    expect(validateAndSanitiseCss(`:root { --x: 1; }`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for rule not starting with scope', () => {
    expect(validateAndSanitiseCss(`.other { color: red; }`, DOC_ID).ok).toBe(false);
  });

  it('returns ok=false for rule scoped to a different doc id', () => {
    expect(validateAndSanitiseCss(`.studio-doc[data-doc-id="99"] { color: red; }`, DOC_ID).ok).toBe(false);
  });

  it('returned css string is present on success', () => {
    const r = validateAndSanitiseCss(`${SCOPE} p { margin: 0; }`, DOC_ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.css).toBe('string');
    expect(r.css.length).toBeGreaterThan(0);
  });
});
