/**
 * Server-safe list of all valid home icon keys.
 * Kept in sync with src/lib/homeIcons.ts — no React imports here.
 */
export const ALL_HOME_ICON_KEYS: string[] = [
  // Work (field)
  'jobs', 'work', 'job_card', 'scheduler', 'progress', 'delays', 'notes', 'log_cost',
  // Field & Files
  'lens', 'plan_mgr', 'files',
  // Fleet
  'fleet',
  // Finance
  'quotes', 'invoices_mgmt', 'ledger', 'purchase_orders',
  // Safety
  'forms', 'safety', 'poster', 'incidents', 'risky',
  // Administration
  'stakeholders', 'team', 'billing', 'settings', 'help',
  // Coming soon
  'report', 'timesheet', 'site_diary', 'rainfall', 'checklist',
  'messages', 'invoices_field', 'daily_log', 'weather',
];

/** Minimal default set for new invited employees */
export const DEFAULT_FIELD_KEYS: string[] = [
  'lens', 'work', 'safety', 'risky',
];
