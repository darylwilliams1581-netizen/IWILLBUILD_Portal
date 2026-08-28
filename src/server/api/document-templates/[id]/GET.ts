/**
 * GET /api/document-templates/:id
 * Load a single document template (full builder JSON + HTML canvas fields).
 *
 * Business logic lives in src/server/lib/document-template-get.ts so it can
 * be unit-tested without Vite struggling to resolve the [id] bracket path.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getDocumentTemplate } from '../../../../lib/document-template-get.js';

export default async function handler(req: Request, res: Response) {
  const id = Number(req.params.id);

  const auth = getAuth();
  const reqHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) reqHeaders[k] = Array.isArray(v) ? v[0] : v;
  }

  const result = await getDocumentTemplate(
    { templateId: id, requestHeaders: reqHeaders },
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
      dbExecute: async (rawSql) => {
        const [rows, meta] = await db.execute(sql.raw(rawSql)) as unknown as [Array<Record<string, unknown>>, unknown];
        return [rows, meta];
      },
    },
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.json({ template: result.template });
}
