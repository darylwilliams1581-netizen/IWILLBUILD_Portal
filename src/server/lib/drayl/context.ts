/**
 * drayl/context.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Adapter: bridges the existing buildDazzaContext() (flat shape) into the
 * new modular DazzaContext shape expected by drayl.ts and persona.ts.
 *
 * The existing context stores data as flat arrays (ctx.jobs, ctx.fleet, etc.).
 * The new engine expects ctx.modules.jobs.data, ctx.modules.fleet.data, etc.
 */

import { buildDazzaContext, derivePermissions } from '../dazza-context.js';
import type { DazzaContext } from './types.js';
import type { DazzaChatInput } from './types.js';

function slot<T = Record<string, unknown>>(data: unknown[] | undefined): { ok: boolean; data: T[] } {
  return {
    ok: true,
    data: (data ?? []) as T[],
  };
}

/**
 * Load and adapt the Dazza context for the new engine.
 * The user object comes from the authenticated session (server-side only).
 */
export async function loadDazzaContext(
  user: DazzaChatInput['user'],
  _adapter?: DazzaChatInput['adapter'],
): Promise<DazzaContext> {
  // Build the existing flat context
  const flatCtx = await buildDazzaContext(
    user.id,
    user.email,
    user.name,
    user.role,
    user.companyId,
    {
      isOwner:       user.permissions.isOwner,
      isAdmin:       user.permissions.isAdmin,
      canDazzaAi:    true,
      canJobs:       user.permissions.canViewJobs,
      canFleet:      user.permissions.canViewFleet,
      canForms:      user.permissions.canViewForms,
      canEstimating: user.permissions.canViewEstimating,
      canFiles:      user.permissions.canViewFiles,
      seeDollars:    user.permissions.seeDollars,
    },
    null, // no support mode in drayl engine path
  );

  // Map flat → modular shape
  // Fleet prestarts: combine prestarts + fleetFlags for the new engine
  const prestartData = [
    ...((flatCtx.prestarts ?? []) as Record<string, unknown>[]),
    ...((flatCtx.fleetFlags ?? []) as Record<string, unknown>[]).map((f) => ({
      ...f,
      issueFlagged: true,
      issue_needs_attention: true,
    })),
  ];

  // Safety: map form submissions with safety-related templates as a proxy
  // (the existing context doesn't have a dedicated safety module — use forms)
  const safetyData = ((flatCtx.formSubmissions ?? []) as Record<string, unknown>[]).filter((s) => {
    const name = String(s.template_name ?? '').toLowerCase();
    return name.includes('swms') || name.includes('safety') || name.includes('whs') || name.includes('risk');
  });

  const newCtx: DazzaContext = {
    companyId:   flatCtx.companyId,
    companyName: flatCtx.companyName,
    userId:      flatCtx.userId,
    user:        flatCtx.user,
    permissions: {
      canViewJobs:       flatCtx.permissions.canJobs,
      canViewFleet:      flatCtx.permissions.canFleet,
      canViewForms:      flatCtx.permissions.canForms,
      canViewEstimating: flatCtx.permissions.canEstimating,
      canViewFiles:      flatCtx.permissions.canFiles,
      canViewSafety:     flatCtx.permissions.canForms, // safety gated same as forms
      seeDollars:        flatCtx.permissions.seeDollars,
      isAdmin:           flatCtx.permissions.isAdmin,
      isOwner:           flatCtx.permissions.isOwner,
    },
    modules: {
      jobs:           slot(flatCtx.jobs),
      jobTodos:       slot(flatCtx.openTodos),
      fleet:          slot(flatCtx.fleet),
      fleetPrestarts: slot(prestartData),
      forms:          slot([
        ...((flatCtx.formTemplates ?? []) as Record<string, unknown>[]),
        ...((flatCtx.formSubmissions ?? []) as Record<string, unknown>[]),
      ]),
      estimates:      slot(flatCtx.estimates),
      files:          slot(flatCtx.files),
      safety:         slot(safetyData),
    },
    warnings:     flatCtx.warnings,
    moduleCounts: flatCtx.moduleCounts,
  };

  return newCtx;
}
