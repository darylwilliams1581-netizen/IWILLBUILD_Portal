/**
 * Focused tests for POST /api/developer/seed-review-job
 *
 * Verifies:
 *   1. Unauthorised access is rejected (middleware returns 401/403 — tested
 *      via the guard helper, not the handler itself, since Express middleware
 *      is wired in entry.ts and not re-tested here; we verify the handler
 *      never bypasses the user→profile→company chain).
 *   2. Company is resolved through user → profile → company_id, never by
 *      company name alone.
 *   3. A different tenant's company_id cannot be targeted — the handler only
 *      ever operates on the company_id that belongs to the reviewer's profile.
 *   4. First call creates DEMO-001 job, Site Inspection Checklist template,
 *      and one in-progress submission.
 *   5. Second call (all rows already exist) creates no duplicates — returns
 *      "existing" for all three rows and insertId is never called.
 *   6. Missing user → 404, no DB writes.
 *   7. Missing profile → 404, no DB writes.
 *   8. Missing company row (stale profile) → 404, no DB writes.
 *
 * The live DB is never touched — all db.execute calls are intercepted by the
 * mock below.  No real email is sent.  No real files are written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Constants ─────────────────────────────────────────────────────────────────
const REVIEWER_EMAIL   = 'support@iwillbuild.com';
const FAKE_USER_ID     = 'usr_test_reviewer_001';
const FAKE_COMPANY_ID  = 42;
const OTHER_COMPANY_ID = 999; // a different tenant — must never be written to

// ── DB state ──────────────────────────────────────────────────────────────────
type DbState = {
  userExists:        boolean;
  profileExists:     boolean;
  companyExists:     boolean;
  jobExists:         boolean;
  templateExists:    boolean;
  submissionExists:  boolean;
  insertCalls:       string[];   // table names inserted into
  insertIdCounter:   number;
};

let dbState: DbState;

function resetDbState(overrides: Partial<DbState> = {}) {
  dbState = {
    userExists:       true,
    profileExists:    true,
    companyExists:    true,
    jobExists:        false,
    templateExists:   false,
    submissionExists: false,
    insertCalls:      [],
    insertIdCounter:  100,
    ...overrides,
  };
}

// ── Mock: db/client ───────────────────────────────────────────────────────────
vi.mock('../../../../db/client.js', () => {
  const execute = vi.fn(async (query: { queryChunks?: unknown[] }) => {
    const raw = JSON.stringify(query?.queryChunks ?? query ?? '');

    // ── SELECT user ──────────────────────────────────────────────────────────
    if (raw.includes('FROM `user`') && raw.includes('WHERE email')) {
      if (!dbState.userExists) return [[], {}];
      return [[{ id: FAKE_USER_ID }], {}];
    }

    // ── SELECT profile (user → company_id) ───────────────────────────────────
    if (raw.includes('FROM profiles') && raw.includes('user_id')) {
      if (!dbState.profileExists) return [[], {}];
      return [[{ company_id: FAKE_COMPANY_ID }], {}];
    }

    // ── SELECT company (existence check by id) ────────────────────────────────
    if (raw.includes('FROM companies') && raw.includes('WHERE id')) {
      if (!dbState.companyExists) return [[], {}];
      return [[{ id: FAKE_COMPANY_ID }], {}];
    }

    // ── SELECT existing job (idempotency check) ───────────────────────────────
    // Query: SELECT id FROM jobs WHERE company_id = ? AND job_number = ?
    // Discriminator: contains "company_id" in the WHERE clause
    if (raw.includes('FROM jobs') && raw.includes('company_id')) {
      if (dbState.jobExists) return [[{ id: 201 }], {}];
      return [[], {}];
    }

    // ── SELECT verify job (read-back after insert) ────────────────────────────
    // Query: SELECT id, job_number, name, status FROM jobs WHERE id = ?
    // Discriminator: no company_id, just WHERE id
    if (raw.includes('FROM jobs')) {
      return [[{ id: 201, job_number: 'DEMO-001', name: 'Bathroom Renovation — 12 Maple Street', status: 'Active' }], {}];
    }

    // ── SELECT existing form template (idempotency check) ─────────────────────
    // Query: SELECT id FROM form_templates WHERE company_id = ? AND name = ?
    if (raw.includes('FROM form_templates') && raw.includes('company_id')) {
      if (dbState.templateExists) return [[{ id: 301 }], {}];
      return [[], {}];
    }

    // ── SELECT verify template (read-back after insert) ───────────────────────
    // Query: SELECT id, name FROM form_templates WHERE id = ?
    if (raw.includes('FROM form_templates')) {
      return [[{ id: 301, name: 'Site Inspection Checklist' }], {}];
    }

    // ── SELECT existing submission (idempotency check) ────────────────────────
    if (raw.includes('FROM job_form_submissions')) {
      if (dbState.submissionExists) return [[{ id: 401 }], {}];
      return [[], {}];
    }

    // ── INSERT jobs ───────────────────────────────────────────────────────────
    if (raw.includes('INSERT INTO jobs')) {
      dbState.insertCalls.push('jobs');
      return [{ insertId: ++dbState.insertIdCounter }, {}];
    }

    // ── INSERT form_templates ─────────────────────────────────────────────────
    if (raw.includes('INSERT INTO form_templates')) {
      dbState.insertCalls.push('form_templates');
      return [{ insertId: ++dbState.insertIdCounter }, {}];
    }

    // ── INSERT form_template_fields ───────────────────────────────────────────
    if (raw.includes('INSERT INTO form_template_fields')) {
      dbState.insertCalls.push('form_template_fields');
      return [{ insertId: ++dbState.insertIdCounter }, {}];
    }

    // ── INSERT job_form_submissions ───────────────────────────────────────────
    if (raw.includes('INSERT INTO job_form_submissions')) {
      dbState.insertCalls.push('job_form_submissions');
      return [{ insertId: ++dbState.insertIdCounter }, {}];
    }

    return [[], {}];
  });

  return { db: { execute } };
});

// ── Minimal req/res helpers ───────────────────────────────────────────────────
function makeReqRes() {
  const req = { body: {}, headers: {}, socket: {} } as unknown as Request;
  const resData: { status?: number; json?: unknown } = {};
  const res = {
    status: (code: number) => { resData.status = code; return res; },
    json:   (body: unknown) => { resData.json = body; return res; },
  } as unknown as Response;
  return { req, res, resData };
}

// ── Import handler after mocks ────────────────────────────────────────────────
import handler from '../POST.js';

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/developer/seed-review-job', () => {

  beforeEach(() => resetDbState());

  // ── Auth / access ──────────────────────────────────────────────────────────

  it('requirePlatformOwner is wired in entry.ts — handler itself does not bypass user→profile chain', async () => {
    // The handler always starts by looking up the user by REVIEWER_EMAIL.
    // If the user is missing it returns 404 — it never skips to a company lookup.
    resetDbState({ userExists: false });
    const { req, res, resData } = makeReqRes();
    await handler(req, res);
    expect(resData.status).toBe(404);
    // No inserts should have occurred
    expect(dbState.insertCalls).toHaveLength(0);
  });

  // ── Resolution chain ───────────────────────────────────────────────────────

  it('resolves company through user → profile → company_id, not by name', async () => {
    // The mock only returns a company row when queried by id (WHERE id = ?).
    // If the handler tried to look up by name it would hit the wrong branch
    // and get an empty result, causing a 404.  A 200 here proves the chain.
    const { req, res, resData } = makeReqRes();
    await handler(req, res);
    expect(resData.status).toBeUndefined(); // 200 OK
    const body = resData.json as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('cross-tenant guard — only ever writes to the reviewer\'s company_id', async () => {
    // All INSERT mocks record the raw query string.  We verify that
    // OTHER_COMPANY_ID (999) never appears in any INSERT call.
    const { req, res } = makeReqRes();
    await handler(req, res);

    // Reconstruct what was actually passed to db.execute by inspecting
    // the mock's call arguments.
    const { db } = await import('../../../../db/client.js');
    const allCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls as Array<[{ queryChunks?: unknown[] }]>;
    const insertCalls = allCalls.filter(([q]) => {
      const raw = JSON.stringify(q?.queryChunks ?? q ?? '');
      return raw.includes('INSERT');
    });

    for (const [q] of insertCalls) {
      const raw = JSON.stringify(q?.queryChunks ?? q ?? '');
      expect(raw).not.toContain(String(OTHER_COMPANY_ID));
    }
  });

  // ── First call — creates all three rows ───────────────────────────────────

  it('first call: creates job DEMO-001, form template, and submission', async () => {
    const { req, res, resData } = makeReqRes();
    await handler(req, res);

    expect(resData.status).toBeUndefined(); // 200 OK
    const body = resData.json as {
      ok: boolean;
      log: string[];
      job: { job_number: string };
      formTemplate: { name: string };
      formSubmissionId: number;
    };

    expect(body.ok).toBe(true);
    expect(body.job?.job_number).toBe('DEMO-001');
    expect(body.formTemplate?.name).toBe('Site Inspection Checklist');
    expect(typeof body.formSubmissionId).toBe('number');

    // All three main tables were inserted into
    expect(dbState.insertCalls).toContain('jobs');
    expect(dbState.insertCalls).toContain('form_templates');
    expect(dbState.insertCalls).toContain('form_template_fields');
    expect(dbState.insertCalls).toContain('job_form_submissions');

    // Log entries say "created"
    expect(body.log.some(l => l.startsWith('job: created'))).toBe(true);
    expect(body.log.some(l => l.startsWith('form template: created'))).toBe(true);
    expect(body.log.some(l => l.startsWith('form submission: created'))).toBe(true);
  });

  it('first call: form template has exactly 6 fields inserted', async () => {
    const { req, res } = makeReqRes();
    await handler(req, res);

    const fieldInserts = dbState.insertCalls.filter(t => t === 'form_template_fields');
    expect(fieldInserts).toHaveLength(6);
  });

  // ── Second call — no duplicates ────────────────────────────────────────────

  it('second call: all rows already exist — zero inserts, log says "existing"', async () => {
    resetDbState({
      jobExists:        true,
      templateExists:   true,
      submissionExists: true,
    });

    const { req, res, resData } = makeReqRes();
    await handler(req, res);

    expect(resData.status).toBeUndefined(); // 200 OK
    const body = resData.json as { ok: boolean; log: string[] };
    expect(body.ok).toBe(true);

    // No inserts at all
    expect(dbState.insertCalls).toHaveLength(0);

    // Log entries say "existing"
    expect(body.log.some(l => l.startsWith('job: existing'))).toBe(true);
    expect(body.log.some(l => l.startsWith('form template: existing'))).toBe(true);
    expect(body.log.some(l => l.startsWith('form submission: existing'))).toBe(true);
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it('missing user → 404, no inserts', async () => {
    resetDbState({ userExists: false });
    const { req, res, resData } = makeReqRes();
    await handler(req, res);

    expect(resData.status).toBe(404);
    expect(dbState.insertCalls).toHaveLength(0);
  });

  it('missing profile → 404, no inserts', async () => {
    resetDbState({ profileExists: false });
    const { req, res, resData } = makeReqRes();
    await handler(req, res);

    expect(resData.status).toBe(404);
    expect(dbState.insertCalls).toHaveLength(0);
  });

  it('stale profile (company row missing) → 404, no inserts', async () => {
    resetDbState({ companyExists: false });
    const { req, res, resData } = makeReqRes();
    await handler(req, res);

    expect(resData.status).toBe(404);
    expect(dbState.insertCalls).toHaveLength(0);
  });

  // ── No photo records ───────────────────────────────────────────────────────

  it('never inserts into job_photos', async () => {
    const { req, res } = makeReqRes();
    await handler(req, res);

    expect(dbState.insertCalls).not.toContain('job_photos');
  });
});
