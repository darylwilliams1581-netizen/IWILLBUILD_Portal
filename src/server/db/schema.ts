import {
  mysqlTable,
  varchar,
  text,
  boolean,
  timestamp,
  int,
  date,
} from 'drizzle-orm/mysql-core';

// ── BetterAuth required tables ──────────────────────────────────────────────

export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  isAdmin: boolean('is_admin').default(false),
  // Account recovery additions
  phoneNumber:        varchar('phone_number', { length: 30 }),
  verificationMethod: varchar('verification_method', { length: 30 }),
  // Dedicated phone verification flag — never conflated with emailVerified
  phoneVerified:      boolean('phone_verified').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const session = mysqlTable('session', {
  id: varchar('id', { length: 36 }).primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const account = mysqlTable('account', {
  id: varchar('id', { length: 36 }).primaryKey(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: varchar('password', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const verification = mysqlTable('verification', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── IWILLBUILD app tables ────────────────────────────────────────────────────

export const companies = mysqlTable('companies', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 255 }).notNull(),
  abn: varchar('abn', { length: 20 }),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 255 }),
  website: varchar('website', { length: 255 }),
  address: text('address'),
  // ── SaaS subscription fields ─────────────────────────────────────────────
  // plan: solo | team | pro | enterprise
  plan: varchar('plan', { length: 30 }).notNull().default('trial'),
  // subscriptionStatus: trial | active | past_due | cancelled | expired
  subscriptionStatus: varchar('subscription_status', { length: 30 }).notNull().default('trial'),
  trialEndsAt: timestamp('trial_ends_at'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
  stripePriceId: varchar('stripe_price_id', { length: 100 }),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  cancelledAt: timestamp('cancelled_at'),
  pastDueSince: timestamp('past_due_since'),
  maxUsers: int('max_users').notNull().default(1),
  industry: varchar('industry', { length: 50 }).notNull().default('construction'),
  // starter_pack_loaded / starter_pack_loaded_at are NOT in the Drizzle schema —
  // late-added columns read/written via raw SQL only to avoid cold-start crashes.
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const companyMembers = mysqlTable('company_members', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('viewer'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const profiles = mysqlTable('profiles', {
  id: int('id').primaryKey().autoincrement(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  companyId: int('company_id').references(() => companies.id, { onDelete: 'set null' }),
  phone: varchar('phone', { length: 30 }),
  role: varchar('role', { length: 50 }).notNull().default('viewer'),
  // Status: active | invited | inactive
  status: varchar('status', { length: 30 }).notNull().default('active'),
  // Granular permission toggles (1 = allowed, 0 = denied)
  permJobs:        boolean('perm_jobs').notNull().default(true),
  permFleet:       boolean('perm_fleet').notNull().default(true),
  permForms:       boolean('perm_forms').notNull().default(true),
  permFiles:       boolean('perm_files').notNull().default(true),
  permEstimating:  boolean('perm_estimating').notNull().default(true),
  permDazzaAi:     boolean('perm_dazza_ai').notNull().default(true),
  permAdmin:       boolean('perm_admin').notNull().default(false),
  permSeeDollars:  boolean('perm_see_dollars').notNull().default(true),
  permInviteUsers: boolean('perm_invite_users').notNull().default(false),
  permDeleteRecords: boolean('perm_delete_records').notNull().default(false),
  permInvoices: boolean('perm_invoices').notNull().default(true),
  // Platform-level role — separate from company role.
  // 'developer' = IWILLBUILD platform developer (full Owner Console access)
  // 'support' = platform support staff (read-only Owner Console)
  // null = normal company user
  // platform_role is NOT in the Drizzle schema — it's a late-added column read via raw SQL only.
  // Keeping it out of the schema prevents Drizzle from including it in SELECT * queries,
  // which would crash on production DBs that haven't run the startup migration yet.
  // Notification preferences stored as JSON blob (user-scoped)
  notificationPrefs: text('notification_prefs'),
  // Home screen icon permissions — JSON array of allowed icon keys.
  // null = not set yet (use role-based defaults). Set at invite time or via Team & Permissions.
  homeIconPermissions: text('home_icon_permissions'),
  // Activity tracking
  lastLoginAt: timestamp('last_login_at'),
  lastActiveAt: timestamp('last_active_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const jobs = mysqlTable('jobs', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobNumber: varchar('job_number', { length: 50 }),
  name: varchar('name', { length: 255 }).notNull(),
  client: varchar('client', { length: 255 }),
  address: text('address'),
  status: varchar('status', { length: 60 }).notNull().default('New'),
  notes: text('notes'),
  // Scheduler v2 — explicit scheduled vs actual dates
  scheduledStartDate: date('scheduled_start_date'),
  expectedCompletionDate: date('expected_completion_date'),
  actualStartDate: date('actual_start_date'),
  actualCompletionDate: date('actual_completion_date'),
  assignedSupervisorUserId: varchar('assigned_supervisor_user_id', { length: 36 }),
  assignedTeamLabel: varchar('assigned_team_label', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const fleetAssets = mysqlTable('fleet_assets', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  assetNumber: varchar('asset_number', { length: 50 }),
  type: varchar('type', { length: 100 }).notNull().default('Vehicle'),
  makeModel: varchar('make_model', { length: 255 }),
  rego: varchar('rego', { length: 50 }),
  regoNotApplicable: boolean('rego_not_applicable').notNull().default(false),
  serviceDate: timestamp('service_date'),
  regoExpiry: timestamp('rego_expiry'),
  status: varchar('status', { length: 60 }).notNull().default('Active'),
  notes: text('notes'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const fleetPrestarts = mysqlTable('fleet_prestarts', {
  id: int('id').primaryKey().autoincrement(),
  assetId: int('asset_id')
    .notNull()
    .references(() => fleetAssets.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  operatorName: varchar('operator_name', { length: 255 }),
  kmHours: varchar('km_hours', { length: 50 }),
  safeToOperate: boolean('safe_to_operate').notNull().default(true),
  issueNeedsAttention: boolean('issue_needs_attention').notNull().default(false),
  issueComment: text('issue_comment'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const fleetDriverSessions = mysqlTable('fleet_driver_sessions', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  fleetAssetId: int('fleet_asset_id')
    .notNull()
    .references(() => fleetAssets.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  driverName: varchar('driver_name', { length: 255 }).notNull(),
  startAt: timestamp('start_at').notNull().defaultNow(),
  endAt: timestamp('end_at'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  source: varchar('source', { length: 50 }).notNull().default('dashboard_quick_start'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const dazzaThreads = mysqlTable('dazza_threads', {
  id: int('id').primaryKey().autoincrement(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  companyId: int('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Media Assets ──────────────────────────────────────────────────────────────
// Canonical record for every file stored in R2 (or local storage).
// job_photos.media_asset_id is a FK to this table.
// Created here so the FK column on job_photos resolves at migration time.
export const mediaAssets = mysqlTable('media_assets', {
  id:            int('id').primaryKey().autoincrement(),
  companyId:     int('company_id').references(() => companies.id, { onDelete: 'set null' }),
  uploadedByUserId: varchar('uploaded_by_user_id', { length: 36 }),
  /** R2 / local storage object key — the permanent identifier */
  storageKey:    varchar('storage_key', { length: 500 }).notNull(),
  /** Bucket / container name (e.g. "job-card-photos") */
  bucket:        varchar('bucket', { length: 100 }),
  originalName:  varchar('original_name', { length: 255 }),
  mimeType:      varchar('mime_type', { length: 100 }),
  sizeBytes:     int('size_bytes'),
  imageWidth:    int('image_width'),
  imageHeight:   int('image_height'),
  /** Optional: signed URL cached here for fast reads (expires, not authoritative) */
  cachedUrl:     text('cached_url'),
  cachedUrlExpiresAt: timestamp('cached_url_expires_at'),
  createdAt:     timestamp('created_at').defaultNow(),
  updatedAt:     timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const jobPhotos = mysqlTable('job_photos', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  // Original file — always kept for download/evidence
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }),
  label: varchar('label', { length: 255 }),
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: int('size_bytes'),
  // Thumbnail — ~300px wide JPEG, generated server-side after upload
  thumbnailKey: varchar('thumbnail_key', { length: 255 }),
  thumbnailMimeType: varchar('thumbnail_mime_type', { length: 100 }),
  thumbnailSizeBytes: int('thumbnail_size_bytes'),
  // Preview — ~1000px wide JPEG (optional, for lightbox)
  previewKey: varchar('preview_key', { length: 255 }),
  previewMimeType: varchar('preview_mime_type', { length: 100 }),
  previewSizeBytes: int('preview_size_bytes'),
  // Dimensions of the original (populated when Jimp can decode)
  imageWidth: int('image_width'),
  imageHeight: int('image_height'),
  uploadedByUserId: varchar('uploaded_by_user_id', { length: 36 }),
  uploadedByName: varchar('uploaded_by_name', { length: 255 }),
  caption: text('caption'),
  category: varchar('category', { length: 100 }),
  // Lock fields — set when a photo is saved & locked via the photo editor
  status: varchar('status', { length: 20 }).default('draft'),
  lockedAt: timestamp('locked_at'),
  lockedByUserId: varchar('locked_by_user_id', { length: 36 }),
  lockedByName: varchar('locked_by_name', { length: 255 }),
  // FK to canonical media_assets row (populated by uploadService)
  mediaAssetId: int('media_asset_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Job Photo Shares ──────────────────────────────────────────────────────────
export const jobPhotoShares = mysqlTable('job_photo_shares', {
  id:                int('id').primaryKey().autoincrement(),
  jobId:             int('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  companyId:         int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  tokenHash:         varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt:         timestamp('expires_at'),
  createdByUserId:   varchar('created_by_user_id', { length: 36 }),
  createdAt:         timestamp('created_at').defaultNow(),
});

export const formTemplates = mysqlTable('form_templates', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  formType: varchar('form_type', { length: 50 }).notNull().default('Job'),
  category: varchar('category', { length: 100 }),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  onDashboard: boolean('on_dashboard').notNull().default(false),
  onJobs: boolean('on_jobs').notNull().default(false),
  onFleet: boolean('on_fleet').notNull().default(false),
  sharedInLibrary: boolean('shared_in_library').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const formTemplateFields = mysqlTable('form_template_fields', {
  id: int('id').primaryKey().autoincrement(),
  templateId: int('template_id')
    .notNull()
    .references(() => formTemplates.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 255 }).notNull().default(''),
  fieldType: varchar('field_type', { length: 50 }).notNull().default('short_text'),
  required: boolean('required').notNull().default(false),
  optionsJson: text('options_json'),
  settingsJson: text('settings_json'),
  logicJson: text('logic_json'),
  fieldOrder: int('field_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const jobFormSubmissions = mysqlTable('job_form_submissions', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateId: int('template_id')
    .notNull()
    .references(() => formTemplates.id, { onDelete: 'cascade' }),
  completedByUserId: varchar('completed_by_user_id', { length: 255 }).notNull(),
  completedByName: varchar('completed_by_name', { length: 255 }),
  status: varchar('status', { length: 30 }).notNull().default('in_progress'), // in_progress | completed
  answersJson: text('answers_json'), // JSON object of fieldId -> answer
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const estimates = mysqlTable('estimates', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 60 }).notNull().default('Draft'),
  markupPercent: varchar('markup_percent', { length: 20 }).notNull().default('0'),
  gstMode: varchar('gst_mode', { length: 30 }).notNull().default('No GST'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const estimateLines = mysqlTable('estimate_lines', {
  id: int('id').primaryKey().autoincrement(),
  estimateId: int('estimate_id')
    .notNull()
    .references(() => estimates.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: varchar('quantity', { length: 30 }).notNull().default('1'),
  unit: varchar('unit', { length: 50 }),
  rate: varchar('rate', { length: 30 }).notNull().default('0'),
  lineOrder: int('line_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Estimating Library ───────────────────────────────────────────────────────

export const costGuideItems = mysqlTable('cost_guide_items', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 255 }).notNull(),
  unit: varchar('unit', { length: 50 }),
  rate: varchar('rate', { length: 30 }).notNull().default('0'),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const recipes = mysqlTable('recipes', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  notes: text('notes'),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const recipeLines = mysqlTable('recipe_lines', {
  id: int('id').primaryKey().autoincrement(),
  recipeId: int('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: varchar('quantity', { length: 30 }).notNull().default('1'),
  unit: varchar('unit', { length: 50 }),
  rate: varchar('rate', { length: 30 }).notNull().default('0'),
  lineOrder: int('line_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Files ─────────────────────────────────────────────────────────────────────

export const companyFiles = mysqlTable('company_files', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: int('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  fleetAssetId: int('fleet_asset_id').references(() => fleetAssets.id, { onDelete: 'set null' }),
  uploadedByUserId: varchar('uploaded_by_user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  storedName: varchar('stored_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: int('size_bytes').notNull(),
  fileCategory: varchar('file_category', { length: 50 }).notNull().default('Other'),
  label: varchar('label', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Job To-dos ────────────────────────────────────────────────────────────────

export const jobTodos = mysqlTable('job_todos', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),                          // longer detail field (new)
  startDate: varchar('start_date', { length: 20 }),          // ISO date YYYY-MM-DD (new)
  dueDate: varchar('due_date', { length: 20 }),              // ISO date string YYYY-MM-DD
  // Open | In Progress | Completed | Cancelled
  status: varchar('status', { length: 30 }).notNull().default('Open'),
  assignedUserId: varchar('assigned_user_id', { length: 36 }), // user.id (new)
  assignedName: varchar('assigned_name', { length: 255 }),     // denormalised display name (new)
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Job Progress Lines ────────────────────────────────────────────────────────

// ── Program of Works: sections ─────────────────────────────────────────────
export const jobProgressSections = mysqlTable('job_progress_sections', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const jobProgressLines = mysqlTable('job_progress_lines', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  // Section membership (nullable — null = Unsectioned)
  sectionId: int('section_id'),
  estimateLineId: int('estimate_line_id'), // source line reference (nullable)
  description: text('description').notNull(),
  // Financial fields — preserved for historical PO compatibility, not shown in PoW UI
  quantity: varchar('quantity', { length: 30 }).notNull().default('1'),
  unit: varchar('unit', { length: 50 }),
  rate: varchar('rate', { length: 30 }).notNull().default('0'),
  percentComplete: int('percent_complete').notNull().default(0), // 0-100
  progressNote: text('progress_note'),
  // Program of Works scheduling fields
  startDate: date('start_date'),
  endDate: date('end_date'),
  sortOrder: int('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const estimatingTakeoffPads = mysqlTable('estimating_takeoff_pads', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull(),
  title: varchar('title', { length: 255 }).notNull().default(''),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const downloads = mysqlTable('downloads', {
  id: int('id').primaryKey().autoincrement(),
  companyId: int('company_id').references(() => companies.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  fileType: varchar('file_type', { length: 20 }),
  fileSize: varchar('file_size', { length: 30 }),
  version: varchar('version', { length: 30 }),
  url: text('url'),
  isPublic: boolean('is_public').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Dazza AI audit log ────────────────────────────────────────────────────────
// Records every Dazza chat turn that touches sensitive data.
// Never stores raw secrets, passwords, or full AI responses.
export const dazzaAuditLog = mysqlTable('dazza_audit_log', {
  id:              int('id').primaryKey().autoincrement(),
  userId:          varchar('user_id', { length: 36 }).notNull(),
  companyId:       int('company_id').notNull(),
  questionSummary: varchar('question_summary', { length: 500 }).notNull(),
  modulesUsed:     varchar('modules_used', { length: 255 }).notNull().default(''),
  dollarsIncluded: boolean('dollars_included').notNull().default(false),
  supportMode:     boolean('support_mode').notNull().default(false),
  supportCompanyId: int('support_company_id'),
  createdAt:       timestamp('created_at').defaultNow(),
});

// ── User activity events ──────────────────────────────────────────────────────
export const userActivityEvents = mysqlTable('user_activity_events', {
  id:           int('id').primaryKey().autoincrement(),
  companyId:    int('company_id').notNull(),
  userId:       varchar('user_id', { length: 36 }).notNull(),
  eventType:    varchar('event_type', { length: 50 }).notNull(), // login | logout | active
  metadataJson: text('metadata_json'),
  createdAt:    timestamp('created_at').defaultNow(),
});

// ── Support audit events ──────────────────────────────────────────────────────
export const supportAuditEvents = mysqlTable('support_audit_events', {
  id:              int('id').primaryKey().autoincrement(),
  ownerUserId:     varchar('owner_user_id', { length: 36 }).notNull(),
  targetCompanyId: int('target_company_id').notNull(),
  actionType:      varchar('action_type', { length: 100 }).notNull(),
  entityType:      varchar('entity_type', { length: 100 }),
  entityId:        varchar('entity_id', { length: 100 }),
  summary:         text('summary'),
  metadataJson:    text('metadata_json'),
  createdAt:       timestamp('created_at').defaultNow(),
});

// ── Account recovery tables ───────────────────────────────────────────────────

export const passwordResetTokens = mysqlTable('password_reset_tokens', {
  id:        varchar('id', { length: 36 }).primaryKey(),
  userId:    varchar('user_id', { length: 36 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const smsVerificationCodes = mysqlTable('sms_verification_codes', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  userId:     varchar('user_id', { length: 36 }).notNull(),
  codeHash:   varchar('code_hash', { length: 64 }).notNull(),
  phone:      varchar('phone', { length: 30 }).notNull(),
  expiresAt:  timestamp('expires_at').notNull(),
  attempts:   int('attempts').notNull().default(0),
  verifiedAt: timestamp('verified_at'),
  createdAt:  timestamp('created_at').defaultNow(),
});

export const trustedDevices = mysqlTable('trusted_devices', {
  id:                varchar('id', { length: 36 }).primaryKey(),
  userId:            varchar('user_id', { length: 36 }).notNull(),
  deviceName:        varchar('device_name', { length: 255 }),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }).notNull(),
  pinHash:           varchar('pin_hash', { length: 255 }),
  pinAttempts:       int('pin_attempts').notNull().default(0),
  pinLockedUntil:    timestamp('pin_locked_until'),
  lastUsedAt:        timestamp('last_used_at'),
  createdAt:         timestamp('created_at').defaultNow(),
});

export const manualVerificationLog = mysqlTable('manual_verification_log', {
  id:               int('id').primaryKey().autoincrement(),
  targetUserId:     varchar('target_user_id', { length: 36 }).notNull(),
  verifiedByUserId: varchar('verified_by_user_id', { length: 36 }).notNull(),
  method:           varchar('method', { length: 30 }).notNull().default('manual_admin'),
  note:             text('note'),
  createdAt:        timestamp('created_at').defaultNow(),
});

// ── Starter Pack Runs ─────────────────────────────────────────────────────────
export const starterPackRuns = mysqlTable('starter_pack_runs', {
  id:            int('id').primaryKey().autoincrement(),
  companyId:     int('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  runByUserId:   varchar('run_by_user_id', { length: 36 }),
  status:        varchar('status', { length: 30 }).notNull().default('pending'), // pending | success | partial | failed
  notes:         text('notes'),
  createdAt:     timestamp('created_at').defaultNow(),
});

// ── Alias: formFields → formTemplateFields ────────────────────────────────────
// Several handlers import `formFields` from schema. They target the same
// form_template_fields table — this alias keeps them compiling without
// requiring a data migration or handler rewrite.
export const formFields = formTemplateFields;
