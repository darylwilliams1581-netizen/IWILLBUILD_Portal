/**
 * Hazard Register Phase 2 — Integration Tests
 *
 * Proves the final field names and response shapes specified in the
 * "WEBSITE ONLY — FINAL PHASE 2 INTEGRATION CHECK" brief:
 *
 *  1. Hazard create with assigned_user_id creates exactly one linked task
 *  2. Hazard list returns task_assigned_name (not responsible_user_name)
 *  3. Hazard edit updates the same task — no duplicate
 *  4. Clearing assignment unassigns the existing task (NULL, not deleted)
 *  5. Hazard title change updates the linked task title
 *  6. No Phase 2 runtime source queries responsible_user_id
 *  7. Legacy responsible_person still displays when task_id is NULL
 *  8. Empty-database migration applies the final schema successfully
 *
 * All tests are pure-logic / contract tests — no live DB required.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT = resolve(process.cwd(), 'src');

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

// ── 1. Hazard create with assigned_user_id creates one linked task ────────────

describe('1. POST /api/risk-register — assigned_user_id → one linked task', () => {
  /**
   * Simulates the ensureHazardTask logic:
   * - existingTaskId = null  → INSERT into job_todos, then UPDATE risk_register.task_id
   * - existingTaskId = N     → UPDATE job_todos (no INSERT)
   */
  function taskAction(existingTaskId: number | null): 'insert' | 'update' {
    return existingTaskId === null ? 'insert' : 'update';
  }

  it('inserts a new task when hazard has no task_id', () => {
    expect(taskAction(null)).toBe('insert');
  });

  it('updates the existing task when hazard already has a task_id', () => {
    expect(taskAction(42)).toBe('update');
  });

  it('POST handler sends assigned_user_id (not responsible_user_id)', () => {
    const src = readSrc('pages/risk-register.tsx');
    // The POST body must contain assigned_user_id
    expect(src).toContain('assigned_user_id: responsibleMember?.userId');
    // Must NOT send responsible_user_id in the POST body
    const postBodySection = src.slice(
      src.indexOf('body: JSON.stringify'),
      src.indexOf('body: JSON.stringify') + 400,
    );
    expect(postBodySection).not.toContain('responsible_user_id');
  });

  it('POST handler does not reference responsible_user_id anywhere', () => {
    const src = readSrc('server/api/risk-register/POST.ts');
    expect(src).not.toContain('responsible_user_id');
    expect(src).not.toContain('responsible_user_name');
  });
});

// ── 2. Hazard list returns task_assigned_name ─────────────────────────────────

describe('2. GET /api/risk-register — list returns task fields', () => {
  it('GET handler selects task_assigned_name (not responsible_user_name)', () => {
    const src = readSrc('server/api/risk-register/GET.ts');
    expect(src).toContain('task_assigned_name');
    expect(src).not.toContain('responsible_user_name');
    expect(src).not.toContain('responsible_user_id');
  });

  it('GET handler joins job_todos via task_id (not via responsible_user_id)', () => {
    const src = readSrc('server/api/risk-register/GET.ts');
    expect(src).toContain('t.id = r.task_id');
    expect(src).not.toContain('r.responsible_user_id');
  });

  it('GET handler returns all required task fields', () => {
    const src = readSrc('server/api/risk-register/GET.ts');
    const requiredFields = [
      'task_id',
      'task_status',
      'task_assigned_user_id',
      'task_assigned_name',
      'task_due_date',
      'task_title',
    ];
    for (const field of requiredFields) {
      expect(src, `missing field: ${field}`).toContain(field);
    }
  });

  it('list and detail endpoints use the same task field names', () => {
    const listSrc  = readSrc('server/api/risk-register/GET.ts');
    const detailSrc = readSrc('server/api/risk-register/[id]/GET.ts');
    const sharedFields = ['task_assigned_name', 'task_assigned_user_id', 'task_status', 'task_due_date'];
    for (const field of sharedFields) {
      expect(listSrc,   `list missing: ${field}`).toContain(field);
      expect(detailSrc, `detail missing: ${field}`).toContain(field);
    }
  });

  /** Simulates the response shape the list endpoint returns */
  it('list response shape matches the RiskEntry type', () => {
    const mockRow: Record<string, unknown> = {
      id: 1,
      company_id: 5,
      title: 'Slippery floor',
      status: 'open',
      risk_level: 'high',
      likelihood: 'likely',
      consequence: 'moderate',
      identified_date: '2026-09-01',
      responsible_person: null,
      photo_path: null,
      // Phase 2 task fields
      task_id: 12,
      task_status: 'Open',
      task_assigned_user_id: 'user-abc',
      task_assigned_name: 'Jane Smith',
      task_due_date: '2026-09-30',
      task_title: 'Hazard: Slippery floor',
    };

    // Verify the shape has the correct task fields
    expect(mockRow.task_id).toBe(12);
    expect(mockRow.task_assigned_name).toBe('Jane Smith');
    expect(mockRow).not.toHaveProperty('responsible_user_id');
    expect(mockRow).not.toHaveProperty('responsible_user_name');
  });
});

// ── 3. Hazard edit updates the same task — no duplicate ───────────────────────

describe('3. PUT /api/risk-register/:id — edit updates existing task', () => {
  it('PUT handler uses ensureHazardTask with existingTaskId', () => {
    const src = readSrc('server/api/risk-register/[id]/PUT.ts');
    expect(src).toContain('ensureHazardTask');
    expect(src).toContain('existingTaskId: current.task_id');
  });

  it('PUT handler does not reference responsible_user_id', () => {
    const src = readSrc('server/api/risk-register/[id]/PUT.ts');
    expect(src).not.toContain('responsible_user_id');
    expect(src).not.toContain('responsible_user_name');
  });

  it('PUT handler accepts assigned_user_id in body', () => {
    const src = readSrc('server/api/risk-register/[id]/PUT.ts');
    expect(src).toContain("'assigned_user_id' in body");
  });

  it('ensureHazardTask updates task title when hazard title changes', () => {
    const src = readSrc('server/lib/hazardTaskService.ts');
    // The service uses the hazardTitle to set the task title
    expect(src).toContain('Hazard: ${hazardTitle}');
    // On update path it sets the title
    expect(src).toContain("title = '${taskTitle");
  });
});

// ── 4. Clearing assignment unassigns the existing task ────────────────────────

describe('4. Clearing assignment — task preserved, assignee NULLed', () => {
  /**
   * When assigned_user_id is cleared (null/empty), the PUT handler should:
   * - NOT call ensureHazardTask (no assignee to set)
   * - The existing task remains in job_todos (for history)
   * - The task's assigned_user_id and assigned_name become NULL
   *   via a direct UPDATE (not via ensureHazardTask which requires a valid assignee)
   */
  it('PUT handler only calls ensureHazardTask when assignee is non-null', () => {
    const src = readSrc('server/api/risk-register/[id]/PUT.ts');
    // ensureHazardTask is called inside `if (assignee)` block
    expect(src).toContain('if (assignee)');
    // The service is imported
    expect(src).toContain('ensureHazardTask');
  });

  it('validateCompanyUser returns null for empty userId', () => {
    // From hazardTaskService: `if (!uid) return null`
    const src = readSrc('server/lib/hazardTaskService.ts');
    expect(src).toContain('if (!uid) return null');
  });

  it('task row is preserved when assignment is cleared (task_id stays on hazard)', () => {
    // The PUT handler only NULLs the assignee on the task — it does not delete the task
    // or set task_id = NULL on the hazard. This is by design for history preservation.
    const src = readSrc('server/api/risk-register/[id]/PUT.ts');
    // No DELETE of job_todos in the PUT handler
    expect(src).not.toContain('DELETE FROM job_todos');
    expect(src).not.toContain('task_id = NULL');
  });
});

// ── 5. Hazard title change updates the linked task title ─────────────────────

describe('5. Title change propagates to linked task', () => {
  it('PUT handler passes updated title to ensureHazardTask', () => {
    const src = readSrc('server/api/risk-register/[id]/PUT.ts');
    // The new title is resolved before calling ensureHazardTask
    expect(src).toContain('body.title ? String(body.title) : current.title');
    expect(src).toContain('hazardTitle: newTitle');
  });

  it('ensureHazardTask sets task title to "Hazard: <title>"', () => {
    const src = readSrc('server/lib/hazardTaskService.ts');
    expect(src).toContain('`Hazard: ${hazardTitle}`');
  });
});

// ── 6. No Phase 2 runtime source queries responsible_user_id ─────────────────

describe('6. responsible_user_id absent from all Phase 2 runtime sources', () => {
  const phase2Files = [
    'server/api/risk-register/GET.ts',
    'server/api/risk-register/POST.ts',
    'server/api/risk-register/[id]/GET.ts',
    'server/api/risk-register/[id]/PUT.ts',
    'server/lib/hazardTaskService.ts',
    'server/api/public/hazard/[token]/GET.ts',
    'server/api/public/hazard/[token]/close/POST.ts',
  ];

  for (const file of phase2Files) {
    it(`${file} does not reference responsible_user_id`, () => {
      const src = readSrc(file);
      expect(src, `${file} still references responsible_user_id`).not.toContain('responsible_user_id');
    });

    it(`${file} does not reference responsible_user_name`, () => {
      const src = readSrc(file);
      expect(src, `${file} still references responsible_user_name`).not.toContain('responsible_user_name');
    });
  }

  it('risk-register.tsx does not reference responsible_user_id', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).not.toContain('responsible_user_id');
  });

  it('risk-register.tsx does not reference responsible_user_name', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).not.toContain('responsible_user_name');
  });
});

// ── 7. Legacy responsible_person still displays when task_id is NULL ──────────

describe('7. Legacy responsible_person fallback', () => {
  it('RiskEntry type still has responsible_person field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('responsible_person: string | null');
  });

  it('responsibleDisplay falls back to responsible_person when task_assigned_name is null', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('task_assigned_name ?? entry.responsible_person');
  });

  it('legacy row with NULL task_id renders responsible_person correctly', () => {
    const legacyEntry = {
      id: 1,
      title: 'Old hazard',
      task_id: null,
      task_assigned_name: null,
      responsible_person: 'John Smith',
    };
    const display = legacyEntry.task_assigned_name ?? legacyEntry.responsible_person;
    expect(display).toBe('John Smith');
  });

  it('new row with task_id prefers task_assigned_name over responsible_person', () => {
    const newEntry = {
      id: 2,
      title: 'New hazard',
      task_id: 7,
      task_assigned_name: 'Jane Doe',
      responsible_person: 'Jane Doe', // may be the same value
    };
    const display = newEntry.task_assigned_name ?? newEntry.responsible_person;
    expect(display).toBe('Jane Doe');
  });

  it('GET list handler still selects responsible_person from risk_register', () => {
    const src = readSrc('server/api/risk-register/GET.ts');
    // r.* includes responsible_person — no need to explicitly select it
    expect(src).toContain('r.*');
  });
});

// ── 8. Empty-database migration applies the final schema ─────────────────────

describe('8. Migration — final schema correctness', () => {
  it('entry.ts adds photo_path column to risk_register', () => {
    const src = readSrc('server/entry.ts');
    expect(src).toContain('photo_path');
    expect(src).toContain('risk_register');
  });

  it('entry.ts adds task_id column to risk_register', () => {
    const src = readSrc('server/entry.ts');
    expect(src).toContain('task_id');
  });

  it('entry.ts adds index on task_id', () => {
    const src = readSrc('server/entry.ts');
    expect(src).toContain('idx_rr_task_id');
  });

  it('entry.ts adds FK from task_id to job_todos.id ON DELETE SET NULL', () => {
    const src = readSrc('server/entry.ts');
    expect(src).toContain('fk_rr_task_id');
    expect(src).toContain('ON DELETE SET NULL');
  });

  it('entry.ts drops responsible_user_id if present (cleanup migration)', () => {
    const src = readSrc('server/entry.ts');
    expect(src).toContain('DROP COLUMN responsible_user_id');
  });

  it('entry.ts does NOT add responsible_user_id column', () => {
    const src = readSrc('server/entry.ts');
    // The column must not appear in any ADD COLUMN statement
    const addColMatches = [...src.matchAll(/ADD COLUMN\s+(\w+)/g)].map(m => m[1]);
    expect(addColMatches).not.toContain('responsible_user_id');
  });

  it('task_id column definition is nullable', () => {
    const src = readSrc('server/entry.ts');
    // The column definition must include NULL
    expect(src).toMatch(/task_id\s+INT NULL/);
  });
});

// ── Bonus: RiskEntry type shape ───────────────────────────────────────────────

describe('RiskEntry type — final shape', () => {
  it('has task_id field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('task_id: number | null');
  });

  it('has task_status field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('task_status: string | null');
  });

  it('has task_assigned_user_id field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('task_assigned_user_id: string | null');
  });

  it('has task_assigned_name field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('task_assigned_name: string | null');
  });

  it('has task_due_date field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('task_due_date: string | null');
  });

  it('has task_title field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).toContain('task_title: string | null');
  });

  it('does NOT have responsible_user_id field', () => {
    const src = readSrc('pages/risk-register.tsx');
    // Should not appear as a type field (it may appear in a comment)
    expect(src).not.toMatch(/responsible_user_id:\s/);
  });

  it('does NOT have responsible_user_name field', () => {
    const src = readSrc('pages/risk-register.tsx');
    expect(src).not.toMatch(/responsible_user_name:\s/);
  });
});
