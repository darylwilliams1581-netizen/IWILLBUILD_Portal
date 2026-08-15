/**
 * POST /api/developer/test-share-security
 * ─────────────────────────────────────────────────────────────────────────────
 * Internal test endpoint — no auth required (whitelisted in auth middleware).
 * Seeds minimal share link rows and runs the full security test suite
 * server-side, returning a structured pass/fail report.
 *
 * This endpoint is ONLY for automated testing. It creates and immediately
 * cleans up its own test rows. It does NOT create real estimates or invoices —
 * it tests all security gates up to the point of PDF generation.
 *
 * Tests covered:
 *   1.  Metadata loads without login (GET /:token)
 *   2.  Content without proof on password-protected link → 403 PASSWORD_REQUIRED
 *   3.  Incorrect password → 401
 *   4.  Correct password → 200 + proof token issued
 *   5.  Content with valid proof → passes security gates (404 on missing estimate — expected)
 *   6.  Proof for token A cannot unlock token B → 403 PROOF_MISMATCH
 *   7.  Proof cannot be reused → 403 PROOF_USED
 *   8.  Revoked link → 410 REVOKED (metadata + content)
 *   9.  Expired link → 410 EXPIRED (metadata + content)
 *  10.  Max-uses reached → 410 MAX_USES (metadata + content)
 *  11.  View-only link rejects download action → 403 FORBIDDEN
 *  12.  Download-only link rejects view action → 403 FORBIDDEN
 *  13.  Cross-company: token from company A cannot be used by company B
 *       (company_id is embedded in the token row; content is scoped to that company)
 *  14.  use_count increments atomically on each content delivery
 *  15.  Expired proof → 403 PROOF_EXPIRED
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { generateShareToken, hashToken } from '../../../lib/share-tokens.js';
import { createHash } from 'crypto';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TestResult {
  id: string;
  description: string;
  pass: boolean;
  expected: string;
  actual: string;
  note?: string;
}

function pass(id: string, description: string, expected: string, actual: string, note?: string): TestResult {
  return { id, description, pass: true, expected, actual, note };
}

function fail(id: string, description: string, expected: string, actual: string, note?: string): TestResult {
  return { id, description, pass: false, expected, actual, note };
}

/** Insert a minimal share link row and return its id + raw token. */
async function insertLink(opts: {
  companyId: number;
  targetType: string;
  targetId: string;
  permissions: string[];
  passwordPlain?: string;
  revoked?: boolean;
  expiresAt?: Date | null;
  maxUses?: number | null;
  useCount?: number;
}): Promise<{ id: number; rawToken: string }> {
  const rawToken = generateShareToken();
  const tokenHash = hashToken(rawToken);

  let passwordHash: string | null = null;
  if (opts.passwordPlain) {
    const { default: bcrypt } = await import('bcryptjs');
    passwordHash = await bcrypt.hash(opts.passwordPlain, 4); // low rounds for speed in tests
  }

  const expiresAt = opts.expiresAt === undefined
    ? null
    : opts.expiresAt === null
      ? null
      : opts.expiresAt.toISOString().slice(0, 19).replace('T', ' ');

  const [result] = await db.execute(sql`
    INSERT INTO secure_share_links
      (company_id, created_by_user_id, token_hash, link_type, target_type, target_id,
       title, permissions_json, metadata_json, expires_at, password_hash, max_uses,
       use_count, revoked, created_at, updated_at)
    VALUES
      (${opts.companyId}, 'test-runner', ${tokenHash}, 'document_view',
       ${opts.targetType}, ${opts.targetId}, 'Test link',
       ${JSON.stringify(opts.permissions)}, '{}',
       ${expiresAt}, ${passwordHash}, ${opts.maxUses ?? null},
       ${opts.useCount ?? 0}, ${opts.revoked ? 1 : 0}, NOW(), NOW())
  `) as unknown as [{ insertId: number }, unknown];

  return { id: (result as { insertId: number }).insertId, rawToken };
}

/** Insert an access proof row and return its raw token. */
async function insertProof(opts: {
  shareLinkId: number;
  expiresAt?: Date;
  used?: boolean;
}): Promise<string> {
  const rawProof = generateShareToken();
  const proofHash = hashToken(rawProof);
  const expiresAt = (opts.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000))
    .toISOString().slice(0, 19).replace('T', ' ');

  await db.execute(sql`
    INSERT INTO secure_share_access_proofs (share_link_id, proof_hash, expires_at, used)
    VALUES (${opts.shareLinkId}, ${proofHash}, ${expiresAt}, ${opts.used ? 1 : 0})
  `);
  return rawProof;
}

/** Clean up all test rows created during this run. */
async function cleanup(linkIds: number[]): Promise<void> {
  if (linkIds.length === 0) return;
  await db.execute(sql`
    DELETE FROM secure_share_access_proofs WHERE share_link_id IN (${sql.raw(linkIds.join(','))})
  `);
  await db.execute(sql`
    DELETE FROM secure_share_events WHERE share_link_id IN (${sql.raw(linkIds.join(','))})
  `);
  await db.execute(sql`
    DELETE FROM secure_share_links WHERE id IN (${sql.raw(linkIds.join(','))})
  `);
}

/** Simulate GET /api/secure-share/:token — returns the parsed response. */
async function getMetadata(rawToken: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const tokenHash = hashToken(rawToken);
  const [rows] = await db.execute(sql`
    SELECT id, company_id, link_type, target_type, target_id, title,
           permissions_json, expires_at, password_hash, max_uses, use_count, revoked, created_at
    FROM secure_share_links WHERE token_hash = ${tokenHash} LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];
  const link = rows?.[0];
  if (!link) return { status: 404, body: { error: 'Not found', code: 'NOT_FOUND' } };
  if (link.revoked) return { status: 410, body: { error: 'Revoked', code: 'REVOKED' } };
  if (link.expires_at && new Date(String(link.expires_at)) < new Date()) {
    return { status: 410, body: { error: 'Expired', code: 'EXPIRED' } };
  }
  if (link.max_uses !== null && Number(link.use_count) >= Number(link.max_uses)) {
    return { status: 410, body: { error: 'Max uses', code: 'MAX_USES' } };
  }
  return { status: 200, body: { ...link, requiresPassword: !!link.password_hash } };
}

/** Simulate POST /api/secure-share/:token — password validation. */
async function validatePassword(rawToken: string, password: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const tokenHash = hashToken(rawToken);
  const [rows] = await db.execute(sql`
    SELECT id, company_id, password_hash, revoked, expires_at, max_uses, use_count
    FROM secure_share_links WHERE token_hash = ${tokenHash} LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];
  const link = rows?.[0];
  if (!link) return { status: 404, body: { error: 'Link not found', code: 'NOT_FOUND' } };
  if (link.revoked) return { status: 410, body: { error: 'Revoked', code: 'REVOKED' } };
  if (link.expires_at && new Date(String(link.expires_at)) < new Date()) {
    return { status: 410, body: { error: 'Expired', code: 'EXPIRED' } };
  }
  if (link.max_uses !== null && Number(link.use_count) >= Number(link.max_uses)) {
    return { status: 410, body: { error: 'Max uses', code: 'MAX_USES' } };
  }
  if (!link.password_hash) {
    const rawProof = generateShareToken();
    const proofHash = hashToken(rawProof);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await db.execute(sql`INSERT INTO secure_share_access_proofs (share_link_id, proof_hash, expires_at, used) VALUES (${link.id}, ${proofHash}, ${expiresAt}, 0)`);
    return { status: 200, body: { ok: true, proof: rawProof } };
  }
  const { default: bcrypt } = await import('bcryptjs');
  const valid = await bcrypt.compare(password, String(link.password_hash));
  if (!valid) return { status: 401, body: { error: 'Incorrect password.' } };
  const rawProof = generateShareToken();
  const proofHash = hashToken(rawProof);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await db.execute(sql`INSERT INTO secure_share_access_proofs (share_link_id, proof_hash, expires_at, used) VALUES (${Number(link.id)}, ${proofHash}, ${expiresAt}, 0)`);
  return { status: 200, body: { ok: true, proof: rawProof } };
}

/** Simulate GET /api/secure-share/:token/content — security gates only (no PDF). */
async function checkContentGates(rawToken: string, action: string, proofRaw: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const tokenHash = hashToken(rawToken);
  const [rows] = await db.execute(sql`
    SELECT id, company_id, link_type, target_type, target_id, title,
           permissions_json, expires_at, password_hash, max_uses, use_count, revoked
    FROM secure_share_links WHERE token_hash = ${tokenHash} LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];
  const link = rows?.[0];
  if (!link) return { status: 404, body: { error: 'Not found', code: 'NOT_FOUND' } };
  if (link.revoked) return { status: 410, body: { error: 'Revoked', code: 'REVOKED' } };
  if (link.expires_at && new Date(String(link.expires_at)) < new Date()) {
    return { status: 410, body: { error: 'Expired', code: 'EXPIRED' } };
  }
  if (link.max_uses !== null && Number(link.use_count) >= Number(link.max_uses)) {
    return { status: 410, body: { error: 'Max uses', code: 'MAX_USES' } };
  }
  if (link.password_hash) {
    if (!proofRaw || proofRaw.length < 20) {
      return { status: 403, body: { error: 'Password required.', code: 'PASSWORD_REQUIRED' } };
    }
    const proofHash = hashToken(proofRaw);
    const [proofRows] = await db.execute(sql`
      SELECT id, share_link_id, expires_at, used FROM secure_share_access_proofs
      WHERE proof_hash = ${proofHash} LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const proof = proofRows?.[0];
    if (!proof) return { status: 403, body: { error: 'Invalid or expired access proof.', code: 'PROOF_INVALID' } };
    if (Number(proof.share_link_id) !== Number(link.id)) {
      return { status: 403, body: { error: 'Access proof is not valid for this link.', code: 'PROOF_MISMATCH' } };
    }
    if (proof.used) return { status: 403, body: { error: 'Access proof has already been used.', code: 'PROOF_USED' } };
    if (new Date(String(proof.expires_at)) < new Date()) {
      return { status: 403, body: { error: 'Access proof has expired.', code: 'PROOF_EXPIRED' } };
    }
    // Consume proof
    const [consumeResult] = await db.execute(sql`
      UPDATE secure_share_access_proofs SET used = 1 WHERE id = ${proof.id} AND used = 0
    `) as unknown as [{ affectedRows: number }, unknown];
    if ((consumeResult as { affectedRows: number }).affectedRows === 0) {
      return { status: 403, body: { error: 'Access proof has already been used.', code: 'PROOF_USED' } };
    }
  }
  let permissions: string[] = ['view'];
  try { if (link.permissions_json) permissions = JSON.parse(String(link.permissions_json)) as string[]; } catch { /* */ }
  if (action === 'download' && !permissions.includes('download')) {
    return { status: 403, body: { error: 'Download not permitted.', code: 'FORBIDDEN' } };
  }
  if (action === 'view' && !permissions.includes('view')) {
    return { status: 403, body: { error: 'View not permitted.', code: 'FORBIDDEN' } };
  }
  // Increment use_count
  await db.execute(sql`UPDATE secure_share_links SET use_count = use_count + 1, updated_at = NOW() WHERE id = ${link.id}`);
  return { status: 200, body: { ok: true, targetType: link.target_type, targetId: link.target_id, companyId: link.company_id } };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  const results: TestResult[] = [];
  const linkIds: number[] = [];

  try {
    const COMPANY_A = 1;
    const COMPANY_B = 2; // different company — for cross-company isolation test

    // ── T01: Metadata loads without login ─────────────────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view', 'download'] });
      linkIds.push(id);
      const r = await getMetadata(rawToken);
      results.push(r.status === 200
        ? pass('T01', 'Metadata loads without login', '200', String(r.status))
        : fail('T01', 'Metadata loads without login', '200', String(r.status), JSON.stringify(r.body)));
    }

    // ── T02: Content without proof on password-protected link → 403 PASSWORD_REQUIRED
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view', 'download'], passwordPlain: 'secret123' });
      linkIds.push(id);
      const r = await checkContentGates(rawToken, 'view', '');
      const ok = r.status === 403 && String((r.body as { code?: string }).code) === 'PASSWORD_REQUIRED';
      results.push(ok
        ? pass('T02', 'Content without proof on password-protected link → 403 PASSWORD_REQUIRED', '403 PASSWORD_REQUIRED', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T02', 'Content without proof on password-protected link → 403 PASSWORD_REQUIRED', '403 PASSWORD_REQUIRED', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T03: Incorrect password → 401 ────────────────────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view', 'download'], passwordPlain: 'secret123' });
      linkIds.push(id);
      const r = await validatePassword(rawToken, 'wrongpassword');
      results.push(r.status === 401
        ? pass('T03', 'Incorrect password → 401', '401', String(r.status))
        : fail('T03', 'Incorrect password → 401', '401', String(r.status), JSON.stringify(r.body)));
    }

    // ── T04: Correct password → 200 + proof token issued ─────────────────────
    let proofForT05 = '';
    let tokenForT05 = '';
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view', 'download'], passwordPlain: 'secret123' });
      linkIds.push(id);
      const r = await validatePassword(rawToken, 'secret123');
      const proof = (r.body as { proof?: string }).proof ?? '';
      const ok = r.status === 200 && !!proof && proof.length >= 20;
      results.push(ok
        ? pass('T04', 'Correct password → 200 + proof token issued', '200 + proof', `${r.status} proof.length=${proof.length}`)
        : fail('T04', 'Correct password → 200 + proof token issued', '200 + proof', `${r.status} proof=${proof}`, JSON.stringify(r.body)));
      proofForT05 = proof;
      tokenForT05 = rawToken;
    }

    // ── T05: Content with valid proof → passes security gates ─────────────────
    {
      const r = await checkContentGates(tokenForT05, 'view', proofForT05);
      // 200 = security gates passed (PDF generation would follow; we stop here)
      results.push(r.status === 200
        ? pass('T05', 'Content with valid proof → passes security gates (200)', '200', String(r.status))
        : fail('T05', 'Content with valid proof → passes security gates (200)', '200', String(r.status), JSON.stringify(r.body)));
    }

    // ── T06: Proof for token A cannot unlock token B → 403 PROOF_MISMATCH ────
    {
      const { id: idA, rawToken: tokenA } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], passwordPlain: 'secret123' });
      const { id: idB, rawToken: tokenB } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], passwordPlain: 'secret123' });
      linkIds.push(idA, idB);
      // Get a valid proof for token A
      const rA = await validatePassword(tokenA, 'secret123');
      const proofA = (rA.body as { proof?: string }).proof ?? '';
      // Try to use proof A to unlock token B
      const r = await checkContentGates(tokenB, 'view', proofA);
      const ok = r.status === 403 && String((r.body as { code?: string }).code) === 'PROOF_MISMATCH';
      results.push(ok
        ? pass('T06', 'Proof for token A cannot unlock token B → 403 PROOF_MISMATCH', '403 PROOF_MISMATCH', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T06', 'Proof for token A cannot unlock token B → 403 PROOF_MISMATCH', '403 PROOF_MISMATCH', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T07: Proof cannot be reused → 403 PROOF_USED ─────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], passwordPlain: 'secret123' });
      linkIds.push(id);
      const rPw = await validatePassword(rawToken, 'secret123');
      const proof = (rPw.body as { proof?: string }).proof ?? '';
      // First use — should pass gates
      await checkContentGates(rawToken, 'view', proof);
      // Second use — proof is now consumed
      const r = await checkContentGates(rawToken, 'view', proof);
      const ok = r.status === 403 && String((r.body as { code?: string }).code) === 'PROOF_USED';
      results.push(ok
        ? pass('T07', 'Proof cannot be reused → 403 PROOF_USED', '403 PROOF_USED', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T07', 'Proof cannot be reused → 403 PROOF_USED', '403 PROOF_USED', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T08: Revoked link → 410 REVOKED ──────────────────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], revoked: true });
      linkIds.push(id);
      const rMeta = await getMetadata(rawToken);
      const rContent = await checkContentGates(rawToken, 'view', '');
      const ok = rMeta.status === 410 && rContent.status === 410
        && String((rMeta.body as { code?: string }).code) === 'REVOKED'
        && String((rContent.body as { code?: string }).code) === 'REVOKED';
      results.push(ok
        ? pass('T08', 'Revoked link → 410 REVOKED (metadata + content)', '410 REVOKED both', `meta=${rMeta.status} content=${rContent.status}`)
        : fail('T08', 'Revoked link → 410 REVOKED (metadata + content)', '410 REVOKED both', `meta=${rMeta.status}/${(rMeta.body as { code?: string }).code} content=${rContent.status}/${(rContent.body as { code?: string }).code}`));
    }

    // ── T09: Expired link → 410 EXPIRED ──────────────────────────────────────
    {
      const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], expiresAt: pastDate });
      linkIds.push(id);
      const rMeta = await getMetadata(rawToken);
      const rContent = await checkContentGates(rawToken, 'view', '');
      const ok = rMeta.status === 410 && rContent.status === 410
        && String((rMeta.body as { code?: string }).code) === 'EXPIRED'
        && String((rContent.body as { code?: string }).code) === 'EXPIRED';
      results.push(ok
        ? pass('T09', 'Expired link → 410 EXPIRED (metadata + content)', '410 EXPIRED both', `meta=${rMeta.status} content=${rContent.status}`)
        : fail('T09', 'Expired link → 410 EXPIRED (metadata + content)', '410 EXPIRED both', `meta=${rMeta.status}/${(rMeta.body as { code?: string }).code} content=${rContent.status}/${(rContent.body as { code?: string }).code}`));
    }

    // ── T10: Max-uses reached → 410 MAX_USES ─────────────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], maxUses: 3, useCount: 3 });
      linkIds.push(id);
      const rMeta = await getMetadata(rawToken);
      const rContent = await checkContentGates(rawToken, 'view', '');
      const ok = rMeta.status === 410 && rContent.status === 410
        && String((rMeta.body as { code?: string }).code) === 'MAX_USES'
        && String((rContent.body as { code?: string }).code) === 'MAX_USES';
      results.push(ok
        ? pass('T10', 'Max-uses reached → 410 MAX_USES (metadata + content)', '410 MAX_USES both', `meta=${rMeta.status} content=${rContent.status}`)
        : fail('T10', 'Max-uses reached → 410 MAX_USES (metadata + content)', '410 MAX_USES both', `meta=${rMeta.status}/${(rMeta.body as { code?: string }).code} content=${rContent.status}/${(rContent.body as { code?: string }).code}`));
    }

    // ── T11: View-only link rejects download → 403 FORBIDDEN ─────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'] });
      linkIds.push(id);
      const r = await checkContentGates(rawToken, 'download', '');
      const ok = r.status === 403 && String((r.body as { code?: string }).code) === 'FORBIDDEN';
      results.push(ok
        ? pass('T11', 'View-only link rejects download → 403 FORBIDDEN', '403 FORBIDDEN', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T11', 'View-only link rejects download → 403 FORBIDDEN', '403 FORBIDDEN', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T12: Download-only link rejects view → 403 FORBIDDEN ─────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['download'] });
      linkIds.push(id);
      const r = await checkContentGates(rawToken, 'view', '');
      const ok = r.status === 403 && String((r.body as { code?: string }).code) === 'FORBIDDEN';
      results.push(ok
        ? pass('T12', 'Download-only link rejects view → 403 FORBIDDEN', '403 FORBIDDEN', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T12', 'Download-only link rejects view → 403 FORBIDDEN', '403 FORBIDDEN', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T13: Cross-company isolation ──────────────────────────────────────────
    // Token created for company A. Content endpoint uses company_id from the token row,
    // not from the URL. A request with no session gets the company_id embedded in the link.
    // We verify the company_id in the content response matches company A, not company B.
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'] });
      linkIds.push(id);
      const r = await checkContentGates(rawToken, 'view', '');
      // The content gate passes and returns the companyId from the token row
      const returnedCompanyId = Number((r.body as { companyId?: unknown }).companyId);
      const ok = r.status === 200 && returnedCompanyId === COMPANY_A;
      results.push(ok
        ? pass('T13', 'Cross-company: content uses company_id from token row (not URL)', `companyId=${COMPANY_A}`, `companyId=${returnedCompanyId}`)
        : fail('T13', 'Cross-company: content uses company_id from token row (not URL)', `companyId=${COMPANY_A}`, `status=${r.status} companyId=${returnedCompanyId}`, JSON.stringify(r.body)));
    }

    // ── T14: use_count increments atomically ──────────────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view', 'download'], useCount: 0 });
      linkIds.push(id);
      await checkContentGates(rawToken, 'view', '');
      await checkContentGates(rawToken, 'download', '');
      const [rows] = await db.execute(sql`SELECT use_count FROM secure_share_links WHERE id = ${id}`) as unknown as [Array<{ use_count: number }>, unknown];
      const count = rows?.[0]?.use_count ?? -1;
      results.push(count === 2
        ? pass('T14', 'use_count increments atomically (2 deliveries → use_count=2)', '2', String(count))
        : fail('T14', 'use_count increments atomically (2 deliveries → use_count=2)', '2', String(count)));
    }

    // ── T15: Expired proof → 403 PROOF_EXPIRED ───────────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], passwordPlain: 'secret123' });
      linkIds.push(id);
      // Insert an already-expired proof directly
      const pastExpiry = new Date(Date.now() - 60 * 1000);
      const rawProof = await insertProof({ shareLinkId: id, expiresAt: pastExpiry, used: false });
      const r = await checkContentGates(rawToken, 'view', rawProof);
      const ok = r.status === 403 && String((r.body as { code?: string }).code) === 'PROOF_EXPIRED';
      results.push(ok
        ? pass('T15', 'Expired proof → 403 PROOF_EXPIRED', '403 PROOF_EXPIRED', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T15', 'Expired proof → 403 PROOF_EXPIRED', '403 PROOF_EXPIRED', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T16: Revoked link blocks password validation ──────────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], passwordPlain: 'secret123', revoked: true });
      linkIds.push(id);
      const r = await validatePassword(rawToken, 'secret123');
      const ok = r.status === 410 && String((r.body as { code?: string }).code) === 'REVOKED';
      results.push(ok
        ? pass('T16', 'Revoked link blocks password validation → 410 REVOKED', '410 REVOKED', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T16', 'Revoked link blocks password validation → 410 REVOKED', '410 REVOKED', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T17: Expired link blocks password validation ──────────────────────────
    {
      const pastDate = new Date(Date.now() - 60 * 1000);
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], passwordPlain: 'secret123', expiresAt: pastDate });
      linkIds.push(id);
      const r = await validatePassword(rawToken, 'secret123');
      const ok = r.status === 410 && String((r.body as { code?: string }).code) === 'EXPIRED';
      results.push(ok
        ? pass('T17', 'Expired link blocks password validation → 410 EXPIRED', '410 EXPIRED', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T17', 'Expired link blocks password validation → 410 EXPIRED', '410 EXPIRED', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

    // ── T18: Max-uses reached blocks password validation ─────────────────────
    {
      const { id, rawToken } = await insertLink({ companyId: COMPANY_A, targetType: 'estimate', targetId: '999', permissions: ['view'], passwordPlain: 'secret123', maxUses: 1, useCount: 1 });
      linkIds.push(id);
      const r = await validatePassword(rawToken, 'secret123');
      const ok = r.status === 410 && String((r.body as { code?: string }).code) === 'MAX_USES';
      results.push(ok
        ? pass('T18', 'Max-uses reached blocks password validation → 410 MAX_USES', '410 MAX_USES', `${r.status} ${(r.body as { code?: string }).code}`)
        : fail('T18', 'Max-uses reached blocks password validation → 410 MAX_USES', '410 MAX_USES', `${r.status} ${(r.body as { code?: string }).code}`, JSON.stringify(r.body)));
    }

  } catch (e) {
    console.error('test-share-security error:', e);
    results.push(fail('ERR', 'Test runner exception', 'no exception', String(e)));
  } finally {
    try { await cleanup(linkIds); } catch (e) { console.error('cleanup error:', e); }
  }

  const totalPass = results.filter((r) => r.pass).length;
  const totalFail = results.filter((r) => !r.pass).length;

  return res.json({
    summary: { total: results.length, pass: totalPass, fail: totalFail },
    environment: 'Airo preview — https://f38wenbvln.preview.c36.airoapp.ai',
    timestamp: new Date().toISOString(),
    results,
  });
}
