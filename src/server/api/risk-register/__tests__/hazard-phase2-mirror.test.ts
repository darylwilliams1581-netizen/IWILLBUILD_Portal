import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const runtimeFiles = [
  'src/server/api/risk-register/GET.ts',
  'src/server/api/risk-register/POST.ts',
  'src/server/api/risk-register/[id]/GET.ts',
  'src/server/api/risk-register/[id]/PUT.ts',
  'src/server/lib/hazardTaskService.ts',
  'src/server/api/public/hazard/[token]/GET.ts',
  'src/server/api/public/hazard/[token]/close/POST.ts',
  'src/pages/risk-register.tsx',
];

describe('Hazard Register Phase 2 mirror', () => {
  it('uses the linked task model without direct user columns', () => {
    const runtime = runtimeFiles.map(read).join('\n');
    expect(runtime).not.toContain('responsible_user_id');
    expect(runtime).not.toContain('responsible_user_name');
    expect(runtime).toContain('risk_register');
    expect(runtime).toContain('task_id');
  });

  it.each([
    'task_id',
    'task_status',
    'task_assigned_user_id',
    'task_assigned_name',
    'task_due_date',
    'task_title',
  ])('returns %s from list and detail', field => {
    expect(read('src/server/api/risk-register/GET.ts')).toContain(field);
    expect(read('src/server/api/risk-register/[id]/GET.ts')).toContain(field);
  });

  it('joins tasks through the company-scoped task id', () => {
    const list = read('src/server/api/risk-register/GET.ts');
    expect(list).toContain('t.id = r.task_id AND t.company_id = r.company_id');
  });

  it('sends assigned_user_id and displays legacy text only as fallback', () => {
    const page = read('src/pages/risk-register.tsx');
    expect(page).toContain("assigned_user_id: ''");
    expect(page).toContain('entry.task_assigned_name || entry.responsible_person');
  });

  it('updates an existing task and clears its assignment without deleting it', () => {
    const service = read('src/server/lib/hazardTaskService.ts');
    expect(service).toContain('if (taskId)');
    expect(service).toContain('update.assignedUserId = assignedUserId ?? null');
    expect(service).toContain('update.assignedName = assignedName ?? null');
    expect(service).toContain('if (!assignmentProvided || !assignedUserId) return null');
  });

  it('keeps hazard and task closure synchronized', () => {
    expect(read('src/server/api/risk-register/[id]/PUT.ts')).toContain('completeLinkedTask');
    expect(read('src/server/api/tasks/[id]/PUT.ts')).toContain('closeLinkedHazard');
    expect(read('src/server/api/public/hazard/[token]/close/POST.ts')).toContain('completeLinkedTask');
  });

  it('stores only hashed external tokens', () => {
    const share = read('src/server/api/risk-register/[id]/share-token/POST.ts');
    expect(share).toContain("createHash('sha256')");
    expect(share).toContain('token_hash');
    expect(share).toContain('token: rawToken');
  });

  it('keeps the public response limited to one hazard', () => {
    const publicGet = read('src/server/api/public/hazard/[token]/GET.ts');
    expect(publicGet).toContain('WHERE st.token_hash = ${tokenHash}');
    expect(publicGet).not.toContain('hazard_public_comments');
    expect(publicGet).not.toContain('created_by_user_id');
  });

  it('uses a dedicated validated photo namespace', () => {
    expect(read('src/server/storage/r2Config.ts')).toContain("'hazard-photos'");
    expect(read('src/server/storage/uploadPolicy.ts')).toContain("'hazard-photos':       IMAGE_POLICY");
    expect(read('src/server/api/risk-register/[id]/photo/POST.ts')).toContain("logicalNamespace: 'hazard-photos'");
  });

  it('registers specific hazard routes before the generic id route', () => {
    const entry = read('src/server/entry.ts');
    expect(entry.indexOf('app.get("/api/risk-register/:id/photo-url"')).toBeGreaterThan(-1);
    expect(entry.indexOf('app.get("/api/risk-register/:id/photo-url"')).toBeLessThan(entry.indexOf('app.get("/api/risk-register/:id",'));
  });

  it('creates nullable indexed task linkage and sharing tables', () => {
    const entry = read('src/server/entry.ts');
    expect(entry).toContain('task_id             INT NULL');
    expect(entry).toContain('idx_rr_task_id');
    expect(entry).toContain('ON DELETE SET NULL');
    expect(entry).toContain('CREATE TABLE IF NOT EXISTS hazard_share_tokens');
    expect(entry).toContain('CREATE TABLE IF NOT EXISTS hazard_public_comments');
  });

  it('exposes the public hazard route without opening other risk APIs', () => {
    const auth = read('src/server/lib/auth-middleware.ts');
    expect(auth).toContain("pattern: /^\\/api\\/public\\/hazard\\/[^/]+$/");
    expect(auth).toContain("pattern: /^\\/api\\/public\\/hazard\\/[^/]+\\/close$/");
    expect(auth).not.toContain("pattern: /^\\/api\\/risk-register");
  });
});
