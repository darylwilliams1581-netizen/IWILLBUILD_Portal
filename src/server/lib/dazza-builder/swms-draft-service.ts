/**
 * dazza-builder/swms-draft-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure service for the Dazza SWMS Draft creation workflow.
 *
 * RESPONSIBILITIES:
 * 1. Validate gathered SWMS details — identify which critical fields are missing
 *    so Dazza can ask concise, targeted questions.
 * 2. Build the full ordered list of BuilderOperations for a new SWMS draft,
 *    using only named Document Tools from the catalogue.
 * 3. Enforce draft-only invariants — the service can only produce operations
 *    that create a private draft (doc_status: 'draft').
 * 4. Enforce no-publish / no-Global-Library / no-job-assign invariants at the
 *    operation level — none of those operations are ever emitted.
 * 5. Guarantee no [object Object] rendering — every block is built through
 *    the catalogue factory or the explicit buildBlock() type switch.
 *
 * DESIGN RULES:
 * - PURE: no DB access, no HTTP calls, no side effects.
 *   All DB work is done in the orchestrator before calling this service.
 * - READ-ONLY INPUTS: the service never mutates its inputs.
 * - CATALOGUE-FIRST: every block is produced via a named toolId from the
 *   catalogue.  Raw blockType is used only for system_field blocks (which
 *   have no catalogue toolId) and for the detail grid (tables.detail_grid).
 * - DRAFT ONLY: createNewTemplate always sets docStatus: 'draft'.
 *   The service has no code path that sets any other status.
 * - NO PUBLISH / NO LIBRARY / NO JOB ASSIGN: the operation builder never
 *   emits updateTemplateSettings with docStatus != 'draft', never emits
 *   a publishDocument op, never emits a globalLibraryAdd op, and never
 *   emits an assignToJob op.  These ops do not exist in the VALID_DOCUMENT_OPS
 *   allowlist and would be rejected by validateOperations anyway.
 *
 * SECTION ORDER (matches the IWILLBUILD SWMS standard):
 *  1.  Safety First Banner
 *  2.  Document Title (H1)
 *  3.  System Fields (company, job, document details)
 *  4.  Scope of Work (H2 + paragraph)
 *  5.  Work Sequence (H2 + bullet list)
 *  6.  Hazards, Risks and Controls (H2 + SWMS Risk Table)
 *  7.  Critical Controls (H2 + Danger Banner + bullet list)
 *  8.  PPE Banner (Advanced → PPE Banner)
 *  9.  Plant and Equipment Requirements (H2 + table)
 * 10.  Competency Requirements (H2 + table)
 * 11.  Environmental Controls (H2 + paragraph)
 * 12.  Emergency and Rescue Arrangements (H2 + First Aid Banner + paragraph)
 * 13.  Revision Table (H2 + Revision Table)
 * 14.  Worker Sign-On (H2 + Sign-Off Table)
 *
 * MISSING DETAILS QUESTIONS:
 * The service identifies which of the 8 critical fields are absent and returns
 * a concise question list.  Dazza asks ALL missing fields in ONE message —
 * never one question per turn.  Fields already supplied are never asked again.
 */

import type { BuilderOperation } from './types.js';

// ── SWMS detail types ─────────────────────────────────────────────────────────

/**
 * All details Dazza needs to build a complete SWMS draft.
 * Every field is optional — the service identifies which are missing.
 */
export interface SwmsDetails {
  /** Title / activity name (e.g. "Cleaning high-rise windows from a crane-suspended work box") */
  title?: string;
  /** Australian state or territory jurisdiction (e.g. "NSW", "QLD", "VIC") */
  jurisdiction?: string;
  /** Physical work location / site address */
  workLocation?: string;
  /** Equipment and access method (e.g. "crane-suspended work box", "EWP", "scaffolding") */
  equipmentMethod?: string;
  /** Height and fall exposure (e.g. "40m above ground level") */
  heightFallExposure?: string;
  /** Workers and their competencies (e.g. "2 × licensed riggers, 1 × dogman") */
  workersCompetencies?: string;
  /** Public or traffic interaction (e.g. "pedestrian exclusion zone required") */
  publicTrafficInteraction?: string;
  /** Special hazards beyond standard fall risk (e.g. "chemical exposure, glass breakage") */
  specialHazards?: string;
  /** Emergency and rescue arrangements (e.g. "vertical rescue team on standby") */
  emergencyRescue?: string;
}

/**
 * A single missing-detail question for Dazza to ask.
 */
export interface MissingDetailQuestion {
  /** The field key that is missing */
  field: keyof SwmsDetails;
  /** The question to ask the user */
  question: string;
  /** Example answer to help the user */
  example: string;
}

/**
 * Result of validating SWMS details.
 */
export interface SwmsValidationResult {
  /** True if all critical fields are present */
  isComplete: boolean;
  /** Missing fields that Dazza must ask about */
  missingQuestions: MissingDetailQuestion[];
  /** Fields that are present (for provenance reporting) */
  presentFields: Array<keyof SwmsDetails>;
}

/**
 * Result of building the SWMS operation list.
 */
export interface SwmsBuildResult {
  /** The ordered list of BuilderOperations */
  operations: BuilderOperation[];
  /** Human-readable summary for the proposal */
  summary: string;
  /** Sections that will be created */
  affectedSections: string[];
  /** Validation impact note */
  validationImpact: string;
  /**
   * DRAFT ONLY invariant — always 'draft'.
   * This field exists so tests can assert the value without inspecting
   * the operations array.
   */
  docStatus: 'draft';
  /**
   * NEVER TRUE — the service never publishes, never adds to Global Library,
   * never assigns to a job.  This field exists so tests can assert false.
   */
  isPublished: false;
  isGlobalLibrary: false;
  isJobAssigned: false;
}

// ── Critical field definitions ────────────────────────────────────────────────

/**
 * The 8 critical fields that must be present before Dazza can build a complete
 * SWMS.  If any are missing, Dazza asks for ALL missing fields in one message.
 */
export const SWMS_CRITICAL_FIELDS: Array<{
  field: keyof SwmsDetails;
  question: string;
  example: string;
}> = [
  {
    field: 'jurisdiction',
    question: 'Which state or territory will this work be performed in?',
    example: 'e.g. NSW, QLD, VIC, WA, SA, TAS, ACT, NT',
  },
  {
    field: 'workLocation',
    question: 'What is the work location or site address?',
    example: 'e.g. 123 George St, Sydney NSW 2000, or "CBD high-rise, Sydney"',
  },
  {
    field: 'equipmentMethod',
    question: 'What equipment and access method will be used?',
    example: 'e.g. crane-suspended work box, EWP, scaffolding, rope access',
  },
  {
    field: 'heightFallExposure',
    question: 'What is the working height and fall exposure?',
    example: 'e.g. 40m above ground level, 15 storeys',
  },
  {
    field: 'workersCompetencies',
    question: 'How many workers will be involved and what are their required competencies?',
    example: 'e.g. 2 × licensed riggers, 1 × dogman, all with Working at Heights ticket',
  },
  {
    field: 'publicTrafficInteraction',
    question: 'Is there any public or traffic interaction at the work site?',
    example: 'e.g. pedestrian exclusion zone required, road closure, no public access',
  },
  {
    field: 'specialHazards',
    question: 'Are there any special hazards beyond standard fall risk?',
    example: 'e.g. chemical exposure from cleaning agents, glass breakage, wind loading, electrical proximity',
  },
  {
    field: 'emergencyRescue',
    question: 'What are the emergency and rescue arrangements?',
    example: 'e.g. vertical rescue team on standby, rescue plan documented, 000 + site supervisor contact',
  },
];

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate the supplied SWMS details and identify missing critical fields.
 *
 * RULES:
 * - A field is considered "present" if it is a non-empty string after trimming.
 * - title is NOT in the critical fields list — it is inferred from the user's
 *   original request if not explicitly supplied.
 * - All 8 critical fields must be present for isComplete to be true.
 * - Missing fields are returned in the canonical order (jurisdiction first).
 *
 * Pure function — no side effects.
 */
export function validateSwmsDetails(details: SwmsDetails): SwmsValidationResult {
  const missingQuestions: MissingDetailQuestion[] = [];
  const presentFields: Array<keyof SwmsDetails> = [];

  // Check title separately (not in critical fields — inferred from request)
  if (details.title?.trim()) presentFields.push('title');

  for (const { field, question, example } of SWMS_CRITICAL_FIELDS) {
    const value = details[field];
    if (value && String(value).trim().length > 0) {
      presentFields.push(field);
    } else {
      missingQuestions.push({ field, question, example });
    }
  }

  return {
    isComplete: missingQuestions.length === 0,
    missingQuestions,
    presentFields,
  };
}

// ── Operation builder ─────────────────────────────────────────────────────────

/**
 * Build the full ordered list of BuilderOperations for a new SWMS draft.
 *
 * INVARIANTS (enforced by this function — never violated):
 * 1. createNewTemplate always sets docStatus: 'draft' — never 'published',
 *    'active', or any other value.
 * 2. No updateTemplateSettings operation sets docStatus to anything other
 *    than 'draft'.
 * 3. No publishDocument, globalLibraryAdd, or assignToJob operations are
 *    ever emitted.
 * 4. Every block is produced via a named toolId from the catalogue, or via
 *    the explicit blockType switch in buildBlock() — never via raw object
 *    interpolation that could produce "[object Object]".
 * 5. Banner blocks always use title/body fields — never a content field.
 * 6. Image blocks always use src/alt/size/align/preserveAspectRatio — never
 *    a content field.
 * 7. System field blocks always use fieldKey/label/fallback/showLabel.
 *
 * @param details  The validated SWMS details (all critical fields present)
 * @param referenceDocId  Optional ID of the approved reference document used
 *                        (for provenance reporting only — not used in ops)
 * @param referenceDocName  Optional name of the approved reference document
 */
export function buildSwmsOperations(
  details: SwmsDetails,
  referenceDocId?: number,
  referenceDocName?: string,
): SwmsBuildResult {
  const title = details.title?.trim() || 'Safe Work Method Statement';
  const ops: BuilderOperation[] = [];

  // ── 0. Create new template — ALWAYS draft ─────────────────────────────────
  // INVARIANT: docStatus is hardcoded to 'draft' — never any other value.
  // This is the only place docStatus is set; no subsequent operation changes it.
  ops.push({
    op: 'createNewTemplate',
    name: title,
    templateType: 'swms',
    docStatus: 'draft',   // ← INVARIANT: always 'draft', never 'published'
    docKind: 'doc',
  });

  // ── 1. Safety First Banner ─────────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'advanced.banner_safety_first',
    title: 'SAFETY FIRST',
    body: 'ARRIVE SAFE • WORK SAFE • GO HOME SAFE',
  });

  // ── 2. Document Title (H1) ─────────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.document_title',
    content: title,
  });

  // ── 3. System Fields — company and job details ─────────────────────────────
  // System fields use blockType: 'system_field' (no catalogue toolId for these)
  const systemFields: Array<{ fieldKey: string; label: string; fallback: string }> = [
    { fieldKey: 'company_name',      label: 'Company Name',      fallback: '[Company Name]' },
    { fieldKey: 'job_number',        label: 'Job Number',        fallback: '[Job Number]' },
    { fieldKey: 'job_name',          label: 'Job / Project Name', fallback: '[Job Name]' },
    { fieldKey: 'customer_name',     label: 'Client / Customer', fallback: '[Client Name]' },
    { fieldKey: 'document_number',   label: 'Document Number',   fallback: '[Doc No.]' },
    { fieldKey: 'document_revision', label: 'Revision',          fallback: 'Rev 0' },
  ];

  for (const sf of systemFields) {
    ops.push({
      op: 'addBlock',
      blockType: 'system_field',
      fieldKey: sf.fieldKey,
      label: sf.label,
      fallback: sf.fallback,
      showLabel: true,
    });
  }

  // ── 4. Scope of Work ───────────────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Scope of Work',
  });

  const scopeLines: string[] = [
    `Activity: ${title}`,
    details.workLocation ? `Location: ${details.workLocation}` : '',
    details.jurisdiction ? `Jurisdiction: ${details.jurisdiction}` : '',
    details.equipmentMethod ? `Access Method: ${details.equipmentMethod}` : '',
    details.heightFallExposure ? `Height / Fall Exposure: ${details.heightFallExposure}` : '',
    details.publicTrafficInteraction ? `Public / Traffic Interaction: ${details.publicTrafficInteraction}` : '',
  ].filter(Boolean);

  ops.push({
    op: 'addBlock',
    toolId: 'structure.paragraph',
    content: scopeLines.join('\n'),
  });

  // ── 5. Work Sequence ───────────────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Work Sequence',
  });

  ops.push({
    op: 'addBlock',
    toolId: 'structure.bullet_list',
    html: [
      '<ul>',
      '<li>Pre-start inspection and toolbox talk</li>',
      '<li>Establish exclusion zones and site controls</li>',
      '<li>Set up and inspect access equipment</li>',
      '<li>Commence work activities per this SWMS</li>',
      '<li>Monitor conditions and hazards throughout</li>',
      '<li>Complete work and remove all equipment</li>',
      '<li>Post-work site inspection and sign-off</li>',
      '</ul>',
    ].join(''),
  });

  // ── 6. Hazards, Risks and Controls ────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Hazards, Risks and Controls',
  });

  // Risk Assessment Matrix image
  ops.push({
    op: 'addBlock',
    toolId: 'advanced.risk_assessment',
    title: 'Risk Assessment Matrix',
    showLegend: true,
    showOnExport: true,
  });

  // SWMS Risk Table
  ops.push({
    op: 'addBlock',
    toolId: 'tables.swms_risk',
  });

  // ── 7. Critical Controls ───────────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Critical Controls',
  });

  // Danger banner for critical controls — uses title/body, NOT content
  ops.push({
    op: 'addBlock',
    toolId: 'advanced.banner_danger',
    title: 'Critical Controls — Must Be In Place Before Work Commences',
    body: 'Failure to implement these controls must result in immediate work stoppage.',
  });

  // Build critical controls list from supplied details
  const criticalControlItems: string[] = [
    '<li>All workers must hold current Working at Heights competency</li>',
    details.equipmentMethod
      ? `<li>Access equipment (${details.equipmentMethod}) inspected and certified before use</li>`
      : '<li>Access equipment inspected and certified before use</li>',
    details.heightFallExposure
      ? `<li>Fall arrest system in place for all work at ${details.heightFallExposure}</li>`
      : '<li>Fall arrest system in place for all elevated work</li>',
    details.emergencyRescue
      ? `<li>Emergency rescue arrangements confirmed: ${details.emergencyRescue}</li>`
      : '<li>Emergency rescue arrangements confirmed and communicated to all workers</li>',
    details.publicTrafficInteraction
      ? `<li>Exclusion zone / public interaction controls in place: ${details.publicTrafficInteraction}</li>`
      : '<li>Exclusion zone established and maintained throughout work</li>',
  ];

  if (details.specialHazards) {
    criticalControlItems.push(`<li>Special hazard controls in place: ${details.specialHazards}</li>`);
  }

  ops.push({
    op: 'addBlock',
    toolId: 'structure.bullet_list',
    html: `<ul>${criticalControlItems.join('')}</ul>`,
  });

  // ── 8. PPE Banner ─────────────────────────────────────────────────────────
  // Uses the canonical PPE Banner factory — protected src cannot be overridden
  ops.push({
    op: 'addBlock',
    toolId: 'advanced.ppe_banner',
  });

  // ── 9. Plant and Equipment Requirements ───────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Plant and Equipment Requirements',
  });

  // Equipment table: Item / Certification Required / Inspection Frequency
  ops.push({
    op: 'addBlock',
    toolId: 'tables.blank',
  });

  // ── 10. Competency Requirements ───────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Competency Requirements',
  });

  const competencyItems: string[] = [
    details.workersCompetencies
      ? `<li>${details.workersCompetencies}</li>`
      : '<li>All workers must hold current relevant licences and competencies</li>',
    '<li>Working at Heights — RIIWHS204E or equivalent</li>',
    '<li>First Aid — current certificate required for at least one worker on site</li>',
    details.equipmentMethod?.toLowerCase().includes('crane') || details.equipmentMethod?.toLowerCase().includes('work box')
      ? '<li>Rigging — RII30915 or equivalent; Dogman — RIIWHS302E or equivalent</li>'
      : '',
    details.equipmentMethod?.toLowerCase().includes('ewp')
      ? '<li>EWP Operation — RIIWHS301E or equivalent</li>'
      : '',
  ].filter(Boolean);

  ops.push({
    op: 'addBlock',
    toolId: 'structure.bullet_list',
    html: `<ul>${competencyItems.join('')}</ul>`,
  });

  // ── 11. Environmental Controls ────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Environmental Controls',
  });

  ops.push({
    op: 'addBlock',
    toolId: 'structure.paragraph',
    content: [
      'All waste materials and cleaning agents must be contained and disposed of in accordance with applicable environmental regulations.',
      details.jurisdiction ? `Applicable jurisdiction: ${details.jurisdiction}.` : '',
      'Spill kits must be available on site. No cleaning agents to enter stormwater drains.',
    ].filter(Boolean).join(' '),
  });

  // ── 12. Emergency and Rescue Arrangements ─────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Emergency and Rescue Arrangements',
  });

  // First Aid Banner — uses title/body, NOT content
  ops.push({
    op: 'addBlock',
    toolId: 'advanced.banner_first_aid',
    title: 'FIRST AID',
    body: 'IN AN EMERGENCY CALL 000',
  });

  ops.push({
    op: 'addBlock',
    toolId: 'structure.paragraph',
    content: details.emergencyRescue
      ? `Emergency and rescue arrangements: ${details.emergencyRescue}. All workers must be briefed on emergency procedures before work commences. Emergency contact numbers must be posted at the work site.`
      : 'Emergency and rescue arrangements must be documented and communicated to all workers before work commences. Emergency contact numbers must be posted at the work site. Vertical rescue capability must be available for all elevated work.',
  });

  // ── 13. Revision Table ────────────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Document Revision History',
  });

  ops.push({
    op: 'addBlock',
    toolId: 'tables.revision',
  });

  // ── 14. Worker Sign-On ────────────────────────────────────────────────────
  ops.push({
    op: 'addBlock',
    toolId: 'structure.section_heading',
    content: 'Worker Sign-On',
  });

  ops.push({
    op: 'addBlock',
    toolId: 'advanced.banner_safety',
    title: 'Worker Acknowledgement',
    body: 'By signing below, I confirm I have read, understood, and agree to comply with this Safe Work Method Statement.',
  });

  ops.push({
    op: 'addBlock',
    toolId: 'tables.sign_off',
  });

  // ── Build summary ──────────────────────────────────────────────────────────
  const refNote = referenceDocId && referenceDocName
    ? ` Based on approved reference document #${referenceDocId} "${referenceDocName}".`
    : ' No approved SWMS reference documents found — using IWILLBUILD default style.';

  const summary = [
    `Create new SWMS draft: "${title}".`,
    `Jurisdiction: ${details.jurisdiction ?? 'not specified'}.`,
    `Location: ${details.workLocation ?? 'not specified'}.`,
    `Access: ${details.equipmentMethod ?? 'not specified'}.`,
    refNote,
    'Status: PRIVATE DRAFT only — not published, not added to Global Library, not assigned to any job.',
  ].join(' ');

  const affectedSections = [
    'Document Header (Safety First Banner, Title, System Fields)',
    'Scope of Work',
    'Work Sequence',
    'Hazards, Risks and Controls (Risk Matrix + SWMS Risk Table)',
    'Critical Controls',
    'PPE Banner',
    'Plant and Equipment Requirements',
    'Competency Requirements',
    'Environmental Controls',
    'Emergency and Rescue Arrangements',
    'Document Revision History',
    'Worker Sign-On',
  ];

  return {
    operations: ops,
    summary,
    affectedSections,
    validationImpact: 'New template — no existing blocks affected. All blocks use named Document Tools. Draft status only.',
    docStatus: 'draft',
    isPublished: false,
    isGlobalLibrary: false,
    isJobAssigned: false,
  };
}

// ── Proposal display helpers ──────────────────────────────────────────────────

/**
 * Build the human-readable proposal text that Dazza shows to the owner
 * BEFORE calling builder_propose_changes.
 *
 * This is the "complete proposal" the spec requires — shown before creation,
 * not after.
 */
export function buildSwmsProposalText(
  details: SwmsDetails,
  result: SwmsBuildResult,
  referenceDocId?: number,
  referenceDocName?: string,
): string {
  const title = details.title?.trim() || 'Safe Work Method Statement';
  const lines: string[] = [
    `## Proposed SWMS Draft: "${title}"`,
    '',
    '**Status:** PRIVATE DRAFT — not published, not added to the Global Resource Library, not assigned to any job.',
    '',
    '### Details',
    `- **Jurisdiction:** ${details.jurisdiction ?? '—'}`,
    `- **Work Location:** ${details.workLocation ?? '—'}`,
    `- **Access Method:** ${details.equipmentMethod ?? '—'}`,
    `- **Height / Fall Exposure:** ${details.heightFallExposure ?? '—'}`,
    `- **Workers & Competencies:** ${details.workersCompetencies ?? '—'}`,
    `- **Public / Traffic Interaction:** ${details.publicTrafficInteraction ?? '—'}`,
    `- **Special Hazards:** ${details.specialHazards ?? '—'}`,
    `- **Emergency & Rescue:** ${details.emergencyRescue ?? '—'}`,
    '',
    '### Sections to be created',
  ];

  for (const section of result.affectedSections) {
    lines.push(`- ${section}`);
  }

  lines.push('');

  if (referenceDocId && referenceDocName) {
    lines.push(`**Reference:** Based on approved reference document #${referenceDocId} "${referenceDocName}".`);
  } else {
    lines.push('**Reference:** No approved SWMS reference documents found — using IWILLBUILD default style.');
  }

  lines.push('');
  lines.push('**Regulatory compliance:** This SWMS is a starting point only. It has not been reviewed for regulatory compliance. Review against applicable WHS legislation and codes of practice for the jurisdiction before use.');
  lines.push('');
  lines.push('Click **Apply** to create this draft, or tell me what to change.');

  return lines.join('\n');
}

// ── Missing details question formatter ───────────────────────────────────────

/**
 * Format missing detail questions into a single concise message.
 * Dazza asks ALL missing fields in ONE message — never one per turn.
 *
 * @param questions  The missing detail questions from validateSwmsDetails()
 * @param activityTitle  The activity title from the user's original request
 */
export function formatMissingDetailsMessage(
  questions: MissingDetailQuestion[],
  activityTitle: string,
): string {
  if (questions.length === 0) return '';

  const lines: string[] = [
    `To build the SWMS for **${activityTitle}**, I need a few more details:`,
    '',
  ];

  for (let i = 0; i < questions.length; i++) {
    lines.push(`${i + 1}. **${questions[i].question}**`);
    lines.push(`   *(${questions[i].example})*`);
    lines.push('');
  }

  lines.push('You can answer all of these in one message.');

  return lines.join('\n');
}
