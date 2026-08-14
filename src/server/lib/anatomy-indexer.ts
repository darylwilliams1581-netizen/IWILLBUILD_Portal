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

function extractSymbols(content: string, language: string): string[] {
  const symbols: string[] = [];

  if (language === 'typescript' || language === 'javascript') {
    // Exported functions / classes / consts
    const exportMatches = content.matchAll(
      /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm
    );
    for (const m of exportMatches) {
      if (m[1]) symbols.push(m[1]);
    }

    // Express route registrations
    const routeMatches = content.matchAll(
      /app\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/g
    );
    for (const m of routeMatches) {
      if (m[1] && m[2]) symbols.push(`route:${m[1].toUpperCase()}:${m[2]}`);
    }

    // React component names (PascalCase functions)
    const componentMatches = content.matchAll(
      /^(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9_$]*)/gm
    );
    for (const m of componentMatches) {
      if (m[1]) symbols.push(`component:${m[1]}`);
    }
  }

  if (language === 'sql') {
    // Table names
    const tableMatches = content.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?/gi
    );
    for (const m of tableMatches) {
      if (m[1]) symbols.push(`table:${m[1]}`);
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
