/**
 * /roadmap  — IWIllBUIlD Portal Product Roadmap
 * Internal-only page (noindex). Accessible from Owner Console / Developer Console.
 */
import { roadmap } from 'virtual:content';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Zap,
  Shield,
  Lock,
  Flag,
  ArrowRight,
  CalendarDays,
  Layers,
  GitBranch,
  Rocket,
  BarChart3,
  Users,
  Truck,
  FileText,
  DollarSign,
  HardHat,
  Wrench,
  Globe,
  Bell,
  Terminal,
  Megaphone,
  Bot,
  CreditCard,
  BookOpen,
  ClipboardList,
} from 'lucide-react';

// ── Content fallbacks ─────────────────────────────────────────────────────────
interface RoadmapGate {
  id: string;
  label: string;
  status: string;
  criteria: string[];
  unblock: string;
}

const roadmapGates: RoadmapGate[] = Array.isArray(roadmap?.GATES) && roadmap.GATES.length > 0
  ? roadmap.GATES
  : [
      { id: 'gate-1', label: 'Phase 1 — Core Portal',  status: 'passed',      criteria: ['Jobs, estimates and job files live', 'Forms builder with conditional logic', 'Fleet prestarts and service log', 'Safety SWMS library and sign-off'],   unblock: 'Phase 2 features' },
      { id: 'gate-2', label: 'Phase 2 — Integrations', status: 'in-progress', criteria: ['Xero, MYOB and QuickBooks OAuth sync', 'Stripe payment links on invoices', 'Plan Manager PDF viewer', 'Customer portal'],                             unblock: 'Phase 3 features' },
      { id: 'gate-3', label: 'Phase 3 — Scale',        status: 'pending',     criteria: ['PWA push notifications', 'Team time tracking', 'Advanced reporting', 'Multi-company support'],                                                          unblock: 'Enterprise plan' },
    ];

const roadmapPhases: string[] = Array.isArray(roadmap?.phases) && roadmap.phases.length > 0
  ? roadmap.phases
  : ['all', 'Phase 1', 'Phase 2', 'Phase 3'];

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'done' | 'in-progress' | 'pending' | 'blocked' | 'parallel';
type Size = 'S' | 'M' | 'L' | '1' | '2' | '3' | '5' | '8' | '13';
type Priority = 'P0' | 'P1' | 'P2' | 'P3';

interface Subtask {
  id: string;
  title: string;
  status: Status;
  estimate: Size;
}

interface Story {
  id: string;
  title: string;
  goal: string;
  status: Status;
  estimate: Size;
  owner: string;
  priority: Priority;
  dependencies: string[];
  risks: string[];
  acceptance: string[];
  subtasks?: Subtask[];
}

interface Epic {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  phase: string;
  status: Status;
  stories: Story[];
  rollback: string;
  releaseGate?: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const EPICS: Epic[] = [
  // ── PHASE 0 ──────────────────────────────────────────────────────────────
  {
    id: 'p0-deploy',
    title: 'Phase 0 — Publish Pipeline Reliability',
    icon: Shield,
    color: 'red',
    phase: 'Phase 0',
    status: 'done',
    rollback: 'If publish fails again: pin to last working commit 030fdb2, open GoDaddy support ticket ref app f38wenbvln, freeze all deploys until socket-hang-up root cause is confirmed fixed.',
    releaseGate: 'Gate A',
    stories: [
      {
        id: 'p0-s1',
        title: 'Publish pipeline fix',
        goal: 'Restore reliable one-click publish to iwillbuild.com with zero socket-hang-up errors.',
        status: 'done',
        estimate: '8',
        owner: 'Platform / GoDaddy Support',
        priority: 'P0',
        dependencies: [],
        risks: ['GoDaddy infra change outside our control', 'Rollback may require manual git reset'],
        acceptance: [
          '✅ `npm run build` completes without error in CI',
          '✅ Published app loads at iwillbuild.com within 60 s of deploy',
          '✅ No socket-hang-up in last 5 consecutive deploys',
          '✅ .dockerignore excludes /docs, /migrations, /scripts, /src/server/api/migrate-*',
        ],
        subtasks: [
          { id: 'p0-s1-t1', title: 'Identify socket-hang-up root cause (GoDaddy ticket)', status: 'done', estimate: 'M' },
          { id: 'p0-s1-t2', title: 'Audit .dockerignore — strip internal docs from bundle', status: 'done', estimate: 'S' },
          { id: 'p0-s1-t3', title: 'Verify 5 clean consecutive deploys', status: 'done', estimate: 'S' },
        ],
      },
    ],
  },

  // ── PHASE 1 ──────────────────────────────────────────────────────────────
  {
    id: 'p1-studio',
    title: 'Epic 1 — IWIllBUIlD Studio',
    icon: Layers,
    color: 'orange',
    phase: 'Phase 1',
    status: 'in-progress',
    rollback: 'If a Studio module causes a runtime crash: flip its status back to `coming_soon` in the module registry (single-line change, no DB migration needed). The rest of Studio remains live.',
    releaseGate: 'Gate B',
    stories: [
      {
        id: 'p1-s1',
        title: 'Studio shell & navigation',
        goal: 'Deliver /studio route with sidebar entry, blank canvas layout, and category filter tabs.',
        status: 'done',
        estimate: '3',
        owner: 'Frontend',
        priority: 'P1',
        dependencies: [],
        risks: [],
        acceptance: [
          '✅ /studio loads without auth error for all roles',
          '✅ Sidebar entry visible and active-highlighted',
          '✅ Category filter tabs render (Documents, Safety, Planning, Fleet, Training, Custom)',
        ],
      },
      {
        id: 'p1-s2',
        title: 'Service modules launcher — 20-module grid',
        goal: 'Show all 20 modules with status badges, category filtering, and animated card grid.',
        status: 'done',
        estimate: '5',
        owner: 'Frontend',
        priority: 'P1',
        dependencies: ['p1-s1'],
        risks: ['Module count may grow — registry must be data-driven'],
        acceptance: [
          '✅ 20 module cards render across 6 categories',
          '✅ "Ready" badge routes to builder; "Coming soon" shows tooltip',
          '✅ Stats row shows live recent-document count from API',
          '✅ Category filter hides/shows correct cards',
        ],
      },
      {
        id: 'p1-s3',
        title: 'Custom Document & Custom Form modules (first two "Ready")',
        goal: 'Wire Custom Document and Custom Form modules to DocumentBuilder with type/name pre-seeding.',
        status: 'done',
        estimate: '5',
        owner: 'Frontend + Backend',
        priority: 'P1',
        dependencies: ['p1-s2'],
        risks: ['document_templates table must exist at startup (safetyTables)'],
        acceptance: [
          '✅ Clicking Custom Document opens /studio/builder/new with type=document',
          '✅ Clicking Custom Form opens /studio/builder/new with type=form',
          '✅ URL updates to real ID after first save',
          '✅ Recent docs list on /studio shows saved templates',
          '✅ document_templates table created by startup self-healing',
        ],
      },
      {
        id: 'p1-s4',
        title: 'SWMS Builder module',
        goal: 'Enable the SWMS module in Studio — pre-seeds a SWMS template with standard hazard blocks.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend + Backend',
        priority: 'P1',
        dependencies: ['p1-s3'],
        risks: ['SWMS sign-off workflow is a separate story (Safety epic)', 'Existing safety/swms API must be compatible'],
        acceptance: [
          '⬜ SWMS module status flipped to `available`',
          '⬜ Builder opens with pre-seeded hazard/control blocks',
          '⬜ Save creates a record in safety_swms table linked to company',
          '⬜ Saved SWMS appears in /safety SWMS list',
          '⬜ PDF export produces a readable A4 document',
        ],
        subtasks: [
          { id: 'p1-s4-t1', title: 'Flip SWMS module to available in registry', status: 'pending', estimate: 'S' },
          { id: 'p1-s4-t2', title: 'Pre-seed SWMS template blocks (hazard, control, PPE, sign-off)', status: 'pending', estimate: 'M' },
          { id: 'p1-s4-t3', title: 'Wire save → safety_swms table', status: 'pending', estimate: 'M' },
          { id: 'p1-s4-t4', title: 'PDF export via browser print / server-side render', status: 'pending', estimate: 'L' },
        ],
      },
      {
        id: 'p1-s5',
        title: 'Remaining 17 Studio modules — flip to available as built',
        goal: 'Progressively enable each remaining module (Site Diary, Inspection Report, Toolbox Talk, etc.) as their builders are completed.',
        status: 'pending',
        estimate: '13',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p1-s4'],
        risks: ['Each module may need unique block pre-seeds', 'Scope creep — timebox each module to 1 day max'],
        acceptance: [
          '⬜ Each module has a unique template pre-seed',
          '⬜ Status badge flips to "Ready" only after acceptance test passes',
          '⬜ No module causes a crash in adjacent modules',
        ],
      },
    ],
  },

  // ── PHASE 2 ──────────────────────────────────────────────────────────────
  {
    id: 'p2-scheduler',
    title: 'Epic 2 — Scheduler',
    icon: CalendarDays,
    color: 'blue',
    phase: 'Phase 2',
    status: 'pending',
    rollback: 'If drag-drop causes data corruption: disable drag-drop flag in scheduler.tsx (single boolean), revert to click-to-assign modal. No DB rollback needed.',
    stories: [
      {
        id: 'p2-s1',
        title: 'Calendar view improvements',
        goal: 'Upgrade scheduler to a proper week/month calendar with job blocks and colour-coded status.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend',
        priority: 'P1',
        dependencies: [],
        risks: ['scheduler.tsx is already 35 KB — extract sub-components before adding more'],
        acceptance: [
          '⬜ Week view shows job blocks with start/end dates',
          '⬜ Month view shows job count per day',
          '⬜ Status colours match job status palette',
          '⬜ Mobile view collapses to day-strip',
        ],
        subtasks: [
          { id: 'p2-s1-t1', title: 'Refactor scheduler.tsx into SchedulerCalendar + SchedulerJobBlock components', status: 'pending', estimate: 'M' },
          { id: 'p2-s1-t2', title: 'Week view with job blocks', status: 'pending', estimate: 'L' },
          { id: 'p2-s1-t3', title: 'Month view with day-count chips', status: 'pending', estimate: 'M' },
        ],
      },
      {
        id: 'p2-s2',
        title: 'Drag-drop job assignment',
        goal: 'Allow dragging a job card to a date cell to update its scheduledStartDate.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p2-s1'],
        risks: ['Optimistic update must roll back on API failure', 'Touch drag on mobile is complex — defer to v2 if needed'],
        acceptance: [
          '⬜ Drag job to new date updates scheduledStartDate via PUT /api/jobs/:id',
          '⬜ Optimistic UI updates immediately; rolls back on error',
          '⬜ Undo available for 5 s after drop',
          '⬜ Touch drag works on iPad (primary field device)',
        ],
      },
      {
        id: 'p2-s3',
        title: 'Crew availability overlay',
        goal: 'Show which team members are assigned to jobs on each day to prevent double-booking.',
        status: 'pending',
        estimate: '5',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p2-s2'],
        risks: ['Requires team assignment data on jobs — may need schema addition'],
        acceptance: [
          '⬜ Crew availability panel shows per-day assignment count',
          '⬜ Over-assigned days highlighted in amber',
          '⬜ Clicking a crew member filters calendar to their jobs',
        ],
      },
    ],
  },

  {
    id: 'p2-fleet',
    title: 'Epic 3 — Fleet',
    icon: Truck,
    color: 'cyan',
    phase: 'Phase 2',
    status: 'pending',
    rollback: 'If maintenance log migration fails: the new columns are nullable — existing fleet records are unaffected. Drop the new columns and revert the UI component.',
    stories: [
      {
        id: 'p2-f1',
        title: 'Service / maintenance log per asset',
        goal: 'Record service events (oil change, tyre rotation, WOF) against each fleet asset with date and odometer.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend + Backend',
        priority: 'P1',
        dependencies: [],
        risks: ['fleet_service_log table needs colsToEnsure entry', 'fleet-detail.tsx is already 43 KB — extract ServiceLog component'],
        acceptance: [
          '⬜ fleet_service_log table created at startup',
          '⬜ Add/edit/delete service events from fleet-detail.tsx',
          '⬜ Service type, date, odometer, cost, notes fields',
          '⬜ List sorted by date desc',
        ],
        subtasks: [
          { id: 'p2-f1-t1', title: 'Add fleet_service_log to safetyTables + colsToEnsure', status: 'pending', estimate: 'S' },
          { id: 'p2-f1-t2', title: 'GET/POST/DELETE /api/fleet/:id/service-log', status: 'pending', estimate: 'M' },
          { id: 'p2-f1-t3', title: 'ServiceLogTab component in fleet-detail.tsx', status: 'pending', estimate: 'M' },
        ],
      },
      {
        id: 'p2-f2',
        title: 'Odometer tracking',
        goal: 'Track odometer readings over time per asset to calculate km since last service.',
        status: 'pending',
        estimate: '3',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p2-f1'],
        risks: [],
        acceptance: [
          '⬜ Odometer field on service log entry',
          '⬜ Current odometer shown on fleet asset card',
          '⬜ km since last service calculated and displayed',
        ],
      },
      {
        id: 'p2-f3',
        title: 'Next service alerts',
        goal: 'Surface a dashboard alert and fleet flag when a service is due within 14 days or overdue.',
        status: 'pending',
        estimate: '5',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p2-f2'],
        risks: ['Must not spam notifications — debounce to once per day per asset'],
        acceptance: [
          '⬜ Fleet flags API returns service-due assets',
          '⬜ Dashboard fleet card shows "N service due" warning',
          '⬜ Fleet list highlights overdue assets in amber/red',
          '⬜ Notification created in platform_activity_log',
        ],
      },
    ],
  },

  // ── PHASE 3 ──────────────────────────────────────────────────────────────
  {
    id: 'p3-estimating',
    title: 'Epic 4 — Estimating',
    icon: FileText,
    color: 'violet',
    phase: 'Phase 3',
    status: 'pending',
    rollback: 'If PDF export crashes the server: wrap the export handler in a try/catch that returns a 500 with a user-friendly message. No data is mutated by export.',
    stories: [
      {
        id: 'p3-e1',
        title: 'Estimate PDF export',
        goal: 'Generate a branded A4 PDF of an estimate using the company logo and PDF branding settings.',
        status: 'pending',
        estimate: '8',
        owner: 'Backend + Frontend',
        priority: 'P1',
        dependencies: [],
        risks: ['Pure-JS PDF lib required (no puppeteer/chromium on Alpine)', 'Total must be calculated from estimate_lines — no total_amount column on estimates'],
        acceptance: [
          '⬜ GET /api/estimates/:id/export-pdf returns application/pdf',
          '⬜ PDF includes company logo, estimate lines, subtotal, GST, total',
          '⬜ Markup % applied correctly',
          '⬜ Download button in estimate-editor.tsx',
          '⬜ File size < 500 KB for a 20-line estimate',
        ],
        subtasks: [
          { id: 'p3-e1-t1', title: 'Evaluate pdf-lib vs jsPDF for Alpine compatibility', status: 'pending', estimate: 'S' },
          { id: 'p3-e1-t2', title: 'Build PDF layout (header, line table, totals, footer)', status: 'pending', estimate: 'L' },
          { id: 'p3-e1-t3', title: 'Wire company logo from /shared-storage/public/assets/', status: 'pending', estimate: 'S' },
          { id: 'p3-e1-t4', title: 'Download button + loading state in estimate-editor.tsx', status: 'pending', estimate: 'S' },
        ],
      },
      {
        id: 'p3-e2',
        title: 'Client approval link (view-only share)',
        goal: 'Generate a secure share link so a client can view and approve an estimate without logging in.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend + Frontend',
        priority: 'P1',
        dependencies: ['p3-e1'],
        risks: ['secure-share API already exists — reuse token pattern', 'Approval action must be idempotent'],
        acceptance: [
          '⬜ POST /api/estimates/:id/share generates a token (30-day expiry)',
          '⬜ /view-estimate/:token shows read-only estimate with Approve / Request Changes buttons',
          '⬜ Approve action sets estimate.status = "approved" and logs activity',
          '⬜ Expired/invalid token shows friendly error page',
          '⬜ Share link copyable from estimate-editor.tsx',
        ],
      },
    ],
  },

  {
    id: 'p3-invoices',
    title: 'Epic 5 — Invoices',
    icon: DollarSign,
    color: 'emerald',
    phase: 'Phase 3',
    status: 'pending',
    rollback: 'If Stripe payment link creation fails: show a toast error and leave invoice status unchanged. No partial state is written.',
    stories: [
      {
        id: 'p3-i1',
        title: 'Invoice PDF export',
        goal: 'Generate a branded A4 PDF invoice matching the on-screen invoice layout.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend + Frontend',
        priority: 'P1',
        dependencies: ['p3-e1'],
        risks: ['Reuse PDF lib chosen for estimates — share layout primitives'],
        acceptance: [
          '⬜ GET /api/invoices/:id/export-pdf returns application/pdf',
          '⬜ PDF matches invoice-builder.tsx layout (logo, line items, payment terms)',
          '⬜ Download button in invoice-builder.tsx',
          '⬜ Locked invoices can still be exported',
        ],
      },
      {
        id: 'p3-i2',
        title: 'Stripe payment link on invoice',
        goal: 'Add a "Pay Now" button to the client-facing invoice view that opens a Stripe Checkout session.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend + Frontend',
        priority: 'P1',
        dependencies: ['p3-i1'],
        risks: ['Stripe live keys already provisioned', 'Must not double-charge — check invoice status before creating session'],
        acceptance: [
          '⬜ POST /api/invoices/:id/payment-link creates Stripe Checkout session',
          '⬜ "Pay Now" button on /view-invoice/:token',
          '⬜ Stripe webhook marks invoice as paid on checkout.session.completed',
          '⬜ Invoice status updates to "paid" and locked_at set',
          '⬜ Payment confirmation email sent to client',
        ],
        subtasks: [
          { id: 'p3-i2-t1', title: 'POST /api/invoices/:id/payment-link handler', status: 'pending', estimate: 'M' },
          { id: 'p3-i2-t2', title: 'Stripe webhook handler for invoice payment', status: 'pending', estimate: 'M' },
          { id: 'p3-i2-t3', title: '"Pay Now" button on view-invoice.tsx', status: 'pending', estimate: 'S' },
          { id: 'p3-i2-t4', title: 'Payment confirmation email via email skill', status: 'pending', estimate: 'S' },
        ],
      },
      {
        id: 'p3-i3',
        title: 'Overdue invoice reminders',
        goal: 'Automatically send a reminder email to the client when an invoice becomes overdue.',
        status: 'pending',
        estimate: '3',
        owner: 'Backend',
        priority: 'P2',
        dependencies: ['p3-i2'],
        risks: ['Requires a cron/scheduled job — use a startup interval or external cron', 'Must not send duplicate reminders — track last_reminder_sent_at'],
        acceptance: [
          '⬜ Invoice status auto-flips to "overdue" when due_date < today and status = "sent"',
          '⬜ Reminder email sent once on overdue flip, then every 7 days',
          '⬜ last_reminder_sent_at column tracked',
          '⬜ Reminders can be disabled per invoice',
        ],
      },
    ],
  },

  // ── PHASE 4 ──────────────────────────────────────────────────────────────
  {
    id: 'p4-safety',
    title: 'Epic 6 — Safety',
    icon: HardHat,
    color: 'amber',
    phase: 'Phase 4',
    status: 'pending',
    rollback: 'If SWMS sign-off workflow breaks: the sign-off columns are nullable — existing SWMS records are unaffected. Disable the sign-off UI and revert the API handler.',
    stories: [
      {
        id: 'p4-sa1',
        title: 'SWMS builder using Document Builder blocks',
        goal: 'Enable the SWMS Studio module so users can build SWMS documents using the existing block editor.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend + Backend',
        priority: 'P1',
        dependencies: ['p1-s4'],
        risks: ['Covered in Studio Epic p1-s4 — coordinate to avoid duplication'],
        acceptance: [
          '⬜ See p1-s4 acceptance criteria',
          '⬜ SWMS linked to a job via job_id field',
        ],
      },
      {
        id: 'p4-sa2',
        title: 'SWMS sign-off workflow',
        goal: 'Allow workers to digitally sign a SWMS on their phone before starting work.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend + Backend',
        priority: 'P1',
        dependencies: ['p4-sa1'],
        risks: ['Signature capture requires canvas — test on mobile Safari', 'Signed SWMS must be immutable after sign-off'],
        acceptance: [
          '⬜ Sign-off page accessible via share link (no login required)',
          '⬜ Worker enters name + draws signature on canvas',
          '⬜ Signature stored as base64 PNG in DB',
          '⬜ SWMS locked after all required signatories have signed',
          '⬜ Signed PDF exportable with signatures embedded',
        ],
      },
    ],
  },

  {
    id: 'p4-forms',
    title: 'Epic 7 — Forms',
    icon: ClipboardList,
    color: 'pink',
    phase: 'Phase 4',
    status: 'pending',
    rollback: 'If public form share breaks: revoke the share token (DELETE /api/job-forms/:id/share). No submissions are lost.',
    stories: [
      {
        id: 'p4-fo1',
        title: 'Public form share link',
        goal: 'Generate a public URL for a form so external parties (clients, subcontractors) can fill it without logging in.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend + Frontend',
        priority: 'P1',
        dependencies: [],
        risks: ['external-form.tsx already exists — check if share token flow is wired', 'Rate-limit public submissions to prevent spam'],
        acceptance: [
          '⬜ POST /api/job-forms/:id/share generates a token',
          '⬜ /external-form/:token renders the form publicly',
          '⬜ Submission saved to job_form_submissions table',
          '⬜ Share link copyable from forms.tsx',
          '⬜ Token expiry configurable (7 / 30 / never)',
        ],
      },
      {
        id: 'p4-fo2',
        title: 'Submission inbox',
        goal: 'Show all form submissions in a unified inbox so the team can review and action them.',
        status: 'pending',
        estimate: '5',
        owner: 'Frontend + Backend',
        priority: 'P1',
        dependencies: ['p4-fo1'],
        risks: [],
        acceptance: [
          '⬜ Submissions tab in forms.tsx shows all responses',
          '⬜ Each submission shows submitter name, date, form name',
          '⬜ Click to expand full response',
          '⬜ Mark as reviewed / archive',
        ],
      },
      {
        id: 'p4-fo3',
        title: 'Job-linked form responses',
        goal: 'Associate form submissions with a specific job so they appear in the job detail Forms tab.',
        status: 'pending',
        estimate: '3',
        owner: 'Backend + Frontend',
        priority: 'P2',
        dependencies: ['p4-fo2'],
        risks: [],
        acceptance: [
          '⬜ job_id on submission links to jobs table',
          '⬜ Job detail Forms tab shows linked submissions',
          '⬜ Submission count shown on job card',
        ],
      },
    ],
  },

  // ── PHASE 5 ──────────────────────────────────────────────────────────────
  {
    id: 'p5-accounting',
    title: 'Epic 8 — Accounting Integrations',
    icon: BookOpen,
    color: 'teal',
    phase: 'Phase 5',
    status: 'pending',
    rollback: 'If an OAuth callback corrupts the token store: DELETE the integration row for that company and re-authenticate. Invoice sync is idempotent — re-run is safe.',
    releaseGate: 'Gate C',
    stories: [
      {
        id: 'p5-ac1',
        title: 'Xero — live OAuth end-to-end + invoice sync smoke test',
        goal: 'Confirm Xero OAuth flow completes and a real invoice syncs to a Xero sandbox org.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend',
        priority: 'P1',
        dependencies: [],
        risks: ['Xero sandbox credentials may have expired', 'Webhook signature validation must use raw body'],
        acceptance: [
          '⬜ Connect Xero from Settings → Integrations → Accounting',
          '⬜ OAuth callback stores access_token + refresh_token',
          '⬜ POST /api/integrations/xero/sync-invoice sends invoice to Xero sandbox',
          '⬜ Xero webhook received and signature validated',
          '⬜ Token refresh works after expiry',
        ],
      },
      {
        id: 'p5-ac2',
        title: 'MYOB — live OAuth end-to-end smoke test',
        goal: 'Confirm MYOB OAuth flow completes and a real invoice syncs to a MYOB sandbox.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend',
        priority: 'P2',
        dependencies: ['p5-ac1'],
        risks: ['MYOB API rate limits are strict (100 req/min)', 'MYOB sandbox setup requires separate account'],
        acceptance: [
          '⬜ Connect MYOB from Settings → Integrations → Accounting',
          '⬜ OAuth callback stores tokens',
          '⬜ Invoice sync sends to MYOB sandbox without error',
        ],
      },
      {
        id: 'p5-ac3',
        title: 'QBO — live OAuth end-to-end smoke test',
        goal: 'Confirm QuickBooks Online OAuth flow completes and a real invoice syncs.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend',
        priority: 'P2',
        dependencies: ['p5-ac1'],
        risks: ['QBO sandbox requires Intuit developer account', 'Minor API differences vs MYOB/Xero'],
        acceptance: [
          '⬜ Connect QBO from Settings → Integrations → Accounting',
          '⬜ OAuth callback stores tokens',
          '⬜ Invoice sync sends to QBO sandbox without error',
        ],
      },
    ],
  },

  // ── PHASE 6 ──────────────────────────────────────────────────────────────
  {
    id: 'p6-team',
    title: 'Epic 9 — Team & Time Tracking',
    icon: Users,
    color: 'blue',
    phase: 'Phase 6',
    status: 'pending',
    rollback: 'If shift scheduling breaks existing team data: time_entries table is additive — drop it and revert the UI tab without affecting team member records.',
    stories: [
      {
        id: 'p6-t1',
        title: 'Shift scheduling',
        goal: 'Allow admins to assign team members to shifts on specific jobs and dates.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p2-s3'],
        risks: ['Overlaps with Scheduler epic — share the calendar component'],
        acceptance: [
          '⬜ Shift assignment modal on scheduler calendar',
          '⬜ Team member sees their shifts on dashboard',
          '⬜ Shift conflicts highlighted',
        ],
      },
      {
        id: 'p6-t2',
        title: 'Time tracking (clock in/out)',
        goal: 'Let workers clock in and out of jobs from their phone to record actual hours.',
        status: 'pending',
        estimate: '8',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p6-t1'],
        risks: ['GPS location capture is optional but high-value for field use', 'time_entries table needs colsToEnsure entry'],
        acceptance: [
          '⬜ Clock In / Clock Out button on job detail page',
          '⬜ time_entries table records user_id, job_id, clock_in, clock_out',
          '⬜ Total hours shown on job detail',
          '⬜ Admin can edit/delete time entries',
        ],
      },
      {
        id: 'p6-t3',
        title: 'Payroll export prep',
        goal: 'Export a CSV of hours per team member per pay period for import into payroll software.',
        status: 'pending',
        estimate: '3',
        owner: 'Backend',
        priority: 'P3',
        dependencies: ['p6-t2'],
        risks: [],
        acceptance: [
          '⬜ GET /api/team/payroll-export?from=&to= returns CSV',
          '⬜ Columns: name, employee_id, job, date, hours, rate',
          '⬜ Download button in team.tsx',
        ],
      },
    ],
  },

  {
    id: 'p6-customers',
    title: 'Epic 10 — Customer Portal',
    icon: Globe,
    color: 'indigo',
    phase: 'Phase 6',
    status: 'pending',
    rollback: 'If customer portal auth breaks: the portal uses a separate session namespace — revoke all portal tokens (DELETE FROM portal_sessions) without affecting staff logins.',
    stories: [
      {
        id: 'p6-c1',
        title: 'Customer portal login',
        goal: 'Allow clients to log in to a read-only portal to view their jobs, estimates, and invoices.',
        status: 'pending',
        estimate: '13',
        owner: 'Frontend + Backend',
        priority: 'P2',
        dependencies: ['p3-e2', 'p3-i2'],
        risks: ['Separate auth namespace required — must not share staff session tokens', 'Portal must be strictly read-only for clients'],
        acceptance: [
          '⬜ /portal/login page with email + magic link auth',
          '⬜ Customer sees only their own jobs, estimates, invoices',
          '⬜ Approve estimate action available',
          '⬜ Pay invoice via Stripe available',
          '⬜ No access to other companies\' data (row-level security enforced)',
        ],
      },
    ],
  },

  // ── PHASE 7 ──────────────────────────────────────────────────────────────
  {
    id: 'p7-pwa',
    title: 'Epic 11 — PWA Push Notifications',
    icon: Bell,
    color: 'purple',
    phase: 'Phase 7',
    status: 'pending',
    rollback: 'If push subscription registration fails: silently fall back to in-app notification bell. No data is lost.',
    stories: [
      {
        id: 'p7-p1',
        title: 'Push notification infrastructure',
        goal: 'Set up Web Push (VAPID) so the server can send push notifications to subscribed devices.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend',
        priority: 'P2',
        dependencies: [],
        risks: ['iOS Safari push requires iOS 16.4+ and installed PWA', 'VAPID keys must be stored as secrets, not in code'],
        acceptance: [
          '⬜ VAPID keys generated and stored in secrets',
          '⬜ POST /api/push/subscribe stores PushSubscription',
          '⬜ POST /api/push/send (internal) sends a test notification',
          '⬜ Service worker handles push event and shows notification',
        ],
      },
      {
        id: 'p7-p2',
        title: 'Job assigned, invoice paid, form submitted notifications',
        goal: 'Trigger push notifications for the three highest-value events.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend + Frontend',
        priority: 'P2',
        dependencies: ['p7-p1'],
        risks: ['Must respect user notification preferences', 'Batch events to avoid notification spam'],
        acceptance: [
          '⬜ Push sent when a job is assigned to a user',
          '⬜ Push sent when an invoice is marked paid',
          '⬜ Push sent when a public form is submitted',
          '⬜ User can disable each notification type in Settings',
        ],
      },
    ],
  },

  {
    id: 'p7-owner',
    title: 'Epic 12 — Owner Console',
    icon: Terminal,
    color: 'slate',
    phase: 'Phase 7',
    status: 'pending',
    rollback: 'Analytics tab is read-only — no rollback needed. If billing breakdown query is slow: add a DB index on subscriptions.company_id and cache the result for 5 min.',
    stories: [
      {
        id: 'p7-oc1',
        title: 'Usage analytics tab',
        goal: 'Show per-company usage metrics (API calls, storage, active users) in the Owner Console.',
        status: 'pending',
        estimate: '5',
        owner: 'Frontend + Backend',
        priority: 'P3',
        dependencies: [],
        risks: ['platform_activity_log is raw SQL — query must be efficient (add index on company_id + created_at)'],
        acceptance: [
          '⬜ Usage tab in owner-console.tsx',
          '⬜ Per-company: API calls MTD, storage used, active users last 30 days',
          '⬜ Sortable table with export CSV',
        ],
      },
      {
        id: 'p7-oc2',
        title: 'Per-company billing breakdown',
        goal: 'Show each company\'s current plan, MRR, and payment history in the Owner Console.',
        status: 'pending',
        estimate: '3',
        owner: 'Frontend + Backend',
        priority: 'P3',
        dependencies: ['p7-oc1'],
        risks: ['Stripe API calls must be server-side only'],
        acceptance: [
          '⬜ Billing tab shows plan, MRR, next renewal, payment status per company',
          '⬜ Link to Stripe dashboard for each customer',
        ],
      },
    ],
  },

  // ── PHASE 8 ──────────────────────────────────────────────────────────────
  {
    id: 'p8-marketing',
    title: 'Epic 13 — Marketing Landing Page',
    icon: Megaphone,
    color: 'orange',
    phase: 'Phase 8',
    status: 'pending',
    rollback: 'If hero video causes LCP regression: swap back to static hero image (single src change in index.tsx). Video is loaded lazily so it cannot block FCP.',
    stories: [
      {
        id: 'p8-m1',
        title: 'Hero video',
        goal: 'Replace the static hero image with a looping background video that showcases the portal in action.',
        status: 'pending',
        estimate: '3',
        owner: 'Frontend',
        priority: 'P2',
        dependencies: [],
        risks: ['Video must be < 5 MB and have a static poster fallback', 'Autoplay requires muted attribute on mobile'],
        acceptance: [
          '⬜ Hero video loops silently with poster fallback',
          '⬜ LCP score not degraded vs static image (poster loads first)',
          '⬜ Video served from /airo-assets/ slot',
        ],
      },
      {
        id: 'p8-m2',
        title: 'Testimonials section',
        goal: 'Add a social-proof testimonials carousel with real customer quotes.',
        status: 'pending',
        estimate: '3',
        owner: 'Frontend',
        priority: 'P2',
        dependencies: [],
        risks: [],
        acceptance: [
          '⬜ 3–5 testimonial cards with name, company, quote',
          '⬜ Auto-advances every 5 s, pausable on hover',
          '⬜ Content editable via virtual:content layer',
        ],
      },
      {
        id: 'p8-m3',
        title: 'Pricing table live',
        goal: 'Show the four live Stripe plans (Solo $19, Team $79, Business $149, Enterprise) with a CTA to sign up.',
        status: 'pending',
        estimate: '5',
        owner: 'Frontend + Backend',
        priority: 'P1',
        dependencies: [],
        risks: ['Prices must match Stripe live product prices exactly', 'Annual toggle should show discounted price'],
        acceptance: [
          '⬜ Four plan cards with features list',
          '⬜ Monthly / Annual toggle',
          '⬜ "Start free trial" CTA routes to /signup with plan pre-selected',
          '⬜ Prices fetched from /api/subscription/plans (not hardcoded)',
        ],
      },
    ],
  },

  // ── PARALLEL TRACKS ───────────────────────────────────────────────────────
  {
    id: 'px-dazza',
    title: 'Parallel Track — Dazza AI Enhancements',
    icon: Bot,
    color: 'violet',
    phase: 'Parallel',
    status: 'in-progress',
    rollback: 'If a new tool causes hallucinations or data leaks: remove the tool from tools.ts and redeploy. The chat-v2 endpoint falls back to non-tool mode automatically.',
    stories: [
      {
        id: 'px-d1',
        title: 'Streaming responses (GPT-4o / Claude 3.5)',
        goal: 'Deliver token-by-token streaming in the Dazza chat UI for a faster perceived response.',
        status: 'done',
        estimate: '5',
        owner: 'Backend + Frontend',
        priority: 'P1',
        dependencies: [],
        risks: [],
        acceptance: [
          '✅ POST /api/dazza/chat-v2/stream streams SSE tokens',
          '✅ dazza-ai.tsx renders tokens as they arrive',
          '✅ Model switchable between GPT-4o and Claude 3.5 Sonnet',
        ],
      },
      {
        id: 'px-d2',
        title: 'Additional Dazza tools (estimate lookup, safety docs)',
        goal: 'Extend Dazza\'s tool-use to cover estimates, safety documents, and fleet queries.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend',
        priority: 'P2',
        dependencies: ['px-d1'],
        risks: ['Each tool must validate company_id to prevent cross-tenant data access'],
        acceptance: [
          '⬜ get_estimates tool returns estimate list for company',
          '⬜ get_safety_docs tool returns SWMS/plans',
          '⬜ get_fleet_status tool returns asset list with flags',
          '⬜ All tools enforce company_id scoping',
        ],
      },
    ],
  },

  {
    id: 'px-stripe',
    title: 'Parallel Track — Stripe / Billing Improvements',
    icon: CreditCard,
    color: 'emerald',
    phase: 'Parallel',
    status: 'pending',
    rollback: 'If proration calculation is wrong: revert to the previous upgrade handler. Stripe will automatically refund the difference on the next billing cycle.',
    stories: [
      {
        id: 'px-st1',
        title: 'Stripe payment link on invoices',
        goal: 'See Epic 5 — Invoices story p3-i2.',
        status: 'pending',
        estimate: '5',
        owner: 'Backend + Frontend',
        priority: 'P1',
        dependencies: ['p3-i1'],
        risks: ['Covered in Invoices epic — coordinate to avoid duplication'],
        acceptance: ['⬜ See p3-i2 acceptance criteria'],
      },
    ],
  },
];

// ── Next 2 Days ───────────────────────────────────────────────────────────────

const NEXT_TWO_DAYS = [
  { priority: 'P0', label: 'Verify Gate A: run 5 clean deploys to iwillbuild.com and confirm no socket-hang-up', done: true },
  { priority: 'P1', label: 'Studio: flip SWMS module to available — pre-seed hazard/control blocks (p1-s4)', done: false },
  { priority: 'P1', label: 'Studio: wire SWMS save → safety_swms table (p1-s4-t3)', done: false },
  { priority: 'P1', label: 'Estimating: evaluate pdf-lib vs jsPDF for Alpine — spike PDF export (p3-e1-t1)', done: false },
  { priority: 'P1', label: 'Estimating: build estimate PDF layout — header, line table, totals, footer (p3-e1-t2)', done: false },
  { priority: 'P1', label: 'Fleet: add fleet_service_log to safetyTables + colsToEnsure (p2-f1-t1)', done: false },
  { priority: 'P1', label: 'Fleet: build GET/POST/DELETE /api/fleet/:id/service-log (p2-f1-t2)', done: false },
  { priority: 'P2', label: 'Dazza: add get_estimates and get_fleet_status tools to tools.ts (px-d2)', done: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ElementType }> = {
  done:        { label: 'Done',        color: 'text-emerald-700 bg-emerald-50 border-emerald-200',  icon: CheckCircle2 },
  'in-progress': { label: 'In Progress', color: 'text-violet-800 bg-violet-50 border-violet-200',    icon: Clock },
  pending:     { label: 'Pending',     color: 'text-slate-600 bg-slate-50 border-slate-200',        icon: Circle },
  blocked:     { label: 'Blocked',     color: 'text-red-700 bg-red-50 border-red-200',              icon: AlertTriangle },
  parallel:    { label: 'Parallel',    color: 'text-violet-700 bg-violet-50 border-violet-200',     icon: GitBranch },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  P0: { label: 'P0 Blocker', color: 'text-red-700 bg-red-100 border-red-300' },
  P1: { label: 'P1 High',    color: 'text-violet-800 bg-violet-100 border-violet-300' },
  P2: { label: 'P2 Medium',  color: 'text-blue-700 bg-blue-100 border-blue-300' },
  P3: { label: 'P3 Low',     color: 'text-slate-600 bg-slate-100 border-slate-300' },
};

const COLOR_MAP: Record<string, string> = {
  red:    'border-red-400 bg-red-50',
  orange: 'border-violet-400 bg-violet-50',
  blue:   'border-blue-400 bg-blue-50',
  cyan:   'border-cyan-400 bg-cyan-50',
  violet: 'border-violet-400 bg-violet-50',
  emerald:'border-emerald-400 bg-emerald-50',
  amber:  'border-amber-400 bg-amber-50',
  pink:   'border-pink-400 bg-pink-50',
  teal:   'border-teal-400 bg-teal-50',
  indigo: 'border-indigo-400 bg-indigo-50',
  purple: 'border-purple-400 bg-purple-50',
  slate:  'border-slate-400 bg-slate-50',
};

const ICON_COLOR_MAP: Record<string, string> = {
  red:    'text-red-600 bg-red-100',
  orange: 'text-violet-700 bg-violet-100',
  blue:   'text-blue-600 bg-blue-100',
  cyan:   'text-cyan-600 bg-cyan-100',
  violet: 'text-violet-600 bg-violet-100',
  emerald:'text-emerald-600 bg-emerald-100',
  amber:  'text-amber-600 bg-amber-100',
  pink:   'text-pink-600 bg-pink-100',
  teal:   'text-teal-600 bg-teal-100',
  indigo: 'text-indigo-600 bg-indigo-100',
  purple: 'text-purple-600 bg-purple-100',
  slate:  'text-slate-600 bg-slate-100',
};

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon size={9} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function SizeBadge({ size }: { size: Size }) {
  return (
    <span className="inline-flex items-center text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
      {size}
    </span>
  );
}

// ── Story Card ────────────────────────────────────────────────────────────────

function StoryCard({ story }: { story: Story }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="mt-0.5 shrink-0">
          {story.status === 'done'
            ? <CheckCircle2 size={16} className="text-emerald-500" />
            : story.status === 'in-progress'
              ? <Clock size={16} className="text-violet-600" />
              : <Circle size={16} className="text-slate-300" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">{story.title}</span>
            <StatusBadge status={story.status} />
            <PriorityBadge priority={story.priority} />
            <SizeBadge size={story.estimate} />
          </div>
          <p className="text-xs text-muted-foreground">{story.goal}</p>
        </div>
        <div className="shrink-0 mt-0.5">
          {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' as const }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-border bg-slate-50/50 space-y-4">
              {/* Owner */}
              <div className="flex items-center gap-2 pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Owner</span>
                <span className="text-xs text-foreground">{story.owner}</span>
              </div>

              {/* Acceptance Criteria */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Acceptance Criteria</p>
                <ul className="space-y-1">
                  {story.acceptance.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <span className="mt-0.5 shrink-0">{a.startsWith('✅') ? '✅' : '⬜'}</span>
                      <span>{a.replace(/^[✅⬜]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Risks */}
              {story.risks.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Risks</p>
                  <ul className="space-y-1">
                    {story.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dependencies */}
              {story.dependencies.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dependencies</p>
                  <div className="flex flex-wrap gap-1">
                    {story.dependencies.map((d) => (
                      <span key={d} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{d}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtasks */}
              {story.subtasks && story.subtasks.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Subtasks</p>
                  <div className="space-y-1">
                    {story.subtasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-xs">
                        {t.status === 'done'
                          ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                          : <Circle size={12} className="text-slate-300 shrink-0" />
                        }
                        <span className={t.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}>{t.title}</span>
                        <SizeBadge size={t.estimate} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Epic Card ─────────────────────────────────────────────────────────────────

function EpicCard({ epic }: { epic: Epic }) {
  const [open, setOpen] = useState(epic.status === 'in-progress' || epic.status === 'done');
  const Icon = epic.icon;
  const doneCount = epic.stories.filter((s) => s.status === 'done').length;
  const pct = Math.round((doneCount / epic.stories.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' as const }}
      className={`rounded-xl border-l-4 border border-border ${COLOR_MAP[epic.color] ?? 'border-slate-400 bg-slate-50'} overflow-hidden`}
    >
      {/* Epic header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-4 p-5 text-left hover:brightness-95 transition-all"
      >
        <div className={`p-2.5 rounded-xl shrink-0 ${ICON_COLOR_MAP[epic.color] ?? 'text-slate-600 bg-slate-100'}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-bold text-foreground">{epic.title}</span>
            <StatusBadge status={epic.status} />
            {epic.releaseGate && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700">
                <Flag size={9} /> {epic.releaseGate}
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-current rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, color: pct === 100 ? '#10b981' : '#7c3aed' }}
              />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground shrink-0">{doneCount}/{epic.stories.length}</span>
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' as const }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-3">
              {/* Stories */}
              {epic.stories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}

              {/* Rollback criterion */}
              <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide mb-0.5">Rollback Criterion</p>
                  <p className="text-xs text-red-700">{epic.rollback}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const [activePhase, setActivePhase] = useState<string>('all');

  const phases = ['all', 'Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Phase 7', 'Phase 8', 'Parallel'];
  const filtered = activePhase === 'all' ? EPICS : EPICS.filter((e) => e.phase === activePhase);

  const totalStories = EPICS.flatMap((e) => e.stories).length;
  const doneStories = EPICS.flatMap((e) => e.stories).filter((s) => s.status === 'done').length;
  const overallPct = Math.round((doneStories / totalStories) * 100);

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>Product Roadmap — IWIllBUIlD Portal</title>
        <meta name="description" content="Internal product roadmap for the IWIllBUIlD Portal — epics, stories, release gates and sprint priorities." />
        <link rel="canonical" href="https://iwillbuild.com/roadmap" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* ── Header ── */}
      <div className="bg-white border-b border-border sticky top-0 z-20 safe-top">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-100">
              <Rocket size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-base text-foreground leading-none">IWIllBUIlD Portal — Product Roadmap</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Internal · Updated July 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-foreground">{doneStories}/{totalStories} stories</p>
              <p className="text-[10px] text-muted-foreground">{overallPct}% complete</p>
            </div>
            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${overallPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-8">

        {/* ── Next 2 Days ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-primary" />
            <h2 className="font-heading font-bold text-sm text-foreground uppercase tracking-wide">Next 2 Days — Highest Priority</h2>
          </div>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            {NEXT_TWO_DAYS.map((item, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i < NEXT_TWO_DAYS.length - 1 ? 'border-b border-border' : ''}`}>
                <div className="mt-0.5 shrink-0">
                  {item.done
                    ? <CheckCircle2 size={14} className="text-emerald-500" />
                    : <Circle size={14} className="text-slate-300" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{item.label}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_CONFIG[item.priority as Priority].color}`}>
                  {item.priority}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Release Gates ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-slate-500" />
            <h2 className="font-heading font-bold text-sm text-foreground uppercase tracking-wide">Release Gates</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roadmapGates.map((gate) => (
              <div key={gate.id} className={`rounded-xl border p-4 ${gate.status === 'passed' ? 'border-emerald-300 bg-emerald-50' : gate.status === 'in-progress' ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-2 mb-3">
                  {gate.status === 'passed'
                    ? <CheckCircle2 size={14} className="text-emerald-600" />
                    : gate.status === 'in-progress'
                      ? <Clock size={14} className="text-violet-700" />
                      : <Circle size={14} className="text-slate-400" />
                  }
                  <span className="text-xs font-bold text-foreground">{gate.label}</span>
                </div>
                <ul className="space-y-1 mb-3">
                  {gate.criteria.map((c, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <ArrowRight size={9} className="mt-0.5 shrink-0" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] font-semibold text-muted-foreground">
                  Unlocks: <span className="text-foreground">{gate.unblock}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Phase filter ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-slate-500" />
            <h2 className="font-heading font-bold text-sm text-foreground uppercase tracking-wide">Epics & Stories</h2>
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            {roadmapPhases.map((p) => (
              <button
                key={p}
                onClick={() => setActivePhase(p)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  activePhase === p
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground border-border hover:border-primary/40'
                }`}
              >
                {p === 'all' ? 'All Phases' : p}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filtered.map((epic) => (
              <EpicCard key={epic.id} epic={epic} />
            ))}
          </div>
        </section>

        {/* ── Security / Ops constraints ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-slate-500" />
            <h2 className="font-heading font-bold text-sm text-foreground uppercase tracking-wide">Security & Ops Constraints</h2>
          </div>
          <div className="bg-white rounded-xl border border-border p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: Lock, title: 'No internal docs in public bundle', body: '.dockerignore must exclude /docs, /migrations, /scripts, and all migrate-* API handlers from the production image.' },
              { icon: Shield, title: 'Secrets never in source code', body: 'All API keys (Stripe, OpenAI, Twilio, Xero, MYOB, QBO, VAPID) stored as platform secrets. Never in .env committed to git.' },
              { icon: AlertTriangle, title: 'Deploy freeze on pipeline failure', body: 'If publish fails: freeze all deploys, pin to last working commit, open GoDaddy support ticket before any further changes.' },
              { icon: GitBranch, title: 'Additive DB changes only', body: 'All schema changes via colsToEnsure (nullable columns) or safetyTables (CREATE TABLE IF NOT EXISTS). Never DROP or ALTER NOT NULL without a migration plan.' },
              { icon: Users, title: 'Cross-tenant data isolation', body: 'Every API handler must filter by company_id from the authenticated session. Never trust company_id from the request body.' },
              { icon: Zap, title: 'Alpine / musl compatibility', body: 'Production runs Alpine Linux. No native addons (bcrypt → bcryptjs, sharp → jimp, puppeteer → pdf-lib/jsPDF). Test PDF export on Alpine before shipping.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-slate-100 shrink-0">
                  <item.icon size={13} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-[11px] text-muted-foreground pb-4">
          IWIllBUIlD Portal — Internal Roadmap · Not for distribution · {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}
