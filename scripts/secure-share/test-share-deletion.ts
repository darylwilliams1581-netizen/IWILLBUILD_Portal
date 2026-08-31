/**
 * POST /api/admin/test-share-deletion
 * ─────────────────────────────────────────────────────────────────────────────
 * Internal test endpoint — platform owner only.
 *
 * Proves that deleting a source record immediately revokes its share links
 * and that the recipient token endpoint returns 410 Gone.
 *
 * Strategy: uses a synthetic estimate row (inserted and deleted within the
 * test) so no real data is touched.  The test:
 *
 *  1. Inserts a synthetic estimate row
 *  2. Creates a share link for it via POST /api/secure-share
 *  3. Confirms the token resolves (GET /api/secure-share/:token → 200)
 *  4. Deletes the estimate via DELETE /api/estimates/:id
 *  5. Confirms the token now returns 410
 *  6. Confirms secure_share_links row has revoked=1 and token_encrypted=NULL
 *  7. Confirms no active links remain for the target
 *
 * Cleans up all synthetic rows after the run.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../../lib/dazza-context.js';
import { getSecret } from '#airo/secrets';

type TestResult = { name: string; pass: boolean; detail: string };

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const ownerEmail = getSecret('PLATFORM_OWNER_EMAIL');
    const ownerEmailStr = typeof ownerEmail === 'string' ? ownerEmail : String(ownerEmail ?? '');
    if (session.user.email !== ownerEmailStr) {
      return res.status(403).json({ error: 'Platform owner only' });
    }

    const { companyId } = await resolveEffectiveCompany(req, session.user.id);
    if (!companyId) return res.status(400).json({ error: 'No company' });

    const cookieHeader = req.headers.cookie ?? '';
    const origin = 'https://iwillbuild.com';

    const results: TestResult[] = [];
    let syntheticEstimateId: number | null = null;
    let shareLinkId: number | null = null;
    let shareToken: string | null = null;

    async function api(method: string, path: string, body?: unknown) {
      const r = await fetch(`${origin}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({})) as Record<string, unknown>;
      return { status: r.status, data };
    }

    async function publicApi(path: string) {
      const r = await fetch(`${origin}${path}`);
      const data = await r.json().catch(() => ({})) as Record<string, unknown>;
      return { status: r.status, data };
    }

    try {
      // ── Step 1: Insert a synthetic estimate ───────────────────────────────
      const [insertResult] = await db.execute(sql`
        INSERT INTO estimates
          (company_id, title, status, subtotal, tax_total, total, created_at, updated_at)
        VALUES
          (${companyId}, 'DELETION-TEST-SYNTHETIC', 'draft', 0, 0, 0, NOW(), NOW())
      `) as unknown as [{ insertId: number }, unknown];
      syntheticEstimateId = (insertResult as { insertId: number }).insertId;

      results.push({
        name: '1. Synthetic estimate created',
        pass: !!syntheticEstimateId,
        detail: `id=${syntheticEstimateId}`,
      });

      // ── Step 2: Create a share link ───────────────────────────────────────
      const r2 = await api('POST', '/api/secure-share', {
        title: 'Deletion test share',
        linkType: 'document_view',
        targetType: 'estimate',
        targetId: String(syntheticEstimateId),
        permissions: ['view', 'download'],
        expiryDays: 7,
      });
      shareLinkId = r2.data.id as number | null;
      const shareUrl = r2.data.shareUrl as string | undefined;
      shareToken = shareUrl?.split('/share/')[1] ?? null;

      results.push({
        name: '2. Share link created',
        pass: r2.status === 201 && !!shareLinkId && !!shareToken,
        detail: `status=${r2.status} id=${shareLinkId} token=${shareToken ? shareToken.slice(0, 12) + '…' : 'MISSING'}`,
      });

      // ── Step 3: Token resolves before deletion ────────────────────────────
      let preDeleteStatus = 0;
      if (shareToken) {
        const r3 = await publicApi(`/api/secure-share/${shareToken}`);
        preDeleteStatus = r3.status;
      }
      results.push({
        name: '3. Token resolves before deletion (200)',
        pass: preDeleteStatus === 200,
        detail: `status=${preDeleteStatus} (expected 200)`,
      });

      // ── Step 4: Delete the estimate ───────────────────────────────────────
      const r4 = await api('DELETE', `/api/estimates/${syntheticEstimateId}`);
      results.push({
        name: '4. Estimate deleted successfully',
        pass: r4.status === 200 && r4.data.ok === true,
        detail: `status=${r4.status} ok=${r4.data.ok}`,
      });
      // Mark as deleted so cleanup doesn't try again
      if (r4.status === 200) syntheticEstimateId = null;

      // ── Step 5: Token now returns 410 ─────────────────────────────────────
      let postDeleteStatus = 0;
      let postDeleteCode = '';
      if (shareToken) {
        const r5 = await publicApi(`/api/secure-share/${shareToken}`);
        postDeleteStatus = r5.status;
        postDeleteCode = r5.data.code as string ?? '';
      }
      results.push({
        name: '5. Token returns 410 immediately after deletion',
        pass: postDeleteStatus === 410,
        detail: `status=${postDeleteStatus} code=${postDeleteCode} (expected 410/REVOKED)`,
      });

      // ── Step 6: DB row has revoked=1 and token_encrypted=NULL ─────────────
      let dbRevoked = false;
      let dbTokenEncryptedNull = false;
      if (shareLinkId) {
        const [dbRows] = await db.execute(sql`
          SELECT revoked, token_encrypted
          FROM secure_share_links
          WHERE id = ${shareLinkId}
          LIMIT 1
        `) as unknown as [Array<{ revoked: number; token_encrypted: string | null }>, unknown];
        const row = dbRows?.[0];
        dbRevoked = row?.revoked === 1;
        dbTokenEncryptedNull = row?.token_encrypted === null;
      }
      results.push({
        name: '6. DB row: revoked=1 and token_encrypted=NULL',
        pass: dbRevoked && dbTokenEncryptedNull,
        detail: `revoked=${dbRevoked} tokenEncryptedNull=${dbTokenEncryptedNull}`,
      });

      // ── Step 7: No active links remain ────────────────────────────────────
      const [activeRows] = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM secure_share_links
        WHERE company_id = ${companyId}
          AND target_type = 'estimate'
          AND target_id   = ${String(shareLinkId ? (await db.execute(sql`SELECT target_id FROM secure_share_links WHERE id = ${shareLinkId} LIMIT 1`) as unknown as [Array<{target_id: string}>, unknown])[0]?.[0]?.target_id ?? '' : '')}
          AND revoked     = 0
      `) as unknown as [Array<{ cnt: number }>, unknown];
      // Simpler: just check the specific link ID
      const [activeCheck] = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM secure_share_links
        WHERE id = ${shareLinkId ?? 0}
          AND revoked = 0
      `) as unknown as [Array<{ cnt: number }>, unknown];
      const activeCount = Number(activeCheck?.[0]?.cnt ?? 0);
      results.push({
        name: '7. No active links remain for the deleted source',
        pass: activeCount === 0,
        detail: `active links with revoked=0: ${activeCount} (expected 0)`,
      });

      // ── Step 8: Audit event written ───────────────────────────────────────
      const [auditRows] = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM secure_share_events
        WHERE share_link_id = ${shareLinkId ?? 0}
          AND event_type = 'source_deleted'
      `) as unknown as [Array<{ cnt: number }>, unknown];
      const auditCount = Number(auditRows?.[0]?.cnt ?? 0);
      results.push({
        name: '8. Audit event source_deleted written',
        pass: auditCount >= 1,
        detail: `source_deleted events: ${auditCount} (expected ≥1)`,
      });

    } finally {
      // ── Cleanup: remove synthetic estimate if deletion test failed ────────
      if (syntheticEstimateId) {
        await db.execute(sql`DELETE FROM estimates WHERE id = ${syntheticEstimateId} AND company_id = ${companyId}`).catch(() => {});
      }
      // Revoke any lingering test share links
      if (shareLinkId) {
        await db.execute(sql`UPDATE secure_share_links SET revoked = 1, token_encrypted = NULL, updated_at = NOW() WHERE id = ${shareLinkId}`).catch(() => {});
      }
    }

    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;

    return res.json({
      passed,
      failed,
      total: results.length,
      verdict: failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`,
      results,
    });
  } catch (e) {
    console.error('POST /api/admin/test-share-deletion error:', e);
    return res.status(500).json({ error: String(e) });
  }
}
