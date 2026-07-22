/**
 * POST /api/document-templates/:id/import-blocks
 *
 * Accepts a .blocks.json file (as produced by the Python SWMS extraction
 * script) and converts it to DocumentBlock[] using the same block types
 * the Document Builder understands natively.
 *
 * Multipart form: field "file" = the .blocks.json file
 *
 * Returns: { blocks: DocumentBlock[], documentName: string, warnings: string[] }
 *
 * Block type mapping (script → builder):
 *   heading          → HeadingBlock
 *   text             → TextBlock (bold markdown stripped to plain)
 *   short_text       → FieldBlock (fieldType: 'short_text')
 *   date             → FieldBlock (fieldType: 'date')
 *   signature        → FieldBlock (fieldType: 'signature')
 *   page_break       → PageBreakBlock
 *   risk_matrix      → RiskMatrixBlock
 *   safety_badges    → SafetyBadgeRowBlock
 *   hazard_stripe    → BannerBlock (variant: 'warning')
 *   first_aid_banner → BannerBlock (variant: 'first_aid')
 *   table            → TableBlock
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import type {
  DocumentBlock,
  HeadingBlock,
  TextBlock,
  FieldBlock,
  PageBreakBlock,
  RiskMatrixBlock,
  BannerBlock,
  SafetyBadgeRowBlock,
  SafetyBadge,
  SafetyBadgeType,
  TableBlock,
  TableColumn,
  TableRow,
} from '../../../../../components/DocumentBuilder/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/** Strip **bold** and *italic* markdown markers from a string */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

/** Convert **bold** markdown to <strong> HTML */
function markdownToHtml(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/•\s*/g, '')          // strip bullet chars — we'll wrap in <li>
    .trim();
}

/** Convert a text block with bullet points to a rich_text HTML string */
function textToHtml(raw: string): string {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => l.startsWith('•') || l.startsWith('-') || l.startsWith('*'));
  const nonBullet = lines.filter((l) => !l.startsWith('•') && !l.startsWith('-') && !l.startsWith('*'));

  const parts: string[] = [];

  // Leading non-bullet lines become <p>
  for (const l of nonBullet) {
    const html = l
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    parts.push(`<p>${html}</p>`);
  }

  // Bullet lines become <ul>
  if (bulletLines.length > 0) {
    const items = bulletLines.map((l) => {
      const text = l.replace(/^[•\-*]\s*/, '');
      const html = text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return `<li>${html}</li>`;
    });
    parts.push(`<ul>${items.join('')}</ul>`);
  }

  return parts.join('') || `<p>${markdownToHtml(raw)}</p>`;
}

/** Map a PPE label string to the nearest SafetyBadgeType */
function ppeLabelToBadgeType(label: string): SafetyBadgeType {
  const l = label.toLowerCase();
  if (l.includes('helmet') || l.includes('hard hat')) return 'helmet';
  if (l.includes('footwear') || l.includes('boot')) return 'footwear';
  if (l.includes('glass') || l.includes('eye') || l.includes('goggle') || l.includes('face shield')) return 'eye_protection';
  if (l.includes('electrical glove')) return 'electrical_gloves';
  if (l.includes('glove')) return 'gloves';
  if (l.includes('hearing') || l.includes('ear')) return 'hearing';
  if (l.includes('hi-vis') || l.includes('hi vis') || l.includes('high vis') || l.includes('vest')) return 'hi_vis';
  if (l.includes('fall') || l.includes('harness')) return 'fall_arrest';
  if (l.includes('ppe')) return 'ppe';
  return 'custom';
}

// ── Main converter ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertBlock(raw: Record<string, any>, warnings: string[]): DocumentBlock | null {
  const type: string = raw.type ?? '';

  switch (type) {
    // ── heading ──────────────────────────────────────────────────────────────
    case 'heading': {
      const level = Math.min(4, Math.max(1, Number(raw.level ?? 2))) as 1 | 2 | 3 | 4;
      const block: HeadingBlock = {
        id: uid(),
        type: 'heading',
        content: stripMarkdown(String(raw.text ?? raw.content ?? '')),
        level,
        align: 'left',
      };
      return block;
    }

    // ── text ─────────────────────────────────────────────────────────────────
    case 'text': {
      const raw_text = String(raw.text ?? raw.content ?? '');
      // If it contains newlines or bullets, use rich_text for fidelity
      if (raw_text.includes('\n') || raw_text.includes('•')) {
        return {
          id: uid(),
          type: 'rich_text',
          html: textToHtml(raw_text),
        };
      }
      const block: TextBlock = {
        id: uid(),
        type: 'text',
        content: stripMarkdown(raw_text),
        align: 'left',
      };
      return block;
    }

    // ── short_text field ──────────────────────────────────────────────────────
    case 'short_text': {
      const block: FieldBlock = {
        id: uid(),
        type: 'field',
        fieldType: 'short_text',
        label: String(raw.label ?? 'Field'),
        required: false,
        defaultValue: raw.value ? String(raw.value) : undefined,
        placeholder: raw.placeholder ? String(raw.placeholder) : undefined,
      };
      return block;
    }

    // ── date field ────────────────────────────────────────────────────────────
    case 'date': {
      const block: FieldBlock = {
        id: uid(),
        type: 'field',
        fieldType: 'date',
        label: String(raw.label ?? 'Date'),
        required: false,
        defaultValue: raw.value ? String(raw.value) : undefined,
      };
      return block;
    }

    // ── signature field ───────────────────────────────────────────────────────
    case 'signature': {
      const block: FieldBlock = {
        id: uid(),
        type: 'field',
        fieldType: 'signature',
        label: String(raw.label ?? 'Signature'),
        required: false,
      };
      return block;
    }

    // ── page_break ────────────────────────────────────────────────────────────
    case 'page_break': {
      const block: PageBreakBlock = {
        id: uid(),
        type: 'page_break',
      };
      return block;
    }

    // ── risk_matrix ───────────────────────────────────────────────────────────
    case 'risk_matrix': {
      const block: RiskMatrixBlock = {
        id: uid(),
        type: 'risk_matrix',
        title: String(raw.title ?? 'Risk Assessment Matrix'),
        showLegend: true,
        showOnExport: true,
      };
      return block;
    }

    // ── safety_badges / PPE ───────────────────────────────────────────────────
    case 'safety_badges': {
      const rawBadges: string[] = Array.isArray(raw.badges) ? raw.badges : [];
      const badges: SafetyBadge[] = rawBadges.map((label) => ({
        id: uid(),
        badgeType: ppeLabelToBadgeType(label),
        label,
        required: true,
      }));
      const block: SafetyBadgeRowBlock = {
        id: uid(),
        type: 'safety_badge_row',
        badges,
        size: 'md',
        align: 'left',
      };
      return block;
    }

    // ── hazard_stripe → warning banner ────────────────────────────────────────
    case 'hazard_stripe': {
      const block: BannerBlock = {
        id: uid(),
        type: 'banner',
        variant: 'warning',
        title: 'HAZARD',
        body: String(raw.text ?? ''),
        size: 'standard',
        align: 'left',
        showOnExport: true,
      };
      return block;
    }

    // ── first_aid_banner ──────────────────────────────────────────────────────
    case 'first_aid_banner': {
      const block: BannerBlock = {
        id: uid(),
        type: 'banner',
        variant: 'first_aid',
        title: String(raw.text ?? 'EMERGENCY RESPONSE & FIRST AID'),
        body: '',
        size: 'standard',
        align: 'left',
        showOnExport: true,
      };
      return block;
    }

    // ── table ─────────────────────────────────────────────────────────────────
    case 'table': {
      const rawHeaders: string[] = Array.isArray(raw.headers) ? raw.headers : [];
      const rawRows: string[][] = Array.isArray(raw.rows) ? raw.rows : [];
      const fillable: boolean = raw.fillable === true;

      const columns: TableColumn[] = rawHeaders.map((h) => {
        const hl = h.toLowerCase();
        let cellType: TableColumn['cellType'] = 'text';
        if (hl === 'signature' || hl === 'sign') cellType = 'signature';
        else if (hl === 'date') cellType = 'date';
        else if (hl === 'l' || hl === 'c' || hl === 'r') cellType = 'text'; // risk rating columns
        return {
          id: uid(),
          header: h,
          cellType,
          width: 1,
        };
      });

      const rows: TableRow[] = rawRows.map((rawRow) => {
        const cells: Record<string, string> = {};
        columns.forEach((col, i) => {
          cells[col.id] = String(rawRow[i] ?? '');
        });
        return { id: uid(), cells };
      });

      const block: TableBlock = {
        id: uid(),
        type: 'table',
        mode: fillable ? 'fillable' : 'static',
        columns,
        rows,
        stripedRows: true,
        repeatable: fillable,
        showRowNumbers: false,
      };
      return block;
    }

    default: {
      warnings.push(`Unknown block type "${type}" — skipped.`);
      return null;
    }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

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
    if (!id) return res.status(400).json({ error: 'Invalid template ID' });

    // Verify template ownership
    const [rows] = await db.execute(sql.raw(
      `SELECT id FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    // Parse multipart upload
    const { files } = await parseMultipartForm(req, { maxFileSize: 5 * 1024 * 1024 });
    const jsonFile = files.find(
      (f) =>
        f.fieldname === 'file' ||
        (f.originalname ?? '').endsWith('.json') ||
        (f.mimetype ?? '').includes('json')
    );
    if (!jsonFile?.buffer) {
      return res.status(400).json({ error: 'No .blocks.json file uploaded. Upload a .json file in the "file" field.' });
    }

    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonFile.buffer.toString('utf-8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON — could not parse the uploaded file.' });
    }

    // Validate structure
    if (!Array.isArray(parsed.blocks)) {
      return res.status(400).json({ error: 'Invalid .blocks.json — missing "blocks" array.' });
    }

    const documentName: string = String(parsed.document_name ?? 'Imported Document');
    const warnings: string[] = [];

    // Convert each raw block to a DocumentBlock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: DocumentBlock[] = (parsed.blocks as Array<Record<string, any>>)
      .map((raw) => convertBlock(raw, warnings))
      .filter((b): b is DocumentBlock => b !== null);

    if (blocks.length === 0) {
      return res.status(400).json({ error: 'No recognisable blocks found in the JSON file.' });
    }

    return res.json({ ok: true, blocks, documentName, warnings });
  } catch (err) {
    console.error('POST /api/document-templates/:id/import-blocks error:', err);
    return res.status(500).json({ error: 'Import failed' });
  }
}
