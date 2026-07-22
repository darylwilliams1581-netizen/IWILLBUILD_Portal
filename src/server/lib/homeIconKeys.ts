/**
 * Server-safe list of all valid home icon keys.
 * Kept in sync with src/lib/homeIcons.ts — no React imports here.
 */
export const ALL_HOME_ICON_KEYS: string[] = [
  // Field
  'camera', 'sign_in', 'drive', 'prestart', 'forms', 'notes',
  'log_cost', 'delays', 'progress', 'drawings', 'equipment',
  // Safety
  'safety', 'poster', 'policies', 'safety_plan',
  // Tools
  'builders_calc', 'takeoff_pad',
  // Management
  'jobs', 'quotes', 'estimating', 'invoices_mgmt', 'stakeholders',
  'ledger', 'scheduler', 'fleet', 'files', 'team', 'billing',
  'studio', 'settings', 'dazza_ai',
  // Coming soon (10 placeholders)
  'report', 'timesheet', 'site_diary', 'rainfall', 'checklist',
  'messages', 'invoices_field', 'whs_docs', 'daily_log', 'weather',
];

/** Minimal default set for new invited employees */
export const DEFAULT_FIELD_KEYS: string[] = [
  'camera', 'sign_in', 'drive', 'safety', 'prestart',
];
