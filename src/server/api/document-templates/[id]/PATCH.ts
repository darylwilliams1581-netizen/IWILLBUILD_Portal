/**
 * PATCH /api/document-templates/:id
 * Save Studio canvas edits to a document template.
 *
 * For HTML-canvas documents (source_type = 'html'):
 *   - Accepts htmlContent and importCss from the Studio editor
 *   - Re-sanitises HTML through the converter allowlist
 *   - Validates CSS is scoped to .studio-doc[data-doc-id="<id>"]
 *   - Never overwrites import_report or recovery-source metadata
 *
 * For block-canvas documents (source_type ≠ 'html'):
 *   - Accepts the same fields as PUT (builder_json, page_layout, theme, etc.)
 *
 * Business logic lives in src/server/lib/document-template-patch.ts so it
 * can be unit-tested without Vite struggling to resolve the [id] bracket path.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { patchDocumentTemplate } from '../../../lib/document-template-patch.js';

export default async function handler(req: Request, res: Response) {
  const id = Number(req.params.id);

  const auth = getAuth();
  const reqHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) reqHeaders[k] = Array.isArray(v) ? v[0] : v;
  }

  const result = await patchDocumentTemplate(
    { templateId: id, requestHeaders: reqHeaders, body: req.body ?? {} },
    {
      getSession: async (headers) => {
        const h = new Headers();
        for (const [k, v] of Object.entries(headers)) h.set(k, v);
        return auth.api.getSession({ headers: h });
      },
      getProfile: async (userId) => {
        const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
        return p ?? null;
      },
      dbSelect: async (rawSql) => {
        const [rows, meta] = await db.execute(sql.raw(rawSql)) as unknown as [Array<Record<string, unknown>>, unknown];
        return [rows, meta];
      },
      dbUpdate: async (rawSql) => {
        await db.execute(sql.raw(rawSql));
      },
    },
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.json({ ok: true });
}
