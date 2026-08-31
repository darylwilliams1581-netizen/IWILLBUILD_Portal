/**
 * rl-calc.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure calculation helpers for the Job Site RL Register.
 * No side effects, no I/O — safe to import in tests and frontend.
 *
 * All RL values are in METRES with three decimal places of precision.
 * Millimetre values are whole numbers (rounded, not truncated).
 */

import { isValidRLValue } from './string-scanners.js';

/** Round to 3 decimal places (metres precision). */
export function roundRL(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Format a metre value to exactly 3 decimal places. */
export function formatRL(value: number): string {
  return value.toFixed(3);
}

/**
 * Difference between two RL points: B − A.
 * Positive = B is higher than A.
 * Negative = B is lower than A.
 */
export function calcDiff(rlA: number, rlB: number): number {
  return roundRL(rlB - rlA);
}

/**
 * Difference from a target RL: measured − target.
 * Positive = above target.
 * Negative = below target.
 */
export function calcDiffFromTarget(measured: number, target: number): number {
  return roundRL(measured - target);
}

/**
 * Rise/fall from benchmark.
 * Formula: Point RL = Benchmark RL + signed rise/fall
 * Rise is positive, fall is negative.
 */
export function calcRiseFall(benchmarkRL: number, signedRiseFall: number): number {
  return roundRL(benchmarkRL + signedRiseFall);
}

/** Convert metres to whole millimetres (rounded). */
export function metresToMm(metres: number): number {
  return Math.round(metres * 1000);
}

/** Convert millimetres to metres (3 dp). */
export function mmToMetres(mm: number): number {
  return roundRL(mm / 1000);
}

export type ToleranceResult = 'ON_LEVEL' | 'HIGH' | 'LOW';

/**
 * Evaluate a measured RL against a target with an optional tolerance in mm.
 * Returns ON_LEVEL, HIGH, or LOW.
 * If no tolerance is provided, any non-zero difference is HIGH or LOW.
 */
export function evalTolerance(
  measured: number,
  target: number,
  toleranceMm = 0
): ToleranceResult {
  const diffMm = metresToMm(calcDiffFromTarget(measured, target));
  const tol = Math.abs(toleranceMm);
  if (Math.abs(diffMm) <= tol) return 'ON_LEVEL';
  return diffMm > 0 ? 'HIGH' : 'LOW';
}

/**
 * Format a signed difference for display.
 * Always shows sign, metres to 3 dp, and mm as whole number.
 *
 * Examples:
 *   +0.025 m  (+25 mm HIGH)
 *   −0.018 m  (−18 mm LOW)
 *    0.000 m  (0 mm ON LEVEL)
 */
export function formatDiff(diffMetres: number, result?: ToleranceResult): string {
  const mm = metresToMm(diffMetres);
  const sign = diffMetres > 0 ? '+' : diffMetres < 0 ? '−' : '';
  const absM = Math.abs(diffMetres).toFixed(3);
  const absMm = Math.abs(mm);

  const label = result
    ? result === 'ON_LEVEL' ? 'ON LEVEL' : result
    : diffMetres > 0 ? 'HIGH' : diffMetres < 0 ? 'LOW' : 'ON LEVEL';

  if (diffMetres === 0) {
    return `0.000 m  (0 mm ON LEVEL)`;
  }
  return `${sign}${absM} m  (${sign}${absMm} mm ${label})`;
}

/**
 * Format a signed difference as a short string for table cells / exports.
 * e.g. "+0.025 m", "−0.018 m", "0.000 m"
 */
export function formatDiffShort(diffMetres: number): string {
  if (diffMetres === 0) return '0.000 m';
  const sign = diffMetres > 0 ? '+' : '−';
  return `${sign}${Math.abs(diffMetres).toFixed(3)} m`;
}

/**
 * Format a signed mm value for table cells / exports.
 * e.g. "+25 mm", "−18 mm", "0 mm"
 */
export function formatMmShort(diffMetres: number): string {
  const mm = metresToMm(diffMetres);
  if (mm === 0) return '0 mm';
  const sign = mm > 0 ? '+' : '−';
  return `${sign}${Math.abs(mm)} mm`;
}

/** Validate that an RL string has at most 3 decimal places. */
export function isValidRL(value: string): boolean {
  return isValidRLValue(value);
}

/** Parse an RL string to a number, returning NaN if invalid. */
export function parseRL(value: string): number {
  if (!isValidRL(value)) return NaN;
  return parseFloat(value.trim());
}
