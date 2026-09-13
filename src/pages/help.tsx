/**
 * /help — IWILLBUILD Help & User Guide
 *
 * SOURCE OF TRUTH: homeIcons.ts → VISIBLE_GROUP_CONFIG
 *
 * Groups, labels, icon tiles (bg/fg/icon component), adminOnly/ownerOnly badges,
 * and visibility (comingSoon filtering) all come from homeIcons.ts.
 *
 * This file owns ONLY the per-icon documentation (purpose, howTo, tip),
 * keyed by the stable `key` field. To add a new feature to Help:
 *   1. Add it to homeIcons.ts (it will appear automatically in the group list)
 *   2. Add a matching ICON_DOCS[key] entry here
 *
 * comingSoon icons are NEVER shown here — VISIBLE_GROUP_CONFIG already filters them.
 */
import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, ChevronRight, Search, BookMarked, Download, FileDown,
  LayoutDashboard, Briefcase, Wrench, Settings2,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import ManageBackButton from '@/components/ManageBackButton';
import { VISIBLE_GROUP_CONFIG } from '@/lib/homeIcons';

// ── Per-icon documentation ────────────────────────────────────────────────────
// Key matches HomeIconDef.key. Add an entry here for every released icon.
// Icons without an entry show a generic placeholder.
interface IconDoc {
  purpose: string;
  howTo: string[];
  tip?: string;
}

const PHONE_PAGES = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    colour: 'bg-violet-600',
    description: 'Your daily overview: notifications, tasks, contacts, quick photo upload and recent jobs.',
  },
  {
    title: 'Work',
    icon: Briefcase,
    colour: 'bg-blue-600',
    description: 'Choose a job, then open its tasks, notes, progress, attendance, photos, files, finance, forms or safety records.',
  },
  {
    title: 'Tools',
    icon: Wrench,
    colour: 'bg-rose-600',
    description: 'Safety registers, permits, incidents, posters, Studio Forms, Studio Documents and estimating utilities.',
  },
  {
    title: 'Manage',
    icon: Settings2,
    colour: 'bg-slate-700',
    description: 'Resource Library, Sign-in History, team, billing, settings, app permissions, account deletion and Help.',
  },
] as const;

const HELP_LABELS: Record<string, string> = {
  job_card: 'Service Jobs',
  risk_register: 'Hazard Register',
  library: 'Resource Library',
};

const ICON_DOCS: Record<string, IconDoc> = {
  // ── FIELD ──────────────────────────────────────────────────────────────────
  tools: {
    purpose: 'Open the operational tools available for your account and role.',
    howTo: ['Tap Work.', 'Open Tools.', 'Choose the tool you need.', 'Use the back arrow to return to Work.'],
  },
  jobs: {
    purpose: 'Create, manage and monitor projects. Most field actions start by choosing a job on the Work page.',
    howTo: [
      'Tap Work, then choose the job feature you need.',
      'Select a job when the job picker opens.',
      'Browse active jobs or use search to find one.',
      'Tap a job to open its detail view.',
      'Use the job sections to open work, field files, finance and safety records.',
      'Use + New Job from the Dashboard when you need to create a project.',
    ],
    tip: 'The Finance nav group is only visible to users with the Finance permission.',
  },
  job_card: {
    purpose: 'Manage smaller call-outs, service work and do-and-charge jobs separately from larger projects.',
    howTo: ['Open Service Jobs.', 'Browse existing service jobs or create a new one.', 'Record the work, labour, materials and site notes.', 'Open the service job when you need to update or print its record.'],
  },
  log_cost: {
    purpose: 'Quickly record a cost or expense against a job while you are on site — materials, subcontractors, hire equipment, etc.',
    howTo: ['Tap Log Cost on the home screen.', 'Select the job the cost belongs to.', 'Enter the amount, description, and category.', 'Attach a receipt photo if needed.', 'Tap Save — the cost is added to the job\'s ledger immediately.'],
    tip: 'Costs logged here feed directly into job profitability reports.',
  },
  scheduler: {
    purpose: 'Plan and schedule jobs, tasks, and team members on a visual calendar. See who is working where and when.',
    howTo: ['Tap Scheduler on the home screen.', 'View the calendar in day, week, or month view.', 'Tap a time slot to create a new schedule entry.', 'Assign a job, team members, and duration.', 'Team members receive a notification of their schedule.'],
  },

  // ── FILES ──────────────────────────────────────────────────────────────────
  lens: {
    purpose: 'A company-wide photo gallery. Browse all photos taken across every job in one place. Filter by job, date, or category.',
    howTo: ['Tap Lens on the home screen.', 'Browse the photo feed — newest first.', 'Use the job filter to narrow to a specific project.', 'Tap any photo to view it full screen.', 'Use the share button to send a photo.'],
  },
  plan_mgr: {
    purpose: 'Upload, organise, and view construction plans and drawings at a project level. Annotate plans and share with the team.',
    howTo: ['Tap Plan Manager on the home screen.', 'Select a job to view its plans.', 'Tap + to upload a new plan set.', 'Tap any plan to open the full-screen viewer.', 'Pinch to zoom, use the annotation tools to mark up the plan.'],
  },
  files: {
    purpose: 'A central file store for all business documents — contracts, certificates, insurance, plans, and any other files not attached to a specific job.',
    howTo: ['Tap Files on the home screen.', 'Browse folders or search by filename.', 'Tap a file to preview or download it.', 'Tap + to upload a new file.', 'Use folders to organise files by category.'],
  },
  asset_mgr: {
    purpose: 'Manage and track company assets — equipment, tools, and plant. Log service records, check maintenance schedules, and record usage.',
    howTo: ['Tap Equipment Manager on Work.', 'Browse the equipment list or search by name.', 'Tap an item to view details, service history, and documents.', 'Use the + button to log a new service or usage record.'],
    tip: 'Equipment Manager is on the Work tab.',
  },

  // ── FLEET ──────────────────────────────────────────────────────────────────
  fleet: {
    purpose: 'Manage your vehicle and plant fleet. Track registrations, service schedules, prestart history, and assign vehicles to jobs.',
    howTo: ['Tap Fleet on the home screen.', 'Browse the fleet list.', 'Tap a vehicle to view its details, service history, and prestart records.', 'Tap + to add a new vehicle or piece of plant.', 'Set service reminders — you\'ll be notified when service is due.'],
  },

  // ── FINANCE ────────────────────────────────────────────────────────────────
  quotes: {
    purpose: 'Create and manage job estimates. Add labour, materials, subcontractors, and margins to produce a professional estimate document.',
    howTo: ['Tap Estimates on the home screen.', 'Browse existing estimates or tap + to create a new one.', 'Add sections and line items — set quantities, rates, and margins.', 'Apply GST and review the total.', 'Generate a quote PDF to send to the client.'],
  },
  invoices_mgmt: {
    purpose: 'Create and manage invoices for completed work. Track payment status and send reminders.',
    howTo: ['Tap Invoices on the home screen.', 'Browse all invoices or filter by status (Draft, Sent, Paid, Overdue).', 'Tap + to create a new invoice.', 'Add line items, apply GST, and set payment terms.', 'Send to the client — payment status updates as payments are recorded.'],
  },
  ledger: {
    purpose: 'A running ledger of all costs and income entries against a job. Every cost logged, invoice raised, and manual entry appears here in chronological order.',
    howTo: ['Open a job and tap Finance, then Job Ledger.', 'Browse all entries — costs, invoices, and manual adjustments.', 'Tap + to add a manual ledger entry.', 'Use the export button to download the ledger as CSV.'],
    tip: 'The ledger is the source of truth for job financials. Costs logged from the field and invoices raised in the office both flow here automatically.',
  },
  purchase_orders: {
    purpose: 'Create and manage Purchase Orders (POs) for contractors and suppliers against a job. Track PO status from Draft through to Approved, Sent, and Completed.',
    howTo: [
      'Tap Purchase Orders on the home screen.',
      'Tap + New PO to open the create workflow.',
      'Select the contractor, add a title, and set the PO date.',
      'Add line items — description, quantity, unit, and rate.',
      'Review the subtotal and GST, then save as Draft or submit for approval.',
      'Change status to Approved when authorised, then Sent once issued to the contractor.',
      'Tap the PDF button on any PO to generate and download a formatted PDF.',
    ],
    tip: 'Approved POs lock their line items to prevent accidental edits.',
  },
  estimating: {
    purpose: 'Build detailed cost estimates using Cost Guide rates, Recipes, Builders Calc, and Take-off Pad. Produce professional quote documents.',
    howTo: ['Tap Estimating on the home screen (Admin only).', 'Use the Cost Guide tab to browse standard rates.', 'Use Recipes to build reusable cost bundles.', 'Use Builders Calc for on-site construction calculations.', 'Use Take-off Pad to measure quantities from drawings.'],
    tip: 'Estimating is visible to Admins and Owners only.',
  },
  builders_calc: {
    purpose: 'A construction calculator for common on-site calculations — concrete volumes, steel weights, area, perimeter, and more.',
    howTo: ['Tap Builders Calc on the home screen.', 'Select the calculation type.', 'Enter the dimensions or values.', 'The result is calculated instantly.', 'Tap Copy to copy the result to your clipboard.'],
  },
  takeoff_pad: {
    purpose: 'Measure quantities directly from uploaded drawings. Scale the drawing, then trace areas, lengths, and counts to produce a take-off list.',
    howTo: ['Tap Takeoff Pad on the home screen.', 'Upload or select a drawing.', 'Set the scale by measuring a known dimension on the drawing.', 'Use the area, length, or count tools to measure quantities.', 'Export the take-off list to use in an estimate.'],
  },
  finance_settings: {
    purpose: 'Configure finance settings — accounting integrations (Xero, QuickBooks), GST rates, invoice numbering, and PDF branding.',
    howTo: ['Tap Finance Settings on the home screen (Admin only).', 'Connect your accounting software under the Accounting tab.', 'Set your default GST rate and invoice prefix.', 'Upload your company logo for invoice PDFs.'],
    tip: 'Finance Settings is visible to Admins and Owners only.',
  },

  // ── SAFETY ─────────────────────────────────────────────────────────────────
  forms: {
    purpose: 'Studio Forms lets you design and manage digital forms — inspection checklists, toolbox talks, quality records, and any form your business needs.',
    howTo: ['Open Tools and tap Studio Forms.', 'Browse existing forms or tap + to create a new one.', 'Add fields: text, number, checkbox, signature, photo, dropdown, etc.', 'Set required fields and conditional logic.', 'Publish the form — it appears in the Forms picker for field workers.'],
  },
  safety: {
    purpose: 'Studio Documents lets you create, manage, and assign SWMS and other safety documents to jobs. Workers review and sign on before starting high-risk activities.',
    howTo: ['Open Tools and tap Studio Documents.', 'Browse existing documents or tap + to create a new document.', 'Fill in the work activity, hazards, controls, PPE, and plant/equipment.', 'Assign the document to a job.', 'Workers review and sign on via Field Docs.'],
    tip: 'SWMS are required by law for high-risk construction work. Keep them current and job-specific.',
  },
  poster: {
    purpose: 'View and display safety posters and signage — PPE requirements, risk matrices, first aid information, and site rules.',
    howTo: ['Tap Safety Posters on the home screen.', 'Browse the poster library by category.', 'Tap a poster to view it full screen.', 'Use the share button to send a poster or print it for site display.'],
  },
  incidents: {
    purpose: 'Report and manage workplace incidents, near misses, and injuries. Creates a formal incident register with corrective actions and third-party details.',
    howTo: ['Tap Incidents on the home screen.', 'Tap + to report a new incident.', 'Fill in the incident type, date, location, and description.', 'Add injured parties or third-party details if applicable.', 'Assign corrective actions and set due dates.', 'Submit — the incident is added to the register.'],
    tip: 'Report incidents as soon as possible after they occur. Near misses are just as important to record as injuries.',
  },
  risk_register: {
    purpose: 'Identify, assess, and control workplace hazards and risks across the company. Each entry captures the hazard, likelihood × consequence risk matrix, existing controls, additional controls required, responsible person, and due date.',
    howTo: ['Open Tools and tap Hazard Register.', 'Tap New hazard to add an entry.', 'Enter the hazard title, category and description.', 'Set likelihood and consequence — the risk level is calculated automatically.', 'Document existing controls and any additional controls required.', 'Assign a responsible person and due date.', 'Update the status as controls are implemented.'],
    tip: 'Extreme and high hazards are highlighted at the top of the register. Review entries regularly.',
  },
  sds_register: {
    purpose: 'Manage Safety Data Sheets (SDS) for all hazardous substances used on site. Store, search, and access SDS documents for compliance.',
    howTo: ['Tap SDS Register on the home screen.', 'Browse the SDS list or search by substance name.', 'Tap + to add a new SDS entry.', 'Upload the SDS PDF and fill in the substance details.', 'SDS documents are accessible to all team members on site.'],
    tip: 'SDS must be available on site for every hazardous substance in use. Keep them current.',
  },
  rl_register: {
    purpose: 'Manage the Restricted Licence (RL) register — track workers who hold licences for high-risk work (scaffolding, rigging, crane operation, etc.).',
    howTo: ['Tap RL Register on the home screen.', 'Browse the register or search by worker name.', 'Tap + to add a new licence record.', 'Enter the licence type, number, and expiry date.', 'The register flags licences that are expiring soon.'],
    tip: 'Workers must hold a current RL for any high-risk work they perform. Check the register before assigning tasks.',
  },
  electrical_tests: {
    purpose: 'Record and manage electrical test and tag results. Log test dates, results, and next test due dates for all electrical equipment.',
    howTo: ['Tap Electrical Tests on the home screen.', 'Browse the equipment list or search by asset name.', 'Tap + to log a new test result.', 'Enter the test date, result (pass/fail), and next test due date.', 'Failed items are flagged for immediate attention.'],
    tip: 'Test and tag records are required for compliance. Keep them up to date for every piece of electrical equipment.',
  },
  risky: {
    purpose: 'Create risk assessments and work permit checks for site activities, changed conditions, new hazards, or high-risk work.',
    howTo: ['Tap Risk & Permits on the home screen.', 'Tap + to create a new risk assessment.', 'Fill in the activity, hazards, control measures, and any permit requirements.', 'Supervisor signs off, then workers and relevant parties sign on before work begins.', 'Completed assessments are stored against the job.'],
  },

  // ── MANAGEMENT ─────────────────────────────────────────────────────────────
  profile: {
    purpose: 'View and update your personal profile — name, contact details, profile photo, and notification preferences.',
    howTo: ['Tap My Profile on the home screen.', 'Update your name, phone number, or profile photo.', 'Change your notification preferences.', 'Update your password under the Security section.', 'Tap Save to apply changes.'],
  },
  dazza_ai: {
    purpose: 'Dazza AI — an agentic AI assistant for platform owners. Analyse data, generate reports, and run platform-level queries.',
    howTo: ['Tap Dazza AI on the home screen (Owner only).', 'Type your question or instruction in the chat.', 'Dazza will analyse the request and respond with data, summaries, or actions.', 'Review the response and follow up with further questions.'],
    tip: 'Dazza AI is available to platform owners only.',
  },
  library: {
    purpose: 'Browse the IWILLBUILD catalogue of form and document templates. Catalogue previews remain available to every account.',
    howTo: ['Open Manage and tap Resource Library.', 'Browse or search the catalogue.', 'Open an item to preview it.', 'On an active plan, download it into your company templates.'],
    tip: 'Library downloads require an active plan or trial. Templates already owned by your company remain available.',
  },
  quick_links: {
    purpose: 'A customisable set of shortcut links for your team — external websites, supplier portals, council links, or any URL your team needs quick access to.',
    howTo: ['Tap Quick Links on the home screen (Admin only).', 'Browse the links your admin has set up.', 'Tap any link to open it.', 'Admins can add, edit, or remove links from the company settings.'],
  },
  lists: {
    purpose: 'Manage structured data lists used across the platform — cost categories, trade types, delay reasons, and other configurable lookup values.',
    howTo: ['Tap Lists on the home screen (Admin only).', 'Select the list type you want to manage.', 'Add, edit, or remove items from the list.', 'Changes take effect immediately across all jobs and forms.'],
    tip: 'Keeping your lists tidy improves consistency in reporting and cost tracking.',
  },
  user_logs: {
    purpose: 'A full audit log of user actions across the platform — logins, record changes, deletions, and system events.',
    howTo: ['Tap User Logs on the home screen (Admin only).', 'Browse the log feed — newest events at the top.', 'Use filters to narrow by user, action type, or date range.', 'Tap any entry to see the full detail.'],
    tip: 'User Logs are useful for investigating data changes or compliance audits.',
  },
  signin_history: {
    purpose: 'A complete record of all site sign-ins and sign-outs across all jobs. Filter by worker, job, or date. Export to CSV for payroll or compliance reporting.',
    howTo: ['Tap Sign-in History on the home screen (Admin only).', 'Browse the compact sign-in/out log.', 'Use the filters to narrow by worker, job, or date range.', 'Tap Export CSV to download the filtered records.'],
  },
  team: {
    purpose: 'Manage your team members — invite new users, set roles and permissions, view sign-in history, and control what each person can access.',
    howTo: ['Tap Team on the home screen (Admin only).', 'Browse the team list.', 'Tap a team member to view their profile and permissions.', 'Tap + to invite a new team member via email.', 'Use the Permissions section to control which features they can access.'],
    tip: 'Owners and Admins always have full access. Field workers only see the features you assign to them.',
  },
  billing: {
    purpose: 'View and manage your IWILLBUILD subscription securely on the website.',
    howTo: ['Open Manage and tap My Billing.', 'The billing page opens in Safari.', 'View your plan, renewal or access-until date.', 'Use the website controls to manage the subscription or payment method.', 'Return to IWILLBUILD when finished.'],
    tip: 'Subscription purchases and billing changes take place on iwillbuild.com, outside the app.',
  },
  settings: {
    purpose: 'Manage your account, company settings, notifications, app permissions and data controls.',
    howTo: ['Open Manage and tap Settings.', 'Use My Account for your personal details and password.', 'Use App Permissions to review camera, photos, location, microphone and notification access.', 'Owners can update company settings and integrations.', 'Use Delete Account in My Account if you need to permanently remove your account.'],
    tip: 'Device permissions are requested only when you use the feature that needs them.',
  },
  help: {
    purpose: 'This current app guide, with a phone navigation overview and searchable feature instructions.',
    howTo: ['Open Manage and tap Help.', 'Start with the four-page phone guide.', 'Use search to find a feature.', 'Tap a feature to expand its instructions.'],
  },
};

// ── Group badge colours — keyed by IconGroup ──────────────────────────────────
// Only visual styling lives here; group membership comes from VISIBLE_GROUP_CONFIG.
const GROUP_BADGE_CLASS: Record<string, string> = {
  field:      'bg-violet-100 text-violet-800 border-violet-200',
  files:      'bg-blue-100 text-blue-800 border-blue-200',
  fleet:      'bg-sky-100 text-sky-800 border-sky-200',
  finance:    'bg-emerald-100 text-emerald-800 border-emerald-200',
  safety:     'bg-red-100 text-red-700 border-red-200',
  management: 'bg-slate-100 text-slate-700 border-slate-200',
};

const GROUP_DESCRIPTION: Record<string, string> = {
  field:      'Day-to-day tools for workers on site. Quick access to the most common field tasks.',
  files:      'Photo capture, plan viewing, file storage, and asset management.',
  fleet:      'Vehicle and plant fleet management.',
  finance:    'Estimates, invoices, purchase orders, job ledger, and financial tools.',
  safety:     'Safety compliance tools — SWMS, risk assessments, permits, incidents, and registers.',
  management: 'Admin and management tools — team, billing, settings, and platform tools.',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    field: true,
    files: false,
    fleet: false,
    finance: false,
    safety: true,
    management: false,
  });
  const [openIcons, setOpenIcons] = useState<Record<string, boolean>>({});

  const q = search.toLowerCase().trim();

  // Filter groups and icons by search query.
  // VISIBLE_GROUP_CONFIG already excludes comingSoon — no further filtering needed.
  const filtered = VISIBLE_GROUP_CONFIG.map(gc => ({
    ...gc,
    defs: gc.defs.filter(icon => icon.key !== 'app_docs').filter(icon => {
      if (!q) return true;
      const doc = ICON_DOCS[icon.key];
      const displayLabel = HELP_LABELS[icon.key] ?? icon.label;
      return (
        displayLabel.toLowerCase().includes(q) ||
        (doc?.purpose.toLowerCase().includes(q) ?? false) ||
        (doc?.howTo.some(s => s.toLowerCase().includes(q)) ?? false)
      );
    }),
  })).filter(gc => gc.defs.length > 0);

  function toggleGroup(group: string) {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  }
  function toggleIcon(key: string) {
    setOpenIcons(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return <>
    <Helmet>
      <title>Help & User Guide — IWILLBUILD</title>
      <meta name="description" content="Current phone navigation and feature help for IWILLBUILD." />
      <meta name="robots" content="noindex" />
      <link rel="canonical" href="https://iwillbuild.com/help" />
    </Helmet>

    <PortalSidebar />
    <DesktopTopBar />
    <DesktopDock />

    <main className="min-h-screen bg-slate-100 pb-20 lg-portal">
      {/* Sticky page header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 lg:top-[108px] z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <ManageBackButton />
              <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
                <BookMarked size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Help & User Guide</h1>
                <p className="text-xs text-slate-500">Current phone navigation and feature instructions</p>
              </div>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search features…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 rounded-lg border border-transparent focus:border-violet-400 focus:bg-white outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
        {!q && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4" aria-labelledby="phone-pages-heading">
            <div className="mb-3">
              <h2 id="phone-pages-heading" className="text-base font-bold text-slate-900">Using the phone app</h2>
              <p className="text-xs text-slate-500 mt-0.5">Tap the page names at the top or swipe left and right.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PHONE_PAGES.map(page => {
                const PageIcon = page.icon;
                return (
                  <div key={page.title} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className={`w-9 h-9 rounded-xl ${page.colour} flex items-center justify-center shrink-0`}>
                      <PageIcon size={18} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{page.title}</h3>
                      <p className="text-xs text-slate-600 leading-snug mt-0.5">{page.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm">
            No results for "<span className="font-medium text-slate-600">{search}</span>"
          </div>
        )}

        {filtered.map(gc => {
          const isOpen = !!openGroups[gc.group];
          const badgeClass = GROUP_BADGE_CLASS[gc.group] ?? 'bg-slate-100 text-slate-700 border-slate-200';
          const description = GROUP_DESCRIPTION[gc.group] ?? '';
          return (
            <div key={gc.group} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(gc.group)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
              >
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                  {gc.label}
                </span>
                <span className="flex-1 text-xs text-slate-500 hidden sm:block">{description}</span>
                <span className="text-xs text-slate-400 font-medium">{gc.defs.length} features</span>
                {isOpen
                  ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                  : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' as const }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-slate-100 divide-y divide-slate-100">
                      {gc.defs.map(icon => {
                        const IconComp = icon.icon;
                        const doc = ICON_DOCS[icon.key];
                        const isIconOpen = !!openIcons[icon.key];
                        const purpose = doc?.purpose ?? 'Open this feature to view the tools available for your account.';
                        const howTo = doc?.howTo ?? [];
                        const tip = doc?.tip;

                        return (
                          <div key={icon.key}>
                            <button
                              onClick={() => toggleIcon(icon.key)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                            >
                              {/* Icon tile — bg/fg sourced from homeIcons.ts */}
                              <div className={`w-10 h-10 rounded-xl ${icon.bg} flex items-center justify-center shrink-0`}>
                                <IconComp size={20} className={icon.fg} strokeWidth={1.8} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-slate-800">{HELP_LABELS[icon.key] ?? icon.label}</span>
                                  {icon.adminOnly && (
                                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Admin</span>
                                  )}
                                  {icon.ownerOnly && (
                                    <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Owner</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 leading-snug mt-0.5 line-clamp-2">{purpose}</p>
                              </div>
                              {isIconOpen
                                ? <ChevronDown size={15} className="text-slate-400 shrink-0" />
                                : <ChevronRight size={15} className="text-slate-400 shrink-0" />}
                            </button>

                            <AnimatePresence initial={false}>
                              {isIconOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.18, ease: 'easeInOut' as const }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                                    {howTo.length > 0 && (
                                      <>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">How to use</p>
                                        <ol className="space-y-1.5">
                                          {howTo.map((step, i) => (
                                            <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                                              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold flex items-center justify-center mt-0.5">
                                                {i + 1}
                                              </span>
                                              <span className="leading-snug">{step}</span>
                                            </li>
                                          ))}
                                        </ol>
                                      </>
                                    )}
                                    {tip && (
                                      <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        <span className="text-amber-500 text-sm shrink-0">💡</span>
                                        <p className="text-xs text-amber-800 leading-snug">{tip}</p>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* ── Step guide and support ───────────────────────────────────────── */}
        {!q && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center shrink-0 shadow-md">
                  <FileDown size={28} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-slate-900 leading-tight">IWILLBUILD Step Guide</h2>
                  <p className="text-sm text-slate-500 mt-0.5 leading-snug">
                    Download the step-by-step PDF guide for use on site or offline.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">PDF · 0.75 MB</p>
                </div>
                <a
                  href="/data/Iwillbuild Product Guild.pdf"
                  download="IWILLBUILD-Step-Guide.pdf"
                  className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-bold transition-colors shrink-0 shadow-sm"
                >
                  <Download size={16} />
                  Download Step Guide
                </a>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Need more help?</h2>
              <p className="text-xs text-slate-500 mt-1">
                Email{' '}
                <a href="mailto:support@iwillbuild.com" className="text-violet-600 hover:underline font-semibold">
                  support@iwillbuild.com
                </a>
                {' '}or visit{' '}
                <a href="https://iwillbuild.com/login-help" target="_blank" rel="noreferrer" className="text-violet-600 hover:underline font-semibold">
                  iwillbuild.com/login-help
                </a>.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  </>;
}
