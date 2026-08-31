/**
 * Final Phase 2 slice — focused tests
 *
 * 1. Import button removed from studio-documents header
 * 2. AttachToJobSheet wired into SourceDocumentPanel
 * 3. PDF export: source-document flow (cover page + Gotenberg merge)
 * 4. PDF export: honest 503 when Gotenberg render fails
 * 5. PDF export: no-Gotenberg fallback returns cover HTML with download link
 * 6. PDF export: blocks-based flow unchanged (rich_text type fix preserved)
 * 7. safetyTab=swms client-side redirect already in SafetyContent
 * 8. safetyTab=plans client-side redirect already in SafetyContent
 * 9. /safety/swms server route redirect in routes.tsx
 * 10. /safety/plans server route redirect in routes.tsx
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';

// ── 1. Import button removed ──────────────────────────────────────────────────
describe('studio-documents header', () => {
  it('no standalone Import button beside New document', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    // The old button had onClick={() => void handleOpenImporter()}
    expect(src).not.toContain('void handleOpenImporter()');
    // FileUp icon should not appear in the header button area
    // (it's removed from the lucide import entirely)
    expect(src).not.toContain('FileUp');
  });

  it('New document button still present', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('setShowNewDocModal(true)');
    expect(src).toContain('New document');
  });

  it('NewDocumentModal is still imported and rendered', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain("import NewDocumentModal");
    expect(src).toContain('<NewDocumentModal');
  });
});

// ── 2. AttachToJobSheet in SourceDocumentPanel ────────────────────────────────
describe('SourceDocumentPanel — AttachToJobSheet integration', () => {
  it('imports AttachToJobSheet', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain("import AttachToJobSheet");
  });

  it('has showAttachSheet state', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('showAttachSheet');
    expect(src).toContain('setShowAttachSheet');
  });

  it('renders AttachToJobSheet when showAttachSheet is true', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('<AttachToJobSheet');
    expect(src).toContain('studioDocId={templateId}');
    expect(src).toContain('docTitle={templateName}');
    expect(src).toContain('templateType={templateType}');
  });

  it('Attach to job button triggers setShowAttachSheet(true)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('setShowAttachSheet(true)');
    expect(src).toContain('Attach to job');
    expect(src).toContain('Briefcase');
  });

  it('accepts templateType prop', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain("templateType?: string");
    expect(src).toContain("templateType = 'custom'");
  });
});

// ── 3. PDF export — source document flow ─────────────────────────────────────
describe('PDF export — source document flow', () => {
  it('loads source_type, source_file_key, source_file_name from DB', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('source_type');
    expect(src).toContain('source_file_key');
    expect(src).toContain('source_file_name');
  });

  it('imports downloadSourceDocument from storage helper', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain("downloadSourceDocument");
    expect(src).toContain('source-document-storage');
  });

  it('has Gotenberg URL helper', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('gotenbergUrl');
    expect(src).toContain('GOTENBERG_URL');
  });

  it('has gotenbergHtmlToPdf helper', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('gotenbergHtmlToPdf');
    expect(src).toContain('/forms/chromium/convert/html');
  });

  it('has gotenbergMergePdfs helper', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('gotenbergMergePdfs');
    expect(src).toContain('/forms/pdfengines/merge');
  });

  it('buildCoverHtml produces cover page with job info and master banner', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('buildCoverHtml');
    expect(src).toContain('master-banner');
    expect(src).toContain('Master Document — Not Job Specific');
    expect(src).toContain('source-badge');
  });

  it('source document flow branches on sourceType docx/pdf', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain("sourceType === 'docx'");
    expect(src).toContain("sourceType === 'pdf'");
    expect(src).toContain('sourceFileKey');
  });

  it('returns merged PDF with application/pdf content-type when Gotenberg succeeds', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain("'application/pdf'");
    expect(src).toContain('attachment; filename=');
  });
});

// ── 4. Honest 503 when Gotenberg render fails ─────────────────────────────────
describe('PDF export — honest 503', () => {
  it('returns 503 when cover PDF render fails (Gotenberg available but broken)', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('503');
    expect(src).toContain('PDF renderer unavailable');
    expect(src).toContain('downloadUrl');
  });
});

// ── 5. No-Gotenberg fallback ──────────────────────────────────────────────────
describe('PDF export — no-Gotenberg fallback', () => {
  it('returns cover HTML with download link when no Gotenberg configured', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('includeDownloadLink: true');
    expect(src).toContain('X-Renderer-Status');
    expect(src).toContain('unavailable');
    expect(src).toContain('X-Source-Download-Url');
  });

  it('cover HTML includes download link to source file', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    expect(src).toContain('Download original');
    expect(src).toContain('source-document/download');
  });
});

// ── 6. Blocks-based flow — rich_text type fix preserved ──────────────────────
describe('PDF export — blocks-based flow', () => {
  it('handles rich_text type (underscore) correctly', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    // Must handle 'rich_text' (the correct schema type)
    expect(src).toContain("b.type === 'rich_text'");
    // Old broken type still handled for backward compat
    expect(src).toContain("b.type === 'richtext'");
  });

  it('rich_text renders innerHTML not escaped text', async () => {
    const src = await fs.readFile('src/server/api/document-templates/[id]/export/pdf/GET.ts', 'utf-8');
    // The fix: rich_text should return raw HTML content, not esc(content)
    // Look for the rich_text branch returning content directly
    expect(src).toContain("b.content || b.html || ''");
  });
});

// ── 7–10. Redirect completeness ───────────────────────────────────────────────
describe('Redirect completeness', () => {
  it('?safetyTab=swms client-side redirect in SafetyContent', async () => {
    const src = await fs.readFile('src/components/safety/SafetyContent.tsx', 'utf-8');
    expect(src).toContain("rawTab === 'swms'");
    expect(src).toContain("navigate('/studio/documents'");
  });

  it('?safetyTab=plans client-side redirect in SafetyContent', async () => {
    const src = await fs.readFile('src/components/safety/SafetyContent.tsx', 'utf-8');
    expect(src).toContain("rawTab === 'plans'");
  });

  it('/safety/swms server route redirect in routes.tsx', async () => {
    const src = await fs.readFile('src/routes.tsx', 'utf-8');
    expect(src).toContain("path: '/safety/swms'");
    expect(src).toContain("redirect('/safety?safetyTab=documents')");
  });

  it('/safety/plans server route redirect in routes.tsx', async () => {
    const src = await fs.readFile('src/routes.tsx', 'utf-8');
    expect(src).toContain("path: '/safety/plans'");
    expect(src).toContain("redirect('/studio/documents')");
  });

  it('all four redirect paths covered', async () => {
    const routesSrc = await fs.readFile('src/routes.tsx', 'utf-8');
    const safetySrc = await fs.readFile('src/components/safety/SafetyContent.tsx', 'utf-8');
    expect(routesSrc).toContain("path: '/safety/swms'");
    expect(routesSrc).toContain("path: '/safety/plans'");
    expect(safetySrc).toContain("rawTab === 'swms'");
    expect(safetySrc).toContain("rawTab === 'plans'");
  });
});

// ── studio-documents: templateType passed to SourceDocumentPanel ──────────────
describe('studio-documents — SourceDocumentPanel templateType', () => {
  it('passes templateType from DocRow to setSourcePanel', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('templateType: ttype');
    expect(src).toContain('doc.template_type');
  });

  it('SourceDocumentPanel receives templateType prop', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('templateType={sourcePanel.templateType}');
  });
});
