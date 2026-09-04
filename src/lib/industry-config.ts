/**
 * industry-config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central definition of all supported industry modes.
 *
 * RULES:
 * - Adding a new industry here is the ONLY change needed for the foundation.
 * - Existing companies default to 'construction' — no data migration needed.
 * - All wording is generic / neutral. No third-party document names.
 * - This file is imported by both client (settings, signup) and server (Dazza context).
 */

export const INDUSTRY_IDS = [
  'construction',
  'civil',
  'landscaping',
  'fuel_dangerous_goods',
  'plant_hire',
  'general_trades',
  'other',
] as const;

export type IndustryId = typeof INDUSTRY_IDS[number];

export interface IndustryConfig {
  id: IndustryId;
  label: string;
  /** Short description shown in selectors */
  description: string;
  /** Emoji / icon hint (used in UI only) */
  icon: string;
  /** Suggested job types for this industry */
  jobTypes: string[];
  /** Suggested form template names for this industry */
  formTemplates: string[];
  /** Short phrase used in Dazza AI system prompt context */
  dazzaContext: string;
  /** Dashboard focus label — replaces generic "Jobs" wording if set */
  dashboardFocus?: string;
}

export const INDUSTRY_CONFIG: Record<IndustryId, IndustryConfig> = {

  construction: {
    id: 'construction',
    label: 'Construction',
    description: 'Residential and commercial building',
    icon: '🏗️',
    jobTypes: [
      'New Build',
      'Renovation',
      'Extension',
      'Fit-Out',
      'Demolition',
      'Maintenance',
      'Inspection',
      'Remediation',
    ],
    formTemplates: [
      'Site Induction',
      'Daily Prestart',
      'SWMS',
      'Toolbox Talk',
      'Incident Report',
      'Quality Inspection',
      'Defect Register',
      'Handover Checklist',
    ],
    dazzaContext: 'construction company working on residential and commercial building projects',
  },

  civil: {
    id: 'civil',
    label: 'Civil',
    description: 'Civil engineering and infrastructure',
    icon: '🛣️',
    jobTypes: [
      'Road Works',
      'Earthworks',
      'Drainage',
      'Concrete Works',
      'Bridge / Structure',
      'Utility Installation',
      'Site Preparation',
      'Rehabilitation',
    ],
    formTemplates: [
      'Site Induction',
      'Daily Prestart',
      'SWMS',
      'Traffic Management Plan',
      'Toolbox Talk',
      'Incident Report',
      'Environmental Checklist',
      'Inspection & Test Plan',
    ],
    dazzaContext: 'civil engineering and infrastructure company',
  },

  landscaping: {
    id: 'landscaping',
    label: 'Landscaping',
    description: 'Landscaping, grounds and horticulture',
    icon: '🌿',
    jobTypes: [
      'New Landscape Install',
      'Garden Maintenance',
      'Irrigation Install',
      'Turf / Lawn',
      'Tree Work',
      'Retaining Wall',
      'Paving',
      'Site Cleanup',
    ],
    formTemplates: [
      'Site Induction',
      'Daily Prestart',
      'SWMS',
      'Chemical / Pesticide Application',
      'Toolbox Talk',
      'Incident Report',
      'Plant & Equipment Checklist',
      'Job Completion Checklist',
    ],
    dazzaContext: 'landscaping and grounds maintenance company',
  },

  fuel_dangerous_goods: {
    id: 'fuel_dangerous_goods',
    label: 'Fuel / Dangerous Goods',
    description: 'Fuel distribution, storage and dangerous goods handling',
    icon: '⛽',
    jobTypes: [
      'Delivery Run',
      'Site Inspection',
      'Depot Maintenance',
      'Customer Site Visit',
      'Fuel System Service',
      'Incident / Spill Response',
    ],
    formTemplates: [
      'Driver Prestart',
      'Delivery Checklist',
      '3-Monthly Site Inspection',
      'Spill Kit Inspection',
      'Incident / Near Miss Report',
      'Fatigue Declaration',
      'Site Access Checklist',
      'Dangerous Goods Checklist',
    ],
    dazzaContext: 'fuel distribution and dangerous goods handling company with strict compliance, fatigue management, and spill response requirements',
    dashboardFocus: 'Runs & Deliveries',
  },

  plant_hire: {
    id: 'plant_hire',
    label: 'Plant Hire',
    description: 'Equipment hire, plant and machinery',
    icon: '🚜',
    jobTypes: [
      'Equipment Hire',
      'Delivery / Pickup',
      'On-Site Operation',
      'Scheduled Service',
      'Breakdown Response',
      'Inspection',
      'Operator Training',
    ],
    formTemplates: [
      'Plant Prestart',
      'Equipment Handover',
      'Operator Induction',
      'SWMS',
      'Incident Report',
      'Service Record',
      'Damage Report',
      'Return Inspection',
    ],
    dazzaContext: 'plant hire and equipment rental company',
  },

  general_trades: {
    id: 'general_trades',
    label: 'General Trades',
    description: 'Electrical, plumbing, HVAC and other trades',
    icon: '🔧',
    jobTypes: [
      'Installation',
      'Service Call',
      'Fault / Repair',
      'Maintenance',
      'Inspection',
      'Quote / Measure',
      'Emergency Call-Out',
    ],
    formTemplates: [
      'Site Induction',
      'Daily Prestart',
      'SWMS',
      'Job Card',
      'Toolbox Talk',
      'Incident Report',
      'Test & Tag Record',
      'Completion Sign-Off',
    ],
    dazzaContext: 'general trades business (electrical, plumbing, HVAC or similar)',
  },

  other: {
    id: 'other',
    label: 'Other',
    description: 'Other industry or mixed operations',
    icon: '🏢',
    jobTypes: [
      'Job',
      'Site Visit',
      'Inspection',
      'Maintenance',
      'Service',
      'Project',
    ],
    formTemplates: [
      'Site Induction',
      'Daily Prestart',
      'SWMS',
      'Toolbox Talk',
      'Incident Report',
      'Checklist',
    ],
    dazzaContext: 'business using IWIllBUIlD for field operations management',
  },
};

/** Get config for an industry, falling back to construction if unknown */
export function getIndustryConfig(id: string | null | undefined): IndustryConfig {
  return INDUSTRY_CONFIG[(id as IndustryId) ?? 'construction'] ?? INDUSTRY_CONFIG.construction;
}

/** All industries as an array, ordered for display */
export const INDUSTRY_LIST: IndustryConfig[] = INDUSTRY_IDS.map((id) => INDUSTRY_CONFIG[id]);
