/**
 * LensJobPickerSheet — thin re-export of the shared JobPickerSheet.
 * ─────────────────────────────────────────────────────────────────────────────
 * All Lens components that import LensJobPickerSheet or LensJobOption continue
 * to work unchanged. The implementation now lives in:
 *   src/components/shared/JobPickerSheet.tsx
 */

export { default } from '@/components/shared/JobPickerSheet';
export type { JobOption as LensJobOption } from '@/components/shared/JobPickerSheet';
export { jobOptionLabel as jobLabel } from '@/components/shared/JobPickerSheet';
