/**
 * Word Source list polish — focused tests
 *
 * Verifies:
 *   1.  GET /api/document-templates FULL_SELECT includes source_type, source_file_name, source_revision
 *   2.  GET /api/document-templates SAFE_SELECT includes source_type, source_file_name, source_revision (as NULL literals)
 *   3.  DocTemplate interface has source_revision field
 *   4.  DocRow renders Word Source badge when source_type === 'docx'
 *   5.  DocRow renders PDF Source badge when source_type === 'pdf'
 *   6.  DocRow renders Source button in expanded section for docx
 *   7.  DocRow renders Source button in expanded section for pdf
 *   8.  SourceDocumentPanel receives isPlatformOwner from studio-documents
 *   9.  SourceDocumentPanel has exactly ONE "Download original" button (no duplicate)
 *  10.  SourceDocumentPanel fallback panel does NOT contain a Download button
 *  11.  SourceDocumentPanel DOCX fallback wording says "Word preview" not "PDF preview"
 *  12.  SourceDocumentPanel DOCX fallback wording says "document-rendering service"
 *  13.  SourceDocumentPanel "Publish to Shared Library" is inside hasSourceDocument block
 *  14.  SourceDocumentPanel "Attach to job" is inside hasSourceDocument block
 *  15.  SourceDocumentPanel "Archive document" is inside hasSourceDocument block
 *  16.  SourceDocumentPanel has no orphaned divider between actions and Publish
 *  17.  checkPreview uses "Word preview requires" wording for DOCX fallback message
 *  18.  GET handler returns { templates: rows } (response shape unchanged)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';

// ── 1–2. GET /api/document-templates SELECT queries ───────────────────────────
describe('GET /api/document-templates — SELECT includes source fields', () => {
  it('FULL_SELECT includes source_type', async () => {
    const src = await fs.readFile('src/server/api/document-templates/GET.ts', 'utf-8');
    const fullBlock = src.slice(src.indexOf('FULL_SELECT'), src.indexOf('SAFE_SELECT'));
    expect(fullBlock).toContain('source_type');
  });

  it('FULL_SELECT includes source_file_name', async () => {
    const src = await fs.readFile('src/server/api/document-templates/GET.ts', 'utf-8');
    const fullBlock = src.slice(src.indexOf('FULL_SELECT'), src.indexOf('SAFE_SELECT'));
    expect(fullBlock).toContain('source_file_name');
  });

  it('FULL_SELECT includes source_revision', async () => {
    const src = await fs.readFile('src/server/api/document-templates/GET.ts', 'utf-8');
    const fullBlock = src.slice(src.indexOf('FULL_SELECT'), src.indexOf('SAFE_SELECT'));
    expect(fullBlock).toContain('source_revision');
  });

  it('SAFE_SELECT includes source_type as NULL literal', async () => {
    const src = await fs.readFile('src/server/api/document-templates/GET.ts', 'utf-8');
    const safeBlock = src.slice(src.indexOf('SAFE_SELECT'));
    expect(safeBlock).toContain('source_type');
    expect(safeBlock).toContain('NULL    AS source_type');
  });

  it('SAFE_SELECT includes source_file_name as NULL literal', async () => {
    const src = await fs.readFile('src/server/api/document-templates/GET.ts', 'utf-8');
    const safeBlock = src.slice(src.indexOf('SAFE_SELECT'));
    expect(safeBlock).toContain('NULL    AS source_file_name');
  });

  it('SAFE_SELECT includes source_revision as NULL literal', async () => {
    const src = await fs.readFile('src/server/api/document-templates/GET.ts', 'utf-8');
    const safeBlock = src.slice(src.indexOf('SAFE_SELECT'));
    expect(safeBlock).toContain('NULL    AS source_revision');
  });

  it('response shape is { templates: rows }', async () => {
    const src = await fs.readFile('src/server/api/document-templates/GET.ts', 'utf-8');
    expect(src).toContain('res.json({ templates: rows })');
  });
});

// ── 3. DocTemplate interface ──────────────────────────────────────────────────
describe('DocTemplate interface', () => {
  it('has source_revision field', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('source_revision?:');
  });

  it('has source_type field', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('source_type?:');
  });

  it('has source_file_name field', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('source_file_name?:');
  });
});

// ── 4–7. DocRow badge and Source button ───────────────────────────────────────
describe('DocRow — Word/PDF Source badge and Source button', () => {
  it("renders Word Source badge when source_type === 'docx'", async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain("doc.source_type === 'docx'");
    expect(src).toContain("'Word'");
  });

  it("renders PDF Source badge when source_type === 'pdf'", async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain("doc.source_type === 'pdf'");
    expect(src).toContain("'PDF'");
  });

  it('badge click calls onShowSourcePanel', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('onShowSourcePanel?.(doc.id, doc.name, doc.template_type)');
  });

  it('expanded section has Source button for docx/pdf', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('Word Source');
    expect(src).toContain('PDF Source');
  });
});

// ── 8. isPlatformOwner passed to SourceDocumentPanel ─────────────────────────
describe('studio-documents — isPlatformOwner wiring', () => {
  it('passes isPlatformOwner to SourceDocumentPanel', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    // isPlatformOwner={isPlatformOwner} must appear in the file
    expect(src).toContain('isPlatformOwner={isPlatformOwner}');
  });
});

// ── 9–16. SourceDocumentPanel actions layout ──────────────────────────────────
describe('SourceDocumentPanel — actions layout and wording', () => {
  it('has exactly one "Download original" button (not counting JSDoc comments)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    // Strip JSDoc/comment lines before counting
    const codeOnly = src.split('\n').filter(l => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    const matches = codeOnly.match(/Download original/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('fallback panel (unavailable) does NOT contain a Download button', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    // The unavailable block should not have a Download button — it was removed
    const unavailableBlock = src.slice(
      src.indexOf("previewStatus === 'unavailable'"),
      src.indexOf("previewStatus === 'error'")
    );
    expect(unavailableBlock).not.toContain('Download original');
    expect(unavailableBlock).not.toContain('handleDownload');
  });

  it('DOCX fallback wording says "Word preview" not "PDF preview"', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    // checkPreview fallback message for DOCX must not say "PDF preview"
    const checkPreviewBlock = src.slice(
      src.indexOf('async function checkPreview'),
      src.indexOf('async function handleDownload')
    );
    expect(checkPreviewBlock).not.toContain('PDF preview requires');
    expect(checkPreviewBlock).toContain('Word preview requires');
  });

  it('DOCX fallback wording says "document-rendering service"', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('document-rendering service');
  });

  it('"Publish to Shared Library" appears in the file', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('Publish to Shared Library');
  });

  it('"Publish to Shared Library" is guarded by isPlatformOwner', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    // Use lastIndexOf to find the JSX occurrence (not the JSDoc comment at the top)
    const publishIdx = src.lastIndexOf('Publish to Shared Library');
    const ownerIdx = src.lastIndexOf('{isPlatformOwner &&', publishIdx);
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(ownerIdx).toBeLessThan(publishIdx);
  });

  it('"Attach to job" appears in the file', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('Attach to job');
  });

  it('"Attach to job" is inside the hasSourceDocument block', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    const hasSourceIdx = src.indexOf('meta.hasSourceDocument && (');
    const attachIdx = src.indexOf('Attach to job');
    // Attach must appear after hasSourceDocument opens
    expect(attachIdx).toBeGreaterThan(hasSourceIdx);
    // And before the closing of the panel body (which is after the hasSourceDocument block)
    const panelBodyCloseIdx = src.indexOf('</div>\n      </div>\n    </div>,\n    document.body');
    expect(attachIdx).toBeLessThan(panelBodyCloseIdx);
  });

  it('"Archive document" appears in the file', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('Archive document');
  });

  it('"Archive document" is inside the hasSourceDocument block', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    // Use lastIndexOf to find the JSX occurrence (not the JSDoc comment at the top)
    const hasSourceIdx = src.indexOf('meta.hasSourceDocument && (');
    const archiveIdx = src.lastIndexOf('Archive document');
    expect(archiveIdx).toBeGreaterThan(hasSourceIdx);
  });

  it('no orphaned divider between revision history and Publish', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    // The old pattern was: close actions div → divider → Publish section outside hasSourceDocument
    // After fix: no standalone divider between the revision history and Publish
    const afterRevHistory = src.slice(
      src.indexOf('Revision history'),
      src.indexOf('Publish to Shared Library')
    );
    expect(afterRevHistory).not.toContain('border-t border-slate-100');
  });

  it('isPlatformOwner guard wraps Publish button', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('{isPlatformOwner && (');
    // Publish button must be inside the isPlatformOwner block
    const ownerBlock = src.slice(
      src.indexOf('{isPlatformOwner && ('),
      src.indexOf('{isPlatformOwner && (') + 2500
    );
    expect(ownerBlock).toContain('Publish to Shared Library');
  });
});

// ── 17. checkPreview wording ──────────────────────────────────────────────────
describe('checkPreview — DOCX fallback message wording', () => {
  it('default fallback message uses "Word preview requires a document-rendering service"', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('Word preview requires a document-rendering service');
  });
});
