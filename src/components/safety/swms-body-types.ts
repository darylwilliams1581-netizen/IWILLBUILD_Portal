// swms-body-types.ts — Structured SWMS body for the upgraded SWMS Body Builder
// All data stored as JSON in swms_body LONGTEXT column

// ─── Risk Rating ──────────────────────────────────────────────────────────────
export type RiskLevel = 'extreme' | 'high' | 'medium' | 'low' | '';

// ─── High-Risk Construction Work categories ───────────────────────────────────
// Source: Work Health and Safety Regulation 2011 (Qld), Schedule 3
// 18 prescribed activities — maintained here as the single source of truth.
// Do NOT hardcode this list elsewhere in the codebase.
export const HRCW_CATEGORIES = [
  'Work involving a risk of a person falling more than 3 metres',
  'Work on telecommunications towers',
  'Demolition of load-bearing structures',
  'Work involving disturbance of asbestos',
  'Work involving structural alterations requiring temporary support to prevent collapse',
  'Work in or near a confined space',
  'Work in or near a shaft or trench deeper than 1.5 metres',
  'Work using explosives',
  'Work on or near pressurised gas distribution mains or piping',
  'Work on or near chemical, fuel or refrigerant lines',
  'Work on or near energised electrical installations or services',
  'Work in an area that may have a contaminated or flammable atmosphere',
  'Tilt-up or precast concrete work',
  'Work on or adjacent to roads or railways used by traffic',
  'Work in areas with artificial extremes of temperature',
  'Work in or near water or other liquids where there is a risk of drowning',
  'Work involving diving',
  'Work involving the use of a crane, hoist or suspended work platform',
] as const;

export type HRCWCategory = typeof HRCW_CATEGORIES[number];

// ─── Document type (when no statutory HRCW applies) ──────────────────────────
export type DocumentType = 'swms' | 'task-specific-swms' | 'safe-work-procedure' | 'general-risk-assessment';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  'swms': 'Safe Work Method Statement (SWMS)',
  'task-specific-swms': 'Task-Specific SWMS',
  'safe-work-procedure': 'Safe Work Procedure',
  'general-risk-assessment': 'General Risk Assessment',
};

// ─── PPE Items ────────────────────────────────────────────────────────────────
export const PPE_ITEMS = [
  'Safety helmet',
  'Safety footwear',
  'Eye protection',
  'Face shield',
  'Hearing protection',
  'General gloves',
  'Cut-resistant gloves',
  'Electrical gloves',
  'Respiratory protection',
  'High-visibility clothing',
  'Arc-rated clothing',
  'Fall-arrest equipment',
  'Sun protection',
  'Other',
] as const;

export type PpeItem = typeof PPE_ITEMS[number];

export interface PpeRow {
  item: PpeItem | string;
  requirement: string;
}

// ─── Critical Control ─────────────────────────────────────────────────────────
export type ControlFlag = 'critical' | 'mandatory' | 'client-requirement' | 'permit-condition';

export interface CriticalControl {
  id: string;
  criticalRisk: string;
  possibleOutcome: string;
  mandatoryControls: string;
  verificationMethod?: string;
  responsibleRole?: string;
  flags: ControlFlag[];
}

// ─── Plant / Equipment ────────────────────────────────────────────────────────
export interface PlantItem {
  id: string;
  item: string;
  requirement: string;
  inspectionRequired: string;
  notes?: string;
}

// ─── HRCW Interface entry ─────────────────────────────────────────────────────
export interface HRCWEntry {
  id: string;
  category: string;
  whyApplies: string;
  linkedWorkStep: string;
  requiredPermit: string;
  relatedSwms: string;
}

// ─── Sequence of Work row ─────────────────────────────────────────────────────
export interface WorkStep {
  id: string;
  sequenceNumber: number;
  sequenceOfWork: string;
  hazardsAndRisks: string;
  possibleConsequence: string;        // mandatory — separate from hazard
  initialRisk: RiskLevel;
  controlMeasures: string;
  residualRisk: RiskLevel;
  responsiblePerson: string;
  // Optional expanded fields
  isCriticalControl?: boolean;
  monitoringMethod?: string;
  stopWorkTrigger?: string;
  linkedPermit?: string;
  linkedSwms?: string;
  evidenceRequired?: string;
  notes?: string;
  expanded?: boolean;
}

// ─── Task-specific requirement ────────────────────────────────────────────────
export interface TaskRequirement {
  id: string;
  type: string;
  description: string;
}

export const TASK_REQUIREMENT_TYPES = [
  'Declared non-live or prohibited live tasks',
  'Exclusion-zone requirements',
  'Safety Observer requirements',
  'Permit requirements',
  'Rescue readiness',
  'Dust-control requirements',
  'Plant separation requirements',
  'Fire-watch requirements',
  'Other',
] as const;

// ─── Environmental control ────────────────────────────────────────────────────
export const ENV_CONTROL_OPTIONS = [
  'Housekeeping',
  'Emergency access',
  'Dust',
  'Waste',
  'Stormwater',
  'Erosion and sediment',
  'Fuel and oil spills',
  'Hazardous waste',
  'Fire prevention',
  'Vegetation',
  'Biosecurity',
  'Public protection',
] as const;

export interface EnvControl {
  type: string;
  description: string;
  responsiblePerson?: string;
}

// ─── Emergency module ─────────────────────────────────────────────────────────
export const EMERGENCY_MODULE_TYPES = [
  'Electric shock',
  'Arc flash',
  'Fall rescue',
  'Trench collapse',
  'Fire',
  'Chemical exposure',
  'Plant incident',
  'Service strike',
  'Serious bleeding',
  'Eye injury',
] as const;

export interface EmergencyAction {
  id: string;
  action: string;
}

// ─── Training / Competency ────────────────────────────────────────────────────
export const COMPETENCY_OPTIONS = [
  'White Card',
  'Site induction',
  'Client induction',
  'Plant competency',
  'Verification of Competency (VOC)',
  'Electrical Safety Observer',
  'Electrical licence',
  'Working at heights',
  'Confined-space training',
  'Traffic control',
  'First aid',
  'Respirator fit testing',
  'Permit holder',
  'Asset-owner authorisation',
] as const;

export interface CompetencyRow {
  requirement: string;
  applies: boolean;
  evidenceOrAuth: string;
}

// ─── Definition ───────────────────────────────────────────────────────────────
export interface DefinitionRow {
  id: string;
  term: string;
  definition: string;
}

// ─── Related document ─────────────────────────────────────────────────────────
export type RelatedDocType = 'Related SWMS' | 'Permit' | 'Drawing' | 'Site plan' | 'Service plan' | 'Traffic plan' | 'SDS' | 'Plant record' | 'Client procedure' | 'Safety Plan' | 'Emergency poster' | 'Other';

export interface RelatedDoc {
  id: string;
  type: RelatedDocType | string;
  document: string;
  revision: string;
  status: 'current' | 'superseded' | 'missing' | '';
}

// ─── Worker sign-on ───────────────────────────────────────────────────────────
export interface WorkerSignOn {
  id: string;
  name: string;
  companyTrade: string;
  signatureData?: string;
  date: string;
}

// ─── Supervisor declaration ───────────────────────────────────────────────────
export interface SupervisorDeclaration {
  name: string;
  position: string;
  date: string;
  signatureData?: string;
  comments?: string;
}

// ─── Build mode ───────────────────────────────────────────────────────────────
export type BuildMode = 'quick' | 'advanced';

// ─── Main SWMS body data structure ───────────────────────────────────────────
export interface SwmsBodyData {
  // Meta
  buildMode: BuildMode;
  documentType: DocumentType;
  title: string;
  category: string;
  revisionNumber: string;
  reviewDate: string;
  authorName: string;
  approvedByName: string;
  status: 'draft' | 'review' | 'approved' | 'archived';

  // 1. Purpose & Scope
  purpose: string;
  scope: string;
  includedActivities: string[];
  excludedActivities: string[];
  workBoundaries: string;

  // 2. HRCW Interface
  hrcwApplies: 'yes' | 'no' | 'unsure';   // replaces noHrcwApplies boolean
  hrcwCategories: HRCWEntry[];
  /** @deprecated use hrcwApplies instead */
  noHrcwApplies?: boolean;

  // 3. Fatal Hazards & Critical Controls
  criticalControls: CriticalControl[];

  // 4. Key Plant, Tools & Safety Equipment
  plantItems: PlantItem[];

  // 5. PPE Requirements
  ppeRows: PpeRow[];

  // 6. Sequence of Work
  workSteps: WorkStep[];

  // 7. Task-Specific Requirements (conditional)
  taskRequirements: TaskRequirement[];

  // 8. Environmental Controls (conditional)
  envControls: EnvControl[];

  // 9. Emergency & Incident Response
  emergencyActions: EmergencyAction[];
  emergencyModules: string[];  // selected module types

  // 10. Training & Competency (advanced)
  competencyRows: CompetencyRow[];

  // 11. Definitions (advanced)
  definitions: DefinitionRow[];

  // 12. Related Documents (advanced)
  relatedDocs: RelatedDoc[];

  // 13. Worker Sign-On
  workerSignOns: WorkerSignOn[];

  // 14. Supervisor Declaration
  supervisorDeclaration: SupervisorDeclaration;

  // Legacy migration fields (preserved for backward compat)
  legacyHazards?: string;
  legacyRisks?: string;
  legacyControls?: string;
}

// ─── Blank defaults ───────────────────────────────────────────────────────────
export function blankSwmsBody(overrides?: Partial<SwmsBodyData>): SwmsBodyData {
  return {
    buildMode: 'quick',
    documentType: 'swms',
    title: '',
    category: '',
    revisionNumber: '1',
    reviewDate: '',
    authorName: '',
    approvedByName: '',
    status: 'draft',

    purpose: '',
    scope: '',
    includedActivities: [''],
    excludedActivities: [],
    workBoundaries: '',

    hrcwApplies: 'unsure',
    hrcwCategories: [],

    criticalControls: [],

    plantItems: [],

    ppeRows: [],

    workSteps: [],

    taskRequirements: [],

    envControls: [],

    emergencyActions: [
      { id: 'e1', action: 'Stop work immediately' },
      { id: 'e2', action: 'Isolate the hazard' },
      { id: 'e3', action: 'Raise the alarm' },
      { id: 'e4', action: 'Call 000 for serious injury' },
      { id: 'e5', action: 'Notify the supervisor and principal contractor' },
      { id: 'e6', action: 'Preserve the incident scene' },
      { id: 'e7', action: 'Do not restart until controls are reviewed' },
    ],
    emergencyModules: [],

    competencyRows: [],

    definitions: [],

    relatedDocs: [],

    workerSignOns: [],

    supervisorDeclaration: {
      name: '',
      position: '',
      date: '',
      signatureData: '',
      comments: '',
    },

    ...overrides,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────
export interface SwmsValidationWarning {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateSwmsBody(d: SwmsBodyData): SwmsValidationWarning[] {
  const warnings: SwmsValidationWarning[] = [];

  if (!d.purpose.trim()) warnings.push({ field: 'purpose', message: 'No Purpose entered', severity: 'error' });
  if (!d.scope.trim()) warnings.push({ field: 'scope', message: 'No Scope entered', severity: 'error' });

  // HRCW validation — new three-state logic
  if (d.hrcwApplies === 'unsure')
    warnings.push({ field: 'hrcw', message: 'Confirm whether High-Risk Construction Work applies', severity: 'error' });
  if (d.hrcwApplies === 'yes' && d.hrcwCategories.length === 0)
    warnings.push({ field: 'hrcw', message: 'HRCW applies — select at least one category', severity: 'error' });
  if (d.hrcwApplies === 'no' && (!d.documentType || d.documentType === 'swms'))
    warnings.push({ field: 'hrcw', message: 'No statutory HRCW — select the correct document type (Task-Specific SWMS, Safe Work Procedure, or General Risk Assessment)', severity: 'error' });

  if (d.workSteps.length === 0)
    warnings.push({ field: 'workSteps', message: 'No sequence-of-work rows exist', severity: 'error' });

  for (const step of d.workSteps) {
    if (!step.hazardsAndRisks.trim())
      warnings.push({ field: `step-${step.id}-hazard`, message: `Work step ${step.sequenceNumber}: no hazard entered`, severity: 'warning' });
    if (!step.possibleConsequence.trim())
      warnings.push({ field: `step-${step.id}-consequence`, message: `Work step ${step.sequenceNumber}: no possible consequence entered`, severity: 'warning' });
    if (!step.controlMeasures.trim())
      warnings.push({ field: `step-${step.id}-controls`, message: `Work step ${step.sequenceNumber}: no controls entered`, severity: 'warning' });
    if (!step.responsiblePerson.trim())
      warnings.push({ field: `step-${step.id}-responsible`, message: `Work step ${step.sequenceNumber}: no responsible person assigned`, severity: 'warning' });
    if (step.residualRisk === 'extreme')
      warnings.push({ field: `step-${step.id}-residual`, message: `Work step ${step.sequenceNumber}: extreme residual risk remains`, severity: 'error' });
    if (step.residualRisk === 'high')
      warnings.push({ field: `step-${step.id}-high`, message: `Work step ${step.sequenceNumber}: high residual risk — supervisor approval required`, severity: 'warning' });
  }

  if (d.ppeRows.length === 0)
    warnings.push({ field: 'ppe', message: 'No PPE requirements specified', severity: 'warning' });
  if (d.emergencyActions.length === 0)
    warnings.push({ field: 'emergency', message: 'No emergency controls specified', severity: 'warning' });

  return warnings;
}

// ─── Migration helper — convert legacy SwmsTemplate fields to SwmsBodyData ────
export function migrateFromLegacy(legacy: Record<string, string | null>): Partial<SwmsBodyData> {
  const steps: WorkStep[] = [];

  // Try to parse sequence_controls as JSON first, else treat as legacy text
  if (legacy.sequence_controls) {
    try {
      const parsed = JSON.parse(legacy.sequence_controls);
      if (Array.isArray(parsed)) {
        parsed.forEach((s: Partial<WorkStep>, i: number) => {
          steps.push({
            id: `migrated-${i}`,
            sequenceNumber: i + 1,
            sequenceOfWork: s.sequenceOfWork ?? '',
            hazardsAndRisks: s.hazardsAndRisks ?? '',
            possibleConsequence: s.possibleConsequence ?? '',  // may be blank on old records
            initialRisk: s.initialRisk ?? '',
            controlMeasures: s.controlMeasures ?? '',
            residualRisk: s.residualRisk ?? '',
            responsiblePerson: s.responsiblePerson ?? '',
          });
        });
      }
    } catch { /* not JSON — leave steps empty, put in legacy field */ }
  }

  // Infer hrcwApplies from legacy noHrcwApplies if present
  const legacyNoHrcw = legacy.no_hrcw_applies;
  const hrcwApplies: 'yes' | 'no' | 'unsure' =
    legacyNoHrcw === 'true' ? 'no' :
    legacyNoHrcw === 'false' ? 'yes' :
    'unsure';

  return {
    purpose: legacy.purpose_scope ?? '',
    scope: legacy.work_activity ?? '',
    hrcwApplies,
    legacyHazards: legacy.hazards ?? undefined,
    legacyRisks: legacy.risks ?? undefined,
    legacyControls: legacy.controls ?? undefined,
    workSteps: steps,
    authorName: legacy.author_name ?? '',
    approvedByName: legacy.approved_by_name ?? '',
    revisionNumber: legacy.revision_number ?? '1',
  };
}
