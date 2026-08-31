# IWILLBUILD Portal — System Map / Product Bible

> **Last updated:** July 2026  
> **Purpose:** Developer and admin reference. Describes the full platform architecture, module inventory, permission model, data model, API surface, and known constraints. Keep this document updated as the platform evolves.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [Navigation Structure](#3-navigation-structure)
4. [User Roles & Permission Model](#4-user-roles--permission-model)
5. [Company Scoping Rules](#5-company-scoping-rules)
6. [Billing & Subscription States](#6-billing--subscription-states)
7. [View-Only Mode Rules](#7-view-only-mode-rules)
8. [Plan Limits & Storage](#8-plan-limits--storage)
9. [File & Photo Handling](#9-file--photo-handling)
10. [Database Tables (by module)](#10-database-tables-by-module)
11. [API Endpoints (by module)](#11-api-endpoints-by-module)
12. [Dazza AI Architecture](#12-dazza-ai-architecture)
13. [Annette Core / Brain Architecture](#13-annette-core--brain-architecture)
14. [Safety Module](#14-safety-module)
15. [Forms System](#15-forms-system)
16. [Studio Module](#16-studio-module)
17. [Attendance & QR Sign-In](#17-attendance--qr-sign-in)
18. [Fleet Sign-On/Off & Analytics](#18-fleet-sign-onoff--analytics)
19. [Emergency Beacon](#19-emergency-beacon)
20. [Session Timeout System](#20-session-timeout-system)
21. [Note Tagging & Tag Tasks](#21-note-tagging--tag-tasks)
22. [Skip Logic (Forms)](#22-skip-logic-forms)
23. [PWA (Progressive Web App)](#23-pwa-progressive-web-app)
24. [Sign-In History](#24-sign-in-history)
25. [Document Builder](#25-document-builder)
26. [Industry Mode](#26-industry-mode)
27. [Template Pack System (Direction)](#27-template-pack-system-direction)
28. [Owner Console](#28-owner-console)
29. [Known Issues / Incomplete Areas](#29-known-issues--incomplete-areas)
30. [Critical "Do Not Break" Workflows](#30-critical-do-not-break-workflows)
31. [Future Migration Notes](#31-future-migration-notes)

---

## 1. Product Overview

IWILLBUILD is a SaaS construction management portal for small-to-medium construction, civil, landscaping, plant hire, fuel/dangerous goods, and general trades businesses. It is a **multi-tenant, company-scoped** platform where each subscribing company gets isolated data.

**Core value proposition:**
- Job management with estimates, costs, progress, photos, files, forms, and safety
- Fleet management with prestarts, maintenance tracking, sign-on/off, and GPS analytics
- Digital forms with conditional logic, skip logic, multi-signer, GPS, and photo capture
- Safety module: SWMS, site safety plans, policies, posters, and AI-assisted drafting
- Studio: multi-tab hub for Documents, Forms, Library, and Safety content
- Attendance & QR sign-in for jobs and fleet assets
- Emergency beacon with offline queue and audit trail
- Dazza AI: a construction-aware AI assistant that reads live portal data
- Estimating library and cost guide
- Team management with role-based access
- Stripe-powered subscription billing with trial, plan limits, and view-only enforcement
- PWA: installable on iOS and Android, works offline

**Deployment:**
- Live at: `iwillbuild.com`
- Stack: Vite + React SPA (SSR via `@dr.pogodin/react-helmet`) + Express API server
- Database: MySQL via Drizzle ORM (with raw `db.execute(sql...)` for DDL and complex queries)
- Storage: Local disk at `/shared-storage/public/assets/<bucket>/` (web-accessible via `/airo-assets/uploads/`)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Routing | React Router v7 (data router, SSR-compatible) |
| SSR | `renderToString` + `@dr.pogodin/react-helmet` + `StaticRouterProvider` |
| Backend | Express.js (explicit route registration in `src/server/entry.ts`) |
| ORM | Drizzle ORM (`src/server/db/client.ts` — TREAT AS IMMUTABLE) |
| Database | MySQL |
| Auth | better-auth (`src/lib/auth/auth.ts`) |
| Payments | Stripe (`2026-02-25.clover` API version) |
| AI | OpenAI `gpt-4o-mini` via raw `fetch` (never the `openai` npm package) |
| File processing | Jimp v1 (pure JS, Alpine-safe) — `JimpMime.jpeg`, lazy async import |
| ZIP export | JSZip (never `archiver`) |
| Fonts | Space Grotesk (headers) + Inter (body) |
| Brand colour | `#F97316` orange / `#FFFFFF` background |
| PWA | `public/manifest.json` — name: IWILLBUILD, theme: `#ff6b00` |

**Critical constraints:**
- Production runs Alpine Linux (musl libc) — **no native addons** (no `bcrypt`, `sharp`, `canvas`)
- Use `bcryptjs` not `bcrypt`; use `jimp` not `sharp`
- `db.execute(sql...)` returns `[rowsArray, fields]` — **always destructure**
- `client.ts` is TREAT AS IMMUTABLE — use `db.execute` only, never direct Drizzle schema mutations
- Express route order: **specific routes BEFORE wildcard routes**
- New DB columns/tables: always via `runStartupMigrations()` self-healing migration in `entry.ts`
- MySQL DDL: **NEVER use `DEFAULT '{}'`** — use `DEFAULT NULL`
- `company_settings` table: **raw SQL only**, not in Drizzle schema
- JSX strings with apostrophes: use `&apos;` or escaped quotes
- `uuid` not installed — use `crypto.randomUUID()`
- `noExternal: true` SSR build — new lucide-react icons must be added to `src/fallbacks/icon-stub.ts`
- Sequential builds only; heap: client `--max-old-space-size=896`, SSR `--max-old-space-size=1800`
- All AI calls use `fetch()` directly — `openai` npm SDK is never imported
- `pdf-lib` and `stripe` are lazily loaded via dynamic import — not in static Rollup graph
- Document export uses `builder_json` column (NOT `content_json`)

**SSR stubs** (in `src/fallbacks/`):
- `date-fns`, `react-pdf`, `pdfjs-dist`, `@opentelemetry` (named-export stub — must correctly implement `context.with(ctx, fn, thisArg, ...args)` and `startActiveSpan` overloads), `@jimp`/`jimp`, `gifwrap`, `docx`, `openai` npm SDK, `@aws-sdk`

---

## 3. Navigation Structure

### Sidebar (all authenticated users)

| Route | Page | Permission gate |
|---|---|---|
| `/` | Dashboard | All |
| `/jobs` | Jobs list | `canJobs` |
| `/jobs/:id` | Job detail (tabbed) | `canJobs` |
| `/estimating` | Estimating library | `canEstimating` |
| `/estimate-editor/:id` | Estimate editor | `canEstimating` |
| `/fleet` | Fleet list | `canFleet` |
| `/fleet/:id` | Fleet detail | `canFleet` |
| `/studio` | Studio (Documents/Forms/Library/Safety) | `canForms` / `canSafety` |
| `/files` | Files | `canFiles` |
| `/team` | Team management | `canTeam` |
| `/scheduler` | Scheduler | All |
| `/signin-history` | Sign-in history | `isAdmin` |
| `/dazza-ai` | Dazza AI chat | `canDazzaAi` |
| `/billing` | Billing | Always accessible |
| `/settings` | Settings | All |
| `/owner-console` | Owner Console | `isOwner` only |

**Removed from sidebar** (redirected to Studio tabs):
- `/forms` → `/studio?tab=forms`
- `/library` → `/studio?tab=library`
- `/safety` → `/studio?tab=safety`

### Auth routes (unauthenticated)

`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/check-email`, `/verify-required`

### Checkout routes

`/checkout/success`, `/checkout/cancel`

### Public / token-validated routes

`/forms/fill/:token` — Public form fill page  
`/safety/sign/:token` — Safety sign deep-link

### SEO redirect routes (noindex)

`/forms`, `/library`, `/safety` — each redirects to `/studio?tab=*` with `noindex` Helmet block

### Job detail tabs

Details · Estimates · Costs · Progress · To-do · Photos · Files · Forms · Notes · Safety · Attendance

---

## 4. User Roles & Permission Model

### Roles (stored in `profiles.role`)

| Role | Description |
|---|---|
| `owner` | Platform owner — first user created. Full access + Owner Console. Only one per platform. |
| `admin` | Company admin — full access within their company. Can manage team, settings, billing. |
| `manager` | Can manage jobs, fleet, forms, safety. Cannot manage team or billing. |
| `worker` | Field worker — limited access. Cannot see dollar amounts. |

### Permission flags (derived in `src/server/lib/dazza-context.ts` → `derivePermissions()`)

| Flag | Description |
|---|---|
| `isOwner` | Platform owner |
| `isAdmin` | Admin or owner |
| `canJobs` | Access jobs module |
| `canFleet` | Access fleet module |
| `canEstimating` | Access estimating |
| `canForms` | Access forms |
| `canFiles` | Access files |
| `canTeam` | Manage team |
| `canSafety` | Access safety module |
| `canDazzaAi` | Access Dazza AI |
| `seeDollars` | See financial amounts (admin/manager only — workers cannot) |
| `canBilling` | Access billing page |

### Permission enforcement

- **Frontend:** `usePermissions()` hook (`src/lib/usePermissions.ts`) — gates UI elements
- **Backend:** `requireWritableSubscription` middleware + `applyWriteGate(app)` in `entry.ts`
- **Dazza AI:** `permissions.canDazzaAi` checked in `POST /api/dazza/chat` before any processing
- **Financial data:** `seeDollars` checked before including estimate/cost data in Dazza context

---

## 5. Company Scoping Rules

**Every database query MUST be scoped to `company_id`.**

- `profile.companyId` is the authoritative company ID for the current session
- All API handlers fetch `profile` from `profiles` table using `session.user.id`
- All DB queries include `WHERE company_id = ${profile.companyId}`
- **No cross-company data is ever returned** — not even to admins of other companies
- The only exception is the **Owner Console** (platform owner only) which can query all companies for monitoring

### Support Mode (Owner only)

- Owner can enter support mode for a specific company via `/api/support-mode/enter`
- While in support mode, `resolveEffectiveCompany()` returns the target company's ID
- Dazza AI context is built for the target company, not the owner's company
- Support mode is audited in `support_mode_audit` table
- Support mode is clearly indicated in the UI (amber banner)

---

## 6. Billing & Subscription States

### Plans

| Plan | Price | User limit |
|---|---|---|
| Solo | $19/mo | 1 |
| Team | $79/mo | 5 |
| Business | $149/mo | 10 |
| Enterprise | Contact only | Custom |

### Subscription state machine

States stored in `companies.subscriptionStatus`:

| State | Description |
|---|---|
| `trial_active` | 30-day free trial, full access |
| `trial_expired` | Trial ended, no subscription — view-only |
| `active` | Paid subscription, full access |
| `cancel_at_period_end` | Cancellation scheduled — full access until period end |
| `cancelled` | Subscription ended — view-only |
| `past_due` | Payment failed — write access suspended |
| `suspended` | Manually suspended by platform owner |

### Stripe integration

- Stripe API version: `2026-02-25.clover`
- Invoices use `parent` field (not `subscription`) — do not use legacy `subscription` field
- Enterprise plan = manual/contact-only — no Stripe checkout
- Webhook events handled: `subscription.updated`, `subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Webhook endpoint: `POST /api/subscription/webhook`

### Cancellation feedback

- `CancelConfirmModal`: 9 radio reasons + optional comment
- Saved to `subscription_cancellation_feedback` table
- Viewable in Owner Console → Cancellation Feedback tab

---

## 7. View-Only Mode Rules

When a company is in `trial_expired`, `cancelled`, `past_due`, or `suspended` state:

- `ViewOnlyBanner` is shown at the top of every portal page
- `ViewOnlyGuard` wraps all write-action buttons — they are disabled with a tooltip
- `useSubscriptionGate` hook provides `isViewOnly` boolean to components
- Dazza AI is **blocked** in view-only mode (returns 403)
- Billing page is **always accessible** regardless of subscription state
- Read operations (viewing jobs, files, forms, etc.) remain available

---

## 8. Plan Limits & Storage

### Plan limits (`src/server/lib/plan-limits.ts`)

- `getPlanLimits(plan)` — returns limits object for a plan
- `checkLimit(companyId, resource, plan)` — checks current usage against limit
- `HARD_LIMITS` — absolute maximums regardless of plan
- Custom overrides stored in `company_settings.custom_limits_json` (Owner Console → Usage tab)

### Storage

- **Active provider:** `localProvider.ts` — disk at `/shared-storage/public/assets/<bucket>/`
- **Web URL pattern:** `/airo-assets/uploads/<path>`
- **Storage service:** `src/server/lib/storage-service.ts`
  - `saveFile(bucket, filename, buffer, mimeType)`
  - `getDownloadStream(bucket, filename)`
  - `deleteFile(bucket, filename)`
  - `getSignedUrl(bucket, filename)`
  - `validateUpload(file, options)`
  - `compressImageIfNeeded(buffer, mimeType)` — uses Jimp
  - `getStorageUsage(companyId)` — returns bytes used

### Storage buckets

| Bucket | Contents |
|---|---|
| `job-photos` | Job photos (compressed via Jimp) |
| `job-files` | Job file attachments |
| `fleet-files` | Fleet vehicle files |
| `form-media` | Form submission photos/signatures |
| `safety-docs` | Safety documents |
| `safety-posters` | Generated safety posters |
| `backups` | Company backup ZIPs |

> **Note:** Fleet files and form media are not yet fully refactored to use the storage service — they may use direct disk paths in some handlers.

---

## 9. File & Photo Handling

### Job Photos

- Upload endpoint: `POST /api/jobs/:id/photos`
- Compression: Jimp v1 — all imports inside `getJimp()` lazy async wrapper
- Jimp API: `JimpMime.jpeg` (not `Jimp.MIME_JPEG`)
- Lightbox, keyboard nav, download, rotate, replace, delete all implemented
- Photos stored in `job_photos` table + disk at `job-photos` bucket

### Job Files

- Upload: `POST /api/jobs/:id/files`
- Download: `GET /api/files/:id/download`
- Stored in `job_files` table + disk at `job-files` bucket

### Fleet Files

- Upload: `POST /api/fleet/:id/files`
- Not yet fully on storage service — uses direct disk paths in some places

### Form Media

- Photos and signatures captured during form submission
- Not yet fully on storage service

### Backup Export

- ZIP via JSZip (never `archiver`)
- Endpoint: `POST /api/settings/backup/export`
- Retention settings in `company_settings.retention_json`

---

## 10. Database Tables (by module)

> All tables include `company_id INT NOT NULL` for multi-tenant scoping unless noted.  
> `company_settings` is raw SQL only — not in Drizzle schema.

### Auth / Users

| Table | Key columns |
|---|---|
| `users` | id (VARCHAR 36), email, name, emailVerified, createdAt |
| `sessions` | id, userId, expiresAt, token |
| `accounts` | id, userId, providerId, accountId |
| `verifications` | id, identifier, value, expiresAt |
| `profiles` | id, userId, companyId, role, pinHash, pinAttempts, pinLockedUntil, trustedDevices_json |

### Companies / Billing

| Table | Key columns |
|---|---|
| `companies` | id, name, subscriptionStatus, stripeCustomerId, stripeSubscriptionId, current_period_end, cancel_at_period_end, cancelled_at, past_due_since, subscriptionPlan, trialEndsAt, **industry** (VARCHAR, default `construction`) |
| `company_settings` | company_id (PK), structure_json, backup_json, last_backup_at, custom_limits_json, retention_json |
| `subscription_cancellation_feedback` | id, company_id, user_id, subscription_id, plan, reason, comment, created_at |

### Jobs

| Table | Key columns |
|---|---|
| `jobs` | id, company_id, title, status, jobType, address, startDate, endDate, notes |
| `job_todos` | id, company_id, job_id, title, completed, dueDate |
| `job_progress` | id, company_id, job_id, milestone, percentage, notes, date |
| `job_photos` | id, company_id, job_id, filename, originalName, size, mimeType, rotation |
| `job_files` | id, company_id, job_id, filename, originalName, size, mimeType |
| `job_costs` | id, company_id, job_id, user_id, purchase_date, merchant, description, category, amount, gst_included, gst_amount, amount_ex_gst, receipt_file_id |
| `job_notes` | id, company_id, job_id, content, created_by |

### Estimating

| Table | Key columns |
|---|---|
| `estimates` | id, company_id, job_id (nullable), title, status, total, notes |
| `estimate_items` | id, estimate_id, company_id, description, qty, unit, rate, total, category |
| `estimating_library` | id, company_id, description, unit, rate, category |
| `cost_guide` | id, company_id, description, unit, rate, category, source |

### Fleet

| Table | Key columns |
|---|---|
| `fleet_vehicles` | id, company_id, name, rego, make, model, year, status, nextService |
| `fleet_prestarts` | id, company_id, vehicle_id, user_id, date, status, items_json, notes |
| `fleet_files` | id, company_id, vehicle_id, filename, originalName, size, mimeType |
| `fleet_flags` | id, company_id, vehicle_id, flagType, description, resolved |
| `fleet_sessions` | id, company_id, vehicle_id, user_id, actor_type, signed_on_at, signed_off_at, start_meter, end_meter, notes, status |
| `fleet_gps_telemetry` | id, company_id, session_id, vehicle_id, lat, lng, speed, heading, accuracy, recorded_at |

### Forms

| Table | Key columns |
|---|---|
| `form_templates` | id, company_id, name, description, industry, fields_json, logic_json, signers_json, status |
| `form_fields` | id, template_id, company_id, fieldType, label, required, options_json, order |
| `job_forms` | id, company_id, job_id, template_id, title, status, submitted_by, submitted_at, data_json, signers_json |

> **Skip logic** is stored in the existing `logic_json` column of `form_templates` — no schema migration required. See [§22 Skip Logic](#22-skip-logic-forms).

### Safety

| Table | Key columns |
|---|---|
| `safety_swms` | id, company_id, title, trade, riskLevel, status, content_json |
| `safety_plans` | id, company_id, job_id, title, status, content_json |
| `safety_documents` | id, company_id, docType, title, version, status, file_path |
| `safety_posters` | id, company_id, posterType, title, file_path, generated_at |
| `safety_generated_posters` | id, company_id, posterType, title, content_json, pdf_path, docx_path |
| `safety_registers` | id, company_id, register_type, title, data_json |

### Attendance

| Table | Key columns |
|---|---|
| `job_attendance` | id, company_id, job_id, user_id, actor_type, signed_in_at, signed_out_at, qr_token, status, notes |

### Emergency Beacon

| Table | Key columns |
|---|---|
| `emergency_alerts` | id, company_id, triggered_by, reason, note, location, status, triggered_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at |

### Notes / Tag Tasks

| Table | Key columns |
|---|---|
| `entity_notes` | id, company_id, entity_type, entity_id, note_type, body, mentions, created_by, created_at |
| `note_tag_tasks` | id, company_id, note_id, assignee, created_by, completed_by, status, due_date, created_at, updated_at |
| `note_comments` | id, company_id, note_id, body, created_by, created_at |

### Documents (Studio)

| Table | Key columns |
|---|---|
| `document_templates` | id, company_id, name, template_type, builder_json, page_layout_json, theme_json, source_docx_path |

### Dazza AI / Brain

| Table | Key columns |
|---|---|
| `dazza_audit_log` | id, company_id, user_id, question_summary, modules_used, dollars_included, support_mode, support_company_id, created_at |
| `dazza_knowledge` | id, company_id, title, content, category, active, created_at |
| `dazza_brain_entries` | id, company_id, title, category, content, source_label, confidence, approved, active, approved_by_user_id, usage_count, last_used_at |
| `dazza_hive_pending` | id, company_id, user_id, question, suggested_title, suggested_content, suggested_category, source_type, status, reviewed_by_user_id, reviewed_at |
| `dazza_brain_interactions` | id, company_id, user_id, question_summary, answer_source, modules_used, confidence_level, conflict_detected, dollars_included, support_mode, support_company_id, tokens_used, created_at |

### Notifications / Activity

| Table | Key columns |
|---|---|
| `notifications` | id, company_id, user_id, type, title, message, read, data_json |
| `activity_log` | id, company_id, user_id, eventType, description, metadata_json, created_at |

### Support Mode

| Table | Key columns |
|---|---|
| `support_mode_audit` | id, owner_user_id, target_company_id, action, notes, created_at |

### Scheduler

| Table | Key columns |
|---|---|
| `scheduler_jobs` | id, company_id, title, jobType, assignedTo, startDate, endDate, status, notes |

---

## 11. API Endpoints (by module)

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/[action]/[detail]` | better-auth handler (login, signup, session, etc.) |
| `POST` | `/api/auth/forgot-password` | Send password reset email |
| `POST` | `/api/auth/reset-password` | Reset password with token |
| `POST` | `/api/auth/change-email` | Change email address |
| `GET` | `/api/auth/validate-reset-token` | Validate reset token |
| `POST` | `/api/auth/pin-login` | PIN login (trusted device) |
| `POST` | `/api/auth/send-sms-code` | Send SMS verification code (Twilio) |
| `POST` | `/api/auth/verify-sms-code` | Verify SMS code |
| `GET` | `/api/auth/sms-configured` | Check if SMS is configured |
| `GET` | `/api/auth/trusted-devices` | List trusted devices |
| `DELETE` | `/api/auth/trusted-devices/:deviceId` | Remove trusted device |
| `POST` | `/api/auth/self-verify` | Self-verify email (dev/demo) |
| `POST` | `/api/auth/resend-verification` | Resend verification email |
| `GET` | `/api/me` | Current user profile |
| `POST` | `/api/me/change-password` | Change password |
| `GET` | `/api/me/email-status` | Email verification status |

### Company

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/company` | Get company profile |
| `PUT` | `/api/company` | Update company profile (incl. `industry`) |
| `GET` | `/api/company-settings` | Get company settings |
| `PUT` | `/api/company-settings` | Update company settings |

### Billing / Subscription

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/subscription/status` | Subscription state + graceDaysLeft + periodEndDate |
| `POST` | `/api/subscription/create-checkout` | Create Stripe checkout session |
| `POST` | `/api/subscription/webhook` | Stripe webhook handler |
| `POST` | `/api/billing/cancel-subscription` | Cancel subscription |
| `POST` | `/api/billing/reactivate-subscription` | Reactivate cancelled subscription |
| `GET` | `/api/billing/customer-portal` | Stripe customer portal URL |
| `POST` | `/api/billing/cancellation-feedback` | Save cancellation reason |
| `POST` | `/api/stripe/create-checkout-session` | Create Stripe session (legacy) |
| `GET` | `/api/stripe/session/:sessionId` | Get Stripe session details |
| `GET` | `/api/usage` | Resource counts, limits, percentages, warnings |

### Jobs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/jobs` | List jobs |
| `POST` | `/api/jobs` | Create job |
| `GET` | `/api/jobs/:id` | Get job |
| `PUT` | `/api/jobs/:id` | Update job |
| `DELETE` | `/api/jobs/:id` | Delete job |
| `GET` | `/api/jobs/:id/todos` | List job todos |
| `POST` | `/api/jobs/:id/todos` | Create todo |
| `GET` | `/api/jobs/:id/progress` | Get progress entries |
| `POST` | `/api/jobs/:id/progress` | Add progress entry |
| `GET` | `/api/jobs/:id/photos` | List photos |
| `POST` | `/api/jobs/:id/photos` | Upload photo |
| `GET` | `/api/jobs/:id/files` | List files |
| `POST` | `/api/jobs/:id/files` | Upload file |
| `GET` | `/api/jobs/:id/costs` | List costs |
| `POST` | `/api/jobs/:id/costs` | Add cost entry |
| `GET` | `/api/jobs/:id/forms` | List job forms |
| `POST` | `/api/jobs/:id/forms` | Attach form to job |
| `GET` | `/api/jobs/:id/swms` | List SWMS for job |
| `GET` | `/api/jobs/:id/attendance` | List attendance records |
| `POST` | `/api/jobs/:id/signin-qr` | QR sign-in (public, token-validated) |
| `POST` | `/api/jobs/:id/signout-qr` | QR sign-out (public, token-validated) |
| `GET` | `/api/files/:id/download` | Download file |

### Estimating

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/estimates` | List estimates |
| `POST` | `/api/estimates` | Create estimate |
| `GET` | `/api/estimates/:id` | Get estimate |
| `PUT` | `/api/estimates/:id` | Update estimate |
| `DELETE` | `/api/estimates/:id` | Delete estimate |
| `POST` | `/api/estimates/:id/import-csv` | Import items from CSV |
| `GET` | `/api/estimates/:id/export-csv` | Export items to CSV |
| `GET` | `/api/cost-guide` | List cost guide entries |
| `POST` | `/api/cost-guide` | Add cost guide entry |
| `PUT` | `/api/cost-guide/:id` | Update entry |
| `DELETE` | `/api/cost-guide/:id` | Delete entry |
| `POST` | `/api/cost-guide/import-csv` | Import from CSV |
| `GET` | `/api/cost-guide/export-csv` | Export to CSV |
| `GET` | `/api/recipes` | List estimating recipes |
| `GET` | `/api/recipes/:id` | Get recipe |
| `GET` | `/api/takeoff-pad` | Get takeoff pad data |

### Fleet

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/fleet` | List vehicles |
| `POST` | `/api/fleet` | Add vehicle |
| `GET` | `/api/fleet/:id` | Get vehicle |
| `PUT` | `/api/fleet/:id` | Update vehicle |
| `DELETE` | `/api/fleet/:id` | Delete vehicle |
| `GET` | `/api/fleet/:id/prestarts` | List prestarts |
| `POST` | `/api/fleet/:id/prestarts` | Submit prestart |
| `GET` | `/api/fleet/:id/files` | List vehicle files |
| `POST` | `/api/fleet/:id/files` | Upload vehicle file |
| `GET` | `/api/fleet/:id/sessions` | List sign-on/off sessions |
| `POST` | `/api/fleet/:id/sessions/signin` | Sign on to vehicle |
| `POST` | `/api/fleet/:id/sessions/signoff` | Sign off vehicle |
| `POST` | `/api/fleet/:id/sessions/:sessionId/force-close` | Force-close stale session (admin) |
| `POST` | `/api/fleet/:id/telemetry` | Batch GPS telemetry upload |
| `GET` | `/api/fleet/flags` | List fleet flags |
| `GET` | `/api/fleet/analytics` | Fleet usage analytics (admin/owner only) |

### Forms

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/form-templates` | List templates |
| `POST` | `/api/form-templates` | Create template |
| `GET` | `/api/form-templates/:id` | Get template |
| `PUT` | `/api/form-templates/:id` | Update template |
| `DELETE` | `/api/form-templates/:id` | Delete template |
| `POST` | `/api/form-templates/seed` | Seed default templates |
| `GET` | `/api/forms` | List form submissions |
| `POST` | `/api/forms` | Submit form |
| `GET` | `/api/forms/:id` | Get submission |
| `PUT` | `/api/forms/:id` | Update submission |
| `GET` | `/api/forms/:id/fields` | Get form fields |
| `GET` | `/api/job-forms/:id` | Get job form |
| `PUT` | `/api/job-forms/:id` | Update job form |

### Safety

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/safety/swms` | List SWMS |
| `POST` | `/api/safety/swms` | Create SWMS |
| `GET` | `/api/safety/swms/:id` | Get SWMS |
| `PUT` | `/api/safety/swms/:id` | Update SWMS |
| `DELETE` | `/api/safety/swms/:id` | Delete SWMS |
| `POST` | `/api/safety/swms/seed` | Seed default SWMS |
| `GET` | `/api/safety/plans` | List site safety plans |
| `POST` | `/api/safety/plans` | Create plan |
| `GET` | `/api/safety/plans/:id` | Get plan |
| `PUT` | `/api/safety/plans/:id` | Update plan |
| `DELETE` | `/api/safety/plans/:id` | Delete plan |
| `POST` | `/api/safety/plans/seed` | Seed default plans |
| `GET` | `/api/safety/documents` | List policies/procedures |
| `POST` | `/api/safety/documents` | Upload document |
| `GET` | `/api/safety/documents/:id` | Get document |
| `DELETE` | `/api/safety/documents/:id` | Delete document |
| `GET` | `/api/safety/posters` | List site posters |
| `POST` | `/api/safety/posters` | Create poster |
| `GET` | `/api/safety/posters/:id` | Get poster |
| `DELETE` | `/api/safety/posters/:id` | Delete poster |
| `GET` | `/api/safety/generated-posters` | List generated posters |
| `POST` | `/api/safety/generated-posters` | Generate poster |
| `GET` | `/api/safety/generated-posters/:id` | Get generated poster |
| `DELETE` | `/api/safety/generated-posters/:id` | Delete generated poster |
| `POST` | `/api/safety/ai/draft` | AI-assisted SWMS/plan draft |

### Studio / Document Templates

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/document-templates` | List templates for authenticated company |
| `POST` | `/api/document-templates/:id/duplicate` | Duplicate a document template |
| `GET` | `/api/document-templates/:id/export/pdf` | Print-ready HTML (triggers `window.print()`) |
| `GET` | `/api/document-templates/:id/export/docx` | Streams `.docx` download |

### Notes / Tag Tasks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notes` | List entity notes (filtered by entity_type + entity_id) |
| `POST` | `/api/notes` | Create note (auto-spawns tag tasks for todo/action types) |
| `PUT` | `/api/notes/:id` | Update note |
| `DELETE` | `/api/notes/:id` | Delete note |
| `GET` | `/api/notes/:id/comments` | List comments on a note |
| `POST` | `/api/notes/:id/comments` | Add comment |
| `GET` | `/api/tag-tasks` | List tag tasks for current user |
| `PUT` | `/api/tag-tasks/:id` | Update tag task (complete, reassign, etc.) |

### Emergency Beacon

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/emergency/trigger` | Trigger emergency alert |
| `GET` | `/api/emergency/alerts` | List emergency alerts |
| `POST` | `/api/emergency/alerts/:id/acknowledge` | Acknowledge alert |
| `POST` | `/api/emergency/alerts/:id/resolve` | Resolve alert |

### Sign-In History

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/signin-history` | Unified job + fleet history, paginated, filterable, CSV export |

### Dazza AI

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/dazza/chat` | Main chat endpoint |
| `GET` | `/api/dazza/context` | Get Dazza context summary (for UI) |
| `GET` | `/api/dazza/key-status` | Check if OpenAI key is configured |
| `GET` | `/api/dazza/knowledge` | List company knowledge entries |
| `POST` | `/api/dazza/knowledge` | Add knowledge entry |
| `PUT` | `/api/dazza/knowledge/:id` | Update knowledge entry |
| `DELETE` | `/api/dazza/knowledge/:id` | Delete knowledge entry |
| `POST` | `/api/dazza/annette` | Annette direct query endpoint |
| `GET` | `/api/dazza/brain/status` | Brain stats + pending hive + top entries |
| `POST` | `/api/dazza/brain/hive/approve` | Approve pending hive entry |
| `POST` | `/api/dazza/brain/hive/reject` | Reject pending hive entry |

### Team

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/team` | List team members |
| `POST` | `/api/team/invite` | Invite team member |
| `PUT` | `/api/team/:id` | Update member |
| `DELETE` | `/api/team/:id` | Remove member |
| `POST` | `/api/team/verify-user` | Verify user manually |
| `POST` | `/api/team/resend-verification` | Resend verification |

### Notifications

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notifications` | List notifications |
| `GET` | `/api/notifications/alerts` | Get alert notifications |
| `POST` | `/api/notifications/read` | Mark as read |
| `GET` | `/api/notifications/prefs` | Get notification preferences |
| `PUT` | `/api/notifications/prefs` | Update preferences |

### Settings / Backup

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/settings/backup/export` | Export company backup ZIP |
| `POST` | `/api/settings/backup/run` | Run backup |
| `GET` | `/api/settings/retention` | Get retention settings |
| `PUT` | `/api/settings/retention` | Update retention settings |

### Owner Console

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/owner-console/stats` | Platform overview stats |
| `GET` | `/api/owner-console/companies` | All companies |
| `GET` | `/api/owner-console/companies/:id` | Company detail |
| `GET` | `/api/owner-console/companies/usage` | Per-company usage |
| `GET` | `/api/owner-console/users` | All users |
| `POST` | `/api/owner-console/users/verify` | Manually verify user |
| `GET` | `/api/owner-console/activity` | Activity log |
| `GET` | `/api/owner-console/storage` | System storage breakdown |
| `GET` | `/api/owner-console/cancellation-feedback` | Cancellation feedback |

### Support Mode

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/support-mode/enter` | Enter support mode for company |
| `POST` | `/api/support-mode/exit` | Exit support mode |
| `GET` | `/api/support-mode/status` | Current support mode status |
| `GET` | `/api/support-mode/audit` | Support mode audit log |
| `GET` | `/api/support-mode/checklist` | Support checklist |

### Misc

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/active-ping` | Update last active timestamp |
| `POST` | `/api/signup` | Company + owner signup |
| `GET` | `/api/dashboard/setup-check` | Dashboard setup completion |
| `GET` | `/api/dashboard/todos` | Dashboard todo summary |
| `GET` | `/api/scheduler/jobs` | Scheduler job list |

---

## 12. Dazza AI Architecture

### Overview

Dazza is a construction-aware AI assistant that reads **live portal data** from the current company. All AI calls are **server-side only** — API keys are never exposed to the browser.

### Context modules (`src/server/lib/dazza-context.ts`)

`buildDazzaContext()` assembles a `DazzaContext` object with 13+ modules:

| Module | Data included |
|---|---|
| `jobs` | Recent jobs (title, status, type, address) |
| `fleet` | Vehicles (name, rego, status) |
| `estimates` | Recent estimates (title, total — only if `seeDollars`) |
| `forms` | Form templates (name, type) |
| `files` | Recent files (name, type) |
| `safety` | SWMS count, plan count |
| `team` | Team members (name, role) |
| `subscription` | Plan, status, trial days remaining |
| `usage` | Resource counts vs limits |
| `company` | Name, industry, address |
| `user` | Name, role, permissions |
| `knowledge` | Company-specific knowledge entries |
| `brain` | Approved brain entries (company-scoped) |

### System prompt (`buildSystemPrompt()` in `src/server/api/dazza/chat/POST.ts`)

- Exported so `annette-brain.ts` can import it (lazy dynamic import to avoid circular dep)
- Includes: company name, industry, user name/role, all context modules, permission flags
- Industry phrase from `src/lib/industry-config.ts`

### Local tools (`tryLocalTool()`)

Pure maths/GST calculators — no DB, no OpenAI:
- Pier/slab/pit/trench concrete volume
- GST add/remove
- Fall/grade calculations
- Simple arithmetic expressions

### Context handlers (`tryContextHandler()`)

Portal data lookups — DB, no OpenAI:
- Job count/status queries
- Fleet status queries
- Subscription/plan queries
- Usage queries

### Response format

All Dazza responses are structured with sections:
```
📋 From IWILLBUILD data:
[portal data answer]

🧠 AI reasoning:
[OpenAI reasoning, flagged if conflicts with portal data]

📦 Source modules:
[list of modules used]

📊 Confidence:
[High / Medium / Low]

⚠️ Verification reminder:
[when safety/legal/compliance topics detected]
```

---

## 13. Annette Core / Brain Architecture

### Overview (`src/server/lib/annette-brain.ts`)

Annette is the intelligence layer behind Dazza. It implements a structured answer pipeline:

### The Loop (per question)

```
1. INTERNAL CHECK
   tryLocalTool()      → pure maths / GST / calculators  (no DB, no OpenAI)
   tryContextHandler() → portal data lookups              (DB, no OpenAI)
   tryBrainLookup()    → company-scoped brain entries     (DB, no OpenAI)

2. OPENAI REASONING  (only if API key exists)
   Sends system prompt + context + question to OpenAI.
   Parses the structured response sections.

3. COMPARE + CONFLICT DETECTION
   If both internal and OpenAI answers exist, compare them.
   Portal data ALWAYS wins on factual conflicts.
   Flag conflicts in the AI reasoning section.

4. RESULT → DazzaAnswer (structured, source-labelled)

5. HIVE UPDATE  (async, non-blocking)
   Useful interactions queued as pending hive entries.
   Admins approve/reject via Brain Status panel.
   NOTHING is auto-saved as approved knowledge.
```

### Answer sources

| Source | Description |
|---|---|
| `local_tool` | Pure calculator, no data |
| `portal_data` | Portal DB lookup, no OpenAI |
| `brain_entry` | Approved brain entry, no OpenAI |
| `openai` | OpenAI only (no portal data) |
| `portal+openai` | Portal data + OpenAI reasoning |
| `brain+openai` | Brain entry + OpenAI reasoning |
| `no_key` | No OpenAI key configured |

### Brain tables

- `dazza_brain_entries` — approved company-scoped knowledge entries
- `dazza_hive_pending` — AI answers queued for admin review
- `dazza_brain_interactions` — interaction audit log with source/confidence/conflict tracking

### Security guarantees

- All brain queries scoped to `effectiveCompanyId` from session
- No cross-company brain data ever included
- `seeDollars` enforced before financial data in context
- Brain entries require explicit admin approval — nothing auto-saves
- Hive pending entries are never used in answers until approved

### Brain Status panel (`src/components/DazzaBrainStatus.tsx`)

- Admin/owner only — accessible via Dazza AI → Brain tab
- Shows: total entries, pending hive count, total interactions
- Pending hive queue: expand, edit title/content/category, approve or reject
- Top brain entries by usage count
- Recent interactions with source/confidence/conflict badges
- "How it works" explanation panel

---

## 14. Safety Module

### Tabs

1. **Dashboard** — overview stats, recent activity
2. **SWMS Library** — Safe Work Method Statements
3. **Site Safety Plans** — per-job safety plans
4. **Policies & Procedures** — document library
5. **Site Posters** — downloadable safety posters
6. **Dazza AI** — AI-assisted safety drafting

### Safety Poster Generator

- 7 poster types: PPE, Emergency Contact, Lifting, Risk Matrix, Life Saving Rules, Emergency Assembly Point, Custom
- Export: PDF and DOCX
- Safety Pack: bundle all posters as ZIP

### AI-assisted drafting

- `POST /api/safety/ai/draft` — generates SWMS/plan content via OpenAI
- Uses company industry context from `industry-config.ts`

---

## 15. Forms System

### Field types (20 total)

Short text, Long text, Number, Date, Date & time, Yes/No, Checkbox, Single choice, Multi choice, Photo, Signature, Section heading, Instruction, Link/URL, Location/GPS, Page Break, Linear Scale, Rating, Instruction+Image

### Features

- **Conditional logic** — show/hide fields based on answers
- **Skip logic** — advanced rule-based field skipping (see §22)
- **Multi-signer** — multiple signature fields with named signers
- **100-field limit** per template
- **7 seeded templates** (industry-aware)
- **Page Break** — pagination in form builder (runner pagination not yet implemented)
- **GPS** — captured as plain string (structured capture not yet implemented)

### Known gaps

- Page Break pagination not implemented in form runner
- GPS stored as plain string, not structured lat/lng object

---

## 16. Studio Module

### Overview

Studio (`/studio`) is a multi-tab hub consolidating Documents, Forms, Library, and Safety content. It replaces the previous top-level `/forms`, `/library`, and `/safety` routes (those now redirect with `noindex`).

### Tabs

| Tab | URL param | Description |
|---|---|---|
| Documents | `?tab=documents` (default) | Document template management |
| Forms | `?tab=forms` | Form template management |
| Library | `?tab=library` | Community/shared library |
| Safety | `?tab=safety` | Safety content |

### Documents tab features

- API-driven rows with green "Active" badge + revision number
- Bold title + template type pill
- Icon toolbar per row: duplicate, share, print, export PDF, export DOCX, edit, delete
- Export PDF: `window.open('/api/document-templates/:id/export/pdf')` — print-ready HTML
- Export DOCX: `window.open('/api/document-templates/:id/export/docx')` — streams `.docx`
- Duplicate: `POST /api/document-templates/:id/duplicate` — toast feedback
- Delete: inline confirm, toast feedback
- URL sync: tab state persisted in query param

### Sidebar `isActive` logic

- Studio nav item highlights when path is `/studio` with no tab param, or `tab=documents`
- Does **not** highlight for `tab=forms`, `tab=library`, `tab=safety` (those have their own sub-items)

---

## 17. Attendance & QR Sign-In

### Overview

Job attendance tracking with QR code sign-in/out for workers and guests at job sites.

### Components

- **`JobAttendanceTab`** — tab on job detail page; shows live sessions, stale session amber alert, supervisor force-close, "Stale" badge, CSV export
- **`JobQrModal`** — displays QR code for a job; `actorType` validated against `VALID_ACTOR_TYPES` Set

### Security

- All SQL queries parameterised
- Duplicate session detection (prevents double sign-in)
- `qrAttendanceLimiter` — rate limiter on QR endpoints
- QR public endpoints registered **BEFORE** auth guard middleware in `entry.ts`
- `actorType` validated against `VALID_ACTOR_TYPES` Set in handler

### Stale session handling

- Sessions open >12h flagged as stale
- Amber alert shown to supervisor in `JobAttendanceTab`
- Supervisor can force-close stale sessions
- "Stale" badge displayed on affected rows

### CSV export

- Attendance records exportable as CSV from `JobAttendanceTab`

---

## 18. Fleet Sign-On/Off & Analytics

### Sign-On/Off Flow

- Workers sign on/off individual fleet assets
- Sessions stored in `fleet_sessions` table
- Meter readings captured at sign-on and sign-off
- Meter validation: sign-off reading must be ≥ sign-on reading
- Stale session warning shown in `FleetUsagePanel` for sessions open >12h
- Admin/owner can force-close stale sessions via inline confirm dialog (not `window.confirm`)

### GPS Telemetry

- Batch telemetry upload: `POST /api/fleet/:id/telemetry`
- Stored in `fleet_gps_telemetry` table (lat, lng, speed, heading, accuracy, recorded_at)
- Haversine distance calculation for total distance per session
- Drive time, average speed, and max speed derived from telemetry

### Session Summary

- **`SessionSummaryCard`** — post-session modal shown after sign-off
- Displays: distance, drive time, avg/max speed, collision events

### Fleet Analytics

- **`FleetAnalyticsTab`** — admin/owner only
- Aggregated usage stats across all vehicles and sessions
- Collision event tracking

### CSV export

- Fleet usage records exportable as CSV from `FleetUsagePanel`

---

## 19. Emergency Beacon

### Overview

Two-step emergency alert flow with offline support and full audit trail.

### Trigger flow

1. **Confirmation gate** — user must confirm intent before proceeding
2. **Detail form** — reason selection + optional note + location capture
3. **3-second hold-to-confirm** — prevents accidental triggers; button must be held for 3 seconds

### Offline queue

- Alerts queued in `localStorage` when device is offline
- Auto-syncs to server on reconnect
- Prevents lost alerts in poor connectivity environments

### `EmergencyAlertLog`

- Full audit trail of all emergency alerts
- Pulsing red "Active" badge on unresolved alerts
- Acknowledge and resolve actions with timestamp + actor recorded
- History of ack/resolve events per alert

### Database

- `emergency_alerts` table: triggered_by, reason, note, location, status, triggered_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at

---

## 20. Session Timeout System

### Overview

Automatic session expiry to enforce security, particularly for shared/site devices.

### Expiry calculation (`calcSessionExpiry`)

```
expiry = min(signIn + 14h, next 06:00 AEST)
```

- Sessions never last more than 14 hours from sign-in
- Sessions always expire by 06:00 AEST the following morning (clean daily reset)

### Components

- **`useSessionTimeout`** hook — tracks time remaining, fires warning and expiry events
- **`SessionExpiredBanner`** — orange toast notification shown when session expires; prompts re-login

### Behaviour

- Warning shown before expiry (configurable lead time)
- On expiry: user is shown the banner and redirected to login
- Designed for shared site tablets where workers may leave sessions open overnight

---

## 21. Note Tagging & Tag Tasks

### Overview

Rich note system with @mention support, automatic task spawning, and threaded comments. Wired into Job detail Notes tab, Fleet detail Notes tab, and Dashboard My Tasks panel.

### Note types

| Type | Behaviour |
|---|---|
| `general` | Plain note, no task spawned |
| `todo` | Auto-spawns a tag task for the mentioned user |
| `action` | Auto-spawns a tag task for the mentioned user |
| `observation` | Plain note, no task spawned |
| `hazard` | Plain note, no task spawned |

### @mention system

- Live dropdown appears as user types `@`
- Dropdown shows team members matching the typed prefix
- Mentions stored as JSON array in `entity_notes.mentions`
- Mentioned users receive a tag task if note type is `todo` or `action`

### Tag tasks

- Stored in `note_tag_tasks` table
- Assignee, created_by, status, due_date, completion tracking
- Surfaced in **Dashboard → My Tasks panel** for the assigned user
- Status: `pending` → `completed`

### Threaded comments

- Comments stored in `note_comments` table
- Attached to a parent note via `note_id`

### Entity scoping

- `entity_type`: `job` | `fleet_vehicle` (extensible)
- `entity_id`: the ID of the parent entity
- All queries scoped to `company_id`

---

## 22. Skip Logic (Forms)

### Overview

Advanced rule-based field skipping in the form runner. Allows form designers to define conditions under which fields are automatically skipped (hidden and unrequired).

### Data model

Skip rules stored in the existing `logic_json` column of `form_templates` — **zero schema migration required**.

```typescript
interface SkipRule {
  id: string;
  conditions: SkipCondition[];   // one or more conditions
  conditionMode: 'AND' | 'OR';   // how conditions combine
  action: SkipAction;            // what to do when conditions match
}

interface SkipCondition {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'
           | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value: string;
}

interface SkipAction {
  type: 'skip_field' | 'skip_to_field' | 'skip_to_end';
  targetFieldId?: string;
}
```

### Runtime behaviour

- Rules evaluated immediately on field value change
- Skipped fields are automatically unrequired (cannot block form submission)
- Orange toast shown when a skip is triggered
- Back-stack maintained so users can navigate back through skipped sections

### Cycle detection

- DFS cycle detection runs at rule-save time
- Prevents infinite skip loops

### Analytics

- **`SkipMetricsPanel`** — shows skips per field, top trigger values, recent skip events

---

## 23. PWA (Progressive Web App)

### Overview

IWILLBUILD is installable as a PWA on iOS and Android. No app store required.

### Manifest (`public/manifest.json`)

- `name`: IWILLBUILD
- `short_name`: IWILLBUILD
- `theme_color`: `#ff6b00`
- `display`: `standalone`
- Icons provided for all standard sizes

### Install prompts

Two complementary install surfaces:

#### `PwaInstallPrompt` (bottom banner)

- Appears on any page for users who haven't installed
- **X button** = snooze 3 days (`localStorage` key: `iwb_pwa_install_snooze`)
- **"Don't show again"** link = permanent dismiss (`localStorage` key: `iwb_pwa_install_dismissed`)
- Android/Chrome: uses `beforeinstallprompt` event → native install dialog
- iOS Safari: shows Share → Add to Home Screen instructions
- Hides automatically when running in `standalone` display mode

#### `DashboardInstallCallout` (dashboard card)

- Compact callout shown on the dashboard between KPI widgets and My Tasks
- Same snooze/dismiss localStorage keys as `PwaInstallPrompt` — they share state
- Android/Chrome: inline "Install" button triggers native prompt
- iOS Safari: "How to install" link + Share icon instruction
- Hides when already installed (standalone mode) or dismissed/snoozed

### Snooze / dismiss logic

| Key | Behaviour |
|---|---|
| `iwb_pwa_install_dismissed` | Permanent — never show again |
| `iwb_pwa_install_snooze` | Timestamp — hide until `Date.now() > value` (3-day snooze) |
| `iwb_pwa_dash_dismissed` | Permanent dismiss for dashboard callout |
| `iwb_pwa_dash_snooze` | 3-day snooze for dashboard callout |

### Offline support

- Emergency beacon alerts queued in `localStorage` when offline, auto-synced on reconnect
- Service worker caches static assets for offline shell rendering

---

## 24. Sign-In History

### Overview

Unified view of all job attendance and fleet sign-on/off events for a company.

### Endpoint

`GET /api/signin-history` — unified job + fleet history, paginated, filterable, CSV export

### Page

`/signin-history` — accessible to admin/owner roles

### Features

- Unified timeline of job attendance + fleet sessions
- Filters: date range, entity type (job/fleet), user, status
- Pagination
- CSV export of filtered results

---

## 25. Document Builder

### Overview

Rich document builder for creating safety documents, toolbox talks, and other structured documents. Accessed via Studio → Documents tab.

### Block types

#### Content blocks
- **Banner blocks**: Info, Warning, Danger, Success, Safety, Custom
- **Safety-specific banners**: Safety First, First Aid, Image Banner, No Entry, Emergency Evacuation, Electrical Hazard, Confined Space, Environmental, Toolbox Talk
- **Risk Matrix Block**: 5×5 AS/NZS colour-coded grid, toggleable legend
- **Safety Badges**: 9 PPE icon types
- **RichTextBlock**: DOM-based HTML sanitiser with allowlist

#### Import
- **PDF Import**: renders PDF pages to PNG via `pdfjs-dist` with graceful fallback

### Export

- **PDF export**: browser-print approach (no puppeteer) — `GET /api/document-templates/:id/export/pdf`
- **DOCX export**: pure-JS ZIP + Open XML (no jszip) — `GET /api/document-templates/:id/export/docx`

### Data model

- Content stored in `document_templates.builder_json` (NOT `content_json`)
- Page layout in `document_templates.page_layout_json`
- Theme in `document_templates.theme_json`

---

## 26. Industry Mode

### Source of truth: `src/lib/industry-config.ts`

7 industries defined:

| Industry | Key |
|---|---|
| Construction | `construction` |
| Civil | `civil` |
| Landscaping | `landscaping` |
| Fuel / Dangerous Goods | `fuel_dangerous_goods` |
| Plant Hire | `plant_hire` |
| General Trades | `general_trades` |
| Other | `other` |

Each industry defines:
- `label` — display name
- `icon` — Lucide icon name
- `suggestedJobTypes` — array of job type strings
- `formTemplateNames` — array of default form template names
- `dazzaContextPhrase` — phrase injected into Dazza system prompt

### Where industry is used

- `companies.industry` column (VARCHAR, default `construction`)
- Signup wizard step 1 — industry selector grid
- Settings → Company tab — "Industry Mode" tile selector
- Dazza system prompt — `Industry: <value>` in active context
- Safety AI drafting — industry-aware content
- Form template seeding — industry-specific templates

### Adding a new industry

**Only edit `src/lib/industry-config.ts`** — all other systems read from this single source of truth.

---

## 27. Template Pack System (Direction)

> Not yet implemented — this is the planned direction.

Template Packs are curated bundles of forms, SWMS, safety plans, and cost guide entries pre-configured for a specific industry or trade type.

**Planned structure:**
- Pack definition: name, industry, description, included templates
- Install flow: owner/admin selects a pack, all templates are seeded into their company
- Pack versioning: packs can be updated; companies can re-install to get new templates
- Custom packs: companies can create their own packs from existing templates

**Implementation notes:**
- Pack definitions should live in `src/lib/template-packs.ts`
- Install endpoint: `POST /api/template-packs/:packId/install`
- Track installed packs in `company_settings.installed_packs_json`

---

## 28. Owner Console

### Access

- Platform owner only (`isOwner` permission)
- Route: `/owner-console`

### Tabs

| Tab | Description |
|---|---|
| Overview | Platform stats, GoDaddy dev dashboard link |
| Companies | All companies with status, plan, user count |
| Users | All users across all companies |
| Activity | Platform-wide activity log |
| Usage | Per-company resource usage with custom limit overrides |
| System Storage | Storage breakdown by company/file type |
| Cancellation Feedback | Cancellation reasons from churned companies |
| Support Setup | Support mode management (shown when active) |

### Custom limits

- Owner can set per-company overrides for any plan limit
- Stored in `company_settings.custom_limits_json`
- Applied in `checkLimit()` — custom overrides take precedence over plan defaults

---

## 29. Known Issues / Incomplete Areas

| Area | Issue | Priority |
|---|---|---|
| Forms | Page Break pagination not in form runner | High |
| Forms | GPS stored as plain string, not structured lat/lng | Medium |
| Annette | Issues #1, 2, 4, 5, 6, 7, 8 unresolved | High |
| Auth | Email verification disabled (re-enable after demo) | Medium |
| Storage | Fleet files not fully on storage service | Low |
| Storage | Form media not fully on storage service | Low |
| Integrations | SharePoint/OneDrive needs Azure OAuth | Low |
| Integrations | SMS verification needs Twilio credentials | Medium |
| Forms | Multi-signer workflow incomplete | Medium |
| Safety | Digital sign-off workflow not implemented | Low |
| Template Packs | Not yet implemented | Low |
| Jobs | No delete/archive UI — status-change only | Low |
| Scheduler | No pre-save conflict warning (overlap detection is display-only) | Low |
| Plan Manager | No PDF export of annotated drawings; share failure is silent to user | Low |
| Community Library | No uninstall/remove UI (API exists, no button) | Low |
| Invoice | Delete/void uses `window.confirm()` — inconsistent with rest of app | Low |
| Security | 6 SCA medium advisories: `better-auth`, `drizzle-kit`, `esbuild`, `js-yaml` — monitor for upstream patches | Medium |

---

## 30. Critical "Do Not Break" Workflows

These workflows are core to the platform and must not be broken by any change:

### 1. Subscription gate

- `requireWritableSubscription` middleware in `entry.ts`
- `applyWriteGate(app)` wraps all write endpoints
- `useSubscriptionGate` hook on frontend
- **Never bypass this gate** — it enforces billing compliance

### 2. Company scoping

- Every DB query must include `company_id = ${profile.companyId}`
- `profile.companyId` comes from session → `profiles` table
- **Never trust client-supplied company IDs** for data access

### 3. Stripe webhook

- `POST /api/subscription/webhook` must remain accessible without auth
- Handles subscription state transitions
- Stripe API version: `2026-02-25.clover` — do not change
- Invoices use `parent` field — do not use legacy `subscription` field

### 4. Startup migrations

- `runStartupMigrations()` in `entry.ts` runs on every server start
- Adds new columns/tables safely (idempotent)
- **Never remove existing migration entries** — only add new ones
- All new DB schema changes must go through this function

### 5. Auth session

- better-auth handles all session management
- `getAuth()` returns the auth instance
- Session headers must be forwarded correctly in all API handlers
- PIN login uses bcryptjs (not bcrypt) — Alpine-safe
- OpenTelemetry stub: `context.with(ctx, fn, thisArg, ...args)` must correctly forward thisArg/args; `startActiveSpan` must handle both 2-arg and 3-arg overloads — incorrect stub crashes better-auth on every sign-in

### 6. Dazza AI security

- All Dazza context built server-side — never trust client context
- `seeDollars` enforced before financial data
- Cross-company guard in chat handler
- Brain entries require explicit admin approval

### 7. File storage paths

- Files stored at `/shared-storage/public/assets/<bucket>/`
- Web URLs: `/airo-assets/uploads/<path>`
- **Never write runtime files to the app source directory** — fails in production
- Jimp imports must be inside `getJimp()` lazy async wrapper

### 8. Express route order

- Specific routes MUST be registered before wildcard/parameterised routes
- e.g., `GET /api/fleet/flags` must come before `GET /api/fleet/:id`
- QR attendance public endpoints (`/api/jobs/:id/signin-qr`, `/api/jobs/:id/signout-qr`) must be registered **before** the auth guard middleware

### 9. SSR icon stub

- `noExternal: true` SSR build means all lucide-react icons must be exported from `src/fallbacks/icon-stub.ts`
- Any new icon used in a component that renders server-side must be added to the stub
- Missing stub entry = SSR build crash

### 10. Rate limiter

- Global API rate limit: IP-based, 30 requests / 15 min
- Auth sub-limit: per-email, 10 requests / 15 min (prevents corporate NAT lockouts)
- Do not lower the IP limit below 30 — corporate NAT means many users share one IP

---

## 31. Future Migration Notes

### Database: MySQL → Supabase (PostgreSQL)

- All raw SQL uses MySQL syntax — will need porting (e.g., `TINYINT(1)` → `BOOLEAN`, `AUTO_INCREMENT` → `SERIAL`)
- `db.execute(sql...)` returns `[rowsArray, fields]` in MySQL — Supabase/pg returns differently
- `company_settings` raw SQL will need full rewrite
- Drizzle supports PostgreSQL — schema files can be adapted
- Migration path: export all data, transform, re-import

### Storage: Local disk → S3/R2/Azure Blob

- Storage service abstraction already in place (`storage-service.ts`)
- Add a new provider (e.g., `s3Provider.ts`) implementing the same interface
- Switch active provider in `storage-service.ts`
- Migrate existing files: copy from `/shared-storage/public/assets/` to new bucket
- Update URL generation in `getSignedUrl()` and `getDownloadStream()`

### Deployment: Current → Vercel

- SSR entry point: `src/server/entry.ts` (Express)
- Vercel would require converting to Vercel serverless functions or using `@vercel/node`
- Alternatively: deploy as a Docker container on Vercel (supports Express)
- Static assets: move to CDN (Vercel handles this automatically)
- Environment variables: migrate all secrets from current secret store to Vercel env vars
- Persistent storage: Vercel has no persistent disk — must migrate to S3/R2 first

### Auth: better-auth → Supabase Auth / Clerk

- better-auth tables: `users`, `sessions`, `accounts`, `verifications`
- Migration requires: export users, import to new auth provider, update session handling
- PIN login is custom — would need to be re-implemented or removed
- SMS verification (Twilio) is custom — would need re-implementation

### AI: OpenAI → Multi-provider

- All OpenAI calls use raw `fetch` — easy to swap endpoint
- Model: `gpt-4o-mini` — parameterise this for easy switching
- Annette brain architecture is provider-agnostic — just swap the fetch call

---

*This document is the authoritative reference for the IWILLBUILD platform. Update it whenever significant architectural changes are made.*
