/**
 * document-template-patch.ts
 * ──────────────────────────
 * Pure business logic for PATCH /api/document-templates/:id.
 *
 * Extracted from the route handler so it can be unit-tested without Vite
 * struggling to resolve the [id] bracket path.
 *
 * HTML-canvas save path (source_type = 'html'):
 *   - Accepts html_content and import_css from the Studio canvas
 *   - Re-sanitises html_content through the converter allowlist (same pass
 *     used at import time) — prevents any XSS that could arrive via a
 *     crafted PUT body
 *   - Validates import_css:
 *       • Must be scoped to .studio-doc[data-doc-id="<id>"] — any rule that
 *         does not start with that selector is rejected (400)
 *       • @import, @charset, url() with javascript:/data: schemes, and
 *         expression() are stripped/rejected
 *       • Bare global selectors (html, body, *, :root, etc.) are rejected
 *   - import_report and recovery-source metadata (source_file_name,
 *     source_sha256, source_revision, source_mime_type, source_file_key)
 *     are NEVER overwritten by a Studio canvas save — they are set only by
 *     the import-docx pipeline
 *   - rendered_pdf_key is cleared (NULL) so the next PDF export regenerates
 *
 * Non-HTML save path (source_type ≠ 'html' or absent):
 *   - Accepts the same builder_json / page_layout / theme / metadata fields
 *     as the existing PUT handler
 *   - html_content / import_css are ignored
 *
 * Shared:
 *   - Auth: session required
 *   - Tenant isolation: SELECT + UPDATE always include company_id filter
 *   - Optimistic concurrency: updated_at is always refreshed
 *   - Fallback compatibility: newer columns wrapped in try/catch same as PUT
 */

import { sanitiseHtml } from './docx-to-html.js';

export interface PatchDeps {
  getSession: (headers: Record<string, string>) => Promise<{ user: { id: string } } | null>;
  getProfile: (userId: string) => Promise<{ companyId: number } | null>;
  /** Returns [rows, meta]; rows[0] is the ownership-check row */
  dbSelect: (sql: string) => Promise<[Array<Record<string, unknown>>, unknown]>;
  dbUpdate: (sql: string) => Promise<void>;
}

export interface PatchInput {
  templateId: number;
  requestHeaders: Record<string, string>;
  body: PatchBody;
}

export interface PatchBody {
  // HTML canvas fields
  htmlContent?: string;
  importCss?: string;
  // Block-canvas / metadata fields (same as PUT)
  name?: string;
  templateType?: string;
  pageLayout?: unknown;
  theme?: unknown;
  blocks?: unknown;
  systemFields?: unknown;
  sourceAttachments?: unknown;
  pdfSettings?: unknown;
  sourceJobId?: number | null;
  docStatus?: string;
  docKind?: string;
  requiresAcknowledgement?: boolean;
  acknowledgementLabel?: string;
  acknowledgementText?: string;
  submitLabel?: string;
  requiresSignature?: boolean;
  appliedWidgets?: unknown[];
}

export type PatchResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 403 | 404 | 500; error: string };

// ─── CSS scope validator ──────────────────────────────────────────────────────

/**
 * Expected scope prefix for all CSS rules in an HTML-canvas document.
 * Every rule must begin with this selector (possibly followed by a combinator
 * or pseudo-class).
 */
function expectedCssScope(docId: number): string {
  return `.studio-doc[data-doc-id="${docId}"]`;
}

/**
 * Dangerous CSS patterns that must never appear in stored CSS regardless of
 * scoping.
 */
const DANGEROUS_CSS_RE = [
  /expression\s*\(/i,                      // CSS expression()
  /@import\b/i,                             // @import (can load external sheets)
  /@charset\b/i,                            // @charset (encoding attacks)
  /url\s*\(\s*['"]?\s*javascript:/i,        // javascript: in url()
  /url\s*\(\s*['"]?\s*data:(?!image\/)/i,  // data: url() except data:image/
  /vbscript:/i,                             // vbscript: scheme
];

/**
 * Global selectors that are not allowed even inside a scoped block.
 * These would escape the scope via specificity tricks or cascade.
 */
const GLOBAL_SELECTOR_RE = /(?:^|[,{])\s*(?:html|body|\*|:root)\b/i;

/**
 * Validate and sanitise import_css for a Studio HTML canvas save.
 *
 * Returns { ok: true, css: string } on success.
 * Returns { ok: false, error: string } if the CSS contains unsafe constructs
 * that cannot be stripped (global selectors, @import, etc.).
 *
 * Safe-strippable constructs (expression, javascript: url) are removed in
 * place rather than rejected so that a minor sanitiser pass at import time
 * doesn't cause a 400 on re-save.
 */
export function validateAndSanitiseCss(
  css: string,
  docId: number,
): { ok: true; css: string } | { ok: false; error: string } {
  if (!css || !css.trim()) return { ok: true, css: '' };

  // ── Reject dangerous patterns that cannot be safely stripped ────────────
  if (/@import\b/i.test(css)) {
    return { ok: false, error: 'CSS @import is not permitted in canvas documents' };
  }
  if (/@charset\b/i.test(css)) {
    return { ok: false, error: 'CSS @charset is not permitted in canvas documents' };
  }
  if (/url\s*\(\s*['"]?\s*javascript:/i.test(css)) {
    return { ok: false, error: 'CSS url() with javascript: scheme is not permitted' };
  }
  if (/vbscript:/i.test(css)) {
    return { ok: false, error: 'CSS vbscript: scheme is not permitted' };
  }

  // ── Strip expression() in place ──────────────────────────────────────────
  let sanitised = css.replace(/expression\s*\([^)]*\)/gi, '/* stripped */');

  // ── Strip data: url() for non-image schemes ──────────────────────────────
  sanitised = sanitised.replace(
    /url\s*\(\s*(['"]?)\s*data:(?!image\/)([^)]*)\1\s*\)/gi,
    '/* stripped */',
  );

  // ── Reject global selectors ───────────────────────────────────────────────
  // Split on } to get individual rule blocks and check each selector part
  const ruleBlocks = sanitised.split('}');
  for (const block of ruleBlocks) {
    const selectorPart = block.split('{')[0]?.trim() ?? '';
    if (!selectorPart) continue;
    if (GLOBAL_SELECTOR_RE.test(selectorPart)) {
      return {
        ok: false,
        error: `CSS global selector "${selectorPart.slice(0, 60)}" is not permitted — all rules must be scoped to the document root`,
      };
    }
  }

  // ── Enforce scope prefix on every rule ───────────────────────────────────
  const scope = expectedCssScope(docId);
  // Split into rule blocks again (after stripping) and check each selector
  const blocks2 = sanitised.split('}');
  for (const block of blocks2) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const selectorPart = trimmed.split('{')[0]?.trim() ?? '';
    if (!selectorPart) continue;
    // Each comma-separated selector must start with the scope prefix
    const selectors = selectorPart.split(',').map(s => s.trim()).filter(Boolean);
    for (const sel of selectors) {
      if (!sel.startsWith(scope)) {
        return {
          ok: false,
          error: `CSS rule "${sel.slice(0, 80)}" is not scoped to the document root (${scope})`,
        };
      }
    }
  }

  return { ok: true, css: sanitised };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function patchDocumentTemplate(
  input: PatchInput,
  deps: PatchDeps,
): Promise<PatchResult> {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const session = await deps.getSession(input.requestHeaders);
    if (!session?.user) return { ok: false, status: 401, error: 'Unauthorised' };

    const profile = await deps.getProfile(session.user.id);
    if (!profile?.companyId) return { ok: false, status: 403, error: 'No company' };

    const { templateId, body } = input;
    if (!templateId || templateId <= 0) {
      return { ok: false, status: 400, error: 'Invalid ID' };
    }

    // ── Ownership check (tenant-isolated) ───────────────────────────────────
    const [ownerRows] = await deps.dbSelect(
      `SELECT id, source_type FROM document_templates WHERE id = ${templateId} AND company_id = ${profile.companyId} LIMIT 1`,
    );
    const ownerRow = ownerRows?.[0];
    if (!ownerRow) return { ok: false, status: 404, error: 'Template not found' };

    const sourceType = (ownerRow.source_type as string | null) ?? null;
    const isHtmlDoc = sourceType === 'html';

    // ── Build SET clauses ───────────────────────────────────────────────────
    const setParts: string[] = [];

    if (isHtmlDoc) {
      // ── HTML canvas save path ─────────────────────────────────────────────
      // Only htmlContent and importCss are accepted for HTML documents.
      // Any block-canvas fields in the body are ignored.

      if (body.htmlContent === undefined && body.importCss === undefined) {
        return { ok: false, status: 400, error: 'No fields to update' };
      }

      if (body.htmlContent !== undefined) {
        if (typeof body.htmlContent !== 'string') {
          return { ok: false, status: 400, error: 'htmlContent must be a string' };
        }
        // Strip dangerous element content (script/style/etc.) before the
        // allowlist sanitiser runs — the allowlist strips the tags but leaves
        // inner text, so we must remove the whole element including content.
        const stripped = body.htmlContent
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
          .replace(/<object[\s\S]*?<\/object>/gi, '')
          .replace(/<embed[^>]*>/gi, '');
        const sanitised = sanitiseHtml(stripped);
        setParts.push(`html_content = ${sqlStr(sanitised)}`);
      }

      if (body.importCss !== undefined) {
        if (typeof body.importCss !== 'string') {
          return { ok: false, status: 400, error: 'importCss must be a string' };
        }
        const cssResult = validateAndSanitiseCss(body.importCss, templateId);
        if (!cssResult.ok) {
          return { ok: false, status: 400, error: cssResult.error };
        }
        setParts.push(`import_css = ${sqlStr(cssResult.css)}`);
      }

      // Clear cached PDF so next export regenerates
      setParts.push('rendered_pdf_key = NULL');

      // NOTE: import_report, source_file_name, source_sha256, source_revision,
      // source_mime_type, source_file_key are intentionally NOT updated here.
      // They are set only by the import-docx pipeline.

    } else {

      const {
        name, templateType, pageLayout, theme, blocks, systemFields,
        sourceAttachments, pdfSettings, sourceJobId, docStatus, docKind,
        requiresAcknowledgement, acknowledgementLabel, acknowledgementText,
        submitLabel, requiresSignature, appliedWidgets,
      } = body;

      const builderJson = JSON.stringify({
        blocks: blocks ?? [],
        systemFields: systemFields ?? [],
        sourceAttachments: sourceAttachments ?? [],
        appliedWidgets: appliedWidgets ?? [],
      });
      const pageLayoutJson = JSON.stringify(pageLayout ?? {});
      const themeJson = JSON.stringify(theme ?? {});
      const pdfSettingsJson = pdfSettings ? JSON.stringify(pdfSettings) : null;

      setParts.push(`builder_json = ${sqlStr(builderJson)}`);
      setParts.push(`page_layout_json = ${sqlStr(pageLayoutJson)}`);
      setParts.push(`theme_json = ${sqlStr(themeJson)}`);
      if (pdfSettingsJson !== null) setParts.push(`pdf_settings_json = ${sqlStr(pdfSettingsJson)}`);
      if (name?.trim()) setParts.push(`name = ${sqlStr(name.trim())}`);
      if (templateType) setParts.push(`template_type = ${sqlStr(templateType)}`);
      if (sourceJobId !== undefined) setParts.push(`source_job_id = ${sourceJobId != null ? Number(sourceJobId) : 'NULL'}`);
      if (docStatus) setParts.push(`doc_status = ${sqlStr(docStatus)}`);
      if (docKind) setParts.push(`doc_kind = ${sqlStr(docKind)}`);
      if (requiresAcknowledgement !== undefined) setParts.push(`requires_acknowledgement = ${requiresAcknowledgement ? 1 : 0}`);
      if (acknowledgementLabel !== undefined) setParts.push(`acknowledgement_label = ${sqlStr(acknowledgementLabel)}`);
      if (acknowledgementText !== undefined) setParts.push(`acknowledgement_text = ${sqlStr(acknowledgementText)}`);
      if (submitLabel !== undefined) setParts.push(`submit_label = ${sqlStr(submitLabel)}`);
      if (requiresSignature !== undefined) setParts.push(`requires_signature = ${requiresSignature ? 1 : 0}`);
      if (appliedWidgets !== undefined) setParts.push(`applied_widgets_json = ${sqlStr(JSON.stringify(appliedWidgets ?? []))}`);
    }

    if (setParts.length === 0) {
      return { ok: false, status: 400, error: 'No fields to update' };
    }

    // Always refresh updated_at
    setParts.push('updated_at = NOW()');

    const updateSql = `UPDATE document_templates SET ${setParts.join(', ')} WHERE id = ${templateId} AND company_id = ${profile.companyId}`;

    try {
      await deps.dbUpdate(updateSql);
    } catch (updateErr: unknown) {
      // Fallback: if newer columns are missing on this DB, retry with core fields only
      const errObj = updateErr as { message?: string; cause?: { message?: string; sqlMessage?: string } };
      const combined = String(errObj?.message ?? '') + ' ' + String(errObj?.cause?.message ?? errObj?.cause?.sqlMessage ?? '');
      const isMissingCol = combined.includes('ER_BAD_FIELD_ERROR') || combined.includes('Unknown column');
      if (isMissingCol && !isHtmlDoc) {
        // For non-HTML docs, retry without newer columns (same pattern as PUT)
        const coreParts = setParts.filter(p =>
          p.startsWith('builder_json') ||
          p.startsWith('page_layout_json') ||
          p.startsWith('theme_json') ||
          p.startsWith('updated_at'),
        );
        if (coreParts.length > 0) {
          await deps.dbUpdate(
            `UPDATE document_templates SET ${coreParts.join(', ')} WHERE id = ${templateId} AND company_id = ${profile.companyId}`,
          );
        }
      } else {
        throw updateErr;
      }
    }

    return { ok: true };
  } catch (err) {
    console.error('[patchDocumentTemplate] error:', err);
    return { ok: false, status: 500, error: 'Failed to save template' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Escape a string value for safe embedding in a raw SQL SET clause.
 * Uses JSON.stringify which produces a double-quoted string with all
 * special characters escaped — MySQL accepts this as a string literal.
 */
function sqlStr(value: string): string {
  return JSON.stringify(value);
}
