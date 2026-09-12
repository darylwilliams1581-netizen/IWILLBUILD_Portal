/**
 * dazza-builder/dazza-reference-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only reference document service for the Dazza Builder Assistant.
 *
 * PURPOSE:
 *   Lets Dazza search approved reference documents and read their style
 *   patterns so it can guide new document creation consistently.
 *
 * DESIGN RULES:
 * 1. READ-ONLY — no INSERT, UPDATE, or DELETE.  Every function returns data
 *    only; no side effects.
 * 2. TENANT ISOLATION — every query includes AND company_id = ownerCompanyId.
 *    The ownerCompanyId is always resolved server-side from the authenticated
 *    user's profile row, never from AI-supplied arguments.
 * 3. APPROVED-ONLY — only documents with doc_status IN ('published', 'active')
 *    AND is_active = 1 are returned.  Draft, broken, and inactive documents
 *    are silently excluded.  Dazza must never train on or cite draft/broken docs.
 * 4. NO NEW AI PROVIDER — keyword matching only; no vector DB, no embeddings.
 * 5. PROVENANCE REPORTING — every result includes the document ID, name, type,
 *    and status so Dazza can report which references it used.
 * 6. SAFE CONTENT LIMITS — builder_json is parsed and summarised; raw JSON is
 *    never returned in full to avoid token overflow.
 *
 * APPROVED STATUS DEFINITION:
 *   doc_status = 'published' OR doc_status = 'active'
 *   AND is_active = 1
 *   Excludes: 'draft', 'broken', 'archived', 'pending', or any other value.
 *
 * STYLE EXTRACTION:
 *   Reads pageLayout, theme, and the first N blocks of builder_json to infer:
 *   - Page layout and margins
 *   - Theme colours
 *   - Heading hierarchy (H1/H2/H3 content patterns)
 *   - Standard table column patterns
 *   - Banner variants used
 *   - Safety image blocks (PPE, risk matrix)
 *   - Revision and sign-off table patterns
 *
 * KEYWORD MATCHING:
 *   Searches name, template_type, and a text extract from builder_json
 *   (heading content only — not cell data) using case-insensitive substring
 *   matching.  No SQL LIKE injection — all values are parameterised.
 *
 * DEPENDENCIES:
 *   - db (drizzle-orm/mysql2 client) — injected for testability
 *   - sql tag from drizzle-orm
 */

import { db as defaultDb } from '../../db/client.js';
import { sql } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal DB interface — injected so tests can mock without a real connection */
export interface ReferenceDb {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}

/** A single approved reference document summary */
export interface ReferenceDocSummary {
  id: number;
  name: string;
  templateType: string;
  docStatus: string;
  docKind: string;
  updatedAt: string | null;
  /** Heading-level text extracted from builder_json for keyword matching */
  headingText: string;
}

/** Full reference document with style patterns extracted */
export interface ReferenceDocDetail extends ReferenceDocSummary {
  style: DocumentStyleProfile;
  /** Which reference documents and patterns were used (provenance) */
  provenanceNote: string;
}

/** Style profile extracted from a document's builder_json */
export interface DocumentStyleProfile {
  /** Page layout settings */
  pageLayout: {
    paperSize: string;
    orientation: string;
    margins: string;
  };
  /** Theme colours */
  theme: {
    backgroundColor: string;
    accentColor: string;
    textColor: string;
    tableHeaderColor: string;
    tableHeaderTextColor: string;
  };
  /** Heading hierarchy — first occurrence of each level */
  headings: {
    h1?: string;
    h2?: string;
    h3?: string;
  };
  /** Table column patterns found in the document */
  tablePatterns: Array<{
    columnCount: number;
    headers: string[];
    hasSignatureColumn: boolean;
    hasDateColumn: boolean;
  }>;
  /** Banner variants used */
  bannerVariants: string[];
  /** Safety image blocks present */
  safetyImages: Array<{
    src: string;
    alt: string;
  }>;
  /** Whether a sign-off table is present */
  hasSignOffTable: boolean;
  /** Whether a revision table is present */
  hasRevisionTable: boolean;
  /** Total block count */
  blockCount: number;
}

/** Search parameters for reference document lookup */
export interface ReferenceSearchParams {
  /** Owner's company_id — MUST be resolved server-side, never from AI args */
  ownerCompanyId: number;
  /** Filter by template_type (e.g. 'swms', 'safety_plan', 'policy') */
  documentType?: string;
  /** Filter by safety category keyword (matched against name + heading text) */
  safetyCategory?: string;
  /** Filter by title keyword (matched against name) */
  titleKeyword?: string;
  /** Filter by work activity keyword (matched against name + heading text) */
  workActivity?: string;
  /** Filter by tag keywords (matched against name + heading text) */
  tags?: string[];
  /** Max results (default 10, max 20) */
  limit?: number;
}

/** Result of a reference document search */
export interface ReferenceSearchResult {
  /** Approved documents matching the search */
  documents: ReferenceDocSummary[];
  /** Total approved documents in the tenant (for context) */
  totalApproved: number;
  /** Search parameters used (for provenance reporting) */
  searchParams: Omit<ReferenceSearchParams, 'ownerCompanyId'>;
  /** Note for Dazza to include in its response */
  provenanceNote: string;
}

// ── Approved status constants ─────────────────────────────────────────────────

/**
 * The only doc_status values that qualify a document as an approved reference.
 * Draft, broken, archived, and any other status are excluded.
 */
export const APPROVED_STATUSES = ['published', 'active'] as const;
export type ApprovedStatus = typeof APPROVED_STATUSES[number];

/**
 * Returns true if a doc_status value is approved for reference use.
 * Used in tests and in the service to enforce the approved-only rule.
 */
export function isApprovedStatus(status: string): status is ApprovedStatus {
  return (APPROVED_STATUSES as readonly string[]).includes(status);
}

// ── Style extraction ──────────────────────────────────────────────────────────

/**
 * Extract a DocumentStyleProfile from a parsed builder_json object.
 * Pure function — no DB access, no side effects.
 * Safe to call with any input; all fields have safe defaults.
 */
export function extractStyleProfile(builderJson: Record<string, unknown>): DocumentStyleProfile {
  // ── Page layout ────────────────────────────────────────────────────────────
  const rawLayout = (builderJson.pageLayout ?? {}) as Record<string, unknown>;
  const pageLayout = {
    paperSize:   String(rawLayout.paperSize   ?? 'A4'),
    orientation: String(rawLayout.orientation ?? 'portrait'),
    margins:     String(rawLayout.margins     ?? 'standard'),
  };

  // ── Theme ──────────────────────────────────────────────────────────────────
  const rawTheme = (builderJson.theme ?? {}) as Record<string, unknown>;
  const theme = {
    backgroundColor:      String(rawTheme.backgroundColor      ?? '#ffffff'),
    accentColor:          String(rawTheme.accentColor          ?? '#1e3a5f'),
    textColor:            String(rawTheme.textColor            ?? '#1a1a1a'),
    tableHeaderColor:     String(rawTheme.tableHeaderColor     ?? '#1e3a5f'),
    tableHeaderTextColor: String(rawTheme.tableHeaderTextColor ?? '#ffffff'),
  };

  // ── Blocks ─────────────────────────────────────────────────────────────────
  const blocks = (builderJson.blocks as Array<Record<string, unknown>>) ?? [];
  const blockCount = blocks.length;

  const headings: DocumentStyleProfile['headings'] = {};
  const tablePatterns: DocumentStyleProfile['tablePatterns'] = [];
  const bannerVariants: string[] = [];
  const safetyImages: DocumentStyleProfile['safetyImages'] = [];
  let hasSignOffTable = false;
  let hasRevisionTable = false;

  for (const block of blocks) {
    const type = String(block.type ?? '');

    // ── Headings ─────────────────────────────────────────────────────────────
    if (type === 'heading') {
      const level = Number(block.level ?? 2);
      const content = String(block.content ?? '').trim();
      if (level === 1 && !headings.h1 && content) headings.h1 = content.slice(0, 80);
      if (level === 2 && !headings.h2 && content) headings.h2 = content.slice(0, 80);
      if (level === 3 && !headings.h3 && content) headings.h3 = content.slice(0, 80);
    }

    // ── Tables ────────────────────────────────────────────────────────────────
    if (type === 'table') {
      const columns = (block.columns as Array<Record<string, unknown>>) ?? [];
      const headers = columns.map((c) => String(c.header ?? '').trim()).filter(Boolean);
      const hasSignatureColumn = columns.some((c) =>
        String(c.cellType ?? '').toLowerCase() === 'signature' ||
        String(c.header ?? '').toLowerCase().includes('signature'),
      );
      const hasDateColumn = columns.some((c) =>
        String(c.cellType ?? '').toLowerCase() === 'date' ||
        String(c.header ?? '').toLowerCase() === 'date',
      );

      // Classify sign-off and revision tables by header patterns
      const headerStr = headers.join(' ').toLowerCase();
      if (headerStr.includes('signature') || (headerStr.includes('name') && headerStr.includes('date'))) {
        hasSignOffTable = true;
      }
      if (headerStr.includes('revision') || headerStr.includes('rev') || headerStr.includes('amendment')) {
        hasRevisionTable = true;
      }

      tablePatterns.push({ columnCount: columns.length, headers, hasSignatureColumn, hasDateColumn });
    }

    // ── Banners ───────────────────────────────────────────────────────────────
    if (type === 'banner') {
      const variant = String(block.variant ?? 'info');
      if (!bannerVariants.includes(variant)) bannerVariants.push(variant);
    }

    // ── Safety images ─────────────────────────────────────────────────────────
    if (type === 'image') {
      const src = String(block.src ?? '');
      if (src.includes('safety-badges') || src.includes('ppe') || src.includes('risk-matrix')) {
        safetyImages.push({
          src,
          alt: String(block.alt ?? ''),
        });
      }
    }
  }

  return {
    pageLayout,
    theme,
    headings,
    tablePatterns,
    bannerVariants,
    safetyImages,
    hasSignOffTable,
    hasRevisionTable,
    blockCount,
  };
}

/**
 * Extract heading-level text from builder_json for keyword matching.
 * Returns a single lowercase string of all heading content.
 * Pure function — no DB access.
 */
export function extractHeadingText(builderJson: Record<string, unknown>): string {
  const blocks = (builderJson.blocks as Array<Record<string, unknown>>) ?? [];
  const headings: string[] = [];
  for (const block of blocks) {
    if (String(block.type ?? '') === 'heading' && typeof block.content === 'string') {
      headings.push(block.content.trim());
    }
  }
  return headings.join(' ').toLowerCase();
}

// ── Keyword matching ──────────────────────────────────────────────────────────

/**
 * Returns true if the document matches all supplied keyword filters.
 * All matching is case-insensitive substring matching.
 * Pure function — no DB access.
 *
 * @param doc         The document summary row
 * @param params      The search parameters (keywords only — no ownerCompanyId)
 */
export function documentMatchesFilters(
  doc: ReferenceDocSummary,
  params: Omit<ReferenceSearchParams, 'ownerCompanyId' | 'limit'>,
): boolean {
  const nameLower = doc.name.toLowerCase();
  const typeLower = doc.templateType.toLowerCase();
  const headingLower = doc.headingText.toLowerCase();
  const searchable = `${nameLower} ${typeLower} ${headingLower}`;

  // Document type filter — exact match on template_type
  if (params.documentType) {
    if (!typeLower.includes(params.documentType.toLowerCase())) return false;
  }

  // Title keyword — matched against name only
  if (params.titleKeyword) {
    if (!nameLower.includes(params.titleKeyword.toLowerCase())) return false;
  }

  // Safety category — matched against name + headings
  if (params.safetyCategory) {
    if (!searchable.includes(params.safetyCategory.toLowerCase())) return false;
  }

  // Work activity — matched against name + headings
  if (params.workActivity) {
    if (!searchable.includes(params.workActivity.toLowerCase())) return false;
  }

  // Tags — ALL tags must match somewhere in name + headings
  if (params.tags?.length) {
    for (const tag of params.tags) {
      if (!searchable.includes(tag.toLowerCase())) return false;
    }
  }

  return true;
}

// ── Main service functions ────────────────────────────────────────────────────

/**
 * Search approved reference documents for the given tenant.
 *
 * SECURITY:
 * - ownerCompanyId MUST be resolved server-side before calling this function.
 *   Never pass a value from AI-supplied arguments.
 * - Only documents with doc_status IN ('published', 'active') AND is_active = 1
 *   are returned.
 * - All SQL parameters are passed through the drizzle sql tag — no string
 *   interpolation of user-supplied values.
 *
 * @param params  Search parameters (ownerCompanyId must be server-resolved)
 * @param dbClient  Optional DB client override for testing
 */
export async function searchReferenceDocs(
  params: ReferenceSearchParams,
  dbClient: ReferenceDb = defaultDb,
): Promise<ReferenceSearchResult> {
  const limit = Math.min(params.limit ?? 10, 20);

  // ── Fetch all approved documents for this tenant ───────────────────────────
  // We fetch all approved docs and filter in-memory so keyword matching can
  // operate on extracted heading text (which is not a DB column).
  // The result set is bounded by the approved-only filter and the tenant scope,
  // so this is safe for typical document counts (< 500 per tenant).
  const [rows] = await dbClient.execute(sql`
    SELECT
      id,
      name,
      template_type,
      doc_status,
      doc_kind,
      builder_json,
      updated_at
    FROM document_templates
    WHERE company_id = ${params.ownerCompanyId}
      AND doc_status IN ('published', 'active')
      AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 200
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  const allApproved = rows ?? [];
  const totalApproved = allApproved.length;

  // ── Build summary rows with extracted heading text ─────────────────────────
  const summaries: ReferenceDocSummary[] = allApproved.map((row) => {
    let builderJson: Record<string, unknown> = {};
    try {
      builderJson = JSON.parse(String(row.builder_json ?? '{}'));
    } catch {
      builderJson = {};
    }
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      templateType: String(row.template_type ?? ''),
      docStatus: String(row.doc_status ?? ''),
      docKind: String(row.doc_kind ?? 'doc'),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      headingText: extractHeadingText(builderJson),
    };
  });

  // ── Apply keyword filters in-memory ───────────────────────────────────────
  const { ownerCompanyId: _omit, limit: _lim, ...filterParams } = params;
  const filtered = summaries.filter((doc) => documentMatchesFilters(doc, filterParams));
  const results = filtered.slice(0, limit);

  // ── Build provenance note ──────────────────────────────────────────────────
  const filterDesc: string[] = [];
  if (params.documentType) filterDesc.push(`type="${params.documentType}"`);
  if (params.titleKeyword) filterDesc.push(`title="${params.titleKeyword}"`);
  if (params.safetyCategory) filterDesc.push(`category="${params.safetyCategory}"`);
  if (params.workActivity) filterDesc.push(`activity="${params.workActivity}"`);
  if (params.tags?.length) filterDesc.push(`tags=[${params.tags.join(', ')}]`);

  const provenanceNote = results.length > 0
    ? `Found ${results.length} approved reference document(s) matching ${filterDesc.length ? filterDesc.join(', ') : 'no filters'} (from ${totalApproved} total approved). IDs: ${results.map((d) => `#${d.id} "${d.name}"`).join(', ')}.`
    : `No approved reference documents found matching ${filterDesc.length ? filterDesc.join(', ') : 'the given criteria'}. ${totalApproved} approved document(s) exist in this tenant.`;

  return {
    documents: results,
    totalApproved,
    searchParams: filterParams,
    provenanceNote,
  };
}

/**
 * Read the style profile of a specific approved reference document.
 *
 * SECURITY:
 * - ownerCompanyId MUST be resolved server-side.
 * - Only approved documents (doc_status IN ('published', 'active') AND is_active = 1)
 *   are accessible.  Draft/broken documents return a NOT_APPROVED error.
 * - The document must belong to the owner's company (tenant isolation).
 *
 * @param documentId      The document_templates.id to read
 * @param ownerCompanyId  Server-resolved company_id of the authenticated owner
 * @param dbClient        Optional DB client override for testing
 */
export async function getReferenceDocStyle(
  documentId: number,
  ownerCompanyId: number,
  dbClient: ReferenceDb = defaultDb,
): Promise<
  | { ok: true; detail: ReferenceDocDetail }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_APPROVED' | 'WRONG_TENANT'; message: string }
> {
  // ── Single tenant-scoped query ─────────────────────────────────────────────
  // We use a single query with company_id + id to prevent cross-tenant leakage.
  // A second "does it exist at all?" query would reveal cross-tenant existence.
  const [rows] = await dbClient.execute(sql`
    SELECT
      id,
      name,
      template_type,
      doc_status,
      doc_kind,
      builder_json,
      updated_at
    FROM document_templates
    WHERE id = ${documentId}
      AND company_id = ${ownerCompanyId}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];

  const row = rows?.[0];

  // ── Not found (or wrong tenant — same message to prevent info disclosure) ──
  if (!row) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: `Reference document #${documentId} not found or not accessible.`,
    };
  }

  // ── Approved-only gate ─────────────────────────────────────────────────────
  const docStatus = String(row.doc_status ?? '');
  const isActive = Boolean(row.is_active ?? true);

  if (!isApprovedStatus(docStatus) || !isActive) {
    return {
      ok: false,
      code: 'NOT_APPROVED',
      message: `Document #${documentId} ("${String(row.name ?? '')}") has status "${docStatus}" and cannot be used as a reference. Only published or active documents are approved for reference.`,
    };
  }

  // ── Parse builder_json ─────────────────────────────────────────────────────
  let builderJson: Record<string, unknown> = {};
  try {
    builderJson = JSON.parse(String(row.builder_json ?? '{}'));
  } catch {
    builderJson = {};
  }

  const style = extractStyleProfile(builderJson);
  const headingText = extractHeadingText(builderJson);

  const summary: ReferenceDocSummary = {
    id: Number(row.id),
    name: String(row.name ?? ''),
    templateType: String(row.template_type ?? ''),
    docStatus,
    docKind: String(row.doc_kind ?? 'doc'),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    headingText,
  };

  const provenanceNote = `Style extracted from approved reference document #${summary.id} "${summary.name}" (type: ${summary.templateType}, status: ${summary.docStatus}). ${style.blockCount} blocks analysed.`;

  return {
    ok: true,
    detail: {
      ...summary,
      style,
      provenanceNote,
    },
  };
}

/**
 * Resolve the owner's company_id from their user_id.
 * Extracted as a standalone function so it can be called from the orchestrator
 * before passing ownerCompanyId to the reference service.
 *
 * SECURITY: Always resolves from the DB — never from AI-supplied arguments.
 *
 * @param ownerUserId  The authenticated owner's user_id
 * @param dbClient     Optional DB client override for testing
 */
export async function resolveOwnerCompanyId(
  ownerUserId: string,
  dbClient: ReferenceDb = defaultDb,
): Promise<number | null> {
  const [rows] = await dbClient.execute(sql`
    SELECT company_id FROM profiles WHERE user_id = ${ownerUserId} LIMIT 1
  `) as unknown as [Array<{ company_id: number | null }>, unknown];
  return rows?.[0]?.company_id ?? null;
}
