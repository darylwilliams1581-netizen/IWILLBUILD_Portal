/**
 * builder-case-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side service for Dazza Builder Cases.
 *
 * SECURITY BOUNDARY (absolute):
 *   - Platform owner only — every function must be called after
 *     getPlatformOwnerInfo() confirms isPlatformOwner === true.
 *   - No secrets, credentials, or API keys are stored in case records.
 *   - No mutation tools — Dazza proposes; Airo applies.
 *   - Marking a case sent_to_airo does NOT resolve the linked bug.
 *   - A bug may only be resolved after verification passes.
 *
 * STAGE 1 BOUNDARY:
 *   Dazza may: read anatomy, diagnose, propose patches, generate Airo prompts.
 *   Dazza must not: write source files, run shell commands, commit, deploy, publish.
 *
 * PERSISTENCE:
 *   All artefacts (diagnosis, patch, airo_prompt, test_plan) are stored as TEXT
 *   in the builder_cases table. No binary content. No secrets.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BuilderCaseStatus =
  | 'draft'
  | 'analysing'
  | 'diagnosis_ready'
  | 'patch_ready'
  | 'awaiting_daryl_review'
  | 'sent_to_airo'
  | 'awaiting_verification'
  | 'verified'
  | 'failed'
  | 'closed';

export type BuilderCaseRisk = 'low' | 'medium' | 'high' | 'critical';

export interface BuilderCaseRow {
  id: string;
  owner_user_id: string;
  title: string;
  requested_result: string | null;
  linked_bug_id: string | null;
  conversation_id: string | null;
  anatomy_snapshot_id: string | null;
  anatomy_commit_sha: string | null;
  anatomy_snapshot_name: string | null;
  source_version: string | null;
  repo_name: string | null;
  status: BuilderCaseStatus;
  risk_level: BuilderCaseRisk | null;
  // Diagnosis
  confirmed_symptom: string | null;
  root_cause: string | null;
  evidence: string | null;
  files_inspected: string | null;
  assumptions: string | null;
  unknowns: string | null;
  // Proposed changes
  proposed_files: string | null;
  change_summary: string | null;
  db_route_impact: string | null;
  security_considerations: string | null;
  rollback_instructions: string | null;
  // Artefacts
  proposed_patch: string | null;
  airo_prompt: string | null;
  test_plan: string | null;
  runtime_checks: string | null;
  // Verification
  verification_notes: string | null;
  resolution_note: string | null;
  // Timestamps
  sent_to_airo_at: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── SQL escape ────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function escStr(s: string | null | undefined): string {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateBuilderCaseInput {
  ownerUserId: string;
  title: string;
  requestedResult?: string | null;
  linkedBugId?: string | null;
  conversationId?: string | null;
  anatomySnapshotId?: string | null;
  anatomyCommitSha?: string | null;
  anatomySnapshotName?: string | null;
  sourceVersion?: string | null;
  repoName?: string | null;
}

export async function createBuilderCase(input: CreateBuilderCaseInput): Promise<BuilderCaseRow> {
  const id = randomUUID();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await db.execute(sql.raw(`
    INSERT INTO builder_cases
      (id, owner_user_id, title, requested_result, linked_bug_id, conversation_id,
       anatomy_snapshot_id, anatomy_commit_sha, anatomy_snapshot_name, source_version,
       repo_name, status, created_at, updated_at)
    VALUES
      (${esc(id)},
       ${esc(input.ownerUserId)},
       ${esc(input.title)},
       ${escStr(input.requestedResult ?? null)},
       ${escStr(input.linkedBugId ?? null)},
       ${escStr(input.conversationId ?? null)},
       ${escStr(input.anatomySnapshotId ?? null)},
       ${escStr(input.anatomyCommitSha ?? null)},
       ${escStr(input.anatomySnapshotName ?? null)},
       ${escStr(input.sourceVersion ?? null)},
       ${escStr(input.repoName ?? null)},
       'draft',
       '${now}',
       '${now}')
  `));

  const row = await getBuilderCase(id, input.ownerUserId);
  if (!row) throw new Error('Failed to create builder case');
  return row;
}

// ── Get ───────────────────────────────────────────────────────────────────────

export async function getBuilderCase(
  id: string,
  ownerUserId: string,
): Promise<BuilderCaseRow | null> {
  const [rows] = await db.execute(sql.raw(`
    SELECT * FROM builder_cases
    WHERE id = ${esc(id)}
      AND owner_user_id = ${esc(ownerUserId)}
    LIMIT 1
  `)) as unknown as [BuilderCaseRow[], unknown];

  return (rows ?? [])[0] ?? null;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listBuilderCases(
  ownerUserId: string,
  opts: { limit?: number; status?: BuilderCaseStatus } = {},
): Promise<BuilderCaseRow[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const statusClause = opts.status ? `AND status = ${esc(opts.status)}` : '';

  const [rows] = await db.execute(sql.raw(`
    SELECT id, owner_user_id, title, requested_result, linked_bug_id, conversation_id,
           anatomy_snapshot_id, anatomy_commit_sha, anatomy_snapshot_name, source_version,
           repo_name, status, risk_level, confirmed_symptom, root_cause,
           proposed_files, airo_prompt, proposed_patch,
           sent_to_airo_at, verified_at, created_at, updated_at
    FROM builder_cases
    WHERE owner_user_id = ${esc(ownerUserId)}
    ${statusClause}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `)) as unknown as [BuilderCaseRow[], unknown];

  return rows ?? [];
}

// ── Update ────────────────────────────────────────────────────────────────────

export type BuilderCaseUpdateInput = Partial<{
  title: string;
  requestedResult: string | null;
  linkedBugId: string | null;
  conversationId: string | null;
  anatomySnapshotId: string | null;
  anatomyCommitSha: string | null;
  anatomySnapshotName: string | null;
  sourceVersion: string | null;
  repoName: string | null;
  status: BuilderCaseStatus;
  riskLevel: BuilderCaseRisk | null;
  // Diagnosis
  confirmedSymptom: string | null;
  rootCause: string | null;
  evidence: string | null;
  filesInspected: string | null;
  assumptions: string | null;
  unknowns: string | null;
  // Proposed changes
  proposedFiles: string | null;
  changeSummary: string | null;
  dbRouteImpact: string | null;
  securityConsiderations: string | null;
  rollbackInstructions: string | null;
  // Artefacts
  proposedPatch: string | null;
  airoPrompt: string | null;
  testPlan: string | null;
  runtimeChecks: string | null;
  // Verification
  verificationNotes: string | null;
  resolutionNote: string | null;
}>;

export async function updateBuilderCase(
  id: string,
  ownerUserId: string,
  input: BuilderCaseUpdateInput,
): Promise<BuilderCaseRow | null> {
  // Verify ownership
  const existing = await getBuilderCase(id, ownerUserId);
  if (!existing) return null;

  const setClauses: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const fieldMap: Record<string, string | null | undefined> = {
    title:                    input.title,
    requested_result:         input.requestedResult,
    linked_bug_id:            input.linkedBugId,
    conversation_id:          input.conversationId,
    anatomy_snapshot_id:      input.anatomySnapshotId,
    anatomy_commit_sha:       input.anatomyCommitSha,
    anatomy_snapshot_name:    input.anatomySnapshotName,
    source_version:           input.sourceVersion,
    repo_name:                input.repoName,
    status:                   input.status,
    risk_level:               input.riskLevel,
    confirmed_symptom:        input.confirmedSymptom,
    root_cause:               input.rootCause,
    evidence:                 input.evidence,
    files_inspected:          input.filesInspected,
    assumptions:              input.assumptions,
    unknowns:                 input.unknowns,
    proposed_files:           input.proposedFiles,
    change_summary:           input.changeSummary,
    db_route_impact:          input.dbRouteImpact,
    security_considerations:  input.securityConsiderations,
    rollback_instructions:    input.rollbackInstructions,
    proposed_patch:           input.proposedPatch,
    airo_prompt:              input.airoPrompt,
    test_plan:                input.testPlan,
    runtime_checks:           input.runtimeChecks,
    verification_notes:       input.verificationNotes,
    resolution_note:          input.resolutionNote,
  };

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val === undefined) continue; // not provided — skip
    setClauses.push(`${col} = ${escStr(val)}`);
  }

  // Handle status-driven timestamp fields
  if (input.status === 'sent_to_airo' && !existing.sent_to_airo_at) {
    setClauses.push(`sent_to_airo_at = '${now}'`);
  }
  if (input.status === 'verified' && !existing.verified_at) {
    setClauses.push(`verified_at = '${now}'`);
  }

  if (setClauses.length === 0) return existing;

  setClauses.push(`updated_at = '${now}'`);

  await db.execute(sql.raw(`
    UPDATE builder_cases
    SET ${setClauses.join(', ')}
    WHERE id = ${esc(id)}
      AND owner_user_id = ${esc(ownerUserId)}
  `));

  return getBuilderCase(id, ownerUserId);
}

// ── Get by linked bug ─────────────────────────────────────────────────────────

export async function getBuilderCaseByBugId(
  bugId: string,
  ownerUserId: string,
): Promise<BuilderCaseRow | null> {
  const [rows] = await db.execute(sql.raw(`
    SELECT * FROM builder_cases
    WHERE linked_bug_id = ${esc(bugId)}
      AND owner_user_id = ${esc(ownerUserId)}
    ORDER BY created_at DESC
    LIMIT 1
  `)) as unknown as [BuilderCaseRow[], unknown];

  return (rows ?? [])[0] ?? null;
}

// ── Generate Airo prompt ──────────────────────────────────────────────────────

/**
 * Build the complete Airo prompt from a builder case.
 * This is a pure function — no DB writes.
 * The prompt is stored in airo_prompt on the case record.
 *
 * SECURITY: Never include secrets, credentials, or API keys.
 */
export function generateAiroPrompt(c: BuilderCaseRow): string {
  const snapshotRef = c.anatomy_snapshot_name
    ? `${c.anatomy_snapshot_name}${c.anatomy_commit_sha ? ` (SHA: ${c.anatomy_commit_sha.slice(0, 8)})` : ''}`
    : c.anatomy_snapshot_id ?? 'Not recorded';

  const lines: string[] = [
    '# IWIIlBUILD Repair Case',
    '',
    `Case ID: ${c.id}`,
    `Linked bug: ${c.linked_bug_id ?? 'None'}`,
    `Source version: ${c.source_version ?? 'Not recorded'}`,
    `Anatomy snapshot: ${snapshotRef}`,
    `Base commit SHA/export fingerprint: ${c.anatomy_commit_sha ?? 'Not recorded'}`,
    '',
    '## Confirmed problem',
    '',
    c.confirmed_symptom ?? '(Not yet diagnosed — run Dazza diagnosis first)',
    '',
    '## Root cause',
    '',
    c.root_cause ?? '(Not yet diagnosed)',
    '',
    '## Evidence',
    '',
    c.evidence
      ? c.evidence.split('\n').map(l => `- ${l.trim()}`).filter(l => l !== '- ').join('\n')
      : '- (No evidence recorded)',
    '',
    '## Required minimal change',
    '',
    c.change_summary ?? '(Not yet specified)',
    '',
    '## Files allowed to change',
    '',
    c.proposed_files
      ? c.proposed_files.split('\n').map(l => `- ${l.trim()}`).filter(l => l !== '- ').join('\n')
      : '- (Not yet specified)',
    '',
    '## Proposed patch',
    '',
    c.proposed_patch ?? '(Not yet generated)',
    '',
    '## Tests required',
    '',
    c.test_plan ?? '(Not yet specified)',
    '',
    '## Runtime verification',
    '',
    c.runtime_checks ?? '(Not yet specified)',
    '',
    '## Completion report required',
    '',
    'Report back with:',
    '- Files changed (exact paths)',
    '- TypeScript build result',
    '- Runtime endpoint test results',
    '- Any deviations from the proposed patch',
    '',
    '---',
    'Do not change unrelated files.',
    'Do not expose secrets.',
    'Do not mark the bug resolved until verification.',
    'Do not publish.',
  ];

  return lines.join('\n');
}
