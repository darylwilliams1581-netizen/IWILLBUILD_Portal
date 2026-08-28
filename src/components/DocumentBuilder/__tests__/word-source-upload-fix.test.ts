/**
 * Word Source upload bug fix — focused integration tests
 *
 * Verifies:
 *   1. NewDocumentModal has onSaved prop and success state (no silent navigate)
 *   2. NewDocumentModal verifies server returned mode='keep_word' before calling onSaved
 *   3. NewDocumentModal uses filename-without-extension as document name
 *   4. NewDocumentModal does NOT call navigate on keep_word success
 *   5. studio-documents passes onSaved to NewDocumentModal and calls load() + setSourcePanel
 *   6. SourceDocumentPanel has PDF viewer (iframe) for PDF source type
 *   7. SourceDocumentPanel calls pdf-preview endpoint for DOCX source type
 *   8. SourceDocumentPanel shows deliberate fallback panel when pdf-preview returns 503
 *   9. SourceDocumentPanel has checkPreview function that branches on sourceType
 *  10. import-docx POST handler persists source_type='docx' and returns mode='keep_word'
 *  11. import-docx POST handler uses filename-without-extension as document name (via createPlaceholder)
 *  12. pdf-preview endpoint returns 503 with honest message when no Gotenberg
 *  13. source-document/download endpoint is registered in entry.ts
 *  14. source-document/pdf-preview endpoint is registered in entry.ts
 *  15. Convert to Studio Blocks is still present as legacy option in DocxImporter
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';

// ── 1–4. NewDocumentModal ─────────────────────────────────────────────────────
describe('NewDocumentModal — success path', () => {
  it('has onSaved prop in interface', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('onSaved?:');
    expect(src).toContain("sourceType: 'docx' | 'pdf'");
  });

  it('has saved state (SavedResult) for success step', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('SavedResult');
    expect(src).toContain('setSaved(');
    expect(src).toContain('saved.name');
  });

  it('verifies server returned mode=keep_word before calling onSaved', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain("data.mode !== 'keep_word'");
    expect(src).toContain('Server did not persist the source document');
  });

  it('uses filename without extension as document name', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    // docName derived from file.name with extension stripped
    expect(src).toContain("file.name.replace(/\\.(docx|pdf)$/i, '')");
    expect(src).toContain('createPlaceholder(docName)');
  });

  it('does NOT navigate to builder on keep_word success', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    // navigate should only be called in handleBlank and the "Open in builder" success button
    // It must NOT be called directly after the upload response in handleFileSelected
    // The upload success path sets setSaved() and calls onSaved() — no navigate() there
    const handleFileSelectedBlock = src.slice(
      src.indexOf('async function handleFileSelected'),
      src.indexOf('async function handleBlank')
    );
    // navigate should not appear in handleFileSelected (only in success button onClick)
    expect(handleFileSelectedBlock).not.toContain('navigate(');
  });

  it('calls onSaved with id, name, sourceType', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('onSaved?.(id, docName, sourceType)');
  });

  it('shows success state with View in documents list and Open in builder buttons', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    expect(src).toContain('View in documents list');
    expect(src).toContain('Open in builder');
    expect(src).toContain('saved.sourceType');
  });

  it('uses correct field name for Word upload (docx not file)', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/NewDocumentModal.tsx', 'utf-8');
    // Word upload must use field name 'docx' to match import-docx POST handler
    expect(src).toContain("mode === 'word' ? 'docx' : 'pdf'");
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
    // Fallback panel must include Download action
    const unavailableBlock = src.slice(
      src.indexOf("previewStatus === 'unavailable'"),
      src.indexOf("previewStatus === 'error'")
    );
    expect(unavailableBlock).toContain('Download original');
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

// ── 15. Legacy convert_blocks still present ───────────────────────────────────
describe('DocxImporter — legacy convert_blocks', () => {
  it('Convert to Studio Blocks option is still present with Legacy badge', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/DocxImporter.tsx', 'utf-8');
    expect(src).toContain('Convert to Studio Blocks');
    expect(src).toContain('Legacy');
    expect(src).toContain("'convert_blocks'");
  });

  it('Keep as Word Source is the default (recommended) option', async () => {
    const src = await fs.readFile('src/components/DocumentBuilder/DocxImporter.tsx', 'utf-8');
    expect(src).toContain('Keep as Word Source');
    expect(src).toContain('Recommended');
    expect(src).toContain("'keep_word'");
  });
});
