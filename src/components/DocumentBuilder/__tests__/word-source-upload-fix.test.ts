/**
 * Word Source upload — updated tests for convert_blocks_v2 architecture
 *
 * NewDocumentModal:
 *   1. onSaved prop still present (used for PDF path)
 *   2. Word path sends mode=convert_blocks_v2 (never convert_html)
 *   3. Word path verifies server returned mode=convert_blocks_v2
 *   4. Word path does NOT call onSaved (PDF-only)
 *   5. studio-documents passes onSaved to NewDocumentModal and calls load() + setSourcePanel
 *   6–9. SourceDocumentPanel viewer (unchanged)
 *   10–11. import-docx POST handler (unchanged)
 *   12. pdf-preview endpoint returns 503 (unchanged)
 *   13–14. Route registration (unchanged)
 *   15. DocxImporter: convert_blocks_v2 is the default; keep_word is in Advanced section
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';

// ── 1–4. NewDocumentModal ─────────────────────────────────────────────────────
describe('NewDocumentModal — Word path (convert_blocks_v2)', () => {
  it('onSaved prop still present in interface (used for PDF path)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('onSaved?:');
    expect(src).toContain("sourceType: 'docx' | 'pdf'");
  });

  it('Word path sends mode=convert_blocks_v2 (never convert_html)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain("formData.append('mode', 'convert_blocks_v2')");
    expect(src).not.toContain("formData.append('mode', 'convert_html')");
  });

  it('Word path verifies server returned mode=convert_blocks_v2', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain("data.mode !== 'convert_blocks_v2'");
    expect(src).toContain('Server did not convert the document to blocks');
  });

  it('uses filename without extension as document name', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain("file.name.replace(/\\.(docx|dotx)$/i, '')");
    expect(src).toContain('createPlaceholder(docName)');
  });

  it('Word path navigates to /studio/builder/:id on success', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('navigate(`/studio/builder/${id}`)');
  });

  it('Word path does NOT call onSaved', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    const wordFnBlock = src.slice(
      src.indexOf('async function handleWordFile'),
      src.indexOf('async function handlePdfFile'),
    );
    expect(wordFnBlock).not.toContain('onSaved?.(');
  });

  it('uses correct field name for Word upload (docx)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain("formData.append('docx', file)");
  });

  it('accepts .dotx in addition to .docx', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('.docx,.dotx');
  });

  it('Word path writes blocks via PATCH to builder_json (never html_content)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('builderJson');
    expect(src).toContain("method: 'PATCH'");
    // Must not write html_content in the Word path
    const wordFnBlock = src.slice(
      src.indexOf('async function handleWordFile'),
      src.indexOf('async function handlePdfFile'),
    );
    expect(wordFnBlock).not.toContain('html_content');
    expect(wordFnBlock).not.toContain('htmlContent');
  });
});

// ── 5. studio-documents wiring ────────────────────────────────────────────────
describe('studio-documents — onSaved wiring', () => {
  it('passes onSaved to NewDocumentModal', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    expect(src).toContain('onSaved=');
    expect(src).toContain('void load()');
  });

  it('calls setSourcePanel after successful save', async () => {
    const src = await fs.readFile('src/pages/studio-documents.tsx', 'utf-8');
    // onSaved callback should open the SourceDocumentPanel
    expect(src).toContain('setSourcePanel(');
    // The onSaved block must contain both load() and setSourcePanel
    const onSavedBlock = src.slice(
      src.indexOf('onSaved={(id, name, sourceType)'),
      src.indexOf('onSaved={(id, name, sourceType)') + 400
    );
    expect(onSavedBlock).toContain('load()');
    expect(onSavedBlock).toContain('setSourcePanel(');
  });
});

// ── 6–9. SourceDocumentPanel viewer ──────────────────────────────────────────
describe('SourceDocumentPanel — document viewer', () => {
  it('has previewStatus state', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('previewStatus');
    expect(src).toContain("'available'");
    expect(src).toContain("'unavailable'");
    expect(src).toContain("'loading'");
  });

  it('has checkPreview function that branches on sourceType', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('async function checkPreview');
    expect(src).toContain("sourceType === 'pdf'");
    expect(src).toContain('pdf-preview');
  });

  it('renders iframe for PDF source pointing at download endpoint', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('source-document/download');
    expect(src).toContain('<iframe');
    expect(src).toContain("sourceType === 'pdf'");
  });

  it('renders iframe for DOCX source pointing at pdf-preview endpoint', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('source-document/pdf-preview');
  });

  it('shows deliberate fallback panel when previewStatus is unavailable', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain("previewStatus === 'unavailable'");
    expect(src).toContain('Preview unavailable');
    expect(src).toContain('previewUnavailableMsg');
    // Fallback panel must NOT have its own Download button — the general Download action below covers it
    const unavailableBlock = src.slice(
      src.indexOf("previewStatus === 'unavailable'"),
      src.indexOf("previewStatus === 'error'")
    );
    expect(unavailableBlock).not.toContain('Download original');
  });

  it('has Preview document toggle button', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('Preview document');
    expect(src).toContain('Hide preview');
    expect(src).toContain('showPreview');
  });

  it('panel is wider (max-w-lg) to accommodate iframe', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/SourceDocumentPanel.tsx', 'utf-8');
    expect(src).toContain('max-w-lg');
  });
});

// ── 10–11. import-docx POST handler ──────────────────────────────────────────
describe('import-docx POST handler — keep_word persistence', () => {
  it('sets source_type=docx in UPDATE statement', async () => {
    const src = await fs.readFile(
      "src/server/api/document-templates/[id]/import-docx/POST.ts",
      'utf-8'
    );
    expect(src).toContain("source_type       = 'docx'");
    expect(src).toContain('source_file_key');
    expect(src).toContain('source_sha256');
    expect(src).toContain('source_revision');
  });

  it('returns mode=keep_word in response', async () => {
    const src = await fs.readFile(
      "src/server/api/document-templates/[id]/import-docx/POST.ts",
      'utf-8'
    );
    expect(src).toContain("mode: 'keep_word'");
  });

  it('accepts field name "docx" for the uploaded file', async () => {
    const src = await fs.readFile(
      "src/server/api/document-templates/[id]/import-docx/POST.ts",
      'utf-8'
    );
    expect(src).toContain("f.fieldname === 'docx'");
  });
});

// ── 12. pdf-preview 503 ───────────────────────────────────────────────────────
describe('pdf-preview endpoint — honest 503', () => {
  it('returns 503 with honest message when no Gotenberg configured', async () => {
    const src = await fs.readFile(
      "src/server/api/document-templates/[id]/source-document/pdf-preview/GET.ts",
      'utf-8'
    );
    expect(src).toContain('503');
    expect(src).toContain('PDF preview unavailable');
    expect(src).toContain('downloadAvailable: true');
    expect(src).toContain('GOTENBERG_URL');
  });
});

// ── 13–14. Route registration ─────────────────────────────────────────────────
describe('Route registration in entry.ts', () => {
  it('source-document/download GET is registered', async () => {
    const src = await fs.readFile('src/server/entry.ts', 'utf-8');
    expect(src).toContain('source-document/download');
    expect(src).toContain('app.get("/api/document-templates/:id/source-document/download"');
  });

  it('source-document/pdf-preview GET is registered', async () => {
    const src = await fs.readFile('src/server/entry.ts', 'utf-8');
    expect(src).toContain('source-document/pdf-preview');
    expect(src).toContain('app.get("/api/document-templates/:id/source-document/pdf-preview"');
  });

  it('import-docx POST is registered', async () => {
    const src = await fs.readFile('src/server/entry.ts', 'utf-8');
    expect(src).toContain('import-docx');
    expect(src).toContain('app.post("/api/document-templates/:id/import-docx"');
  });
});

// ── 15. DocxImporter — convert_blocks_v2 default ─────────────────────────────
describe('DocxImporter — legacy convert_blocks', () => {
  it('convert_blocks_v2 is the default mode (not keep_word or convert_html)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/DocxImporter.tsx', 'utf-8');
    expect(src).toContain("useState<DocxMode>('convert_blocks_v2')");
  });

  it('keep_word is present as an advanced/recovery option', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/DocxImporter.tsx', 'utf-8');
    expect(src).toContain("'keep_word'");
    expect(src).toContain('Recovery copy');
  });

  it('onOpenInStudio prop is declared', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/DocxImporter.tsx', 'utf-8');
    expect(src).toContain('onOpenInStudio');
    expect(src).toContain('ConvertHtmlResult');
  });
});
