# IWILLBUILD Portal — Smoke Test Checklist

> **Purpose:** Manual regression checklist to run before any production release or after significant changes.  
> **How to use:** Work through each test in order. Mark `[x]` for pass, `[!]` for fail, `[-]` for skipped. Record notes in the Notes field.  
> **Environment:** Run against the live preview URL or production (`iwillbuild.com`).  
> **Last run:** _______________  
> **Run by:** _______________  
> **Build / commit:** _______________

---

## Summary Scorecard

| Module | Tests | Pass | Fail | Skip |
|---|---|---|---|---|
| Auth | 6 | | | |
| Permissions | 4 | | | |
| Subscription States | 5 | | | |
| Jobs | 4 | | | |
| Estimates | 4 | | | |
| Photos | 3 | | | |
| Files | 3 | | | |
| Fleet | 3 | | | |
| Forms | 4 | | | |
| Print / Export | 3 | | | |
| Dazza AI | 4 | | | |
| Storage Limits | 2 | | | |
| Owner Console | 5 | | | |
| **TOTAL** | **50** | | | |

---

## 1. Auth

---

### AUTH-01 — New company signup (full wizard)

**Steps:**
1. Open `/signup` in an incognito window
2. Step 1: Enter company name, select an industry (e.g. Landscaping), click Next
3. Step 2: Enter full name, email, password (min 8 chars), click Next
4. Step 3: Select a plan (e.g. Team), click Create Account
5. Observe redirect

**Expected result:**
- Redirected to `/dashboard` or `/verify-required`
- Company is created with the selected industry
- Trial badge visible (30-day trial)
- No JS errors in console

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### AUTH-02 — Login with email + password

**Steps:**
1. Open `/login`
2. Enter valid email and password
3. Click Sign In

**Expected result:**
- Redirected to `/dashboard`
- User name visible in sidebar
- Company name visible in sidebar header

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### AUTH-03 — Logout

**Steps:**
1. While logged in, click the user avatar or name in the sidebar
2. Click Logout (or navigate to logout action)
3. Attempt to access `/dashboard` directly

**Expected result:**
- Session cleared
- Redirected to `/login`
- `/dashboard` redirects to `/login` when accessed unauthenticated

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### AUTH-04 — Forgot password flow

**Steps:**
1. Open `/forgot-password`
2. Enter a registered email address
3. Click Send Reset Link
4. Check email for reset link (or use `/reset-password?token=...` if email is disabled)
5. Enter new password and confirm
6. Submit and attempt login with new password

**Expected result:**
- Success message shown after submitting email
- Reset link works and allows password change
- Login succeeds with new password

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### AUTH-05 — PIN login (trusted device)

**Steps:**
1. Log in normally
2. Navigate to Settings → Security (or profile)
3. Set up a PIN (4–6 digits)
4. Log out
5. On `/login`, choose PIN login option
6. Enter the PIN

**Expected result:**
- PIN login succeeds and redirects to dashboard
- After 5 wrong attempts, PIN is locked out

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### AUTH-06 — Anti-spam / rate limit on signup

**Steps:**
1. Open `/signup` in a browser
2. Submit the form 6 times rapidly from the same IP (use browser dev tools to repeat the POST)

**Expected result:**
- After 5 attempts within 15 minutes, a rate limit error is returned (429 or similar message)
- Honeypot field (hidden) is not visible to real users

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 2. Permissions

---

### PERM-01 — Worker cannot see dollar amounts

**Steps:**
1. Log in as an admin
2. Invite a team member with role **Worker** (`/team` → Invite)
3. Log in as the worker
4. Navigate to a job with estimates and costs

**Expected result:**
- Estimate totals and cost amounts are hidden or replaced with "—"
- No dollar figures visible anywhere for the worker account

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### PERM-02 — Worker cannot access Owner Console

**Steps:**
1. Log in as a worker
2. Attempt to navigate to `/owner-console` directly

**Expected result:**
- Redirected away or shown an access denied message
- Owner Console link not visible in sidebar

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### PERM-03 — Manager cannot manage team

**Steps:**
1. Log in as a manager
2. Navigate to `/team`

**Expected result:**
- Invite button is absent or disabled
- Cannot change other users' roles
- Cannot delete team members

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### PERM-04 — Admin has full access within company

**Steps:**
1. Log in as an admin (non-owner)
2. Navigate through: Jobs, Fleet, Forms, Safety, Estimating, Team, Settings, Billing

**Expected result:**
- All modules accessible
- Can create/edit/delete records in each module
- Cannot access Owner Console (owner-only)

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 3. Subscription States

---

### SUB-01 — Trial active: full access

**Steps:**
1. Log in as a company in `trial_active` state (new signup, < 30 days)
2. Navigate through all modules
3. Attempt to create a job, upload a file, use Dazza AI

**Expected result:**
- All features accessible
- Trial badge/countdown visible in sidebar or billing page
- No view-only banner

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### SUB-02 — Trial expired: view-only mode

**Steps:**
1. Log in as a company with `trial_expired` status (manually set in DB or use a test account)
2. Navigate to `/dashboard`
3. Attempt to create a new job
4. Attempt to use Dazza AI

**Expected result:**
- View-only banner visible at top of every page
- "Create Job" button is disabled with tooltip
- Dazza AI shows blocked/upgrade message
- Billing page is still accessible and shows upgrade options

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### SUB-03 — Active subscription: full access

**Steps:**
1. Log in as a company with `active` Stripe subscription
2. Navigate through all modules
3. Check `/billing` page

**Expected result:**
- No view-only banner
- Billing page shows plan name, status "Active", next billing date
- All write actions available

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### SUB-04 — Cancel scheduled (cancel_at_period_end)

**Steps:**
1. Log in as a company that has cancelled but is within the billing period
2. Check `/billing` page
3. Navigate through modules

**Expected result:**
- Amber banner on billing page: "Your subscription will cancel on [date]"
- Full access still available until period end
- Reactivate/resubscribe option visible

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### SUB-05 — Cancelled: view-only mode

**Steps:**
1. Log in as a company with `cancelled` status
2. Attempt to create a job, upload a photo, use Dazza AI

**Expected result:**
- View-only banner visible
- All write actions disabled
- Billing page shows plan cards to resubscribe
- Dazza AI blocked

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 4. Jobs

---

### JOB-01 — Create a new job

**Steps:**
1. Navigate to `/jobs`
2. Click "New Job" or equivalent
3. Enter: Title, Job Type, Address, Start Date
4. Save

**Expected result:**
- Job appears in the jobs list
- Job detail page opens with all tabs visible: Details, Estimates, Costs, Progress, To-do, Photos, Files, Forms, Notes, Safety

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### JOB-02 — Add a to-do item to a job

**Steps:**
1. Open a job → To-do tab
2. Add a new to-do item with a title and due date
3. Mark it as complete

**Expected result:**
- To-do item appears in the list
- Checkbox toggles completion state
- Completed item shows strikethrough or moved to completed section

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### JOB-03 — Add a progress entry

**Steps:**
1. Open a job → Progress tab
2. Add a progress entry: milestone name, percentage, date, notes
3. Save

**Expected result:**
- Progress entry appears in the list
- Progress percentage is reflected in any summary display

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### JOB-04 — Add a job note

**Steps:**
1. Open a job → Notes tab
2. Type a note and save

**Expected result:**
- Note appears with author name and timestamp
- Note persists on page refresh

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 5. Estimates

---

### EST-01 — Create an estimate on a job

**Steps:**
1. Open a job → Estimates tab
2. Click "New Estimate"
3. Add a title and at least 3 line items (description, qty, unit, rate)
4. Save

**Expected result:**
- Estimate appears in the estimates list
- Line item totals calculate correctly
- GST calculation is correct (10%)
- Grand total matches sum of line items

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### EST-02 — Import estimate items from CSV

**Steps:**
1. Open an estimate in the editor
2. Use the CSV import function
3. Upload a valid CSV with columns: description, qty, unit, rate, category

**Expected result:**
- Items imported and appear in the estimate
- Totals recalculate after import
- Invalid rows show an error, valid rows are imported

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### EST-03 — Export estimate to CSV

**Steps:**
1. Open an estimate
2. Click Export CSV

**Expected result:**
- CSV file downloads
- File contains all line items with correct values
- File opens correctly in Excel/Google Sheets

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### EST-04 — Approve / change estimate status

**Steps:**
1. Open an estimate
2. Change status from Draft → Sent → Approved (or equivalent workflow)

**Expected result:**
- Status badge updates correctly
- Approved estimates are visually distinct
- Status persists on page refresh

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 6. Photos

---

### PHOTO-01 — Upload a job photo

**Steps:**
1. Open a job → Photos tab
2. Click Upload / drag-and-drop a JPEG or PNG image (> 1MB to test compression)
3. Wait for upload to complete

**Expected result:**
- Photo appears in the photo grid
- Large images are compressed (Jimp) — file size reduced
- No JS errors in console

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### PHOTO-02 — Lightbox, rotate, download

**Steps:**
1. Click a photo to open the lightbox
2. Use keyboard arrows to navigate between photos
3. Click Rotate
4. Click Download

**Expected result:**
- Lightbox opens with full-size photo
- Keyboard navigation works (left/right arrows)
- Rotation saves and persists on refresh
- Download triggers file save

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### PHOTO-03 — Delete a photo

**Steps:**
1. In the photo grid, select a photo
2. Click Delete and confirm

**Expected result:**
- Photo removed from grid
- Photo no longer accessible via direct URL
- Disk file deleted (verify via Owner Console → System Storage)

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 7. Files

---

### FILE-01 — Upload a file to a job

**Steps:**
1. Open a job → Files tab
2. Upload a PDF or DOCX file

**Expected result:**
- File appears in the files list with name, size, and upload date
- File icon matches file type

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### FILE-02 — Download a file

**Steps:**
1. In the files list, click the download icon on a file

**Expected result:**
- File downloads correctly
- Downloaded file is not corrupted (opens in appropriate app)

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### FILE-03 — Delete a file

**Steps:**
1. In the files list, click Delete on a file and confirm

**Expected result:**
- File removed from list
- File no longer downloadable
- Storage usage decreases (check `/api/usage`)

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 8. Fleet

---

### FLEET-01 — Add a fleet asset

**Steps:**
1. Navigate to `/fleet`
2. Click "Add Vehicle" or equivalent
3. Enter: Name, Rego, Make, Model, Year, Status
4. Save

**Expected result:**
- Vehicle appears in the fleet list
- Vehicle detail page accessible with all tabs

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### FLEET-02 — Submit a prestart check

**Steps:**
1. Open a fleet vehicle → Prestarts tab
2. Click "New Prestart"
3. Complete all checklist items
4. Submit

**Expected result:**
- Prestart record saved with date, user, and all item responses
- Prestart appears in the history list
- Status (pass/fail) correctly determined from responses

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### FLEET-03 — Upload a vehicle file

**Steps:**
1. Open a fleet vehicle → Files tab
2. Upload a PDF (e.g. registration certificate)

**Expected result:**
- File appears in the vehicle files list
- File downloadable

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 9. Forms

---

### FORM-01 — Build a form template

**Steps:**
1. Navigate to `/forms`
2. Click "New Template"
3. Add the following field types: Short Text, Yes/No, Photo, Signature, Section Heading, Single Choice (3 options)
4. Add a conditional logic rule: show a field only if Yes/No = Yes
5. Save the template

**Expected result:**
- All field types render correctly in the builder
- Conditional logic rule saved
- Template appears in the templates list

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### FORM-02 — Attach a form to a job

**Steps:**
1. Open a job → Forms tab
2. Click "Add Form" and select the template created in FORM-01
3. Confirm attachment

**Expected result:**
- Form appears in the job's forms list with status "Pending"
- Form is linked to the correct job

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### FORM-03 — Complete a job form (runner)

**Steps:**
1. Open the attached form from the job → Forms tab
2. Fill in all fields including: text, yes/no toggle, photo upload, signature
3. Verify conditional logic: set Yes/No = Yes and confirm the conditional field appears
4. Submit the form

**Expected result:**
- All field types accept input correctly
- Conditional field shows/hides based on the rule
- Photo uploads successfully
- Signature canvas captures and saves
- Form status changes to "Submitted" or "Complete"
- Submitted data visible on review

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### FORM-04 — Seed default form templates

**Steps:**
1. Navigate to `/forms`
2. If no templates exist, trigger the seed action (button or API call `POST /api/form-templates/seed`)
3. Refresh the templates list

**Expected result:**
- Default templates appear (at least 7 for construction industry)
- Templates are scoped to the current company only

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 10. Print / Export

---

### PRINT-01 — Print / export an estimate

**Steps:**
1. Open an estimate in the editor
2. Click Print or Export PDF (if available)
3. Observe the print preview or downloaded PDF

**Expected result:**
- Print layout is clean and professional
- Company name, estimate title, line items, totals, and GST all present
- No UI chrome (sidebar, nav) visible in print output

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### PRINT-02 — Print a completed form

**Steps:**
1. Open a submitted job form
2. Click Print or Export PDF
3. Observe the output

**Expected result:**
- All form fields and responses visible
- Photos rendered (or placeholder if not embeddable)
- Signature image rendered
- Company name and form title in header

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### PRINT-03 — Export backup ZIP

**Steps:**
1. Navigate to Settings → Data & Backup
2. Click Export Backup
3. Wait for ZIP to generate and download

**Expected result:**
- ZIP file downloads successfully
- ZIP contains expected data files (jobs, estimates, forms, etc.)
- ZIP is not corrupted (can be opened)

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 11. Dazza AI

---

### DAZZA-01 — Internal lookup (no OpenAI)

**Steps:**
1. Navigate to `/dazza-ai`
2. Ask: "How many jobs do I have?"
3. Ask: "What vehicles are in my fleet?"

**Expected result:**
- Answers reflect actual portal data (correct counts/names)
- Source label shows "portal_data" or "From IWILLBUILD data"
- Response is fast (no OpenAI latency)
- No OpenAI key required for these queries

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### DAZZA-02 — Local calculator (no DB, no OpenAI)

**Steps:**
1. Ask Dazza: "What is the GST on $4500?"
2. Ask: "How much concrete do I need for a 6m x 4m slab at 100mm depth?"

**Expected result:**
- GST answer: $409.09 (GST component) or $4909.09 (inc GST) — correct calculation
- Concrete volume: 2.4 m³ — correct calculation
- Source label shows "local_tool"
- Instant response, no DB or API call

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### DAZZA-03 — OpenAI fallback (general knowledge)

**Steps:**
1. Ask Dazza a question that requires general construction knowledge: "What are the standard concrete mix ratios for a footpath?"
2. Observe the response and source label

**Expected result:**
- Response includes useful construction knowledge
- Source label shows "openai" or "AI reasoning"
- Response includes a verification reminder for safety/compliance topics
- If no OpenAI key: response indicates AI is unavailable but local tools still work

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### DAZZA-04 — Dazza blocked in view-only mode

**Steps:**
1. Log in as a company in `trial_expired` or `cancelled` state
2. Navigate to `/dazza-ai`
3. Attempt to send a message

**Expected result:**
- Dazza AI is blocked — upgrade prompt or disabled input shown
- `POST /api/dazza/chat` returns 403 if called directly

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 12. Storage Limits

---

### STOR-01 — Usage API returns correct data

**Steps:**
1. Log in as any active company
2. Call `GET /api/usage` (or observe the usage cards in Settings → Data & Backup)
3. Check: jobs count, users count, storage used

**Expected result:**
- Counts match actual records in the database
- Storage used (MB/GB) is a reasonable figure
- Plan limits shown correctly for the current plan
- Warning flags appear if usage > 80% of any limit

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### STOR-02 — Plan user limit enforced

**Steps:**
1. Log in as a company on the Solo plan (1 user limit)
2. Navigate to `/team`
3. Attempt to invite a second user

**Expected result:**
- Invite is blocked with a "plan limit reached" message
- Upgrade prompt shown
- No user is created

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## 13. Owner Console

---

### OWN-01 — Overview stats load correctly

**Steps:**
1. Log in as the platform owner
2. Navigate to `/owner-console`
3. Observe the Overview tab

**Expected result:**
- Stats cards show: Total Companies, Total Users, Active Users, Invited, Inactive, Online Now, Logins Today
- GoDaddy Developer Dashboard link present
- System Map / Product Bible link present and opens the markdown file

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### OWN-02 — Companies list and detail

**Steps:**
1. Navigate to Owner Console → Companies tab
2. Click into a company

**Expected result:**
- All companies listed with: name, plan, status, user count
- Company detail shows subscription info, usage, and user list

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### OWN-03 — Usage tab with custom limit override

**Steps:**
1. Navigate to Owner Console → Usage tab
2. Find a company and click "Set Custom Limits"
3. Override the jobs limit to a custom value
4. Save

**Expected result:**
- Custom limit saved
- `GET /api/usage` for that company now reflects the custom limit
- Override persists on page refresh

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### OWN-04 — System Storage tab

**Steps:**
1. Navigate to Owner Console → System Storage tab

**Expected result:**
- 4 summary cards visible: Total Storage, Job Photos, Job Files, Other
- Storage breakdown bar chart or visual shown
- Top 10 companies by storage listed
- No errors loading the tab

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

### OWN-05 — Cancellation Feedback tab

**Steps:**
1. Navigate to Owner Console → Cancellation Feedback tab

**Expected result:**
- Table shows any submitted cancellation feedback
- Columns: Company, Plan, Reason, Comment, Date
- Empty state shown gracefully if no feedback exists

**Notes:** _______________

- [ ] Pass  [ ] Fail  [ ] Skip

---

## Appendix A — Known Failing Tests (Do Not Block Release)

The following tests are expected to fail due to known incomplete features. Document them here rather than marking as failures:

| Test ID | Known Issue | Ticket / Reference |
|---|---|---|
| FORM-03 | Page Break pagination not in runner — multi-page forms show all fields on one page | Forms Phase 2B |
| FORM-03 | GPS field stores plain string, not structured lat/lng | Forms Phase 2B |
| AUTH-05 | SMS fallback for PIN login requires Twilio credentials (not yet configured) | Needs Twilio setup |

---

## Appendix B — Test Data Setup

### Minimum test accounts needed

| Account | Role | Subscription | Purpose |
|---|---|---|---|
| `owner@test.iwillbuild.com` | Owner | Active | Owner Console, all modules |
| `admin@test.iwillbuild.com` | Admin | Active | Full company access |
| `manager@test.iwillbuild.com` | Manager | Active | No team/billing access |
| `worker@test.iwillbuild.com` | Worker | Active | No dollars, limited access |
| `trial-expired@test.iwillbuild.com` | Admin | trial_expired | View-only tests |
| `cancelled@test.iwillbuild.com` | Admin | cancelled | View-only tests |

### Minimum test data per company

- At least 2 jobs (one with estimates, costs, photos, files, forms)
- At least 1 fleet vehicle with a prestart
- At least 1 form template with conditional logic
- At least 1 submitted form
- At least 1 estimate with 5+ line items

---

## Appendix C — API Smoke Checks (curl / Postman)

Quick API-level checks to run without a browser. Replace `TOKEN` with a valid session token.

```bash
# Health check
curl https://iwillbuild.com/api/health

# Subscription status (authenticated)
curl -H "Cookie: session=TOKEN" https://iwillbuild.com/api/subscription/status

# Usage
curl -H "Cookie: session=TOKEN" https://iwillbuild.com/api/usage

# Dazza context
curl -H "Cookie: session=TOKEN" https://iwillbuild.com/api/dazza/context

# Dazza key status
curl -H "Cookie: session=TOKEN" https://iwillbuild.com/api/dazza/key-status

# Jobs list
curl -H "Cookie: session=TOKEN" https://iwillbuild.com/api/jobs

# Owner console stats (owner only)
curl -H "Cookie: session=TOKEN" https://iwillbuild.com/api/owner-console/stats
```

---

*Keep this checklist updated as new features are added. Add new test cases in the appropriate module section. Update Appendix A when known issues are resolved.*
