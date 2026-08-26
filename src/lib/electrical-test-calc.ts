/**
 * Electrical Test Recorder — assessment helpers
 *
 * All assessment logic is pure and testable.
 * No Energy Queensland limits are applied unless the EQ Earth Tail template
 * is explicitly selected — all other tests show "Manual assessment required".
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TestResult = 'PASS' | 'REVIEW' | 'FAIL' | 'MANUAL';

export type EQCondition = 'C4' | 'C3' | 'P2' | 'P1';

export interface AssessmentOutput {
  result: TestResult;
  condition: EQCondition | null;
  label: string;
  /** Human-readable standard reference shown beside the result */
  standardRef: string | null;
}

// ── EQ Earth Tail Continuity (document-controlled) ───────────────────────────

const EQ_EARTH_TAIL_STANDARD = 'EQ STNW3359 Rev 4 — Earth Tail Continuity';

/**
 * Evaluate a measured resistance (in mΩ) against the Energy Queensland
 * Earth Tail Continuity acceptance criteria.
 *
 * C4: < 10 mΩ   → PASS
 * C3: 10–100 mΩ → REVIEW
 * P2: 100–500 mΩ → REVIEW (maintenance action required)
 * P1: > 500 mΩ  → FAIL
 *
 * Only call this function when the EQ Earth Tail template is explicitly selected.
 */
export function evalEQEarthTail(measuredMOhm: number): AssessmentOutput {
  if (measuredMOhm < 10) {
    return { result: 'PASS',   condition: 'C4', label: 'C4 — Pass',                  standardRef: EQ_EARTH_TAIL_STANDARD };
  }
  if (measuredMOhm <= 100) {
    return { result: 'REVIEW', condition: 'C3', label: 'C3 — Review',                standardRef: EQ_EARTH_TAIL_STANDARD };
  }
  if (measuredMOhm <= 500) {
    return { result: 'REVIEW', condition: 'P2', label: 'P2 — Maintenance Required',  standardRef: EQ_EARTH_TAIL_STANDARD };
  }
  return   { result: 'FAIL',   condition: 'P1', label: 'P1 — Fail',                  standardRef: EQ_EARTH_TAIL_STANDARD };
}

// ── Generic min/max template assessment ──────────────────────────────────────

/**
 * Evaluate a measured value against optional min/max acceptance criteria.
 * If neither min nor max is provided, returns MANUAL (manual assessment required).
 */
export function evalGeneric(
  measured: number,
  minAccept: number | null,
  maxAccept: number | null,
  standardRef: string | null = null,
): AssessmentOutput {
  if (minAccept === null && maxAccept === null) {
    return { result: 'MANUAL', condition: null, label: 'Manual assessment required', standardRef };
  }
  const aboveMin = minAccept === null || measured >= minAccept;
  const belowMax = maxAccept === null || measured <= maxAccept;
  if (aboveMin && belowMax) {
    return { result: 'PASS', condition: null, label: 'Pass', standardRef };
  }
  return { result: 'FAIL', condition: null, label: 'Fail', standardRef };
}

// ── Calibration expiry check ──────────────────────────────────────────────────

/**
 * Returns true if the calibration expiry date has passed (or is today).
 * Accepts ISO date string (YYYY-MM-DD) or null.
 */
export function isCalibrationExpired(expiryDateIso: string | null): boolean {
  if (!expiryDateIso) return false;
  const [y, m, d] = expiryDateIso.split('-').map(Number);
  const expiry = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Format a numeric result with its unit for display. */
export function formatTestValue(value: number | null, unit: string): string {
  if (value === null || value === undefined) return '—';
  return `${value} ${unit}`.trim();
}

/** Return the Tailwind colour class for a result badge. */
export function resultBadgeClass(result: TestResult | null): string {
  switch (result) {
    case 'PASS':   return 'bg-green-100 text-green-800 border-green-200';
    case 'REVIEW': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'FAIL':   return 'bg-red-100 text-red-800 border-red-200';
    default:       return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

/** Return the Tailwind colour class for a condition badge (EQ). */
export function conditionBadgeClass(condition: EQCondition | null): string {
  switch (condition) {
    case 'C4': return 'bg-green-100 text-green-800 border-green-200';
    case 'C3': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'P2': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'P1': return 'bg-red-100 text-red-800 border-red-200';
    default:   return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

/** Format an ISO datetime string as Australian local date/time. */
export function formatAuDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/** Format an ISO date string as Australian local date. */
export function formatAuDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ── Built-in test templates ───────────────────────────────────────────────────

export interface TestTemplate {
  id: string;
  name: string;
  measurementName: string;
  unit: string;
  testCurrentOrVoltage: string | null;
  minAccept: number | null;
  maxAccept: number | null;
  assessmentMethod: string;
  sourceStandard: string | null;
  documentNumber: string | null;
  documentVersion: string | null;
  documentDate: string | null;
  applicableCustomer: string | null;
  applicableAssetClass: string | null;
  isEQEarthTail: boolean;
}

export const BUILTIN_TEMPLATES: TestTemplate[] = [
  {
    id: 'earth_continuity',
    name: 'Earth Continuity',
    measurementName: 'Resistance',
    unit: 'Ω',
    testCurrentOrVoltage: null,
    minAccept: null,
    maxAccept: null,
    assessmentMethod: 'Manual assessment required — refer to applicable standard',
    sourceStandard: null,
    documentNumber: null,
    documentVersion: null,
    documentDate: null,
    applicableCustomer: null,
    applicableAssetClass: null,
    isEQEarthTail: false,
  },
  {
    id: 'eq_earth_tail',
    name: 'Earth Tail Continuity (EQ)',
    measurementName: 'Resistance',
    unit: 'mΩ',
    testCurrentOrVoltage: null,
    minAccept: null,
    maxAccept: null,
    assessmentMethod: 'Automatic — EQ STNW3359 Rev 4 condition classification',
    sourceStandard: 'EQ STNW3359',
    documentNumber: 'STNW3359',
    documentVersion: 'Rev 4',
    documentDate: null,
    applicableCustomer: 'Energy Queensland',
    applicableAssetClass: 'Distribution — Earth Tail',
    isEQEarthTail: true,
  },
  {
    id: 'joint_contact_resistance',
    name: 'Joint / Contact Resistance',
    measurementName: 'Resistance',
    unit: 'mΩ',
    testCurrentOrVoltage: null,
    minAccept: null,
    maxAccept: null,
    assessmentMethod: 'Manual assessment required — refer to applicable standard',
    sourceStandard: null,
    documentNumber: null,
    documentVersion: null,
    documentDate: null,
    applicableCustomer: null,
    applicableAssetClass: null,
    isEQEarthTail: false,
  },
  {
    id: 'insulation_resistance',
    name: 'Insulation Resistance',
    measurementName: 'Resistance',
    unit: 'MΩ',
    testCurrentOrVoltage: '500 V DC',
    minAccept: null,
    maxAccept: null,
    assessmentMethod: 'Manual assessment required — refer to applicable standard',
    sourceStandard: null,
    documentNumber: null,
    documentVersion: null,
    documentDate: null,
    applicableCustomer: null,
    applicableAssetClass: null,
    isEQEarthTail: false,
  },
  {
    id: 'general_electrical',
    name: 'General Electrical Measurement',
    measurementName: 'Measurement',
    unit: 'V',
    testCurrentOrVoltage: null,
    minAccept: null,
    maxAccept: null,
    assessmentMethod: 'Manual assessment required',
    sourceStandard: null,
    documentNumber: null,
    documentVersion: null,
    documentDate: null,
    applicableCustomer: null,
    applicableAssetClass: null,
    isEQEarthTail: false,
  },
  {
    id: 'custom',
    name: 'Custom Test',
    measurementName: 'Measurement',
    unit: '',
    testCurrentOrVoltage: null,
    minAccept: null,
    maxAccept: null,
    assessmentMethod: 'Manual assessment required',
    sourceStandard: null,
    documentNumber: null,
    documentVersion: null,
    documentDate: null,
    applicableCustomer: null,
    applicableAssetClass: null,
    isEQEarthTail: false,
  },
];

export function getTemplate(id: string): TestTemplate | undefined {
  return BUILTIN_TEMPLATES.find(t => t.id === id);
}

/**
 * Run the appropriate assessment for a test record.
 * Only applies EQ Earth Tail criteria when that template is explicitly selected.
 */
export function assessTestRecord(
  templateId: string,
  measuredValue: number | null,
  minAccept: number | null,
  maxAccept: number | null,
  standardRef: string | null,
): AssessmentOutput {
  if (measuredValue === null) {
    return { result: 'MANUAL', condition: null, label: 'No measurement recorded', standardRef: null };
  }
  const tpl = getTemplate(templateId);
  if (tpl?.isEQEarthTail) {
    return evalEQEarthTail(measuredValue);
  }
  return evalGeneric(measuredValue, minAccept, maxAccept, standardRef);
}
