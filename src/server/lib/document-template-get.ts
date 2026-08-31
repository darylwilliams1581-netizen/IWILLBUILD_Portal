/**
 * document-template-get.ts
 * ─────────────────────────
 * Pure business logic for GET /api/document-templates/:id.
 *
 * Extracted from the route handler so it can be unit-tested without Vite
 * struggling to resolve the [id] bracket path.
 *
 * Responsibilities:
 *   - Validate session, profile, and template ID
 *   - SELECT the template row with tenant isolation (company_id filter)
 *   - Parse all JSON blobs safely
 *   - Return a fully-typed TemplateGetResult (success | error)
 *
 * HTML canvas fields (Phase 2):
 *   - htmlContent, importCss, importReport, sourceType, sourceFileName,
 *     sourceSha256, sourceRevision, sourceMimeType
 *   - All default to null for legacy rows where the columns are absent
 *   - importReport is parsed from JSON; malformed values → null (no throw)
 *
 * Tenant isolation:
 *   - The SELECT always includes AND company_id = <companyId>
 *   - A user from company A can never retrieve company B's document
 */

export interface TemplateGetDeps {
  /** Fetch the authenticated session */
  getSession: (headers: Record<string, string>) => Promise<{ user: { id: string } } | null>;
  /** Fetch the user's profile (returns null if not found) */
  getProfile: (userId: string) => Promise<{ companyId: number } | null>;
  /** Execute a raw SQL query; returns [rows, meta] */
  dbExecute: (sql: string) => Promise<[Array<Record<string, unknown>>, unknown]>;
}

export interface TemplateGetInput {
  templateId: number;
  requestHeaders: Record<string, string>;
}

export interface TemplatePayload {
  id: unknown;
  companyId: unknown;
  name: unknown;
  templateType: unknown;
  blocks: unknown;
  systemFields: unknown;
  sourceAttachments: unknown;
  pageLayout: unknown;
  theme: unknown;
  pdfSettings: unknown;
  sourceDocxPath: unknown;
  sourceDocxName: unknown;
  isActive: boolean;
  createdAt: unknown;
  updatedAt: unknown;
  docKind: string;
  requiresAcknowledgement: boolean;
  acknowledgementLabel: string;
  acknowledgementText: string;
  submitLabel: string;
  requiresSignature: boolean;
  sourceJobId: number | null;
  docStatus: string;
  appliedWidgets: unknown;
  // HTML canvas fields
  sourceType: string | null;
  htmlContent: string | null;
  importCss: string | null;
  importReport: unknown;
  sourceFileName: string | null;
  sourceSha256: string | null;
  sourceRevision: number | null;
  sourceMimeType: string | null;
}

export type TemplateGetResult =
  | { ok: true; template: TemplatePayload }
  | { ok: false; status: 400 | 401 | 403 | 404 | 500; error: string };

export async function getDocumentTemplate(
  input: TemplateGetInput,
  deps: TemplateGetDeps,
): Promise<TemplateGetResult> {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const session = await deps.getSession(input.requestHeaders);
    if (!session?.user) return { ok: false, status: 401, error: 'Unauthorised' };

    const profile = await deps.getProfile(session.user.id);
    if (!profile?.companyId) return { ok: false, status: 403, error: 'No company' };

    if (!input.templateId || input.templateId <= 0) {
      return { ok: false, status: 400, error: 'Invalid ID' };
    }

    // ── Fetch row (tenant-isolated) ─────────────────────────────────────────
    const [rows] = await deps.dbExecute(
      `SELECT * FROM document_templates WHERE id = ${input.templateId} AND company_id = ${profile.companyId} LIMIT 1`,
    );
    const row = rows?.[0];
    if (!row) return { ok: false, status: 404, error: 'Template not found' };

    // ── Parse JSON blobs (builder canvas) ───────────────────────────────────
    let builderData: Record<string, unknown> = {};
    try { builderData = JSON.parse(String(row.builder_json ?? '{}')); } catch { /* ignore */ }
    let pageLayout: unknown = {};
    try { pageLayout = JSON.parse(String(row.page_layout_json ?? '{}')); } catch { /* ignore */ }
    let theme: unknown = {};
    try { theme = JSON.parse(String(row.theme_json ?? '{}')); } catch { /* ignore */ }
    let pdfSettings: unknown = null;
    try { pdfSettings = row.pdf_settings_json ? JSON.parse(String(row.pdf_settings_json)) : null; } catch { /* ignore */ }

    // ── HTML canvas fields (Phase 2 — may be absent on legacy DBs) ──────────
    const sourceType = (row.source_type as string | null) ?? null;

    const htmlContent: string | null = (() => {
      const raw = row.html_content;
      if (raw == null || raw === '') return null;
      return String(raw);
    })();

    const importCss: string | null = (() => {
      const raw = row.import_css;
      if (raw == null || raw === '') return null;
      return String(raw);
    })();

    const importReport: unknown = (() => {
      const raw = row.import_report;
      if (raw == null || raw === '') return null;
      try {
        const parsed = JSON.parse(String(raw));
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) return null;
        return parsed;
      } catch {
        return null;
      }
    })();

    const sourceFileName = (row.source_file_name as string | null) ?? null;
    const sourceSha256   = (row.source_sha256   as string | null) ?? null;
    const sourceRevision = row.source_revision != null ? Number(row.source_revision) : null;
    const sourceMimeType = (row.source_mime_type as string | null) ?? null;

    // ── Applied widgets ──────────────────────────────────────────────────────
    const appliedWidgets = (() => {
      if (row.applied_widgets_json) {
        try { return JSON.parse(String(row.applied_widgets_json)); } catch { /* ignore */ }
      }
      return Array.isArray(builderData.appliedWidgets) ? builderData.appliedWidgets : [];
    })();

    return {
      ok: true,
      template: {
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        templateType: row.template_type,
        blocks: builderData.blocks ?? [],
        systemFields: builderData.systemFields ?? [],
        sourceAttachments: builderData.sourceAttachments ?? [],
        pageLayout,
        theme,
        pdfSettings,
        sourceDocxPath: row.source_docx_path,
        sourceDocxName: row.source_docx_name,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        docKind: (row.doc_kind as string) ?? 'doc',
        requiresAcknowledgement: Boolean(row.requires_acknowledgement),
        acknowledgementLabel: (row.acknowledgement_label as string) ?? 'Sign Onto / Acknowledge',
        acknowledgementText: (row.acknowledgement_text as string) ?? 'By signing, I confirm I have read, understood, and agree to comply with this document.',
        submitLabel: (row.submit_label as string) ?? 'Submit Form',
        requiresSignature: Boolean(row.requires_signature),
        sourceJobId: row.source_job_id ? Number(row.source_job_id) : null,
        docStatus: (row.doc_status as string) ?? 'draft',
        appliedWidgets,
        sourceType,
        htmlContent,
        importCss,
        importReport,
        sourceFileName,
        sourceSha256,
        sourceRevision,
        sourceMimeType,
      },
    };
  } catch (err) {
    console.error('[getDocumentTemplate] error:', err);
    return { ok: false, status: 500, error: 'Failed to load template' };
  }
}
