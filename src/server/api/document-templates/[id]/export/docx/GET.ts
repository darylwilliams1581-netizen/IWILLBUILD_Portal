/**
 * GET /api/document-templates/:id/export/docx
 *
 * Exports a document template as a DOCX file.
 * Generates a minimal DOCX using the Open XML format (no external dependencies).
 * Extracts text content from the document's content_json blocks.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

// ── Minimal DOCX builder (pure JS, no native addons) ─────────────────────────
// A DOCX is a ZIP containing XML files. We build a minimal one using
// the Open XML spec. This avoids puppeteer/docx npm packages.

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Block {
  type?: string;
  text?: string;
  content?: string;
  html?: string;
  label?: string;
  [key: string]: unknown;
}

function blocksToDocxXml(blocks: Block[]): string {
  const paragraphs: string[] = [];

  for (const block of blocks) {
    const type = block.type ?? 'text';

    if (type === 'heading' || type === 'h1' || type === 'h2' || type === 'h3') {
      const text = escapeXml(stripHtml(String(block.text ?? block.content ?? '')));
      paragraphs.push(`
        <w:p>
          <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>
        </w:p>`);
    } else if (type === 'richtext' || type === 'text') {
      const raw = String(block.html ?? block.content ?? block.text ?? '');
      const text = escapeXml(stripHtml(raw));
      if (text) {
        paragraphs.push(`
        <w:p>
          <w:r><w:t xml:space="preserve">${text}</w:t></w:r>
        </w:p>`);
      }
    } else if (type === 'banner' || type === 'safety_badge') {
      const text = escapeXml(stripHtml(String(block.label ?? block.text ?? block.content ?? type)));
      paragraphs.push(`
        <w:p>
          <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">[${text}]</w:t></w:r>
        </w:p>`);
    } else if (type === 'table') {
      paragraphs.push(`
        <w:p>
          <w:r><w:t xml:space="preserve">[Table — see original document]</w:t></w:r>
        </w:p>`);
    } else if (type === 'page_break') {
      paragraphs.push(`
        <w:p>
          <w:r><w:br w:type="page"/></w:r>
        </w:p>`);
    } else {
      // Generic fallback — extract any text-like fields
      const text = escapeXml(stripHtml(String(block.text ?? block.content ?? block.html ?? '')));
      if (text) {
        paragraphs.push(`
        <w:p>
          <w:r><w:t xml:space="preserve">${text}</w:t></w:r>
        </w:p>`);
      }
    }
  }

  return paragraphs.join('\n');
}

function buildDocxXml(title: string, blocks: Block[]): string {
  const bodyContent = blocksToDocxXml(blocks);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    ${bodyContent}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ── Minimal ZIP builder ───────────────────────────────────────────────────────
// We need to produce a valid ZIP. Using a pure-JS implementation to avoid
// native addons (Alpine/musl incompatibility).

function crc32(buf: Buffer): number {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDate(d: Date): number {
  return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
}
function dosTime(d: Date): number {
  return (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
}

function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const now = new Date();
  const dt = dosDate(now);
  const tm = dosTime(now);

  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);  // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(0, 8);            // compression (stored)
    local.writeUInt16LE(tm, 10);
    local.writeUInt16LE(dt, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);        // compressed size
    local.writeUInt32LE(size, 22);        // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length
    nameBytes.copy(local, 30);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0, 8);           // flags
    central.writeUInt16LE(0, 10);          // compression
    central.writeUInt16LE(tm, 12);
    central.writeUInt16LE(dt, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);          // extra
    central.writeUInt16LE(0, 32);          // comment
    central.writeUInt16LE(0, 34);          // disk start
    central.writeUInt16LE(0, 36);          // internal attr
    central.writeUInt32LE(0, 38);          // external attr
    central.writeUInt32LE(offset, 42);     // local header offset
    nameBytes.copy(central, 46);

    localHeaders.push(local, file.data);
    centralDirs.push(central);
    offset += local.length + size;
  }

  const centralBuf = Buffer.concat(centralDirs);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralBuf, eocd]);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, builder_json FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = Array.isArray(rows) ? rows[0] : null;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const name = String(doc.name ?? 'Document');
    let blocks: Block[] = [];
    try {
      const parsed = typeof doc.builder_json === 'string'
        ? JSON.parse(doc.builder_json)
        : doc.builder_json;
      blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    } catch { /* use empty blocks */ }

    const docXml = buildDocxXml(name, blocks);

    // DOCX required files
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

    const zipFiles = [
      { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
      { name: '_rels/.rels',         data: Buffer.from(relsXml, 'utf8') },
      { name: 'word/_rels/document.xml.rels', data: Buffer.from(wordRelsXml, 'utf8') },
      { name: 'word/document.xml',   data: Buffer.from(docXml, 'utf8') },
    ];

    const zipBuffer = buildZip(zipFiles);
    const safeName = name.replace(/[^a-z0-9_\-. ]/gi, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Document export DOCX error:', err);
    res.status(500).json({ error: 'Export failed', message: String(err) });
  }
}
