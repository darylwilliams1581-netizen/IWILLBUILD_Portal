/**
 * import-docx — convert_html mode: focused unit tests
 *
 * Tests exercise runConvertHtml() from lib/import-docx-convert-html.ts
 * directly, with all external dependencies (DB, storage) passed as
 * injected mocks — no HTTP server, no real DB, no disk I/O.
 *
 * Groups:
 *   G1. Successful conversion — response shape
 *   G2. Successful conversion — DOCX recovery bytes stored
 *   G3. Successful conversion — HTML/CSS/report persisted to DB
 *   G4. Successful conversion — image placeholders replaced with URLs
 *   G5. Auth / tenant isolation (handler-level guards via source inspection)
 *   G6. Invalid DOCX — 422 with descriptive error
 *   G7. Rollback / cleanup on DB failure
 *   G8. BUCKET_DOC_ASSETS export value
 *   G9. keep_word and convert_blocks paths still work (source inspection)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { runConvertHtml, BUCKET_DOC_ASSETS } from '../import-docx-convert-html.js';
import type { ConvertHtmlDeps, ConvertHtmlInput } from '../import-docx-convert-html.js';

// ─── Minimal DOCX builder ─────────────────────────────────────────────────────

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

async function makeMinimalDocx(bodyXml = '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>'): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W_NS} ${R_NS}><w:body>${bodyXml}</w:body></w:document>`,
  );
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** Build a DOCX with one embedded 1×1 PNG image */
async function makeDocxWithImage(): Promise<Buffer> {
  // Minimal valid 1×1 transparent PNG (67 bytes)
  const PNG_1X1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
    'hex',
  );
  const zip = new JSZip();
  zip.file('word/media/image1.png', PNG_1X1);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W_NS} ${R_NS}
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p><w:r><w:drawing>
      <wp:inline>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill>
              <pic:spPr/>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing></w:r></w:p>
  </w:body>
</w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`,
  );
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ─── Mock dependency factory ──────────────────────────────────────────────────

interface MockState {
  dbCalls: string[];
  savedFiles: Array<{ bucket: string; storageKey: string }>;
  deletedKeys: Array<{ storageKey: string; bucket: string }>;
}

function makeDeps(state: MockState, overrides: Partial<ConvertHtmlDeps> = {}): ConvertHtmlDeps {
  return {
    dbExecute: vi.fn(async (q: { sql: string }) => {
      state.dbCalls.push(q.sql);
      return [[], undefined];
    }),
    uploadSourceDocument: vi.fn(async (buffer: Buffer, opts) => {
      const key = `${opts.companyId}/${opts.templateId}/rev${opts.revision}/recovery.docx`;
      state.savedFiles.push({ bucket: 'source-documents', storageKey: key });
      return {
        storageKey: key,
        sha256: 'aabbcc' + '0'.repeat(58),
        sizeBytes: buffer.length,
        publicUrl: `https://r2.example.com/${key}`,
      };
    }),
    deleteSourceDocument: vi.fn(async (storageKey: string) => {
      state.deletedKeys.push({ storageKey, bucket: 'source-documents' });
    }),
    saveFile: vi.fn(async (input) => {
      state.savedFiles.push({ bucket: input.bucket, storageKey: input.storageKey });
      return {
        storageKey: input.storageKey,
        publicUrl: `https://cdn.example.com/${input.bucket}/${input.storageKey}`,
      };
    }),
    deleteFile: vi.fn(async (storageKey: string, bucket: string) => {
      state.deletedKeys.push({ storageKey, bucket });
    }),
    ...overrides,
  };
}

function makeInput(docxBuffer: Buffer, overrides: Partial<ConvertHtmlInput> = {}): ConvertHtmlInput {
  return {
    docxBuffer,
    originalName: 'test.docx',
    templateId: 42,
    companyId: 1,
    userId: 'user-1',
    currentRevision: 0,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let state: MockState;
beforeEach(() => {
  state = { dbCalls: [], savedFiles: [], deletedKeys: [] };
  vi.clearAllMocks();
});

// ─── G1. Successful conversion — response shape ───────────────────────────────

describe('G1 — successful convert_html: response shape', () => {
  it('returns ok=true', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
  });

  it('payload.mode = "convert_html"', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok && result.payload.mode).toBe('convert_html');
  });

  it('payload.html is a non-empty string', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.payload.html).toBe('string');
    expect(result.payload.html.length).toBeGreaterThan(0);
  });

  it('payload.css contains .studio-doc scope', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.css).toContain('.studio-doc');
  });

  it('payload.report has all required fields', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { report } = result.payload;
    expect(typeof report.messageCount).toBe('number');
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(typeof report.imageCount).toBe('number');
    expect(typeof report.pageBreakCount).toBe('number');
    expect(typeof report.hadUnsupported).toBe('boolean');
  });

  it('payload.sha256 is a 64-char hex string', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sha256).toMatch(/^[0-9a-f]{64}$/i);
  });

  it('payload.revision = currentRevision + 1', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf, { currentRevision: 3 }), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.revision).toBe(4);
  });

  it('payload.sizeBytes matches buffer length', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sizeBytes).toBe(buf.length);
  });

  it('payload.sourceDocxName matches originalName', async () => {
    const buf = await makeMinimalDocx();
    const result = await runConvertHtml(makeInput(buf, { originalName: 'my-swms.docx' }), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.sourceDocxName).toBe('my-swms.docx');
  });
});

// ─── G2. DOCX recovery bytes stored ──────────────────────────────────────────

describe('G2 — DOCX recovery bytes stored', () => {
  it('calls uploadSourceDocument exactly once', async () => {
    const buf = await makeMinimalDocx();
    const deps = makeDeps(state);
    await runConvertHtml(makeInput(buf), deps);
    expect(vi.mocked(deps.uploadSourceDocument)).toHaveBeenCalledOnce();
  });

  it('passes the original DOCX buffer to uploadSourceDocument', async () => {
    const buf = await makeMinimalDocx();
    const deps = makeDeps(state);
    await runConvertHtml(makeInput(buf), deps);
    const [passedBuf] = vi.mocked(deps.uploadSourceDocument).mock.calls[0];
    expect(Buffer.isBuffer(passedBuf)).toBe(true);
    expect(passedBuf.length).toBe(buf.length);
  });

  it('passes correct companyId, templateId, originalName to uploadSourceDocument', async () => {
    const buf = await makeMinimalDocx();
    const deps = makeDeps(state);
    await runConvertHtml(makeInput(buf, { companyId: 7, templateId: 99, originalName: 'swms.docx' }), deps);
    const [, opts] = vi.mocked(deps.uploadSourceDocument).mock.calls[0];
    expect(opts.companyId).toBe(7);
    expect(opts.templateId).toBe(99);
    expect(opts.originalName).toBe('swms.docx');
  });

  it('revision history INSERT uses source_type=html', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf), makeDeps(state));
    const revInsert = state.dbCalls.find(s => s.includes('document_template_revisions'));
    expect(revInsert).toBeDefined();
    expect(revInsert).toContain("'html'");
  });
});

// ─── G3. HTML/CSS/report persisted to DB ─────────────────────────────────────

describe('G3 — HTML/CSS/report persisted to DB', () => {
  it('UPDATE sets source_type = html', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf), makeDeps(state));
    const update = state.dbCalls.find(s => s.includes('UPDATE document_templates'));
    expect(update).toBeDefined();
    expect(update).toContain("source_type       = 'html'");
  });

  it('UPDATE includes html_content column', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf), makeDeps(state));
    const update = state.dbCalls.find(s => s.includes('UPDATE document_templates'));
    expect(update).toContain('html_content');
  });

  it('UPDATE includes import_css column', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf), makeDeps(state));
    const update = state.dbCalls.find(s => s.includes('UPDATE document_templates'));
    expect(update).toContain('import_css');
  });

  it('UPDATE includes import_report column', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf), makeDeps(state));
    const update = state.dbCalls.find(s => s.includes('UPDATE document_templates'));
    expect(update).toContain('import_report');
  });

  it('UPDATE sets rendered_pdf_key = NULL', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf), makeDeps(state));
    const update = state.dbCalls.find(s => s.includes('UPDATE document_templates'));
    expect(update).toContain('rendered_pdf_key  = NULL');
  });

  it('import_report embedded in SQL is valid JSON with report fields', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf), makeDeps(state));
    const update = state.dbCalls.find(s => s.includes('import_report'));
    expect(update).toBeDefined();
    // Extract JSON between import_report = ' ... ', rendered_pdf_key
    const match = /import_report\s*=\s*'([\s\S]*?)',\s*rendered_pdf_key/.exec(update!);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1].replace(/''/g, "'"));
    expect(typeof parsed.messageCount).toBe('number');
    expect(Array.isArray(parsed.warnings)).toBe(true);
    expect(typeof parsed.imageCount).toBe('number');
  });

  it('UPDATE targets the correct template ID', async () => {
    const buf = await makeMinimalDocx();
    await runConvertHtml(makeInput(buf, { templateId: 77 }), makeDeps(state));
    const update = state.dbCalls.find(s => s.includes('UPDATE document_templates'));
    expect(update).toContain('WHERE id = 77');
  });
});

// ─── G4. Image placeholders replaced with URLs ────────────────────────────────

describe('G4 — image placeholders replaced with real URLs', () => {
  it('HTML in payload does not contain __IMG_ASSET_ placeholders when images present', async () => {
    const buf = await makeDocxWithImage();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.payload.imageCount > 0) {
      expect(result.payload.html).not.toContain('__IMG_ASSET_');
    }
  });

  it('saveFile called once per extracted image with doc-assets bucket', async () => {
    const buf = await makeDocxWithImage();
    const deps = makeDeps(state);
    const result = await runConvertHtml(makeInput(buf), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imgSaves = vi.mocked(deps.saveFile).mock.calls.filter(
      ([input]) => (input as { bucket: string }).bucket === BUCKET_DOC_ASSETS,
    );
    expect(imgSaves.length).toBe(result.payload.imageCount);
  });

  it('image storageKey includes companyId and templateId', async () => {
    const buf = await makeDocxWithImage();
    const deps = makeDeps(state);
    const result = await runConvertHtml(makeInput(buf, { companyId: 5, templateId: 20 }), deps);
    expect(result.ok).toBe(true);
    if (!result.ok || result.payload.imageCount === 0) return;
    const imgSave = vi.mocked(deps.saveFile).mock.calls.find(
      ([input]) => (input as { bucket: string }).bucket === BUCKET_DOC_ASSETS,
    );
    expect(imgSave).toBeDefined();
    expect((imgSave![0] as { storageKey: string }).storageKey).toContain('5/20/');
  });

  it('HTML contains cdn URL after placeholder substitution', async () => {
    const buf = await makeDocxWithImage();
    const result = await runConvertHtml(makeInput(buf), makeDeps(state));
    expect(result.ok).toBe(true);
    if (!result.ok || result.payload.imageCount === 0) return;
    expect(result.payload.html).toContain('cdn.example.com');
  });
});

// ─── G5. Auth / tenant isolation (source-level guards) ───────────────────────

describe('G5 — auth and tenant isolation (handler source guards)', () => {
  it('POST.ts checks session.user before proceeding', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'src/server/api/document-templates/[id]/import-docx/POST.ts',
      'utf-8',
    );
    expect(src).toContain("if (!session?.user) return res.status(401)");
  });

  it('POST.ts checks profile.companyId for tenant isolation', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'src/server/api/document-templates/[id]/import-docx/POST.ts',
      'utf-8',
    );
    expect(src).toContain('profile.companyId');
    expect(src).toContain('company_id = ${profile.companyId}');
  });

  it('POST.ts verifies template ownership before processing', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'src/server/api/document-templates/[id]/import-docx/POST.ts',
      'utf-8',
    );
    // Template SELECT must include company_id filter
    expect(src).toContain('WHERE id = ${id} AND company_id = ${profile.companyId}');
  });
});

// ─── G6. Invalid DOCX → 422 ───────────────────────────────────────────────────

describe('G6 — invalid DOCX returns 422', () => {
  it('returns ok=false, status=422 for a non-DOCX buffer', async () => {
    const notDocx = Buffer.from('this is not a docx file at all');
    const result = await runConvertHtml(makeInput(notDocx), makeDeps(state));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(result.error).toContain('DOCX conversion failed');
  });

  it('returns ok=false, status=422 for an empty buffer', async () => {
    const result = await runConvertHtml(makeInput(Buffer.alloc(0)), makeDeps(state));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
  });

  it('does NOT call uploadSourceDocument when conversion fails', async () => {
    const notDocx = Buffer.from('garbage');
    const deps = makeDeps(state);
    await runConvertHtml(makeInput(notDocx), deps);
    expect(vi.mocked(deps.uploadSourceDocument)).not.toHaveBeenCalled();
  });

  it('does NOT call dbExecute when conversion fails', async () => {
    const notDocx = Buffer.from('garbage');
    const deps = makeDeps(state);
    await runConvertHtml(makeInput(notDocx), deps);
    expect(vi.mocked(deps.dbExecute)).not.toHaveBeenCalled();
  });
});

// ─── G7. Rollback / cleanup on DB failure ────────────────────────────────────

describe('G7 — rollback and cleanup on DB failure', () => {
  it('returns ok=false, status=500 when DB UPDATE fails', async () => {
    const buf = await makeMinimalDocx();
    const deps = makeDeps(state, {
      dbExecute: vi.fn(async (q: { sql: string }) => {
        if (q.sql.includes('UPDATE document_templates')) throw new Error('DB write failed');
        return [[], undefined];
      }),
    });
    const result = await runConvertHtml(makeInput(buf), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(500);
  });

  it('calls deleteSourceDocument for recovery copy when DB UPDATE fails', async () => {
    const buf = await makeMinimalDocx();
    const deps = makeDeps(state, {
      dbExecute: vi.fn(async (q: { sql: string }) => {
        if (q.sql.includes('UPDATE document_templates')) throw new Error('DB write failed');
        return [[], undefined];
      }),
    });
    await runConvertHtml(makeInput(buf), deps);
    expect(vi.mocked(deps.deleteSourceDocument)).toHaveBeenCalled();
    const deletedKey = vi.mocked(deps.deleteSourceDocument).mock.calls[0][0];
    expect(typeof deletedKey).toBe('string');
    expect(deletedKey.length).toBeGreaterThan(0);
  });

  it('calls deleteFile for each image asset when DB UPDATE fails', async () => {
    const buf = await makeDocxWithImage();
    const deps = makeDeps(state, {
      dbExecute: vi.fn(async (q: { sql: string }) => {
        if (q.sql.includes('UPDATE document_templates')) throw new Error('DB write failed');
        return [[], undefined];
      }),
    });
    const result = await runConvertHtml(makeInput(buf), deps);
    expect(result.ok).toBe(false);
    // For each image that was saved, deleteFile should have been called
    const imgSaves = vi.mocked(deps.saveFile).mock.calls.filter(
      ([input]) => (input as { bucket: string }).bucket === BUCKET_DOC_ASSETS,
    );
    const imgDeletes = vi.mocked(deps.deleteFile).mock.calls.filter(
      ([, bucket]) => bucket === BUCKET_DOC_ASSETS,
    );
    expect(imgDeletes.length).toBe(imgSaves.length);
  });

  it('returns ok=false, status=500 when uploadSourceDocument fails', async () => {
    const buf = await makeMinimalDocx();
    const deps = makeDeps(state, {
      uploadSourceDocument: vi.fn(async () => { throw new Error('R2 unavailable'); }),
    });
    const result = await runConvertHtml(makeInput(buf), deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(500);
    expect(result.error).toContain('recovery copy');
  });

  it('does NOT call dbExecute when uploadSourceDocument fails', async () => {
    const buf = await makeMinimalDocx();
    const deps = makeDeps(state, {
      uploadSourceDocument: vi.fn(async () => { throw new Error('R2 unavailable'); }),
    });
    await runConvertHtml(makeInput(buf), deps);
    const updateCalls = vi.mocked(deps.dbExecute).mock.calls.filter(
      ([q]) => (q as { sql: string }).sql.includes('UPDATE document_templates'),
    );
    expect(updateCalls.length).toBe(0);
  });
});

// ─── G8. BUCKET_DOC_ASSETS export ────────────────────────────────────────────

describe('G8 — BUCKET_DOC_ASSETS export', () => {
  it('BUCKET_DOC_ASSETS = "doc-assets"', () => {
    expect(BUCKET_DOC_ASSETS).toBe('doc-assets');
  });
});

// ─── G9. Compatibility — keep_word and convert_blocks still work ──────────────

describe('G9 — keep_word and convert_blocks compatibility (source inspection)', () => {
  it('POST.ts still has keep_word mode handler', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'src/server/api/document-templates/[id]/import-docx/POST.ts',
      'utf-8',
    );
    expect(src).toContain("mode === 'keep_word'");
    expect(src).toContain("source_type       = 'docx'");
  });

  it('POST.ts still has convert_blocks mode handler', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'src/server/api/document-templates/[id]/import-docx/POST.ts',
      'utf-8',
    );
    expect(src).toContain("mode: 'convert_blocks'");
    expect(src).toContain('parseDocxToBlocks');
  });

  it('POST.ts default mode is still keep_word', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'src/server/api/document-templates/[id]/import-docx/POST.ts',
      'utf-8',
    );
    expect(src).toContain("?? 'keep_word'");
  });

  it('POST.ts registers convert_html mode before convert_blocks', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      'src/server/api/document-templates/[id]/import-docx/POST.ts',
      'utf-8',
    );
    const htmlIdx = src.indexOf("mode === 'convert_html'");
    const blocksIdx = src.indexOf("mode: 'convert_blocks'");
    expect(htmlIdx).toBeGreaterThan(-1);
    expect(blocksIdx).toBeGreaterThan(-1);
    expect(htmlIdx).toBeLessThan(blocksIdx);
  });
});
