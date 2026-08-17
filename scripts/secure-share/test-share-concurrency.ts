/**
 * POST /api/admin/test-share-concurrency
 * ─────────────────────────────────────────────────────────────────────────────
 * Internal test endpoint — platform owner only.
 *
 * Proves that two simultaneous POST /api/secure-share requests for the same
 * (company_id, target_type, target_id, link_type) produce exactly ONE active
 * row in the database.
 *
 * Method: fires N concurrent requests against POST /api/secure-share using
 * the caller's session cookie, then queries the DB and counts active rows.
 *
 * Body:
 *   targetType  string   (e.g. "completed_form")
 *   targetId    string   (e.g. "99999")  — use a non-existent ID to avoid side effects
 *   linkType    string   (e.g. "document_view")
 *   n?          number   (concurrent requests, default 5, max 10)
 *
 * Returns:
 *   { activeRows, tokenHashes, pass }
 *   pass = true iff activeRows === 1
 *
 * Cleans up: revokes all test rows after the count.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../../lib/dazza-context.js';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    // Platform owner only
    const ownerEmail = getSecret('PLATFORM_OWNER_EMAIL');
    const ownerEmailStr = typeof ownerEmail === 'string' ? ownerEmail : String(ownerEmail ?? '');
    if (session.user.email !== ownerEmailStr) {
      return res.status(403).json({ error: 'Platform owner only' });
    }

    const { companyId } = await resolveEffectiveCompany(req, session.user.id);
    if (!companyId) return res.status(400).json({ error: 'No company' });

    const {
      targetType = 'completed_form',
      targetId = 'concurrency-test-99999',
      linkType = 'document_view',
      n = 5,
    } = req.body as {
      targetType?: string;
      targetId?: string;
      linkType?: string;
      n?: number;
    };

    const concurrency = Math.min(Math.max(Number(n) || 5, 2), 10);

    // ── Clean up any pre-existing test rows ───────────────────────────────────
    await db.execute(sql`
      UPDATE secure_share_links
      SET revoked = 1, updated_at = NOW()
      WHERE company_id = ${companyId}
        AND target_type = ${targetType}
        AND target_id   = ${String(targetId)}
        AND link_type   = ${linkType}
    `);

    // ── Build the request cookie string from the incoming request ─────────────
    const cookieHeader = req.headers.cookie ?? '';
    const origin = `https://iwillbuild.com`;

    // ── Fire N concurrent requests ────────────────────────────────────────────
    const body = JSON.stringify({
      title: 'Concurrency test link',
      linkType,
      targetType,
      targetId: String(targetId),
      permissions: ['view', 'download'],
      expiryDays: 1,
    });

    const requests = Array.from({ length: concurrency }, () =>
      fetch(`${origin}/api/secure-share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body,
      }).then(async (r) => {
        const data = await r.json() as Record<string, unknown>;
        return { status: r.status, data };
      }).catch((e: unknown) => ({
        status: 0,
        data: { error: String(e) },
      }))
    );

    const results = await Promise.all(requests);

    // ── Count active rows in the DB ───────────────────────────────────────────
    const [countRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id) AS ids
      FROM secure_share_links
      WHERE company_id = ${companyId}
        AND target_type = ${targetType}
        AND target_id   = ${String(targetId)}
        AND link_type   = ${linkType}
        AND revoked     = 0
    `) as unknown as [Array<{ cnt: number; ids: string | null }>, unknown];

    const activeRows = Number(countRows?.[0]?.cnt ?? 0);
    const activeIds = countRows?.[0]?.ids ?? '';

    // ── Clean up test rows ────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE secure_share_links
      SET revoked = 1, updated_at = NOW()
      WHERE company_id = ${companyId}
        AND target_type = ${targetType}
        AND target_id   = ${String(targetId)}
        AND link_type   = ${linkType}
    `);

    const pass = activeRows === 1;
    const created201 = results.filter((r) => r.status === 201).length;
    const returned200 = results.filter((r) => r.status === 200).length;
    const errors = results.filter((r) => r.status >= 400).length;

    return res.json({
      pass,
      concurrency,
      activeRows,
      activeIds,
      created201,
      returned200,
      errors,
      results: results.map((r) => ({
        status: r.status,
        existing: (r.data as Record<string, unknown>).existing ?? null,
        id: (r.data as Record<string, unknown>).id ?? null,
      })),
      verdict: pass
        ? `✅ PASS — ${concurrency} concurrent requests produced exactly 1 active row`
        : `❌ FAIL — ${concurrency} concurrent requests produced ${activeRows} active rows`,
    });
  } catch (e) {
    console.error('POST /api/admin/test-share-concurrency error:', e);
    return res.status(500).json({ error: String(e) });
  }
}
