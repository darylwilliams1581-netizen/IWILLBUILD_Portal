/**
 * drayl/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared types for the Drayl engine.
 * These mirror the shape expected by drayl.ts and persona.ts (annette.ts).
 */

export type ModuleName =
  | 'Jobs'
  | 'JobTodos'
  | 'Fleet'
  | 'FleetPrestarts'
  | 'Forms'
  | 'Estimates'
  | 'Files'
  | 'Safety'
  | 'Team'
  | 'Company';

export type Severity = 'critical' | 'warning' | 'info';

export interface AnnetteFinding {
  id: string;
  severity: Severity;
  module: ModuleName;
  title: string;
  detail: string;
  sourceIds: string[];
  recommendedAction: string;
}

// ── The modular context shape expected by the new engine ──────────────────────
// Each module has { ok: boolean; data: unknown[] }

export interface ModuleSlot<T = Record<string, unknown>> {
  ok: boolean;
  data: T[];
}

export interface DazzaContext {
  companyId: number;
  companyName: string;
  userId: string;
  user: { name: string; email: string; role: string };
  permissions: {
    canViewJobs: boolean;
    canViewFleet: boolean;
    canViewForms: boolean;
    canViewEstimating: boolean;
    canViewFiles: boolean;
    canViewSafety: boolean;
    seeDollars: boolean;
    isAdmin: boolean;
    isOwner: boolean;
  };
  modules: {
    jobs:          ModuleSlot;
    jobTodos:      ModuleSlot;
    fleet:         ModuleSlot;
    fleetPrestarts: ModuleSlot;
    forms:         ModuleSlot;
    estimates:     ModuleSlot;
    files:         ModuleSlot;
    safety:        ModuleSlot;
  };
  warnings: string[];
  moduleCounts: Record<string, number>;
}

// ── Input / output for handleDazzaChat ───────────────────────────────────────

export interface DazzaChatInput {
  message: string;
  user: {
    id: string;
    companyId: number;
    name: string;
    email: string;
    role: string;
    permissions: DazzaContext['permissions'];
  };
  /** Pre-built context (optional — if omitted, loadDazzaContext will build it) */
  context?: DazzaContext;
  openAiApiKey?: string;
  openAiModel?: string;
  gstRate?: number;
  /** Adapter for loading context — injected by the API handler */
  adapter?: ContextAdapter;
}

export interface ContextAdapter {
  loadContext(user: DazzaChatInput['user']): Promise<DazzaContext>;
}

export type DazzaMode = 'refusal' | 'context' | 'annette' | 'ai';

export interface DazzaChatResponse {
  reply: string;
  mode: DazzaMode;
  findings: AnnetteFinding[];
  sources: ModuleName[];
  warnings: string[];
  usedOpenAI: boolean;
}

// ── Job shape used by persona.ts ─────────────────────────────────────────────

export interface Job {
  id: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
  clientName?: string | null;
  client?: string | null;
  clientId?: string | null;
  location?: string | null;
  address?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  progressPercent?: number | null;
  progressStatus?: string | null;
  highRisk?: boolean | null;
  riskLevel?: string | null;
  value?: number | null;
  contractValue?: number | null;
  approvedEstimateId?: string | null;
  estimateStatus?: string | null;
}
