/**
 * /help — IWILLBUILD Portal User Manual
 * Lists every home screen icon, its purpose, and how to use it.
 */
import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera, LogIn, Car, ClipboardCheck, FileText, StickyNote,
  DollarSign, Clock, TrendingUp, Layers, Ruler, ClipboardList,
  Wrench, Image, FileCheck, BookOpen, LayoutDashboard,
  Calculator, Receipt, Users,
  HardHat, CalendarDays, Truck, FolderOpen, UserCircle,
  CreditCard, Settings,
  BarChart2, FileSpreadsheet, CloudRain, Clipboard,
  MessageSquare, ClipboardSignature, Wallet, ShieldAlert, AlertTriangle,
  Gamepad2, ChevronDown, ChevronRight, Search, BookMarked,
} from 'lucide-react';
import type { ComponentType } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface IconDoc {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  bg: string;
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
const GROUPS: GroupDoc[] = [
  {
    id: 'field',
    label: 'Field',
    description: 'Day-to-day tools for workers on site. Quick access to the most common field tasks.',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icons: [
      {
        key: 'camera',
        label: 'Camera',
        icon: Camera,
        bg: 'bg-orange-500',
        purpose: 'Take and upload photos directly to a job. Photos are stored against the selected job and can be used in reports, progress updates, and documentation.',
        howTo: [
          'Tap Camera on the home screen.',
          'Select the job you are photographing from the job picker.',
          'Use the camera to take a photo, or choose an existing photo from your library.',
          'Add a caption and category (optional) before saving.',
          'Photos appear in the job\'s Photos tab and can be included in PDF reports.',
        ],
        tip: 'You can take multiple photos in one session — keep tapping the shutter and they all save to the same job.',
      },
      {
        key: 'sign_in',
        label: 'Sign In',
        icon: LogIn,
        bg: 'bg-indigo-500',
        purpose: 'Record a site sign-in for yourself or a visitor. Creates a timestamped attendance record against the selected job.',
        howTo: [
          'Tap Sign In on the home screen.',
          'Select the job site from the picker.',
          'Confirm your name and role, then tap Sign In.',
          'A timestamp is recorded and visible to the job manager.',
        ],
        tip: 'Sign-in records are used for safety compliance and site attendance reporting.',
      },
      {
        key: 'drive',
        label: 'Drive',
        icon: Car,
        bg: 'bg-blue-500',
        purpose: 'Log a vehicle trip against a job. Records start/end location, distance, and the job it relates to.',
        howTo: [
          'Tap Drive on the home screen.',
          'Select the job you are travelling to.',
          'Tap Start Trip when you begin driving.',
          'Tap End Trip when you arrive — distance is calculated automatically.',
          'Trip logs appear in the job\'s Costs section.',
        ],
      },
      {
        key: 'log_cost',
        label: 'Log Cost',
        icon: DollarSign,
        bg: 'bg-emerald-500',
        purpose: 'Quickly record a cost or expense against a job while you are on site — materials, subcontractors, hire equipment, etc.',
        howTo: [
          'Tap Log Cost on the home screen.',
          'Select the job the cost belongs to.',
          'Enter the amount, description, and category.',
          'Attach a receipt photo if needed.',
          'Tap Save — the cost is added to the job\'s ledger immediately.',
        ],
        tip: 'Costs logged here feed directly into job profitability reports.',
      },
      {
        key: 'delays',
        label: 'Delays',
        icon: Clock,
        bg: 'bg-red-500',
        purpose: 'Record a delay event on a job — weather, access issues, waiting on materials, etc. Builds a documented delay register for contract claims.',
        howTo: [
          'Tap Delays on the home screen.',
          'Select the affected job.',
          'Choose the delay type and enter a description.',
          'Set the duration (hours or days).',
          'Tap Save — the delay is logged with a timestamp.',
        ],
        tip: 'Delay records are critical for extension-of-time claims. Log them the same day they occur.',
      },
      {
        key: 'progress',
        label: 'Progress',
        icon: TrendingUp,
        bg: 'bg-cyan-500',
        purpose: 'Log a progress update for a job — what was completed today, percentage complete, and any notes. Keeps the job timeline up to date.',
        howTo: [
          'Tap Progress on the home screen.',
          'Select the job to update.',
          'Enter what was completed and the current percentage.',
          'Add photos to support the update (optional).',
          'Tap Save.',
        ],
      },
      {
        key: 'drawings',
        label: 'Drawings',
        icon: Layers,
        bg: 'bg-lime-500',
        purpose: 'Access and view construction drawings for a job. Drawings are uploaded by the office and available offline once downloaded.',
        howTo: [
          'Tap Drawings on the home screen.',
          'Select the job.',
          'Browse the drawing list — tap any drawing to open it.',
          'Pinch to zoom, swipe to pan.',
          'Tap the download icon to save a drawing for offline use.',
        ],
      },
      {
        key: 'equipment',
        label: 'Equipment',
        icon: Wrench,
        bg: 'bg-rose-500',
        purpose: 'View and manage plant and equipment assets. Log service records, check maintenance schedules, and record equipment usage.',
        howTo: [
          'Tap Equipment on the home screen.',
          'Browse the asset list or search by name.',
          'Tap an asset to view its details, service history, and documents.',
          'Use the + button to log a new service or usage record.',
        ],
      },
    ],
  },
  {
    id: 'safety',
    label: 'Safety',
    description: 'Safety compliance tools — prestarts, risk assessments, permits, forms, and incident reporting.',
    color: 'bg-red-100 text-red-700 border-red-200',
    icons: [
      {
        key: 'poster',
        label: 'Safety Posters',
        icon: Image,
        bg: 'bg-pink-500',
        purpose: 'View and display safety posters and signage — PPE requirements, risk matrices, first aid information, and site rules.',
        howTo: [
          'Tap Safety Posters on the home screen.',
          'Browse the poster library by category.',
          'Tap a poster to view it full screen.',
          'Use the share button to send a poster or print it.',
        ],
      },
      {
        key: 'site_prestart',
        label: 'Site Prestart',
        icon: HardHat,
        bg: 'bg-lime-600',
        purpose: 'Complete a site prestart checklist before work begins. Confirms hazards have been identified, PPE is in place, and the site is safe to start.',
        howTo: [
          'Tap Site Prestart on the home screen.',
          'Select the job site.',
          'Work through each checklist item — tick or flag each one.',
          'Add notes or photos for any flagged items.',
          'Sign and submit — a record is saved against the job.',
        ],
        tip: 'Site prestarts should be completed every morning before work begins.',
      },
      {
        key: 'risky',
        label: 'Risk & Permits',
        icon: ShieldAlert,
        bg: 'bg-rose-600',
        purpose: 'Create risk assessments and work permit checks for site activities, changed conditions, new hazards, or high-risk work. Captures hazards, control measures, permit requirements, supervisor sign-off, and worker/party sign-ons.',
        howTo: [
          'Tap Risk & Permits on the home screen.',
          'Select the job.',
          'Choose to create a new assessment or view existing ones.',
          'Fill in the activity, hazards, control measures, and any permit requirements.',
          'Supervisor signs off, then workers and relevant parties sign on before work begins.',
          'Completed assessments are stored against the job.',
        ],
      },
      {
        key: 'forms',
        label: 'Forms',
        icon: FileText,
        bg: 'bg-purple-500',
        purpose: 'Fill in and submit digital forms for a job — inspection checklists, quality records, toolbox talks, and any custom forms created in Form Studio.',
        howTo: [
          'Tap Forms on the home screen.',
          'Select the job the form relates to.',
          'Choose the form type from the list.',
          'Complete all fields and sign if required.',
          'Tap Submit — the completed form is saved to the job.',
        ],
      },
      {
        key: 'field_docs',
        label: 'Docs',
        icon: FileCheck,
        bg: 'bg-teal-600',
        purpose: 'View and complete documents assigned to a job — safety plans, induction documents, and any documents requiring acknowledgement or signature.',
        howTo: [
          'Tap Docs on the home screen.',
          'Browse documents assigned to your jobs.',
          'Tap a document to open it.',
          'Read through the content, then sign or acknowledge at the bottom.',
          'Completed documents are recorded against your profile and the job.',
        ],
      },
      {
        key: 'prestart',
        label: 'Vehicle Prestart',
        icon: ClipboardCheck,
        bg: 'bg-amber-500',
        purpose: 'Complete a vehicle prestart inspection before using a company vehicle or plant. Checks lights, tyres, fluids, and safety equipment.',
        howTo: [
          'Tap Vehicle Prestart on the home screen.',
          'Select the vehicle or plant item.',
          'Work through the inspection checklist.',
          'Flag any defects and add a photo if needed.',
          'Sign and submit — the record is saved to the vehicle\'s history.',
        ],
        tip: 'Defects flagged in a prestart are automatically notified to the fleet manager.',
      },
      {
        key: 'incidents',
        label: 'Incidents',
        icon: AlertTriangle,
        bg: 'bg-red-600',
        purpose: 'Report and manage workplace incidents, near misses, and injuries. Creates a formal incident register with corrective actions and third-party details.',
        howTo: [
          'Tap Incidents on the home screen.',
          'Tap the + button to report a new incident.',
          'Fill in the incident type, date, location, and description.',
          'Add injured parties or third-party details if applicable.',
          'Assign corrective actions and set due dates.',
          'Submit — the incident is added to the register.',
        ],
        tip: 'Report incidents as soon as possible after they occur. Near misses are just as important to record as injuries.',
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Calculation, estimation, and document creation tools for the office and field.',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    icons: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        bg: 'bg-orange-500',
        purpose: 'A summary overview of your active jobs, recent activity, outstanding tasks, and key metrics at a glance.',
        howTo: [
          'Tap Dashboard on the home screen.',
          'View active jobs, recent sign-ins, and outstanding items.',
          'Tap any card to drill into the detail.',
        ],
      },
      {
        key: 'notes',
        label: 'Notes',
        icon: StickyNote,
        bg: 'bg-yellow-400',
        purpose: 'Quick notes attached to a job — site observations, reminders, meeting notes, or anything you need to record on the fly.',
        howTo: [
          'Tap Notes on the home screen.',
          'Select the job.',
          'Tap + to add a new note.',
          'Type your note and tap Save.',
          'Notes are visible to all team members on that job.',
        ],
      },
      {
        key: 'builders_calc',
        label: 'Builders Calc',
        icon: Ruler,
        bg: 'bg-violet-500',
        purpose: 'A construction-specific calculator for common on-site calculations — concrete volumes, area, linear metres, roof pitches, and more.',
        howTo: [
          'Tap Builders Calc on the home screen.',
          'Select the calculation type from the list.',
          'Enter the required dimensions.',
          'The result is calculated instantly.',
          'Tap Copy to use the result elsewhere.',
        ],
        tip: 'All calculations include a brief explanation of the formula used.',
      },
      {
        key: 'takeoff_pad',
        label: 'Takeoff Pad',
        icon: ClipboardList,
        bg: 'bg-sky-500',
        purpose: 'A digital quantity take-off tool. Measure and count items from drawings or plans to build a materials list or estimate.',
        howTo: [
          'Tap Takeoff Pad on the home screen.',
          'Create a new take-off or open an existing one.',
          'Add line items — enter quantities, units, and descriptions.',
          'Totals are calculated automatically.',
          'Export to use in an estimate or quote.',
        ],
      },
      {
        key: 'estimating',
        label: 'Estimating',
        icon: Calculator,
        bg: 'bg-indigo-500',
        purpose: 'Build detailed cost estimates and quotes. Add labour, materials, subcontractors, and margins to produce a professional quote document.',
        howTo: [
          'Tap Estimating on the home screen.',
          'Create a new estimate or open an existing one.',
          'Add sections and line items with quantities and rates.',
          'Apply margins and GST.',
          'Generate a quote PDF to send to the client.',
        ],
      },
      {
        key: 'scheduler',
        label: 'Scheduler',
        icon: CalendarDays,
        bg: 'bg-blue-600',
        purpose: 'Plan and schedule jobs, tasks, and team members on a visual calendar. See who is working where and when.',
        howTo: [
          'Tap Scheduler on the home screen.',
          'View the calendar in day, week, or month view.',
          'Tap a time slot to create a new schedule entry.',
          'Assign a job, team members, and duration.',
          'Team members receive a notification of their schedule.',
        ],
      },
      {
        key: 'studio_docs',
        label: 'Doc Studio',
        icon: FileText,
        bg: 'bg-orange-500',
        purpose: 'Create and manage document templates — safety plans, SWMS, induction packs, job reports, and any custom documents. Uses a drag-and-drop block editor.',
        howTo: [
          'Tap Doc Studio on the home screen.',
          'Browse existing templates in the Documents or Job Reports tabs.',
          'Tap + to create a new document.',
          'Use the block editor to add headings, text, images, tables, and safety blocks.',
          'Save the document — it becomes available to assign to jobs.',
        ],
        tip: 'Documents with "Requires Acknowledgement" turned on must be signed by workers before they can proceed.',
      },
      {
        key: 'studio_forms',
        label: 'Form Studio',
        icon: ClipboardList,
        bg: 'bg-purple-500',
        purpose: 'Design custom digital forms — inspection checklists, toolbox talks, quality records, and any form your business needs. Forms are filled in via the Forms icon.',
        howTo: [
          'Tap Form Studio on the home screen.',
          'Browse existing forms or tap + to create a new one.',
          'Add fields: text, number, checkbox, signature, photo, dropdown, etc.',
          'Set required fields and conditional logic.',
          'Publish the form — it appears in the Forms picker for field workers.',
        ],
      },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    description: 'Admin and management tools — jobs, invoicing, team, fleet, and business settings.',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    icons: [
      {
        key: 'jobs',
        label: 'Jobs',
        icon: HardHat,
        bg: 'bg-orange-500',
        purpose: 'The central hub for all jobs. Create, manage, and monitor every project — costs, photos, forms, documents, schedule, and team.',
        howTo: [
          'Tap Jobs on the home screen.',
          'Browse active jobs or use search to find one.',
          'Tap a job to open its detail view.',
          'Use the tabs to navigate: Overview, Photos, Costs, Forms, Docs, Schedule, Notes.',
          'Tap + to create a new job.',
        ],
      },
      {
        key: 'quotes',
        label: 'Quotes',
        icon: FileText,
        bg: 'bg-orange-500',
        purpose: 'View and manage quotes linked to jobs. Track quote status — draft, sent, accepted, or declined.',
        howTo: [
          'Tap Quotes on the home screen.',
          'Select the job the quote belongs to.',
          'View existing quotes or create a new one.',
          'Send the quote to the client via email.',
          'Mark as accepted when the client approves.',
        ],
      },
      {
        key: 'invoices_mgmt',
        label: 'Invoices',
        icon: Receipt,
        bg: 'bg-teal-500',
        purpose: 'Create and manage invoices for completed work. Track payment status and send reminders.',
        howTo: [
          'Tap Invoices on the home screen.',
          'Browse all invoices or filter by status.',
          'Tap + to create a new invoice.',
          'Add line items, apply GST, and set payment terms.',
          'Send to the client — payment status updates automatically.',
        ],
      },
      {
        key: 'stakeholders',
        label: 'Stakeholders',
        icon: Users,
        bg: 'bg-pink-500',
        purpose: 'Manage clients, contractors, and other stakeholders. Store contact details, linked jobs, and communication history.',
        howTo: [
          'Tap Stakeholders on the home screen.',
          'Browse the contact list or search by name.',
          'Tap a contact to view their details and linked jobs.',
          'Tap + to add a new stakeholder.',
          'Use the email/phone buttons to contact them directly.',
        ],
      },
      {
        key: 'ledger',
        label: 'Ledger',
        icon: BookOpen,
        bg: 'bg-emerald-600',
        purpose: 'View all costs across jobs in one place. Filter by job, category, or date range to understand where money is being spent.',
        howTo: [
          'Tap Ledger on the home screen.',
          'Select the job or view all jobs.',
          'Filter by cost category or date range.',
          'Tap any entry to see the full detail.',
          'Export to CSV for accounting purposes.',
        ],
      },
      {
        key: 'fleet',
        label: 'Fleet',
        icon: Truck,
        bg: 'bg-slate-600',
        purpose: 'Manage your vehicle and plant fleet. Track registrations, service schedules, prestart history, and assign vehicles to jobs.',
        howTo: [
          'Tap Fleet on the home screen.',
          'Browse the fleet list.',
          'Tap a vehicle to view its details, service history, and prestart records.',
          'Tap + to add a new vehicle or piece of plant.',
          'Set service reminders — you\'ll be notified when service is due.',
        ],
      },
      {
        key: 'files',
        label: 'Files',
        icon: FolderOpen,
        bg: 'bg-amber-500',
        purpose: 'A central file store for all business documents — contracts, certificates, insurance, plans, and any other files not attached to a specific job.',
        howTo: [
          'Tap Files on the home screen.',
          'Browse folders or search by filename.',
          'Tap a file to preview or download it.',
          'Tap + to upload a new file.',
          'Use folders to organise files by category.',
        ],
      },
      {
        key: 'team',
        label: 'Team',
        icon: UserCircle,
        bg: 'bg-violet-500',
        purpose: 'Manage your team members — invite new users, set roles and permissions, view sign-in history, and control what each person can access.',
        howTo: [
          'Tap Team on the home screen.',
          'Browse the team list.',
          'Tap a team member to view their profile and permissions.',
          'Tap + to invite a new team member via email.',
          'Use the Permissions section to control which home screen icons they can see.',
        ],
        tip: 'Owners and Admins always have full access. Field workers only see the icons you assign to them.',
      },
      {
        key: 'billing',
        label: 'Billing',
        icon: CreditCard,
        bg: 'bg-teal-600',
        purpose: 'Manage your IWILLBUILD subscription — view your current plan, update payment details, and see billing history.',
        howTo: [
          'Tap Billing on the home screen.',
          'View your current plan and next billing date.',
          'Tap Manage Subscription to upgrade, downgrade, or cancel.',
          'Update your payment method if needed.',
          'Download past invoices from the billing history.',
        ],
      },
      {
        key: 'settings',
        label: 'Settings',
        icon: Settings,
        bg: 'bg-slate-500',
        purpose: 'Configure your company profile, notification preferences, integrations, and app settings.',
        howTo: [
          'Tap Settings on the home screen.',
          'Update your company name, logo, and contact details.',
          'Configure notification preferences.',
          'Manage integrations (Xero, QuickBooks, etc.).',
          'Set default values for jobs, costs, and forms.',
        ],
      },
    ],
  },
  {
    id: 'comingSoon',
    label: 'Coming Soon',
    description: 'Features currently in development — these will appear on the home screen when released.',
    color: 'bg-gray-100 text-gray-500 border-gray-200',
    icons: [
      { key: 'report',         label: 'Report',       icon: BarChart2,           bg: 'bg-blue-500',    purpose: 'Automated job and business performance reports.', howTo: ['Coming soon.'] },
      { key: 'timesheet',      label: 'Timesheets',   icon: FileSpreadsheet,     bg: 'bg-indigo-400',  purpose: 'Digital timesheets for tracking worker hours against jobs.', howTo: ['Coming soon.'] },
      { key: 'site_diary',     label: 'Site Diary',   icon: ClipboardSignature,  bg: 'bg-amber-600',   purpose: 'Daily site diary entries for contract records and claims.', howTo: ['Coming soon.'] },
      { key: 'rainfall',       label: 'Rainfall',     icon: CloudRain,           bg: 'bg-sky-600',     purpose: 'Log rainfall events for delay claims and contract records.', howTo: ['Coming soon.'] },
      { key: 'checklist',      label: 'Checklist',    icon: Clipboard,           bg: 'bg-lime-600',    purpose: 'Simple task checklists for jobs and daily work.', howTo: ['Coming soon.'] },
      { key: 'messages',       label: 'Messages',     icon: MessageSquare,       bg: 'bg-green-500',   purpose: 'In-app messaging between team members.', howTo: ['Coming soon.'] },
      { key: 'invoices_field', label: 'Invoices',     icon: Wallet,              bg: 'bg-teal-500',    purpose: 'Field-accessible invoice view for workers.', howTo: ['Coming soon.'] },
      { key: 'daily_log',      label: 'Daily Log',    icon: ClipboardList,       bg: 'bg-orange-400',  purpose: 'Daily work log for recording activities and hours.', howTo: ['Coming soon.'] },
      { key: 'weather',        label: 'Weather',      icon: CloudRain,           bg: 'bg-cyan-400',    purpose: 'Live weather for job sites — useful for planning and delay records.', howTo: ['Coming soon.'] },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    field: true, safety: true, tools: true, management: true, comingSoon: false,
  });
  const [openIcons, setOpenIcons] = useState<Record<string, boolean>>({});

  const q = search.toLowerCase().trim();

  const filtered: GroupDoc[] = GROUPS.map(g => ({
    ...g,
    icons: g.icons.filter(ic =>
      !q ||
      ic.label.toLowerCase().includes(q) ||
      ic.purpose.toLowerCase().includes(q) ||
      ic.howTo.some(s => s.toLowerCase().includes(q))
    ),
  })).filter(g => g.icons.length > 0);

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleIcon(key: string) {
    setOpenIcons(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <>
      <Helmet>
        <title>User Manual — IWILLBUILD Portal</title>
        <meta name="description" content="How to use every feature in the IWILLBUILD Portal." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/help" />
      </Helmet>

      <main className="min-h-screen bg-[#F4F5F7] pb-20">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                <BookMarked size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">User Manual</h1>
                <p className="text-xs text-slate-500">Every icon explained — what it does and how to use it</p>
              </div>
            </div>
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search icons or features…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-100 rounded-lg border border-transparent focus:border-orange-400 focus:bg-white outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 pt-4 space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm">
              No results for "<span className="font-medium text-slate-600">{search}</span>"
            </div>
          )}

          {filtered.map(group => {
            const isOpen = !!openGroups[group.id];
            return (
              <div key={group.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${group.color}`}>
                    {group.label}
                  </span>
                  <span className="flex-1 text-xs text-slate-500 hidden sm:block">{group.description}</span>
                  <span className="text-xs text-slate-400 font-medium">{group.icons.length} icons</span>
                  {isOpen
                    ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={16} className="text-slate-400 shrink-0" />
                  }
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
                        {group.icons.map(ic => {
                          const IconComp = ic.icon;
                          const isIconOpen = !!openIcons[ic.key];
                          const isComingSoon = group.id === 'comingSoon';

                          return (
                            <div key={ic.key}>
                              <button
                                onClick={() => !isComingSoon && toggleIcon(ic.key)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isComingSoon ? 'cursor-default' : 'hover:bg-slate-50'}`}
                              >
                                {/* Icon tile */}
                                <div className={`w-10 h-10 rounded-xl ${ic.bg} flex items-center justify-center shrink-0 ${isComingSoon ? 'opacity-50' : ''}`}>
                                  <IconComp size={20} className="text-white" strokeWidth={1.8} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-800">{ic.label}</span>
                                    {isComingSoon && (
                                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Coming Soon</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 leading-snug mt-0.5 line-clamp-2">{ic.purpose}</p>
                                </div>
                                {!isComingSoon && (
                                  isIconOpen
                                    ? <ChevronDown size={15} className="text-slate-400 shrink-0" />
                                    : <ChevronRight size={15} className="text-slate-400 shrink-0" />
                                )}
                              </button>

                              <AnimatePresence initial={false}>
                                {isIconOpen && !isComingSoon && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18, ease: 'easeInOut' as const }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                                      {/* How to use */}
                                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">How to use</p>
                                      <ol className="space-y-1.5">
                                        {ic.howTo.map((step, i) => (
                                          <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                                            <span className="shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[11px] font-bold flex items-center justify-center mt-0.5">
                                              {i + 1}
                                            </span>
                                            <span className="leading-snug">{step}</span>
                                          </li>
                                        ))}
                                      </ol>
                                      {ic.tip && (
                                        <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                          <span className="text-amber-500 text-sm shrink-0">💡</span>
                                          <p className="text-xs text-amber-800 leading-snug">{ic.tip}</p>
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
        </div>
      </main>
    </>
  );
}
