# IWILLBUILD Portal — Owner Beta Launch Checklist

> **Owner use only.** Work through every section before inviting testers.  
> Check each item off as you complete it. Do not skip sections.  
> Last updated: June 2026

---

## Table of Contents

1. [Before Inviting Any Testers](#1-before-inviting-any-testers)
2. [Stripe Checklist](#2-stripe-checklist)
3. [OpenAI Key Checklist](#3-openai-key-checklist)
4. [Storage Limits Checklist](#4-storage-limits-checklist)
5. [Backup & Export Checklist](#5-backup--export-checklist)
6. [Legal & Disclaimer Checklist](#6-legal--disclaimer-checklist)
7. [Support Process](#7-support-process)
8. [Test Account Process](#8-test-account-process)
9. [First 10 Users — Monitoring Checklist](#9-first-10-users--monitoring-checklist)
10. [Rollback Plan](#10-rollback-plan)
11. [Known Limitations to Tell Testers](#11-known-limitations-to-tell-testers)

---

## 1. Before Inviting Any Testers

These must all be done before a single tester signs up.

### Platform health

- [ ] App is live at `iwillbuild.com` and loads without errors
- [ ] `/login` and `/signup` pages load correctly on mobile and desktop
- [ ] Signup wizard completes end-to-end (Solo plan, 30-day trial)
- [ ] First user after signup is correctly assigned `owner` role
- [ ] Dashboard loads after signup with no console errors
- [ ] All 14 portal pages load without crashing (Jobs, Fleet, Forms, Files, Team, Safety, Dazza AI, Billing, Settings, etc.)
- [ ] View-only mode activates correctly when trial expires (test with a backdated trial date in the DB)
- [ ] Stripe webhook endpoint is reachable: `POST /api/subscription/webhook` returns `200` for a test event

### Email

- [ ] Transactional email is working (password reset email arrives within 2 minutes)
- [ ] "Forgot password" flow completes end-to-end
- [ ] Email sender name and address are professional (not a test address)
- [ ] Check spam folder — if reset emails land in spam, fix SPF/DKIM before launch

### Owner Console

- [ ] `/owner-console` loads for your owner account
- [ ] Companies tab shows your own company correctly
- [ ] Usage tab shows correct resource counts
- [ ] System Storage tab loads without errors
- [ ] System Map link (`/docs/IWILLBUILD_SYSTEM_MAP.md`) opens correctly

### Security

- [ ] No test credentials, dummy API keys, or placeholder secrets are in the live environment
- [ ] `OPENAI_API_KEY` is either set (real key) or intentionally left blank (Dazza works in portal-only mode)
- [ ] Stripe keys are live-mode keys, not test-mode keys (or confirm test-mode is intentional for beta)
- [ ] Rate limiting is active on `/api/signup` (anti-spam honeypot + IP rate limit)
- [ ] PIN login lockout works (5 failed attempts locks the PIN)

---

## 2. Stripe Checklist

### Before going live

- [ ] Confirm whether beta is running in **Stripe test mode** or **Stripe live mode** — document this decision
- [ ] If test mode: tell testers to use Stripe test card `4242 4242 4242 4242`, expiry any future date, CVC any 3 digits
- [ ] If live mode: confirm you are ready to process real payments and issue refunds if needed
- [ ] Stripe dashboard → Webhooks → confirm the webhook endpoint `https://iwillbuild.com/api/subscription/webhook` is registered and active
- [ ] Webhook is set to receive at minimum: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- [ ] Stripe API version in code is `2026-02-25.clover` — do not change this
- [ ] Solo plan price ID is set and active in Stripe
- [ ] Team plan price ID is set and active in Stripe
- [ ] Business plan price ID is set and active in Stripe
- [ ] Enterprise plan is contact-only (no Stripe price ID required)
- [ ] Test a full checkout → subscription activation → portal access flow end-to-end
- [ ] Test cancellation flow: cancel → `cancel_at_period_end` state → view-only after period ends
- [ ] Test reactivation flow: reactivate before period ends → full access restored
- [ ] Cancellation feedback modal appears on cancellation and saves to Owner Console → Cancellation Feedback tab
- [ ] Customer portal link works (Stripe-hosted billing portal for card updates, invoice history)
- [ ] Stripe dashboard → Products → confirm plan names and prices match what is shown in the app's `/billing` page

### Refund policy decision

- [ ] Decide and document your refund policy for beta testers (e.g., "full refund within 14 days, no questions asked")
- [ ] Know how to issue a refund in Stripe dashboard: Payments → find charge → Refund

---

## 3. OpenAI Key Checklist

Dazza AI works in **portal-only mode** without an OpenAI key (local calculators, job/fleet/form lookups). Full AI reasoning requires a key.

### If you are enabling full AI for beta

- [ ] OpenAI API key is set in Settings → Dazza AI (or via the secrets manager)
- [ ] Key is a real `sk-...` key with sufficient credits for beta usage
- [ ] Test a Dazza AI question that requires OpenAI (e.g., "What is the GST on $4,500?") — confirm it returns a structured answer with source label
- [ ] Test a portal-data question (e.g., "How many jobs do I have?") — confirm it answers from portal data without calling OpenAI
- [ ] Dazza Brain Status tab (admin) shows green health indicators
- [ ] Hive pending queue is empty before testers start (no stale pending learnings)
- [ ] Confirm the "no API key" banner appears correctly if the key is removed (Dazza still works in portal-only mode)

### Cost controls

- [ ] Set a monthly spend limit on your OpenAI account (recommended: start at $20–$50 for beta)
- [ ] Monitor token usage in Owner Console → Activity after first week
- [ ] Model in use is `gpt-4o-mini` (cost-efficient) — confirm this has not been changed

### If you are NOT enabling full AI for beta

- [ ] Confirm the "no API key" banner in Dazza AI is clear and not alarming to testers
- [ ] Tell testers in your Known Limitations section that full AI requires a key (see Section 11)

---

## 4. Storage Limits Checklist

### Platform storage

- [ ] Storage is on local disk at `/shared-storage/public/assets/` — this is persistent across restarts
- [ ] Check current disk usage: Owner Console → System Storage tab
- [ ] Confirm there is sufficient free disk space for beta (rule of thumb: 10 testers × 500 MB average = 5 GB headroom minimum)
- [ ] File upload limit is 25 MB per file — confirm this is appropriate for your testers' use case
- [ ] Photo compression is active (Jimp compresses images on upload) — confirm photos are not being stored at full raw size

### Plan limits (enforced in-app)

| Plan | Jobs | Fleet | Team | Storage | Forms |
|---|---|---|---|---|---|
| Solo | 10 | 5 | 1 | 1 GB | 10 |
| Team | 50 | 20 | 5 | 5 GB | 50 |
| Business | 200 | 50 | 10 | 20 GB | 200 |

- [ ] Confirm plan limits in `src/lib/plan-limits.ts` match the above table and your pricing page
- [ ] Test that hitting a plan limit shows a clear in-app message (not a crash)
- [ ] Owner Console → Usage tab: confirm you can see per-company usage and set custom overrides if needed for testers

### Storage monitoring

- [ ] Set a reminder to check Owner Console → System Storage weekly during beta
- [ ] Know the process to increase disk space if needed (contact GoDaddy support for the hosting plan)

---

## 5. Backup & Export Checklist

### Before launch

- [ ] Test the backup export: Settings → Data & Backup → Export — confirm the ZIP downloads and contains readable data
- [ ] Confirm the ZIP includes: jobs, fleet, forms, files metadata, team, notes, costs, estimates
- [ ] Confirm photos and uploaded files are included in the export (or document that they are not)
- [ ] Retention settings are configurable per company in Settings → Data & Backup

### Your own backup process (platform-level)

- [ ] Decide on a database backup schedule for the beta period (recommended: daily automated backup)
- [ ] Know how to restore from a database backup if needed (see Rollback Plan, Section 10)
- [ ] Document where database backups are stored and how long they are retained
- [ ] Test a restore from backup in a staging environment before going live (if possible)

### Tester data expectations

- [ ] Tell testers: "Beta data may be wiped at the end of the beta period — export your data before the beta ends"
- [ ] Decide whether you will migrate tester data to production after beta, or start fresh

---

## 6. Legal & Disclaimer Checklist

> **Important:** This is a checklist of things to consider, not legal advice. Consult a lawyer for anything binding.

### Terms & Privacy

- [ ] Terms of Service document exists and is linked from the signup page and footer
- [ ] Privacy Policy document exists and is linked from the signup page and footer
- [ ] Both documents cover: data collection, data storage location (Australia), data retention, user rights, beta disclaimer
- [ ] Beta disclaimer is explicit: "This is a beta product. Features may change. Data may be reset. No uptime guarantee."

### Data & compliance

- [ ] Confirm where data is stored (Australia — GoDaddy hosting region)
- [ ] If testers are Australian businesses: confirm compliance with Australian Privacy Act obligations
- [ ] If testers upload documents containing personal information (e.g., worker inductions, incident reports): confirm your Privacy Policy covers this
- [ ] Safety module disclaimer: SWMS, safety plans, and posters generated by Dazza AI are drafts only — they must be reviewed by a competent person before use on a real worksite
- [ ] Dazza AI disclaimer: AI answers are not legal, safety, or financial advice — users must verify against current legislation and project documents

### Beta-specific

- [ ] Testers have signed (or agreed to) a beta tester agreement covering: confidentiality, no SLA, data may be reset, feedback is welcome
- [ ] You have a clear process for removing a tester's account and data on request
- [ ] You know how to delete a company and all its data from the Owner Console if required

---

## 7. Support Process

### Before launch — set up your support flow

- [ ] Decide your support channel: email, WhatsApp, Slack, or a dedicated support email address
- [ ] Tell testers exactly how to reach you (include this in your tester onboarding message)
- [ ] Set response time expectations: e.g., "I aim to respond within 24 hours on business days"
- [ ] Create a simple bug report template for testers to use:
  ```
  What were you trying to do?
  What happened instead?
  What page/section were you on?
  What device and browser?
  Screenshot (if possible)?
  ```

### Triage process

- [ ] **P1 — Can't log in / data loss / billing error:** Fix same day
- [ ] **P2 — Feature broken / can't complete a workflow:** Fix within 48 hours
- [ ] **P3 — UI glitch / minor annoyance:** Log and fix in next release

### Owner Console tools for support

- [ ] Owner Console → Companies: find a tester's company, check their subscription status
- [ ] Owner Console → Users: find a specific user, check their role and company
- [ ] Owner Console → Activity: review recent activity for a company to diagnose issues
- [ ] Owner Console → Usage: check if a tester has hit a plan limit
- [ ] Support Mode: enter a tester's company context in Dazza AI to diagnose data issues (Owner Console → Support Setup)

### Escalation

- [ ] If the platform is down: check GoDaddy hosting status first, then check server logs
- [ ] If Stripe is down: check `status.stripe.com` — payments will queue and retry automatically
- [ ] If OpenAI is down: Dazza AI falls back to portal-only mode automatically — no action needed

---

## 8. Test Account Process

### Creating tester accounts

**Option A — Testers self-sign-up (recommended for realistic testing)**
- [ ] Send testers the signup URL: `https://iwillbuild.com/signup`
- [ ] Tell them to select the plan that matches their business size
- [ ] Trial is 30 days — no credit card required to start
- [ ] First user to sign up for a company becomes the company Owner

**Option B — You create accounts for testers**
- [ ] Sign up on their behalf using their business email
- [ ] Complete the signup wizard (company name, industry, plan)
- [ ] Send them their login credentials securely (not via plain email)
- [ ] Ask them to change their password on first login

### Tester onboarding message (template)

```
Hi [Name],

You're invited to beta test IWILLBUILD — a construction management portal.

Sign up here: https://iwillbuild.com/signup
Your 30-day trial starts automatically — no credit card needed.

What to test:
- Create a job and add costs, photos, and notes
- Add a fleet asset and complete a prestart
- Build a form using the form builder
- Try Dazza AI — ask it about your jobs or a construction question
- Check the Safety module — generate a SWMS or site poster

How to report issues:
[Your support email / WhatsApp / Slack link]

Known limitations (please read): [link to Section 11 or paste it here]

Thanks for helping build this.
[Your name]
```

### Test account hygiene

- [ ] Keep a list of all tester accounts (name, email, company name, plan, signup date)
- [ ] Check in with each tester after 3 days to confirm they could log in and get started
- [ ] Check in again at 2 weeks to collect feedback
- [ ] At end of beta: notify testers of any data reset, plan changes, or pricing updates

---

## 9. First 10 Users — Monitoring Checklist

Run through this checklist daily for the first week, then weekly after that.

### Daily checks (first 7 days)

- [ ] **Owner Console → Companies:** All tester companies show `trial_active` status — no unexpected `trial_expired` or `cancelled`
- [ ] **Owner Console → Activity:** No unusual error patterns or repeated failed actions
- [ ] **Owner Console → Usage:** No company has hit a plan limit unexpectedly
- [ ] **Owner Console → System Storage:** Storage is not growing faster than expected
- [ ] **Server logs:** No repeated 500 errors or crashes (check via GoDaddy hosting dashboard or app logs)
- [ ] **Stripe dashboard:** No failed payments, no unexpected subscription state changes
- [ ] **Email:** Password reset and any transactional emails are still delivering (check spam rates)

### Weekly checks

- [ ] Review all support messages received — identify any patterns (same bug reported by multiple testers = P1)
- [ ] Check Dazza AI Brain Status (Owner Console → Dazza AI → Brain tab): review hive pending learnings, approve useful ones, reject incorrect ones
- [ ] Check OpenAI token usage against your spend limit — adjust limit if needed
- [ ] Review cancellation feedback (Owner Console → Cancellation Feedback) if any testers have churned
- [ ] Check disk usage trend — is it growing faster than expected?

### Red flags — act immediately

- [ ] Any tester reports they cannot log in → check their account in Owner Console → Users
- [ ] Any tester reports data is missing → check Owner Console → Activity for their company
- [ ] Stripe webhook shows repeated failures → check webhook logs in Stripe dashboard
- [ ] Server error rate spikes → check logs, consider rollback (see Section 10)
- [ ] A tester's company shows `suspended` or `past_due` unexpectedly → check Stripe and manually correct if needed

---

## 10. Rollback Plan

### What "rollback" means for IWILLBUILD

The platform runs on GoDaddy hosting with automatic version control. A rollback means reverting the deployed code to the last known-good version. **It does not revert the database** — database changes are additive (startup migrations only add columns/tables, never drop them).

### When to rollback

- A new deployment causes widespread login failures
- A new deployment causes data to be unreadable or corrupted
- A critical security vulnerability is discovered in new code
- More than 3 testers report the same critical bug within 1 hour of a deployment

### Rollback steps

1. **Identify the last known-good commit** — check the GoDaddy app builder version history or git log
2. **Revert the deployment** — use the GoDaddy app builder to redeploy the previous version
3. **Verify the rollback** — confirm `/login` and `/dashboard` load correctly after rollback
4. **Notify testers** — send a brief message: "We've rolled back a recent update due to an issue. Everything is stable. We'll re-release the fix shortly."
5. **Fix the issue** — reproduce the bug in a local/staging environment, fix it, test it, then redeploy

### Database safety

- Startup migrations are **additive only** — rolling back code does not break the database
- If a migration added a column that the rolled-back code doesn't use, that column is simply ignored — no harm
- If a migration added a table that the rolled-back code doesn't use, same — no harm
- **Never manually drop columns or tables** during a rollback — this can cause data loss

### Emergency contacts

- [ ] GoDaddy support: `https://www.godaddy.com/help` (for hosting/infrastructure issues)
- [ ] Stripe support: `https://support.stripe.com` (for payment processing issues)
- [ ] OpenAI status: `https://status.openai.com` (for AI outages)

---

## 11. Known Limitations to Tell Testers

Copy this section into your tester onboarding message or a "Beta Notes" page.

---

### What works well ✅

- Job management: create, edit, track costs, upload photos and files, add notes
- Fleet management: assets, prestarts, maintenance tracking
- Form builder: 20+ field types, conditional logic, multi-signer
- Safety module: SWMS library, site safety plans, policies, poster generator
- Dazza AI: portal data lookups, construction calculators, AI reasoning (requires OpenAI key)
- Billing: Stripe-powered trial, plan upgrades, cancellation
- Team management: invite members, assign roles

---

### Known limitations in this beta ⚠️

**Forms**
- Form runner does not yet paginate at Page Break fields — all fields show on one page (fix coming)
- GPS/Location fields capture coordinates but store them as plain text, not a structured map link (fix coming)
- Multi-signer workflow is partially implemented — the second signer flow is not complete

**Dazza AI**
- Full AI reasoning requires an OpenAI API key set by the platform owner — if not set, Dazza answers portal lookups and calculators only
- Dazza does not edit records on your behalf — it reads and advises only
- AI answers are not legal, safety, or financial advice — always verify with a qualified person

**Safety module**
- SWMS, safety plans, and posters generated by Dazza AI are drafts — they must be reviewed and signed off by a competent person before use on a real worksite
- Digital sign-off workflow for safety documents is not yet implemented

**Auth & accounts**
- Email verification is currently disabled — accounts are active immediately on signup
- SMS verification (PIN login fallback) requires Twilio credentials — not active in this beta

**Integrations**
- SharePoint / OneDrive file sync is not yet implemented
- No calendar integration yet

**Data**
- Beta data may be reset at the end of the beta period — please export your data before the beta ends (Settings → Data & Backup → Export)
- Storage is on local disk — if the server is migrated, files will be migrated with it, but there is no off-site backup in this beta

**General**
- This is a beta product — features may change, bugs may exist, and there is no uptime SLA
- Mobile experience is optimised but some complex screens (form builder, safety poster generator) work best on a larger screen

---

### How to report a bug

Send a message to **[your support contact]** with:
1. What you were trying to do
2. What happened instead
3. The page you were on
4. Your device and browser
5. A screenshot if possible

Your feedback directly shapes the product — thank you for testing.

---

*This checklist is for internal owner use. Update it as the platform evolves.*  
*Cross-reference: `docs/IWILLBUILD_SYSTEM_MAP.md` for full technical reference.*
