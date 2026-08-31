/**
 * anatomy-indexer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic, cost-free indexer for Dazza Anatomy Index.
 *
 * No AI calls during indexing. All processing is pure text analysis:
 *   - Manifest building
 *   - Path normalisation
 *   - Language / file-type classification
 *   - Line-numbered chunk splitting
 *   - Symbol extraction (exports, functions, classes, routes, schema)
 *   - Searchable content storage
 *
 * AI is only invoked when Dazza answers a question (retrieval phase).
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { ANATOMY_LIMITS } from './anatomy-security.js';

// ── Language classification ───────────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts':       'typescript',
  '.tsx':      'typescript',
  '.js':       'javascript',
  '.jsx':      'javascript',
  '.mjs':      'javascript',
  '.cjs':      'javascript',
  '.html':     'html',
  '.htm':      'html',
  '.css':      'css',
  '.scss':     'scss',
  '.sass':     'sass',
  '.less':     'less',
  '.json':     'json',
  '.jsonc':    'json',
  '.yaml':     'yaml',
  '.yml':      'yaml',
  '.toml':     'toml',
  '.md':       'markdown',
  '.mdx':      'markdown',
  '.txt':      'text',
  '.sql':      'sql',
  '.sh':       'shell',
  '.bash':     'shell',
  '.graphql':  'graphql',
  '.gql':      'graphql',
  '.proto':    'protobuf',
  '.prisma':   'prisma',
  '.swift':    'swift',
  '.kt':       'kotlin',
  '.kts':      'kotlin',
  '.java':     'java',
  '.xml':      'xml',
  '.plist':    'xml',
  '.gradle':   'gradle',
  '.rst':      'rst',
  '.ini':      'ini',
};

const EXT_TO_FILE_TYPE: Record<string, string> = {
  '.ts':       'source',
  '.tsx':      'source',
  '.js':       'source',
  '.jsx':      'source',
  '.mjs':      'source',
  '.cjs':      'source',
  '.html':     'template',
  '.htm':      'template',
  '.css':      'style',
  '.scss':     'style',
  '.sass':     'style',
  '.less':     'style',
  '.json':     'config',
  '.jsonc':    'config',
  '.yaml':     'config',
  '.yml':      'config',
  '.toml':     'config',
  '.md':       'documentation',
  '.mdx':      'documentation',
  '.txt':      'documentation',
  '.sql':      'database',
  '.sh':       'script',
  '.bash':     'script',
  '.graphql':  'schema',
  '.gql':      'schema',
  '.proto':    'schema',
  '.prisma':   'schema',
  '.swift':    'source',
  '.kt':       'source',
  '.kts':      'source',
  '.java':     'source',
  '.xml':      'config',
  '.plist':    'config',
  '.gradle':   'build',
};

function classifyFile(relPath: string): { language: string; fileType: string } {
  const lower = relPath.toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : '';
  return {
    language: EXT_TO_LANGUAGE[ext] ?? 'unknown',
    fileType: EXT_TO_FILE_TYPE[ext] ?? 'other',
  };
}

// ── Symbol extraction ─────────────────────────────────────────────────────────

/**
 * Checks whether a line starts with one of the TS/JS export keyword sequences.
 * Replaces: /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+/gm
 * Returns the identifier name that follows, or null.  Linear scan — no regex.
 */
/** @internal — exported for unit tests only */
export function parseExportSymbol(line: string): string | null {
  let pos = 0;
  if (!line.startsWith('export')) return null;
  pos = 6;
  while (pos < line.length && (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9)) pos++;
  if (pos === 6) return null; // no whitespace after 'export'

  if (line.startsWith('default', pos)) {
    pos += 7;
    while (pos < line.length && (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9)) pos++;
  }
  if (line.startsWith('async', pos)) {
    pos += 5;
    while (pos < line.length && (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9)) pos++;
  }

  const KEYWORDS = ['function', 'interface', 'class', 'const', 'let', 'var', 'type', 'enum'];
  let matched = false;
  for (const kw of KEYWORDS) {
    if (line.startsWith(kw, pos)) {
      const after = pos + kw.length;
      if (after < line.length && (line.charCodeAt(after) === 32 || line.charCodeAt(after) === 9)) {
        pos = after;
        matched = true;
        break;
      }
    }
  }
  if (!matched) return null;

  while (pos < line.length && (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9)) pos++;

  if (pos >= line.length) return null;
  const c0 = line.charCodeAt(pos);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95 || c0 === 36)) return null;
  const idStart = pos++;
  while (pos < line.length) {
    const c = line.charCodeAt(pos);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 36)) break;
    pos++;
  }
  return line.slice(idStart, pos);
}

/**
 * Checks whether a line declares a React component (PascalCase function).
 * Replaces: /^(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9_$]*)/gm
 * Returns the component name, or null.
 */
/** @internal — exported for unit tests only */
export function parseComponentDecl(line: string): string | null {
  let pos = 0;
  if (line.startsWith('export', pos)) {
    pos += 6;
    while (pos < line.length && (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9)) pos++;
  }
  if (line.startsWith('default', pos)) {
    pos += 7;
    while (pos < line.length && (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9)) pos++;
  }
  if (!line.startsWith('function', pos)) return null;
  pos += 8;
  if (pos >= line.length || (line.charCodeAt(pos) !== 32 && line.charCodeAt(pos) !== 9)) return null;
  while (pos < line.length && (line.charCodeAt(pos) === 32 || line.charCodeAt(pos) === 9)) pos++;

  if (pos >= line.length) return null;
  const c0 = line.charCodeAt(pos);
  if (c0 < 65 || c0 > 90) return null; // must be uppercase A-Z
  const idStart = pos++;
  while (pos < line.length) {
    const c = line.charCodeAt(pos);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 36)) break;
    pos++;
  }
  return line.slice(idStart, pos);
}

/**
 * Checks whether a line is a SQL CREATE TABLE statement.
 * Replaces: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?/gi
 * Returns the table name, or null.  Case-insensitive via toUpperCase on the line.
 */
/** @internal — exported for unit tests only */
export function parseSqlCreateTable(line: string): string | null {
  const up = line.toUpperCase();
  let pos = up.indexOf('CREATE');
  if (pos === -1) return null;
  pos += 6;
  if (pos >= up.length || (up.charCodeAt(pos) !== 32 && up.charCodeAt(pos) !== 9)) return null;
  while (pos < up.length && (up.charCodeAt(pos) === 32 || up.charCodeAt(pos) === 9)) pos++;
  if (!up.startsWith('TABLE', pos)) return null;
  pos += 5;
  if (pos >= up.length || (up.charCodeAt(pos) !== 32 && up.charCodeAt(pos) !== 9)) return null;
  while (pos < up.length && (up.charCodeAt(pos) === 32 || up.charCodeAt(pos) === 9)) pos++;
  if (up.startsWith('IF', pos)) {
    pos += 2;
    while (pos < up.length && (up.charCodeAt(pos) === 32 || up.charCodeAt(pos) === 9)) pos++;
    if (!up.startsWith('NOT', pos)) return null;
    pos += 3;
    while (pos < up.length && (up.charCodeAt(pos) === 32 || up.charCodeAt(pos) === 9)) pos++;
    if (!up.startsWith('EXISTS', pos)) return null;
    pos += 6;
    while (pos < up.length && (up.charCodeAt(pos) === 32 || up.charCodeAt(pos) === 9)) pos++;
  }
  // Optional backtick or double-quote
  if (pos < up.length && (up.charCodeAt(pos) === 96 || up.charCodeAt(pos) === 34)) pos++;
  if (pos >= line.length) return null;
  const c0 = line.charCodeAt(pos);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122) || c0 === 95)) return null;
  const idStart = pos++;
  while (pos < line.length) {
    const c = line.charCodeAt(pos);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95)) break;
    pos++;
  }
  return line.slice(idStart, pos);
}

function extractSymbols(content: string, language: string): string[] {
  const symbols: string[] = [];

  if (language === 'typescript' || language === 'javascript') {
    // Line-by-line scan — bounded per-line, no whole-content multiline regex.
    const lines = content.split('\n');
    for (const line of lines) {
      const exportName = parseExportSymbol(line);
      if (exportName) symbols.push(exportName);

      const componentName = parseComponentDecl(line);
      if (componentName) symbols.push(`component:${componentName}`);
    }

    // Express route registrations — negated char class [^'"`] is linear; safe.
    const routeMatches = content.matchAll(
      /app\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/g
    );
    for (const m of routeMatches) {
      if (m[1] && m[2]) symbols.push(`route:${m[1].toUpperCase()}:${m[2]}`);
    }
  }

  if (language === 'sql') {
    const lines = content.split('\n');
    for (const line of lines) {
      const tableName = parseSqlCreateTable(line);
      if (tableName) symbols.push(`table:${tableName}`);
    }
  }

  return [...new Set(symbols)].slice(0, 50);
}

// ── Chunk splitter ────────────────────────────────────────────────────────────

interface Chunk {
  startLine: number;
  endLine: number;
  content: string;
  chunkType: string;
  symbolName: string;
}

function splitIntoChunks(content: string, language: string): Chunk[] {
  const lines = content.split('\n');
  const chunks: Chunk[] = [];

  // For TypeScript/JavaScript: try to split on top-level declarations
  if (language === 'typescript' || language === 'javascript') {
    const topLevelBoundaries: number[] = [0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Top-level export, function, class, const at column 0
      if (/^(?:export|function|class|const|let|var|interface|type|enum|\/\/ ──)/.test(line)) {
        if (i > 0) topLevelBoundaries.push(i);
      }
    }
    topLevelBoundaries.push(lines.length);

    for (let b = 0; b < topLevelBoundaries.length - 1; b++) {
      const start = topLevelBoundaries[b];
      const end = topLevelBoundaries[b + 1];
      const chunkLines = lines.slice(start, end);

      // If chunk is too large, split further by CHUNK_SIZE
      if (chunkLines.length > ANATOMY_LIMITS.MAX_CHUNK_LINES) {
        for (let i = 0; i < chunkLines.length; i += ANATOMY_LIMITS.MAX_CHUNK_LINES - ANATOMY_LIMITS.CHUNK_OVERLAP_LINES) {
          const sliceEnd = Math.min(i + ANATOMY_LIMITS.MAX_CHUNK_LINES, chunkLines.length);
          const slice = chunkLines.slice(i, sliceEnd);
          const symbols = extractSymbols(slice.join('\n'), language);
          chunks.push({
            startLine:  start + i + 1,
            endLine:    start + sliceEnd,
            content:    slice.join('\n'),
            chunkType:  'source_block',
            symbolName: symbols.slice(0, 3).join(', '),
          });
        }
      } else {
        const symbols = extractSymbols(chunkLines.join('\n'), language);
        chunks.push({
          startLine:  start + 1,
          endLine:    end,
          content:    chunkLines.join('\n'),
          chunkType:  'top_level_declaration',
          symbolName: symbols.slice(0, 3).join(', '),
        });
      }
    }
  } else {
    // Simple fixed-size chunking for other file types
    for (let i = 0; i < lines.length; i += ANATOMY_LIMITS.MAX_CHUNK_LINES - ANATOMY_LIMITS.CHUNK_OVERLAP_LINES) {
      const sliceEnd = Math.min(i + ANATOMY_LIMITS.MAX_CHUNK_LINES, lines.length);
      chunks.push({
        startLine:  i + 1,
        endLine:    sliceEnd,
        content:    lines.slice(i, sliceEnd).join('\n'),
        chunkType:  'fixed_block',
        symbolName: '',
      });
    }
  }

  return chunks.filter(c => c.content.trim().length > 0);
}

// ── Main indexer ──────────────────────────────────────────────────────────────

export interface IndexableFile {
  relPath: string;
  content: string;
  sha256: string;
}

export interface IndexResult {
  filesIndexed: number;
  chunksCreated: number;
  errors: string[];
}

export async function indexSnapshot(
  snapshotId: string,
  files: IndexableFile[],
  onProgress?: (indexed: number, total: number) => void,
): Promise<IndexResult> {
  const result: IndexResult = { filesIndexed: 0, chunksCreated: 0, errors: [] };
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress && i % 50 === 0) onProgress(i, total);

    try {
      const { language, fileType } = classifyFile(file.relPath);
      const lines = file.content.split('\n');
      const lineCount = lines.length;
      const byteSize = Buffer.byteLength(file.content, 'utf8');

      // Insert anatomy_files row
      const [fileInsert] = await db.execute(sql.raw(`
        INSERT INTO anatomy_files
          (snapshot_id, rel_path, file_sha256, language, file_type, line_count, byte_size, is_excluded, is_quarantined)
        VALUES
          ('${snapshotId}', '${file.relPath.replace(/'/g, "''")}',
           '${file.sha256}', '${language}', '${fileType}',
           ${lineCount}, ${byteSize}, 0, 0)
      `)) as unknown as [{ insertId: number }, unknown];

      const fileId = (fileInsert as unknown as { insertId: number }).insertId;

      // Split into chunks and insert
      const chunks = splitIntoChunks(file.content, language);

      for (const chunk of chunks) {
        // Truncate content to avoid exceeding MEDIUMTEXT but keep it useful
        const safeContent = chunk.content.slice(0, 65_000);
        const safeSymbol = (chunk.symbolName ?? '').slice(0, 490);
        const safeRelPath = file.relPath.slice(0, 990);

        await db.execute(sql.raw(`
          INSERT INTO anatomy_chunks
            (snapshot_id, file_id, rel_path, start_line, end_line, content, chunk_type, symbol_name)
          VALUES
            ('${snapshotId}', ${fileId},
             '${safeRelPath.replace(/'/g, "''")}',
             ${chunk.startLine}, ${chunk.endLine},
             '${safeContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',
             '${chunk.chunkType}',
             '${safeSymbol.replace(/'/g, "''")}')
        `));
        result.chunksCreated++;
      }

      result.filesIndexed++;
    } catch (e) {
      result.errors.push(`${file.relPath}: ${String(e).slice(0, 200)}`);
    }
  }

  return result;
}

// ── Snapshot SHA-256 ──────────────────────────────────────────────────────────

export function computePackageSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ── Active snapshot lookup ────────────────────────────────────────────────────

export async function getActiveSnapshotId(): Promise<string | null> {
  try {
    const [rows] = await db.execute(sql`
      SELECT id FROM anatomy_snapshots
      WHERE is_active = 1 AND status = 'ready'
      ORDER BY created_at DESC LIMIT 1
    `) as unknown as [Array<{ id: string }>, unknown];
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function getSnapshotMeta(snapshotId: string): Promise<Record<string, unknown> | null> {
  try {
    const [rows] = await db.execute(sql.raw(`
      SELECT id, source_type, repo_owner, repo_name, branch, commit_sha, commit_date,
             snapshot_name, source_desc, app_version, build_number, git_ref,
             status, is_active, total_files, indexed_files, excluded_files,
             quarantine_count, error_message, uploader_user_id, created_at, updated_at
      FROM anatomy_snapshots
      WHERE id = '${snapshotId.replace(/'/g, "''")}'
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}
