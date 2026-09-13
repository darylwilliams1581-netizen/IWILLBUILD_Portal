/**
 * Server-safe list of all valid home icon keys.
 * Kept in sync with src/lib/homeIcons.ts — no React imports here.
 */
export const ALL_HOME_ICON_KEYS: string[] = [
  // Work (field)
  'tools', 'jobs', 'job_card', 'log_cost', 'scheduler',
  // Field & Files
  'lens', 'plan_mgr', 'files', 'asset_mgr',
  // Fleet
  'fleet',
  // Finance
  'quotes', 'invoices_mgmt', 'ledger', 'purchase_orders', 'estimating', 'builders_calc', 'takeoff_pad', 'finance_settings',
  // Safety
  'forms', 'safety', 'poster', 'incidents', 'risk_register', 'sds_register', 'rl_register', 'electrical_tests', 'risky',
  // Administration
  'profile', 'dazza_ai', 'library', 'quick_links', 'lists', 'user_logs', 'signin_history', 'team', 'billing', 'settings', 'help',
];

/** Minimal default set for new invited employees */
export const DEFAULT_FIELD_KEYS: string[] = [
  'lens', 'work', 'safety', 'risky',
];
