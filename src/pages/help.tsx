/**
 * /help — IWILLBUILD Portal User Manual
 * Lists every home screen icon, its purpose, and how to use it.
 */
import { Helmet } from '@dr.pogodin/react-helmet';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from "react-router";
import {
  Camera, LogIn, Car, ClipboardCheck, FileText, StickyNote, DollarSign, Clock,
  TrendingUp, Layers, ClipboardList, BookOpen, LayoutDashboard, Calculator,
  Receipt, Users, HardHat, CalendarDays, Truck, FolderOpen, UserCircle,
  CreditCard, Settings, ShieldAlert, AlertTriangle, ChevronDown, ChevronRight,
  Search, BookMarked, ArrowLeft, Zap, FileStack, Map, ShieldCheck, AlertCircle,
  Building2, TableProperties, ScrollText, Link2, History,
  ShoppingCart, BarChart2,
} from 'lucide-react';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';
import type { ComponentType } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface IconDoc {
  key: string;
  label: string;
  icon: ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
    color?: string;
    style?: React.CSSProperties;
  }>;
  /** Hex colour — matches the dock tile colour for this icon */
  color: string;
  purpose: string;
  howTo: string[];
  tip?: string;
}
interface GroupDoc {
  id: string;
  label: string;
  description: string;
  color: string;
  icons: IconDoc[];
}

// ── Icon documentation ────────────────────────────────────────────────────────
const GROUPS: GroupDoc[] = [{
  id: 'field',
  label: 'Field',
  description: 'Day-to-day tools for workers on site. Quick access to the most common field tasks.',
  color: 'bg-violet-100 text-violet-800 border-violet-200',
  icons: [{
    key: 'camera',
    label: 'Camera',
    icon: Camera,
    bg: 'bg-violet-500',
    purpose: 'Take and upload photos directly to a job. Photos are stored against the selected job and can be used in reports, progress updates, and documentation.',
    howTo: ['Tap Camera on the home screen.', 'Select the job you are photographing from the job picker.', 'Use the camera to take a photo, or choose an existing photo from your library.', 'Add a caption and category (optional) before saving.', 'Photos appear in the job\'s Photos tab and can be included in PDF reports.'],
    tip: 'You can take multiple photos in one session — keep tapping the shutter and they all save to the same job.'
  }, {
    key: 'sign_in',
    label: 'Sign In',
    icon: LogIn,
    bg: 'bg-indigo-500',
    purpose: 'Record a site sign-in for yourself or a visitor. Creates a timestamped attendance record against the selected job.',
    howTo: ['Tap Sign In on the home screen.', 'Select the job site from the picker.', 'Confirm your name and role, then tap Sign In.', 'A timestamp is recorded and visible to the job manager.'],
    tip: 'Sign-in records are used for safety compliance and site attendance reporting.'
  }, {
    key: 'drive',
    label: 'Drive',
    icon: Car,
    bg: 'bg-blue-500',
    purpose: 'Log a vehicle trip against a job. Records start/end location, distance, and the job it relates to.',
    howTo: ['Tap Drive on the home screen.', 'Select the job you are travelling to.', 'Tap Start Trip when you begin driving.', 'Tap End Trip when you arrive — distance is calculated automatically.', 'Trip logs appear in the job\'s Costs section.']
  }, {
    key: 'log_cost',
    label: 'Log Cost',
    icon: DollarSign,
    bg: 'bg-emerald-500',
    purpose: 'Quickly record a cost or expense against a job while you are on site — materials, subcontractors, hire equipment, etc.',
    howTo: ['Tap Log Cost on the home screen.', 'Select the job the cost belongs to.', 'Enter the amount, description, and category.', 'Attach a receipt photo if needed.', 'Tap Save — the cost is added to the job\'s ledger immediately.'],
    tip: 'Costs logged here feed directly into job profitability reports.'
  }, {
    key: 'delays',
    label: 'Delays',
    icon: Clock,
    bg: 'bg-red-500',
    purpose: 'Record a delay event on a job — weather, access issues, waiting on materials, etc. Builds a documented delay register for contract claims.',
    howTo: ['Tap Delays on the home screen.', 'Select the affected job.', 'Choose the delay type and enter a description.', 'Set the duration (hours or days).', 'Tap Save — the delay is logged with a timestamp.'],
    tip: 'Delay records are critical for extension-of-time claims. Log them the same day they occur.'
  }, {
    key: 'progress',
    label: 'Program of Works',
    icon: TrendingUp,
    bg: 'bg-cyan-500',
    purpose: 'A full Gantt-style Program of Works for each job. Organise activities into sections, track start/finish dates, progress percentage, responsible person, and notes. Switch between List view and a monthly Calendar view.',
    howTo: [
      'Open a job and tap the Progress tab (under the WORK nav group).',
      'Tap "Add section" to create a logical grouping (e.g. Foundations, Frame, Fit-out).',
      'Tap "Add activity" to add a work item — set description, section, start/finish dates, progress %, trade, and responsible person.',
      'Use the ↑ ↓ buttons on each section header to reorder sections.',
      'Use the move arrows on each activity row to reorder within a section.',
      'Toggle to Calendar view to see all activities as Gantt bars across the month — navigate months with the arrows.',
      'Hover over a bar (desktop) to see the full activity tooltip.',
      'Activities at 100% turn green automatically.',
      'Export to CSV or PDF Report using the buttons above the table.',
    ],
    tip: 'Activities without dates still appear in the Calendar view — they are listed below the Gantt chart so nothing is lost.'
  }, {
    key: 'drawings',
    label: 'Drawings',
    icon: Layers,
    bg: 'bg-lime-500',
    purpose: 'Access and view construction drawings for a job. Drawings are uploaded by the office and available offline once downloaded.',
    howTo: ['Tap Drawings on the home screen.', 'Select the job.', 'Browse the drawing list — tap any drawing to open it.', 'Pinch to zoom, swipe to pan.', 'Tap the download icon to save a drawing for offline use.']
  }, {
    key: 'field_docs',
    label: 'Field Docs',
    icon: FileStack,
    bg: 'bg-teal-600',
    purpose: 'View and complete documents assigned to a job — safety plans, SWMS, induction documents, and any documents requiring acknowledgement or signature. Field workers pick a job and review or sign on to assigned docs.',
    howTo: ['Tap Field Docs on the home screen or dock.', 'Pick the job from the job list.', 'Switch between the Documents and Sign-ons tabs.', 'Tap a document to open the preview — read through all content sections.', 'Tap Mark as Reviewed or Sign On to record your acknowledgement.', 'Completed sign-ons are recorded against your profile and the job.'],
    tip: 'Documents with "Requires Acknowledgement" must be reviewed before work begins on that activity.'
  }, {
    key: 'notes',
    label: 'Notes',
    icon: StickyNote,
    bg: 'bg-yellow-400',
    purpose: 'Quick notes attached to a job — site observations, reminders, meeting notes, or anything you need to record on the fly.',
    howTo: ['Tap Notes on the home screen.', 'Select the job.', 'Tap + to add a new note.', 'Type your note and tap Save.', 'Notes are visible to all team members on that job.']
  }]
}, {
  id: 'safety',
  label: 'Safety',
  description: 'Safety compliance tools — prestarts, risk assessments, permits, SWMS, and incident reporting.',
  color: 'bg-red-100 text-red-700 border-red-200',
  icons: [{
    key: 'safety_library',
    label: 'Safety',
    icon: ShieldCheck,
    bg: 'bg-red-600',
    purpose: 'The SWMS (Safe Work Method Statement) library. Create, manage, and assign SWMS documents to jobs. Workers review and sign on before starting high-risk activities.',
    howTo: ['Tap Safety on the dock.', 'Browse the SWMS library or tap + to create a new SWMS.', 'Fill in the work activity, hazards, controls, PPE, and plant/equipment.', 'Assign the SWMS to a job.', 'Workers review and sign on via Field Docs.'],
    tip: 'SWMS are required by law for high-risk construction work. Keep them current and job-specific.'
  }, {
    key: 'poster',
    label: 'Safety Posters',
    icon: ShieldAlert,
    bg: 'bg-pink-500',
    purpose: 'View and display safety posters and signage — PPE requirements, risk matrices, first aid information, and site rules. Full desktop toolbar for easy browsing.',
    howTo: ['Tap Safety Posters on the dock.', 'Browse the poster library by category.', 'Tap a poster to view it full screen.', 'Use the share button to send a poster or print it for site display.']
  }, {
    key: 'site_prestart',
    label: 'Site Prestart',
    icon: HardHat,
    bg: 'bg-lime-600',
    purpose: 'Complete a site prestart checklist before work begins. Confirms hazards have been identified, PPE is in place, and the site is safe to start.',
    howTo: ['Tap Site Prestart on the home screen.', 'Select the job site.', 'Work through each checklist item — tick or flag each one.', 'Add notes or photos for any flagged items.', 'Sign and submit — a record is saved against the job.'],
    tip: 'Site prestarts should be completed every morning before work begins.'
  }, {
    key: 'risky',
    label: 'Risk Assessment & Work Permits',
    icon: AlertCircle,
    bg: 'bg-rose-600',
    purpose: 'Create risk assessments and work permit checks for site activities, changed conditions, new hazards, or high-risk work. Captures hazards, control measures, permit requirements, supervisor sign-off, and worker/party sign-ons.',
    howTo: ['Open a job and go to the Safety tab, or tap Risk Assessment & Work Permits on the home screen.', 'Tap + to create a new risk assessment.', 'Fill in the activity, hazards, control measures, and any permit requirements.', 'Supervisor signs off, then workers and relevant parties sign on before work begins.', 'Completed assessments are stored against the job.']
  }, {
    key: 'prestart',
    label: 'Vehicle Prestart',
    icon: ClipboardCheck,
    bg: 'bg-amber-500',
    purpose: 'Complete a vehicle prestart inspection before using a company vehicle or plant. Checks lights, tyres, fluids, and safety equipment.',
    howTo: ['Tap Vehicle Prestart on the home screen.', 'Select the vehicle or plant item.', 'Work through the inspection checklist.', 'Flag any defects and add a photo if needed.', 'Sign and submit — the record is saved to the vehicle\'s history.'],
    tip: 'Defects flagged in a prestart are automatically notified to the fleet manager.'
  }, {
    key: 'incidents',
    label: 'Incidents',
    icon: AlertTriangle,
    bg: 'bg-red-600',
    purpose: 'Report and manage workplace incidents, near misses, and injuries. Creates a formal incident register with corrective actions and third-party details.',
    howTo: ['Tap Incidents on the dock.', 'Tap the + button to report a new incident.', 'Fill in the incident type, date, location, and description.', 'Add injured parties or third-party details if applicable.', 'Assign corrective actions and set due dates.', 'Submit — the incident is added to the register.'],
    tip: 'Report incidents as soon as possible after they occur. Near misses are just as important to record as injuries.'
  }, {
    key: 'risk-register',
    label: 'Risk Register',
    icon: ShieldAlert,
    bg: 'bg-orange-600',
    purpose: 'Identify, assess, and control workplace hazards and risks across the company. Each entry captures the hazard, likelihood × consequence risk matrix, existing controls, additional controls required, responsible person, and due date.',
    howTo: ['Tap Risk Register on the dock.', 'Tap New risk to add a new entry.', 'Enter the hazard title, category, and description.', 'Set likelihood and consequence — the risk level is calculated automatically.', 'Document existing controls and any additional controls required.', 'Assign a responsible person and due date.', 'Update the status as controls are implemented.'],
    tip: 'Extreme and high risks are highlighted at the top of the register. Review and update risk entries regularly — at least before each new project phase.'
  }]
}, {
  id: 'finance',
  label: 'Finance',
  description: 'Purchase orders, job ledger, and financial tracking tools.',
  color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  icons: [{
    key: 'purchase_orders',
    label: 'Purchase Orders',
    icon: ShoppingCart,
    bg: 'bg-emerald-600',
    purpose: 'Create and manage Purchase Orders (POs) for contractors and suppliers against a job. Track PO status from Draft through to Approved, Sent, and Completed. Generate a professional PDF to send directly to the contractor.',
    howTo: [
      'Open a job and tap the Finance nav group, then select Purchase Orders.',
      'Tap + New PO to open the multi-step create workflow.',
      'Select the contractor, add a title, and set the PO date.',
      'Add line items — description, quantity, unit, and rate.',
      'Review the subtotal and GST, then save as Draft or submit for approval.',
      'Change status to Approved when authorised, then Sent once issued to the contractor.',
      'Tap the PDF button on any PO to generate and download a formatted PDF.',
      'Use the search and status filter tabs to find POs quickly across large jobs.',
    ],
    tip: 'PO numbers are auto-generated in sequence per company. Approved POs lock their line items to prevent accidental edits.'
  }, {
    key: 'job_ledger',
    label: 'Job Ledger',
    icon: BarChart2,
    bg: 'bg-teal-600',
    purpose: 'A running ledger of all costs and income entries against a job. Every cost logged, invoice raised, and manual entry appears here in chronological order. Use it to track job profitability in real time.',
    howTo: [
      'Open a job and tap the Finance nav group, then select Job Ledger.',
      'Browse all entries — costs, invoices, and manual adjustments.',
      'Tap + to add a manual ledger entry.',
      'Use the export button to download the ledger as CSV.',
      'Tap any entry to view its full detail or correct it.',
    ],
    tip: 'The ledger is the source of truth for job financials. Costs logged from the field and invoices raised in the office both flow here automatically.'
  }]
}, {
  id: 'tools',
  label: 'Tools & Studio',
  description: 'Calculation, estimation, document creation, and form design tools for the office and field.',
  color: 'bg-violet-100 text-violet-700 border-violet-200',
  icons: [{
    key: 'estimating',
    label: 'Estimating',
    icon: Calculator,
    bg: 'bg-indigo-500',
    purpose: 'Build detailed cost estimates and quotes. Add labour, materials, subcontractors, and margins to produce a professional quote document. Includes Cost Guide, Recipes, Builders Calc, and Take-off Pad tabs.',
    howTo: ['Tap Estimating on the dock.', 'Use the Cost Guide tab to browse standard rates.', 'Use Recipes to build reusable cost bundles.', 'Use Builders Calc for on-site construction calculations.', 'Use Take-off Pad to measure quantities from drawings.', 'Create a new estimate, add sections and line items, apply margins and GST.', 'Generate a quote PDF to send to the client.']
  }, {
    key: 'scheduler',
    label: 'Scheduler',
    icon: CalendarDays,
    bg: 'bg-blue-600',
    purpose: 'Plan and schedule jobs, tasks, and team members on a visual calendar. See who is working where and when.',
    howTo: ['Tap Scheduler on the dock.', 'View the calendar in day, week, or month view.', 'Tap a time slot to create a new schedule entry.', 'Assign a job, team members, and duration.', 'Team members receive a notification of their schedule.']
  }, {
    key: 'plan_manager',
    label: 'Plan Manager',
    icon: Map,
    bg: 'bg-green-600',
    purpose: 'Upload, organise, and view construction plans and drawings at a project level. Annotate plans and share with the team.',
    howTo: ['Tap Plan Manager on the dock.', 'Select a job to view its plans.', 'Tap + to upload a new plan set.', 'Tap any plan to open the full-screen viewer.', 'Pinch to zoom, use the annotation tools to mark up the plan.']
  }, {
    key: 'studio_docs',
    label: 'App Docs',
    icon: FileText,
    bg: 'bg-violet-500',
    purpose: 'Create and manage document templates — safety plans, SWMS, induction packs, job reports, and any custom documents. Uses a drag-and-drop block editor.',
    howTo: ['Tap App Docs on the dock.', 'Browse existing templates in the Documents or Job Reports tabs.', 'Tap + to create a new document.', 'Use the block editor to add headings, text, images, tables, and safety blocks.', 'Save the document — it becomes available to assign to jobs.'],
    tip: 'Documents with "Requires Acknowledgement" turned on must be signed by workers before they can proceed.'
  }, {
    key: 'studio_forms',
    label: 'Forms',
    icon: ClipboardList,
    bg: 'bg-purple-500',
    purpose: 'Design custom digital forms — inspection checklists, toolbox talks, quality records, and any form your business needs. Forms are filled in by field workers via the Forms picker on a job.',
    howTo: ['Tap Forms on the dock.', 'Browse existing forms or tap + to create a new one.', 'Add fields: text, number, checkbox, signature, photo, dropdown, etc.', 'Set required fields and conditional logic.', 'Publish the form — it appears in the Forms picker for field workers.']
  }, {
    key: 'studio_library',
    label: 'Library',
    icon: BookOpen,
    bg: 'bg-amber-600',
    purpose: 'A central knowledge library for your business — store procedures, reference documents, training materials, and any content you want the team to be able to look up.',
    howTo: ['Tap Library on the dock.', 'Browse categories or search for a document.', 'Tap any item to read it.', 'Admins can add, edit, or archive library items.']
  }, {
    key: 'quick_links',
    label: 'Quick Links',
    icon: Link2,
    bg: 'bg-indigo-500',
    purpose: 'A customisable set of shortcut links for your team — external websites, supplier portals, council links, or any URL your team needs quick access to.',
    howTo: ['Tap Quick Links on the dock.', 'Browse the links your admin has set up.', 'Tap any link to open it.', 'Admins can add, edit, or remove links from the company settings.']
  }, {
    key: 'lists',
    label: 'Lists',
    icon: TableProperties,
    bg: 'bg-sky-600',
    purpose: 'Manage structured data lists used across the platform — cost categories, trade types, delay reasons, and other configurable lookup values.',
    howTo: ['Tap Lists on the dock.', 'Select the list type you want to manage.', 'Add, edit, or remove items from the list.', 'Changes take effect immediately across all jobs and forms.'],
    tip: 'Keeping your lists tidy improves consistency in reporting and cost tracking.'
  }]
}, {
  id: 'management',
  label: 'Management',
  description: 'Admin and management tools — jobs, job cards, invoicing, contacts, fleet, files, and business settings.',
  color: 'bg-slate-100 text-slate-700 border-slate-200',
  icons: [{
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    bg: 'bg-blue-600',
    purpose: 'A summary overview of your active jobs, recent activity, outstanding tasks, KPI widgets, fleet flags, and key metrics at a glance.',
    howTo: ['Tap Dashboard on the dock.', 'View KPI widgets, active jobs, recent sign-ins, and outstanding items.', 'Check the fleet flags panel for vehicles needing attention.', 'Tap any card to drill into the detail.']
  }, {
    key: 'jobs',
    label: 'Jobs',
    icon: HardHat,
    bg: 'bg-cyan-600',
    purpose: 'The central hub for all jobs. Create, manage, and monitor every project. The job workspace is organised into five nav groups — JOB, WORK, FIELD & FILES, FINANCE, and SAFETY — each containing the relevant tabs for that area.',
    howTo: [
      'Tap Jobs on the dock.',
      'Browse active jobs or use search to find one.',
      'Tap a job to open its detail view.',
      'Use the five nav groups at the top to switch areas: JOB (details, milestones), WORK (job cards, progress/Program of Works), FIELD & FILES (photos, files, forms, notes, drawings), FINANCE (Job Ledger, Purchase Orders), SAFETY (SWMS, risk assessments, prestarts, incidents).',
      'Tap + to create a new job.',
    ],
    tip: 'The Finance nav group is only visible to users with the Finance permission. The Safety nav group is visible to all team members assigned to the job.'
  }, {
    key: 'job_cards',
    label: 'Job Cards',
    icon: Zap,
    bg: 'bg-yellow-600',
    purpose: 'A fast-action view of jobs displayed as cards. Quickly scan job status, assigned workers, and key details without opening the full job detail.',
    howTo: ['Tap Job Cards on the dock.', 'Browse jobs displayed as visual cards.', 'Use filters to narrow by status, date, or assigned worker.', 'Tap a card to open the full job detail.']
  }, {
    key: 'invoices_mgmt',
    label: 'Invoices',
    icon: Receipt,
    bg: 'bg-teal-500',
    purpose: 'Create and manage invoices for completed work. Track payment status and send reminders.',
    howTo: ['Tap Invoices on the dock.', 'Browse all invoices or filter by status.', 'Tap + to create a new invoice.', 'Add line items, apply GST, and set payment terms.', 'Send to the client — payment status updates automatically.']
  }, {
    key: 'contacts',
    label: 'Contacts',
    icon: Users,
    bg: 'bg-pink-500',
    purpose: 'Manage clients, contractors, and other contacts. Store contact details, linked jobs, and communication history.',
    howTo: ['Tap Contacts on the dock.', 'Browse the contact list or search by name.', 'Tap a contact to view their details and linked jobs.', 'Tap + to add a new contact.', 'Use the email/phone buttons to contact them directly.']
  }, {
    key: 'fleet',
    label: 'Fleet',
    icon: Truck,
    bg: 'bg-slate-600',
    purpose: 'Manage your vehicle and plant fleet. Track registrations, service schedules, prestart history, and assign vehicles to jobs.',
    howTo: ['Tap Fleet on the dock.', 'Browse the fleet list.', 'Tap a vehicle to view its details, service history, and prestart records.', 'Tap + to add a new vehicle or piece of plant.', 'Set service reminders — you\'ll be notified when service is due.']
  }, {
    key: 'files',
    label: 'Files',
    icon: FolderOpen,
    bg: 'bg-amber-500',
    purpose: 'A central file store for all business documents — contracts, certificates, insurance, plans, and any other files not attached to a specific job.',
    howTo: ['Tap Files on the dock.', 'Browse folders or search by filename.', 'Tap a file to preview or download it.', 'Tap + to upload a new file.', 'Use folders to organise files by category.']
  }, {
    key: 'equipment',
    label: 'Equipment',
    icon: Building2,
    bg: 'bg-rose-500',
    purpose: 'View and manage plant and equipment assets. Log service records, check maintenance schedules, and record equipment usage.',
    howTo: ['Tap Equipment on the dock.', 'Browse the asset list or search by name.', 'Tap an asset to view its details, service history, and documents.', 'Use the + button to log a new service or usage record.']
  }, {
    key: 'team',
    label: 'Team',
    icon: UserCircle,
    bg: 'bg-violet-500',
    purpose: 'Manage your team members — invite new users, set roles and permissions, view sign-in history, and control what each person can access.',
    howTo: ['Tap Team in the top bar.', 'Browse the team list.', 'Tap a team member to view their profile and permissions.', 'Tap + to invite a new team member via email.', 'Use the Permissions section to control which features they can access.'],
    tip: 'Owners and Admins always have full access. Field workers only see the features you assign to them.'
  }, {
    key: 'billing',
    label: 'Billing',
    icon: CreditCard,
    bg: 'bg-teal-600',
    purpose: 'Manage your IWILLBUILD subscription — view your current plan, update payment details, and see billing history.',
    howTo: ['Tap Billing in the top bar.', 'View your current plan and next billing date.', 'Tap Manage Subscription to upgrade, downgrade, or cancel.', 'Update your payment method if needed.', 'Download past invoices from the billing history.']
  }, {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    bg: 'bg-slate-500',
    purpose: 'Configure your company profile, notification preferences, integrations, and app settings.',
    howTo: ['Tap your avatar in the top bar to access Settings.', 'Update your company name, logo, and contact details.', 'Configure notification preferences.', 'Manage integrations (Xero, QuickBooks, etc.).', 'Set default values for jobs, costs, and forms.']
  }]
}, {
  id: 'admin',
  label: 'Admin',
  description: 'Admin-only tools for auditing, logs, and platform management.',
  color: 'bg-slate-100 text-slate-600 border-slate-300',
  icons: [{
    key: 'user_logs',
    label: 'User Logs',
    icon: ScrollText,
    bg: 'bg-slate-500',
    purpose: 'A full audit log of user actions across the platform — logins, record changes, deletions, and system events. Visible to Admins and Owners only.',
    howTo: ['Tap User Logs on the dock (Admin/Owner only).', 'Browse the log feed — newest events at the top.', 'Use filters to narrow by user, action type, or date range.', 'Tap any entry to see the full detail.'],
    tip: 'User Logs are useful for investigating data changes or compliance audits.'
  }, {
    key: 'signin_history',
    label: 'Sign-in History',
    icon: History,
    bg: 'bg-slate-600',
    purpose: 'A complete record of all site sign-ins and sign-outs across all jobs. Filter by worker, job, or date. Export to CSV for payroll or compliance reporting.',
    howTo: ['Tap Sign-in History on the dock (Admin/Owner only).', 'Browse the compact sign-in/out log.', 'Use the filters to narrow by worker, job, or date range.', 'Tap Export CSV to download the filtered records.']
  }]
}];
// ── Component ─────────────────────────────────────────────────────────────────
export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    field: true,
    safety: true,
    finance: true,
    tools: true,
    management: true,
    admin: false
  });
  const [openIcons, setOpenIcons] = useState<Record<string, boolean>>({});
  const q = search.toLowerCase().trim();
  const filtered: GroupDoc[] = GROUPS.map(g => ({
    ...g,
    icons: g.icons.filter(ic => !q || ic.label.toLowerCase().includes(q) || ic.purpose.toLowerCase().includes(q) || ic.howTo.some(s => s.toLowerCase().includes(q)))
  })).filter(g => g.icons.length > 0);
  function toggleGroup(id: string) {
    setOpenGroups(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }
  function toggleIcon(key: string) {
    setOpenIcons(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }
  return <>
      <Helmet>
        <title>User Manual — IWILLBUILD Portal</title>
        <meta name="description" content="How to use every feature in the IWILLBUILD Portal." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/help" />
      </Helmet>

      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />

      <main className="min-h-screen bg-[#F4F5F7] pb-20 lg-portal">
        {/* Sticky page header */}
        <div className="bg-white border-b border-slate-200 sticky top-0 lg:top-[108px] z-10">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
                  <BookMarked size={18} className="text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 leading-tight">User Manual</h1>
                  <p className="text-xs text-slate-500">Every feature explained — what it does and how to use it</p>
                </div>
              </div>
              <Link to="/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors shrink-0">
                <ArrowLeft size={13} />
                Dashboard
              </Link>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search features…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 rounded-lg border border-transparent focus:border-violet-400 focus:bg-white outline-none transition-colors" />
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
          {filtered.length === 0 && <div className="text-center py-16 text-slate-400 text-sm">
              No results for "<span className="font-medium text-slate-600">{search}</span>"
            </div>}

          {filtered.map(group => {
          const isOpen = !!openGroups[group.id];
          return <div key={group.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Group header */}
                <button onClick={() => toggleGroup(group.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${group.color}`}>
                    {group.label}
                  </span>
                  <span className="flex-1 text-xs text-slate-500 hidden sm:block">{group.description}</span>
                  <span className="text-xs text-slate-400 font-medium">{group.icons.length} icons</span>
                  {isOpen ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && <motion.div initial={{
                height: 0,
                opacity: 0
              }} animate={{
                height: 'auto',
                opacity: 1
              }} exit={{
                height: 0,
                opacity: 0
              }} transition={{
                duration: 0.2,
                ease: 'easeInOut' as const
              }} className="overflow-hidden">
                      <div className="border-t border-slate-100 divide-y divide-slate-100">
                        {group.icons.map(ic => {
                    const IconComp = ic.icon;
                    const isIconOpen = !!openIcons[ic.key];
                    const isComingSoon = group.id === 'comingSoon';
                    return <div key={ic.key}>
                              <button onClick={() => !isComingSoon && toggleIcon(ic.key)} className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isComingSoon ? 'cursor-default' : 'hover:bg-slate-50'}`}>
                                {/* Icon tile */}
                                <div className={`w-10 h-10 rounded-xl ${ic.bg} flex items-center justify-center shrink-0 ${isComingSoon ? 'opacity-50' : ''}`}>
                                  <IconComp size={20} className="text-white" strokeWidth={1.8} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-800">{ic.label}</span>
                                    {isComingSoon && <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Coming Soon</span>}
                                  </div>
                                  <p className="text-xs text-slate-500 leading-snug mt-0.5 line-clamp-2">{ic.purpose}</p>
                                </div>
                                {!isComingSoon && (isIconOpen ? <ChevronDown size={15} className="text-slate-400 shrink-0" /> : <ChevronRight size={15} className="text-slate-400 shrink-0" />)}
                              </button>

                              <AnimatePresence initial={false}>
                                {isIconOpen && !isComingSoon && <motion.div initial={{
                          height: 0,
                          opacity: 0
                        }} animate={{
                          height: 'auto',
                          opacity: 1
                        }} exit={{
                          height: 0,
                          opacity: 0
                        }} transition={{
                          duration: 0.18,
                          ease: 'easeInOut' as const
                        }} className="overflow-hidden">
                                    <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                                      {/* How to use */}
                                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">How to use</p>
                                      <ol className="space-y-1.5">
                                        {ic.howTo.map((step, i) => <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                                            <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold flex items-center justify-center mt-0.5">
                                              {i + 1}
                                            </span>
                                            <span className="leading-snug">{step}</span>
                                          </li>)}
                                      </ol>
                                      {ic.tip && <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                          <span className="text-amber-500 text-sm shrink-0">💡</span>
                                          <p className="text-xs text-amber-800 leading-snug">{ic.tip}</p>
                                        </div>}
                                    </div>
                                  </motion.div>}
                              </AnimatePresence>
                            </div>;
                  })}
                      </div>
                    </motion.div>}
                </AnimatePresence>
              </div>;
        })}
        </div>
      </main>
    </>;
}
