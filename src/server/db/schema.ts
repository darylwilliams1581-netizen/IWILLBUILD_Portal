import {
  mysqlTable,
  varchar,
  text,
  boolean,
  timestamp,
  int,
} from 'drizzle-orm/mysql-core';

// ── BetterAuth required tables ──────────────────────────────────────────────

export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  isAdmin: boolean('is_admin').default(false),
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

export const jobPhotos = mysqlTable('job_photos', {
  id: int('id').primaryKey().autoincrement(),
  jobId: int('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }),
  label: varchar('label', { length: 255 }),
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: int('size_bytes'),
  createdAt: timestamp('created_at').defaultNow(),
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
