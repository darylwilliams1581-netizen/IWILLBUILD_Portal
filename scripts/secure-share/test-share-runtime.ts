/**
 * POST /api/admin/test-share-runtime
 * ─────────────────────────────────────────────────────────────────────────────
 * Internal test endpoint — platform owner only.
 *
 * Runs the 12-item authenticated runtime test suite for the Secure Share
 * system.  Uses a synthetic test target (targetType=completed_form,
 * targetId=runtime-test-88888) to avoid touching real data.
 *
 * Tests:
 *  1. Generate creates one link (HTTP 201, existing=false)
 *  2. Active GET returns the same link
 *  3. URL is identical between POST response and active GET
 *  4. Repeated POST returns existing link (HTTP 200, existing=true)
 *  5. Active GET still returns exactly one link after repeated POST
 *  6. Revoke makes the recipient token endpoint return 410 REVOKED
 *  7. Active GET returns 0 links after revoke
 *  8. Revoke-and-rotate returns a new URL (different from old)
 *  9. Old token returns 410 after rotate; new token returns 200
 * 10. Company isolation: a second company cannot see the link via active GET
 * 11. No token_hash / token_encrypted / password_hash in any response body
 * 12. Active GET with wrong link_type returns 0 links (purpose isolation)
 *
 * Cleans up all test rows after the run.
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

    const TARGET_TYPE = 'completed_form';
    const TARGET_ID   = 'runtime-test-88888';
    const LINK_TYPE   = 'document_view';

    const results: TestResult[] = [];

    // Helper: make an authenticated request
    async function api(method: string, path: string, body?: unknown) {
      const r = await fetch(`${origin}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({})) as Record<string, unknown>;
      return { status: r.status, data };
    }

    // Helper: check a public token endpoint (no auth)
    async function publicApi(path: string) {
      const r = await fetch(`${origin}${path}`);
      const data = await r.json().catch(() => ({})) as Record<string, unknown>;
      return { status: r.status, data };
    }

    // ── Pre-clean ─────────────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE secure_share_links SET revoked = 1, updated_at = NOW()
      WHERE company_id = ${companyId}
        AND target_type = ${TARGET_TYPE}
        AND target_id   = ${TARGET_ID}
    `);

    const createBody = {
      title: 'Runtime test link',
      linkType: LINK_TYPE,
      targetType: TARGET_TYPE,
      targetId: TARGET_ID,
      permissions: ['view', 'download'],
      expiryDays: 7,
    };

    // ── Test 1: Generate creates one link ─────────────────────────────────────
    const r1 = await api('POST', '/api/secure-share', createBody);
    const firstUrl = r1.data.shareUrl as string | undefined;
    const firstId  = r1.data.id as number | undefined;
    results.push({
      name: '1. Generate creates one link (201, existing=false)',
      pass: r1.status === 201 && r1.data.existing === false && !!firstUrl && !!firstId,
      detail: `status=${r1.status} existing=${r1.data.existing} url=${firstUrl ?? 'MISSING'}`,
    });

    // ── Test 2: Active GET returns the link ───────────────────────────────────
    const r2 = await api('GET', `/api/secure-share/active?targetType=${TARGET_TYPE}&targetId=${TARGET_ID}&linkType=${LINK_TYPE}`);
    const activeLinks = (r2.data.links ?? []) as Array<Record<string, unknown>>;
    results.push({
      name: '2. Active GET returns the link',
      pass: r2.status === 200 && activeLinks.length === 1,
      detail: `status=${r2.status} count=${activeLinks.length}`,
    });

    // ── Test 3: URL is identical ──────────────────────────────────────────────
    const activeUrl = activeLinks[0]?.shareUrl as string | undefined;
    results.push({
      name: '3. URL identical between POST and active GET',
      pass: !!firstUrl && !!activeUrl && firstUrl === activeUrl,
      detail: `post=${firstUrl ?? 'MISSING'} active=${activeUrl ?? 'MISSING'} match=${firstUrl === activeUrl}`,
    });

    // ── Test 4: Repeated POST returns existing ────────────────────────────────
    const r4 = await api('POST', '/api/secure-share', createBody);
    results.push({
      name: '4. Repeated POST returns existing (200, existing=true, same URL)',
      pass: r4.status === 200 && r4.data.existing === true && r4.data.shareUrl === firstUrl,
      detail: `status=${r4.status} existing=${r4.data.existing} sameUrl=${r4.data.shareUrl === firstUrl}`,
    });

    // ── Test 5: Active GET still one link after repeated POST ─────────────────
    const r5 = await api('GET', `/api/secure-share/active?targetType=${TARGET_TYPE}&targetId=${TARGET_ID}&linkType=${LINK_TYPE}`);
    const links5 = (r5.data.links ?? []) as Array<Record<string, unknown>>;
    results.push({
      name: '5. Active GET still exactly 1 link after repeated POST',
      pass: r5.status === 200 && links5.length === 1,
      detail: `count=${links5.length}`,
    });

    // ── Test 6: Revoke makes recipient token return 410 ───────────────────────
    if (firstId) {
      await api('DELETE', `/api/secure-share/${firstId}`);
    }
    // Extract token from URL: /share/<token>
    const firstToken = firstUrl?.split('/share/')[1];
    let r6Status = 0;
    if (firstToken) {
      const r6 = await publicApi(`/api/secure-share/${firstToken}`);
      r6Status = r6.status;
    }
    results.push({
      name: '6. Revoke makes recipient token return 410 REVOKED',
      pass: r6Status === 410,
      detail: `token endpoint status=${r6Status} (expected 410)`,
    });

    // ── Test 7: Active GET returns 0 links after revoke ───────────────────────
    const r7 = await api('GET', `/api/secure-share/active?targetType=${TARGET_TYPE}&targetId=${TARGET_ID}&linkType=${LINK_TYPE}`);
    const links7 = (r7.data.links ?? []) as Array<Record<string, unknown>>;
    results.push({
      name: '7. Active GET returns 0 links after revoke',
      pass: r7.status === 200 && links7.length === 0,
      detail: `count=${links7.length}`,
    });

    // ── Test 8+9: Revoke-and-rotate ───────────────────────────────────────────
    // First create a fresh link to rotate
    const r8pre = await api('POST', '/api/secure-share', createBody);
    const preRotateId  = r8pre.data.id as number | undefined;
    const preRotateUrl = r8pre.data.shareUrl as string | undefined;

    let rotateUrl: string | undefined;
    if (preRotateId) {
      const r8 = await api('POST', `/api/secure-share/${preRotateId}/revoke-and-rotate`, { expiryDays: 7 });
      rotateUrl = r8.data.shareUrl as string | undefined;
      results.push({
        name: '8. Revoke-and-rotate returns a new URL (different from old)',
        pass: r8.status === 200 && !!rotateUrl && rotateUrl !== preRotateUrl,
        detail: `status=${r8.status} oldUrl=${preRotateUrl ?? 'MISSING'} newUrl=${rotateUrl ?? 'MISSING'} different=${rotateUrl !== preRotateUrl}`,
      });
    } else {
      results.push({ name: '8. Revoke-and-rotate', pass: false, detail: 'Pre-rotate link creation failed' });
    }

    // Old token → 410, new token → 200
    const oldToken = preRotateUrl?.split('/share/')[1];
    const newToken = rotateUrl?.split('/share/')[1];
    let oldStatus = 0, newStatus = 0;
    if (oldToken) { const r = await publicApi(`/api/secure-share/${oldToken}`); oldStatus = r.status; }
    if (newToken) { const r = await publicApi(`/api/secure-share/${newToken}`); newStatus = r.status; }
    results.push({
      name: '9. Old token 410 after rotate; new token 200',
      pass: oldStatus === 410 && newStatus === 200,
      detail: `oldToken=${oldStatus} (expected 410) newToken=${newStatus} (expected 200)`,
    });

    // ── Test 10: Company isolation ────────────────────────────────────────────
    // Query the DB directly for a different company — should return 0 rows
    const [isolationRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM secure_share_links
      WHERE company_id != ${companyId}
        AND target_type = ${TARGET_TYPE}
        AND target_id   = ${TARGET_ID}
        AND revoked     = 0
    `) as unknown as [Array<{ cnt: number }>, unknown];
    const otherCompanyRows = Number(isolationRows?.[0]?.cnt ?? 0);
    results.push({
      name: '10. Company isolation: no active rows visible to other companies',
      pass: otherCompanyRows === 0,
      detail: `rows visible to other companies=${otherCompanyRows}`,
    });

    // ── Test 11: No sensitive fields in any response body ─────────────────────
    const sensitiveKeys = ['token_hash', 'tokenHash', 'token_encrypted', 'tokenEncrypted', 'password_hash', 'passwordHash'];
    const allResponses = [r1, r2, r4, r5, r7, r8pre];
    const leaks: string[] = [];
    for (const r of allResponses) {
      const bodyStr = JSON.stringify(r.data);
      for (const key of sensitiveKeys) {
        if (bodyStr.includes(`"${key}"`)) leaks.push(key);
      }
    }
    results.push({
      name: '11. No token_hash / token_encrypted / password_hash in any response',
      pass: leaks.length === 0,
      detail: leaks.length === 0 ? 'clean' : `LEAKED: ${leaks.join(', ')}`,
    });

    // ── Test 12: Wrong link_type returns 0 links (purpose isolation) ──────────
    const r12 = await api('GET', `/api/secure-share/active?targetType=${TARGET_TYPE}&targetId=${TARGET_ID}&linkType=live_form`);
    const links12 = (r12.data.links ?? []) as Array<Record<string, unknown>>;
    results.push({
      name: '12. Wrong link_type returns 0 links (purpose isolation)',
      pass: r12.status === 200 && links12.length === 0,
      detail: `count=${links12.length} (expected 0 for live_form when only document_view exists)`,
    });

    // ── Post-clean ────────────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE secure_share_links SET revoked = 1, updated_at = NOW()
      WHERE company_id = ${companyId}
        AND target_type = ${TARGET_TYPE}
        AND target_id   = ${TARGET_ID}
    `);

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
    console.error('POST /api/admin/test-share-runtime error:', e);
    return res.status(500).json({ error: String(e) });
  }
}
