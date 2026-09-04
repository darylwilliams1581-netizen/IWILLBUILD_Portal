/**
 * /lists — Office Lists
 *
 * Desktop-only data table. User clicks "Generate List", picks a list type
 * and optional filters in a centred modal, then the table renders the result.
 *
 * No tab strip. No side drawer. One table at a time.
 * Company isolation enforced server-side on every request.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Search, Download, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, AlertCircle, ChevronLeft, ChevronRight, HardHat, CheckSquare, StickyNote, ShieldAlert, LogIn, DollarSign, Truck, LayoutDashboard, ChevronRight as Crumb, X, ListFilter, FileText, Users, Clock, Wrench, ClipboardList, FolderOpen, CalendarDays, Receipt, Calculator, ShoppingCart, Car, Gauge, Milestone, MapPin, UserCheck, Package, Play, Filter } from 'lucide-react';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ListType = 'asset-bookings' | 'attendance' | 'costs' | 'customers' | 'drawings' | 'driver-logs' | 'estimates' | 'files' | 'fleet-assets' | 'fleet-prestarts' | 'fleet-service-logs' | 'form-submissions' | 'guest-checkins' | 'incidents' | 'invoices' | 'jobs' | 'job-delays' | 'milestones' | 'notes' | 'purchase-orders' | 'site-prestarts' | 'swms' | 'swms-signoffs' | 'tasks' | 'team-shifts' | 'time-entries';
interface ListCatalogEntry {
  key: ListType;
  label: string;
  icon: React.ElementType;
  description: string;
}

// Single flat catalog — alphabetic order, all live
const CATALOG: ListCatalogEntry[] = [{
  key: 'asset-bookings',
  label: 'Asset Bookings',
  icon: Package,
  description: 'Fleet and equipment booking register'
}, {
  key: 'attendance',
  label: 'Attendance',
  icon: LogIn,
  description: 'Site sign-in / sign-out records'
}, {
  key: 'costs',
  label: 'Costs',
  icon: DollarSign,
  description: 'Job costs, purchases, and expenses'
}, {
  key: 'customers',
  label: 'Customers',
  icon: Users,
  description: 'Customer and client register'
}, {
  key: 'drawings',
  label: 'Drawings',
  icon: FolderOpen,
  description: 'Drawing register with revision history'
}, {
  key: 'driver-logs',
  label: 'Driver Logs',
  icon: Truck,
  description: 'Fleet vehicle usage and driver logs'
}, {
  key: 'estimates',
  label: 'Estimates',
  icon: Calculator,
  description: 'Estimates across all jobs'
}, {
  key: 'files',
  label: 'Files',
  icon: FolderOpen,
  description: 'Document and file register across all jobs'
}, {
  key: 'fleet-assets',
  label: 'Fleet Assets',
  icon: Car,
  description: 'Equipment and vehicle register'
}, {
  key: 'fleet-prestarts',
  label: 'Fleet Prestarts',
  icon: Gauge,
  description: 'Daily vehicle prestart check records'
}, {
  key: 'fleet-service-logs',
  label: 'Fleet Service Logs',
  icon: Wrench,
  description: 'Vehicle and equipment service history'
}, {
  key: 'form-submissions',
  label: 'Form Submissions',
  icon: FileText,
  description: 'All submitted forms across all jobs'
}, {
  key: 'guest-checkins',
  label: 'Guest Check-ins',
  icon: UserCheck,
  description: 'Visitor and guest site check-in register'
}, {
  key: 'incidents',
  label: 'Incidents',
  icon: ShieldAlert,
  description: 'Safety incidents and corrective actions'
}, {
  key: 'invoices',
  label: 'Invoices',
  icon: Receipt,
  description: 'Invoice register across all jobs and customers'
}, {
  key: 'job-delays',
  label: 'Job Delays',
  icon: Clock,
  description: 'Delay events and reasons across all jobs'
}, {
  key: 'jobs',
  label: 'Jobs',
  icon: HardHat,
  description: 'All jobs with status, customer, and progress'
}, {
  key: 'milestones',
  label: 'Milestones',
  icon: Milestone,
  description: 'Project milestones across all jobs'
}, {
  key: 'notes',
  label: 'Notes',
  icon: StickyNote,
  description: 'Notes and comments attached to jobs'
}, {
  key: 'purchase-orders',
  label: 'Purchase Orders',
  icon: ShoppingCart,
  description: 'Purchase orders and contractor spend'
}, {
  key: 'site-prestarts',
  label: 'Site Prestarts',
  icon: MapPin,
  description: 'Daily site prestart check submissions'
}, {
  key: 'swms',
  label: 'SWMS',
  icon: ClipboardList,
  description: 'Safe Work Method Statements register'
}, {
  key: 'swms-signoffs',
  label: 'SWMS Sign-offs',
  icon: UserCheck,
  description: 'Worker SWMS sign-off records'
}, {
  key: 'tasks',
  label: 'Tasks',
  icon: CheckSquare,
  description: 'Job tasks and to-dos across all jobs'
}, {
  key: 'team-shifts',
  label: 'Team Shifts',
  icon: CalendarDays,
  description: 'Roster and shift records across all workers'
}, {
  key: 'time-entries',
  label: 'Time Entries',
  icon: Clock,
  description: 'Timesheet entries across all workers and jobs'
}];
interface ColDef {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (val: unknown, row: Record<string, unknown>) => React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters & badges
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(v: unknown): string {
  if (!v) return '—';
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}
function fmtDateTime(v: unknown): string {
  if (!v) return '—';
  const s = String(v);
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 16).replace('T', ' ');
    return d.toLocaleString('en-AU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return s.slice(0, 16).replace('T', ' ');
  }
}
function fmtCurrency(v: unknown): React.ReactNode {
  if (v == null || v === '') return <span className="text-gray-300">—</span>;
  return <span className="tabular-nums text-[12px] font-medium">${Number(v).toFixed(2)}</span>;
}
function statusBadge(status: unknown): React.ReactNode {
  const s = String(status ?? '').toLowerCase();
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    'in progress': 'bg-blue-100 text-blue-700',
    complete: 'bg-gray-100 text-gray-600',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
    open: 'bg-violet-100 text-violet-800',
    closed: 'bg-gray-100 text-gray-600',
    pending: 'bg-yellow-100 text-yellow-700',
    'not started': 'bg-gray-100 text-gray-500',
    draft: 'bg-gray-100 text-gray-500',
    investigating: 'bg-purple-100 text-purple-700',
    sent: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-600',
    submitted: 'bg-blue-100 text-blue-700'
  };
  const cls = map[s] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {String(status ?? '—')}
    </span>;
}
function severityBadge(sev: unknown): React.ReactNode {
  const s = String(sev ?? '').toLowerCase();
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-violet-100 text-violet-800',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700'
  };
  const cls = map[s] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {String(sev ?? '—')}
    </span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column definitions
// ─────────────────────────────────────────────────────────────────────────────

const COLS: Partial<Record<ListType, ColDef[]>> = {
  jobs: [{
    key: 'job_number',
    label: 'Job #',
    sortable: true,
    width: '90px'
  }, {
    key: 'name',
    label: 'Job Name',
    sortable: true
  }, {
    key: 'customer_name',
    label: 'Customer',
    sortable: false
  }, {
    key: 'site_address',
    label: 'Site',
    sortable: false
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '110px',
    render: v => statusBadge(v)
  }, {
    key: 'start_date',
    label: 'Start',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'expected_completion',
    label: 'Due',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'supervisor_name',
    label: 'Supervisor',
    sortable: false,
    width: '120px'
  }, {
    key: 'progress_percent',
    label: 'Progress',
    sortable: true,
    width: '80px',
    render: v => v != null ? <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden" style={{
        minWidth: 40
      }}>
            <div className="h-full bg-primary rounded-full" style={{
          width: `${Math.min(100, Number(v))}%`
        }} />
          </div>
          <span className="text-[11px] text-gray-500 tabular-nums">{Number(v)}%</span>
        </div> : '—'
  }],
  invoices: [{
    key: 'invoice_number',
    label: 'Invoice #',
    sortable: true,
    width: '110px'
  }, {
    key: 'title',
    label: 'Title',
    sortable: true
  }, {
    key: 'customer_name',
    label: 'Customer',
    sortable: false,
    width: '150px'
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'issue_date',
    label: 'Issued',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'due_date',
    label: 'Due',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'total',
    label: 'Total',
    sortable: true,
    width: '100px',
    render: v => fmtCurrency(v)
  }, {
    key: 'amount_paid',
    label: 'Paid',
    sortable: false,
    width: '100px',
    render: v => fmtCurrency(v)
  }, {
    key: 'balance_due',
    label: 'Balance',
    sortable: true,
    width: '100px',
    render: v => fmtCurrency(v)
  }],
  estimates: [{
    key: 'estimate_number',
    label: 'Estimate #',
    sortable: true,
    width: '110px'
  }, {
    key: 'title',
    label: 'Title',
    sortable: true
  }, {
    key: 'customer_name',
    label: 'Customer',
    sortable: false,
    width: '150px'
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'issue_date',
    label: 'Date',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'expiry_date',
    label: 'Expires',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'subtotal',
    label: 'Subtotal',
    sortable: true,
    width: '100px',
    render: v => fmtCurrency(v)
  }, {
    key: 'total',
    label: 'Total',
    sortable: true,
    width: '100px',
    render: v => fmtCurrency(v)
  }],
  'purchase-orders': [{
    key: 'po_number',
    label: 'PO #',
    sortable: true,
    width: '100px'
  }, {
    key: 'title',
    label: 'Title',
    sortable: true
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'assigned_to_name',
    label: 'Assigned To',
    sortable: false,
    width: '140px'
  }, {
    key: 'trade_type',
    label: 'Trade',
    sortable: false,
    width: '110px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'start_date',
    label: 'Start',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'finish_date',
    label: 'Finish',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'total',
    label: 'Total',
    sortable: true,
    width: '100px',
    render: v => fmtCurrency(v)
  }],
  customers: [{
    key: 'name',
    label: 'Name',
    sortable: true
  }, {
    key: 'contact_person',
    label: 'Contact',
    sortable: false,
    width: '140px'
  }, {
    key: 'email',
    label: 'Email',
    sortable: false,
    width: '180px'
  }, {
    key: 'phone',
    label: 'Phone',
    sortable: false,
    width: '120px'
  }, {
    key: 'abn',
    label: 'ABN',
    sortable: false,
    width: '110px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '90px',
    render: v => statusBadge(v)
  }, {
    key: 'created_at',
    label: 'Added',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }],
  'time-entries': [{
    key: 'user_name',
    label: 'Worker',
    sortable: true
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'shift_date',
    label: 'Date',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'start_time',
    label: 'Start',
    sortable: true,
    width: '80px'
  }, {
    key: 'end_time',
    label: 'End',
    sortable: true,
    width: '80px'
  }, {
    key: 'hours',
    label: 'Hours',
    sortable: true,
    width: '75px',
    render: v => v != null ? <span className="tabular-nums text-[12px]">{Number(v).toFixed(2)}h</span> : '—'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'notes',
    label: 'Notes',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-500 line-clamp-1">{String(v)}</span> : '—'
  }],
  'fleet-assets': [{
    key: 'asset_number',
    label: 'Asset #',
    sortable: true,
    width: '100px'
  }, {
    key: 'name',
    label: 'Name',
    sortable: true
  }, {
    key: 'make_model',
    label: 'Make/Model',
    sortable: false,
    width: '150px'
  }, {
    key: 'type',
    label: 'Type',
    sortable: true,
    width: '110px'
  }, {
    key: 'rego',
    label: 'Rego',
    sortable: false,
    width: '100px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'created_at',
    label: 'Added',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }],
  swms: [{
    key: 'title',
    label: 'Title',
    sortable: true
  }, {
    key: 'work_activity',
    label: 'Work Activity',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-600 line-clamp-1">{String(v)}</span> : '—'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'revision_number',
    label: 'Rev',
    sortable: false,
    width: '60px'
  }, {
    key: 'review_date',
    label: 'Review Date',
    sortable: true,
    width: '105px',
    render: v => fmtDate(v)
  }, {
    key: 'created_by_name',
    label: 'Created By',
    sortable: false,
    width: '130px'
  }, {
    key: 'created_at',
    label: 'Created',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }],
  'form-submissions': [{
    key: 'template_name',
    label: 'Form',
    sortable: false
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '140px'
  }, {
    key: 'submitted_by_name',
    label: 'Submitted By',
    sortable: false,
    width: '130px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'created_at',
    label: 'Submitted',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  files: [{
    key: 'title',
    label: 'File Name',
    sortable: true
  }, {
    key: 'document_type',
    label: 'Type',
    sortable: true,
    width: '110px'
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '140px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'created_by_name',
    label: 'Uploaded By',
    sortable: false,
    width: '130px'
  }, {
    key: 'created_at',
    label: 'Date',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  'team-shifts': [{
    key: 'user_name',
    label: 'Worker',
    sortable: true
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'shift_date',
    label: 'Date',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'start_time',
    label: 'Start',
    sortable: true,
    width: '80px'
  }, {
    key: 'end_time',
    label: 'End',
    sortable: true,
    width: '80px'
  }, {
    key: 'role',
    label: 'Role',
    sortable: false,
    width: '110px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }],
  tasks: [{
    key: 'title',
    label: 'Task',
    sortable: true
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'assigned_name',
    label: 'Assigned To',
    sortable: true,
    width: '130px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '110px',
    render: v => statusBadge(v)
  }, {
    key: 'start_date',
    label: 'Start',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'due_date',
    label: 'Due',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'notes',
    label: 'Notes',
    sortable: false,
    render: v => v ? <span className="text-gray-500 text-[12px] line-clamp-1">{String(v)}</span> : '—'
  }],
  notes: [{
    key: 'body',
    label: 'Note',
    sortable: false,
    render: v => <span className="text-[12px] line-clamp-2 text-gray-700">{String(v ?? '')}</span>
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '160px'
  }, {
    key: 'note_type',
    label: 'Type',
    sortable: false,
    width: '80px',
    render: v => <span className="text-[11px] text-gray-500 capitalize">{String(v ?? '')}</span>
  }, {
    key: 'author_name',
    label: 'Created By',
    sortable: true,
    width: '130px'
  }, {
    key: 'created_at',
    label: 'Date',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  incidents: [{
    key: 'incident_number',
    label: 'Incident #',
    sortable: true,
    width: '100px'
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '140px'
  }, {
    key: 'incident_type',
    label: 'Type',
    sortable: true
  }, {
    key: 'severity',
    label: 'Severity',
    sortable: true,
    width: '90px',
    render: v => severityBadge(v)
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '110px',
    render: v => statusBadge(v)
  }, {
    key: 'incident_date',
    label: 'Date',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'reported_by_name',
    label: 'Reported By',
    sortable: false,
    width: '130px'
  }, {
    key: 'corrective_action_count',
    label: 'Actions',
    sortable: false,
    width: '70px',
    render: v => <span className="tabular-nums text-[12px]">{String(v ?? 0)}</span>
  }],
  attendance: [{
    key: 'user_name',
    label: 'User',
    sortable: true
  }, {
    key: 'user_email',
    label: 'Email',
    sortable: false
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'signed_in_at',
    label: 'Signed In',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }, {
    key: 'signed_out_at',
    label: 'Signed Out',
    sortable: true,
    width: '140px',
    render: v => v ? fmtDateTime(v) : <span className="text-violet-600 text-[11px]">Still on site</span>
  }, {
    key: 'duration_hours',
    label: 'Duration',
    sortable: false,
    width: '80px',
    render: v => v != null ? <span className="tabular-nums text-[12px]">{Number(v).toFixed(1)}h</span> : '—'
  }, {
    key: 'source',
    label: 'Source',
    sortable: false,
    width: '80px',
    render: v => <span className="text-[11px] text-gray-400 capitalize">{String(v ?? '')}</span>
  }],
  costs: [{
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'description',
    label: 'Description',
    sortable: true
  }, {
    key: 'category',
    label: 'Category',
    sortable: true,
    width: '110px'
  }, {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    width: '90px',
    render: v => fmtCurrency(v)
  }, {
    key: 'gst_amount',
    label: 'GST',
    sortable: false,
    width: '80px',
    render: v => v != null ? <span className="tabular-nums text-[12px] text-gray-500">${Number(v).toFixed(2)}</span> : '—'
  }, {
    key: 'purchase_date',
    label: 'Date',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'supplier',
    label: 'Supplier',
    sortable: false,
    width: '120px'
  }],
  'driver-logs': [{
    key: 'user_name',
    label: 'Driver',
    sortable: true
  }, {
    key: 'fleet_name',
    label: 'Vehicle',
    sortable: true
  }, {
    key: 'fleet_registration',
    label: 'Rego',
    sortable: false,
    width: '90px'
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'started_at',
    label: 'Started',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }, {
    key: 'ended_at',
    label: 'Ended',
    sortable: true,
    width: '140px',
    render: v => v ? fmtDateTime(v) : <span className="text-violet-600 text-[11px]">In use</span>
  }, {
    key: 'duration_minutes',
    label: 'Duration',
    sortable: true,
    width: '85px',
    render: v => v != null ? <span className="tabular-nums text-[12px]">
          {Number(v) >= 60 ? `${Math.floor(Number(v) / 60)}h ${Number(v) % 60}m` : `${Number(v)}m`}
        </span> : '—'
  }, {
    key: 'meter_start',
    label: 'Meter Start',
    sortable: true,
    width: '95px',
    render: v => v != null ? <span className="tabular-nums text-[12px]">{Number(v).toLocaleString()}</span> : '—'
  }, {
    key: 'meter_end',
    label: 'Meter End',
    sortable: true,
    width: '95px',
    render: v => v != null ? <span className="tabular-nums text-[12px]">{Number(v).toLocaleString()}</span> : '—'
  }, {
    key: 'note',
    label: 'Note',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-500 line-clamp-1">{String(v)}</span> : '—'
  }],
  // ── Wave-2 columns ──────────────────────────────────────────────────────────

  drawings: [{
    key: 'drawing_number',
    label: 'Drawing #',
    sortable: true,
    width: '110px'
  }, {
    key: 'title',
    label: 'Title',
    sortable: true
  }, {
    key: 'revision',
    label: 'Rev',
    sortable: false,
    width: '55px'
  }, {
    key: 'discipline',
    label: 'Discipline',
    sortable: true,
    width: '110px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '140px'
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'uploaded_by_name',
    label: 'Uploaded By',
    sortable: false,
    width: '130px'
  }, {
    key: 'created_at',
    label: 'Date',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  'job-delays': [{
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'reason',
    label: 'Reason',
    sortable: true
  }, {
    key: 'days',
    label: 'Days',
    sortable: true,
    width: '65px',
    render: v => v != null ? <span className="tabular-nums text-[12px] font-medium">{String(v)}</span> : '—'
  }, {
    key: 'delay_date',
    label: 'Delay Date',
    sortable: true,
    width: '100px',
    render: v => fmtDate(v)
  }, {
    key: 'notes',
    label: 'Notes',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-500 line-clamp-1">{String(v)}</span> : '—'
  }, {
    key: 'created_by_name',
    label: 'Created By',
    sortable: false,
    width: '130px'
  }, {
    key: 'created_at',
    label: 'Created',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  'guest-checkins': [{
    key: 'full_name',
    label: 'Visitor',
    sortable: true
  }, {
    key: 'phone_number',
    label: 'Phone',
    sortable: false,
    width: '120px'
  }, {
    key: 'email',
    label: 'Email',
    sortable: false,
    width: '170px'
  }, {
    key: 'reason_for_visit',
    label: 'Reason',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-600 line-clamp-1">{String(v)}</span> : '—'
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '140px'
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'signed_in_at',
    label: 'Signed In',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }, {
    key: 'signed_out_at',
    label: 'Signed Out',
    sortable: true,
    width: '140px',
    render: v => v ? fmtDateTime(v) : <span className="text-violet-600 text-[11px]">Still on site</span>
  }, {
    key: 'source',
    label: 'Source',
    sortable: false,
    width: '70px',
    render: v => <span className="text-[11px] text-gray-400 capitalize">{String(v ?? '')}</span>
  }],
  'fleet-prestarts': [{
    key: 'asset_name',
    label: 'Asset',
    sortable: true
  }, {
    key: 'asset_rego',
    label: 'Rego',
    sortable: false,
    width: '90px'
  }, {
    key: 'asset_type',
    label: 'Type',
    sortable: false,
    width: '100px'
  }, {
    key: 'operator_name',
    label: 'Operator',
    sortable: true,
    width: '130px'
  }, {
    key: 'km_hours',
    label: 'KM / Hours',
    sortable: false,
    width: '90px'
  }, {
    key: 'safe_to_operate',
    label: 'Safe',
    sortable: true,
    width: '70px',
    render: v => v ? <span className="text-[11px] font-medium text-green-600">Yes</span> : <span className="text-[11px] font-medium text-red-600">No</span>
  }, {
    key: 'issue_needs_attention',
    label: 'Issue',
    sortable: false,
    width: '65px',
    render: v => v ? <span className="text-[11px] font-medium text-violet-700">Yes</span> : <span className="text-[11px] text-gray-300">—</span>
  }, {
    key: 'issue_comment',
    label: 'Issue Detail',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-600 line-clamp-1">{String(v)}</span> : '—'
  }, {
    key: 'created_at',
    label: 'Date',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  'fleet-service-logs': [{
    key: 'asset_name',
    label: 'Asset',
    sortable: true
  }, {
    key: 'asset_rego',
    label: 'Rego',
    sortable: false,
    width: '90px'
  }, {
    key: 'asset_type',
    label: 'Type',
    sortable: false,
    width: '100px'
  }, {
    key: 'service_type',
    label: 'Service Type',
    sortable: true,
    width: '130px'
  }, {
    key: 'service_date',
    label: 'Service Date',
    sortable: true,
    width: '105px',
    render: v => fmtDate(v)
  }, {
    key: 'odometer',
    label: 'Odometer',
    sortable: true,
    width: '90px',
    render: v => v != null ? <span className="tabular-nums text-[12px]">{Number(v).toLocaleString()}</span> : '—'
  }, {
    key: 'provider',
    label: 'Provider',
    sortable: false,
    width: '130px'
  }, {
    key: 'cost',
    label: 'Cost',
    sortable: true,
    width: '90px',
    render: v => fmtCurrency(v)
  }, {
    key: 'next_service_date',
    label: 'Next Service',
    sortable: true,
    width: '105px',
    render: v => fmtDate(v)
  }, {
    key: 'notes',
    label: 'Notes',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-500 line-clamp-1">{String(v)}</span> : '—'
  }],
  'site-prestarts': [{
    key: 'job_name',
    label: 'Job',
    sortable: false
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'submitted_by',
    label: 'Submitted By',
    sortable: true,
    width: '140px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'worker_count',
    label: 'Workers',
    sortable: false,
    width: '75px',
    render: v => <span className="tabular-nums text-[12px]">{String(v ?? 0)}</span>
  }, {
    key: 'created_at',
    label: 'Date',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  'swms-signoffs': [{
    key: 'worker_name',
    label: 'Worker',
    sortable: true
  }, {
    key: 'white_card_number',
    label: 'White Card',
    sortable: false,
    width: '110px'
  }, {
    key: 'company_name',
    label: 'Company',
    sortable: false,
    width: '130px'
  }, {
    key: 'role',
    label: 'Role',
    sortable: false,
    width: '110px'
  }, {
    key: 'swms_title',
    label: 'SWMS',
    sortable: false
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '140px'
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'signed_at',
    label: 'Signed',
    sortable: true,
    width: '140px',
    render: v => fmtDateTime(v)
  }],
  milestones: [{
    key: 'title',
    label: 'Milestone',
    sortable: true
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '150px'
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'due_date',
    label: 'Due Date',
    sortable: true,
    width: '100px',
    render: v => fmtDate(v)
  }, {
    key: 'start_date',
    label: 'Start Date',
    sortable: true,
    width: '100px',
    render: v => fmtDate(v)
  }, {
    key: 'assigned_to',
    label: 'Assigned To',
    sortable: false,
    width: '130px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '110px',
    render: v => statusBadge(v)
  }, {
    key: 'description',
    label: 'Description',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-500 line-clamp-1">{String(v)}</span> : '—'
  }],
  'asset-bookings': [{
    key: 'asset_name',
    label: 'Asset',
    sortable: true
  }, {
    key: 'asset_type',
    label: 'Type',
    sortable: false,
    width: '100px'
  }, {
    key: 'asset_rego',
    label: 'Rego',
    sortable: false,
    width: '90px'
  }, {
    key: 'job_name',
    label: 'Job',
    sortable: false,
    width: '140px'
  }, {
    key: 'job_number',
    label: 'Job #',
    sortable: false,
    width: '80px'
  }, {
    key: 'title',
    label: 'Title',
    sortable: false
  }, {
    key: 'start_date',
    label: 'Start',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'end_date',
    label: 'End',
    sortable: true,
    width: '95px',
    render: v => fmtDate(v)
  }, {
    key: 'start_time',
    label: 'Start Time',
    sortable: false,
    width: '80px'
  }, {
    key: 'end_time',
    label: 'End Time',
    sortable: false,
    width: '80px'
  }, {
    key: 'status',
    label: 'Status',
    sortable: true,
    width: '100px',
    render: v => statusBadge(v)
  }, {
    key: 'notes',
    label: 'Notes',
    sortable: false,
    render: v => v ? <span className="text-[12px] text-gray-500 line-clamp-1">{String(v)}</span> : '—'
  }]
};

// Fallback columns for any list type without a definition yet
const FALLBACK_COLS: ColDef[] = [{
  key: 'id',
  label: 'ID',
  sortable: true,
  width: '70px'
}, {
  key: 'title',
  label: 'Title',
  sortable: true
}, {
  key: 'status',
  label: 'Status',
  sortable: true,
  width: '110px',
  render: v => statusBadge(v)
}, {
  key: 'created_at',
  label: 'Created',
  sortable: true,
  width: '140px',
  render: v => fmtDateTime(v)
}];

// ─────────────────────────────────────────────────────────────────────────────
// Data hook
// ─────────────────────────────────────────────────────────────────────────────

interface ListData {
  rows: Record<string, unknown>[];
  total: number;
}

// Map new list types to their API endpoint slugs
const API_SLUG: Partial<Record<ListType, string>> = {
  'purchase-orders': 'purchase-orders',
  'time-entries': 'time-entries',
  'fleet-assets': 'fleet-assets',
  'form-submissions': 'form-submissions',
  'team-shifts': 'team-shifts'
};
function apiSlug(lt: ListType): string {
  return API_SLUG[lt] ?? lt;
}
function useListData(listType: ListType | null, params: {
  q: string;
  status: string;
  severity: string;
  dateFrom: string;
  dateTo: string;
  userId: string;
  jobId: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}) {
  const [data, setData] = useState<ListData>({
    rows: [],
    total: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetch_ = useCallback(() => {
    if (!listType) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.severity) qs.set('severity', params.severity);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    if (params.userId) qs.set('userId', params.userId);
    if (params.jobId) qs.set('jobId', params.jobId);
    qs.set('page', String(params.page));
    qs.set('pageSize', String(params.pageSize));
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    qs.set('sortDir', params.sortDir);
    fetch(`/api/lists/${apiSlug(listType)}?${qs}`, {
      credentials: 'include',
      signal: ctrl.signal
    }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then((d: ListData) => {
      setData(d);
      setLoading(false);
    }).catch(e => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Failed to load data');
      setLoading(false);
    });
  }, [listType, params.q, params.status, params.severity, params.dateFrom, params.dateTo, params.userId, params.jobId, params.page, params.pageSize, params.sortBy, params.sortDir]);
  useEffect(() => {
    fetch_();
  }, [fetch_]);
  return {
    data,
    loading,
    error
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate List modal
// ─────────────────────────────────────────────────────────────────────────────

interface GenerateParams {
  listType: ListType;
  q: string;
  userId: string;
  jobId: string;
  dateFrom: string;
  dateTo: string;
}
interface ReportUser {
  id: string;
  name: string;
  email: string;
}
interface ReportJob {
  id: number;
  name: string;
  job_number: string;
}
function useModalOptions() {
  const [users, setUsers] = useState<ReportUser[]>([]);
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  useEffect(() => {
    fetch('/api/user-logs/users', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : []).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/lists/jobs?pageSize=200&sortBy=name&sortDir=asc', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : {
      rows: []
    }).then(d => setJobs(Array.isArray(d?.rows) ? d.rows : [])).catch(() => {});
  }, []);
  return {
    users,
    jobs
  };
}
interface GenerateModalProps {
  open: boolean;
  initial: ListType | null;
  onClose: () => void;
  onGenerate: (p: GenerateParams) => void;
}
function GenerateModal({
  open,
  initial,
  onClose,
  onGenerate
}: GenerateModalProps) {
  const {
    users,
    jobs
  } = useModalOptions();
  const [listType, setListType] = useState<ListType>(initial ?? 'jobs');
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const [jobId, setJobId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setListType(initial ?? 'jobs');
      setQ('');
      setUserId('');
      setJobId('');
      setDateFrom('');
      setDateTo('');
    }
  }, [open, initial]);
  if (!open) return null;
  function submit() {
    onGenerate({
      listType,
      q,
      userId,
      jobId,
      dateFrom,
      dateTo
    });
  }
  return <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center" onClick={onClose}>
        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-[560px] mx-4 flex flex-col" style={{
        maxHeight: 'calc(100vh - 80px)'
      }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2">
              <ListFilter size={15} className="text-primary" />
              <span className="text-[14px] font-semibold text-gray-800">Generate List</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100">
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

            {/* List Type */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">List Type</label>
              <select value={listType} onChange={e => setListType(e.target.value as ListType)} className="w-full text-[13px] border border-gray-200 rounded px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary">
                {CATALOG.map(entry => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
              </select>
              {/* Description hint */}
              {(() => {
              const entry = CATALOG.find(c => c.key === listType);
              return entry ? <p className="mt-1 text-[11px] text-gray-400">{entry.description}</p> : null;
            })()}
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Search */}
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Search</label>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by keyword…" className="w-full pl-7 pr-3 py-1.5 text-[12px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>

              {/* User */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">User</label>
                <select value={userId} onChange={e => setUserId(e.target.value)} className="w-full text-[12px] border border-gray-200 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">All users</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
              </div>

              {/* Job */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Job</label>
                <select value={jobId} onChange={e => setJobId(e.target.value)} className="w-full text-[12px] border border-gray-200 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">All jobs</option>
                  {jobs.map(j => <option key={j.id} value={String(j.id)}>
                      {j.job_number ? `${j.job_number} — ` : ''}{j.name}
                    </option>)}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Date From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full text-[12px] border border-gray-200 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Date To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full text-[12px] border border-gray-200 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2 rounded-b-lg">
            <button onClick={onClose} className="px-4 py-2 text-[12px] font-medium text-gray-600 border border-gray-200 rounded hover:bg-white transition-colors">
              Cancel
            </button>
            <button onClick={submit} className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white text-[13px] font-semibold rounded hover:bg-violet-700 transition-colors">
              <Play size={12} />
              Generate
            </button>
          </div>
        </div>
      </div>
    </>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort header cell
// ─────────────────────────────────────────────────────────────────────────────

function SortTh({
  col,
  sortBy,
  sortDir,
  onSort
}: {
  col: ColDef;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (k: string) => void;
}) {
  const active = sortBy === col.key;
  return <th style={{
    width: col.width
  }} className={`px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap select-none border-b border-gray-200 bg-gray-50 ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`} onClick={() => col.sortable && onSort(col.key)}>
      <span className="flex items-center gap-1">
        {col.label}
        {col.sortable && (active ? sortDir === 'asc' ? <ChevronUp size={12} className="text-primary" /> : <ChevronDown size={12} className="text-primary" /> : <ChevronsUpDown size={12} className="text-gray-300" />)}
      </span>
    </th>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
export default function ListsPage() {
  const navigate = useNavigate();

  // Active list state — null = nothing generated yet
  const [activeList, setActiveList] = useState<ListType | null>(null);
  const [activeLabel, setActiveLabel] = useState('');

  // Table filters (applied after Generate)
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userId, setUserId] = useState('');
  const [jobId, setJobId] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const {
    data,
    loading,
    error
  } = useListData(activeList, {
    q: debouncedQ,
    status,
    severity,
    dateFrom,
    dateTo,
    userId,
    jobId,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir
  });
  function handleGenerate(params: GenerateParams) {
    setActiveList(params.listType);
    const entry = CATALOG.find(c => c.key === params.listType);
    setActiveLabel(entry?.label ?? params.listType);
    setQ(params.q);
    setDebouncedQ(params.q);
    setStatus('');
    setSeverity('');
    setDateFrom(params.dateFrom);
    setDateTo(params.dateTo);
    setUserId(params.userId);
    setJobId(params.jobId);
    setSortBy('');
    setSortDir('desc');
    setPage(1);
    setShowFilters(false);
    setModalOpen(false);
  }
  function handleSort(key: string) {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortBy(key);
      setSortDir('desc');
    }
    setPage(1);
  }
  function handleCsvExport() {
    if (!activeList) return;
    const qs = new URLSearchParams();
    if (debouncedQ) qs.set('q', debouncedQ);
    if (status) qs.set('status', status);
    if (severity) qs.set('severity', severity);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (userId) qs.set('userId', userId);
    if (jobId) qs.set('jobId', jobId);
    if (sortBy) qs.set('sortBy', sortBy);
    qs.set('sortDir', sortDir);
    qs.set('format', 'csv');
    window.open(`/api/lists/${apiSlug(activeList)}?${qs}`, '_blank');
  }
  function clearFilters() {
    setStatus('');
    setSeverity('');
    setDateFrom('');
    setDateTo('');
    setUserId('');
    setJobId('');
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const cols = activeList ? COLS[activeList] ?? FALLBACK_COLS : FALLBACK_COLS;
  const hasFilters = !!(status || severity || dateFrom || dateTo || userId || jobId);
  const statusOpts: string[] = activeList === 'jobs' ? ['Active', 'In Progress', 'Complete', 'Cancelled', 'Draft'] : activeList === 'tasks' ? ['Not Started', 'In Progress', 'Complete', 'Cancelled'] : activeList === 'incidents' ? ['Open', 'Investigating', 'Closed'] : activeList === 'invoices' ? ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'] : activeList === 'estimates' ? ['Draft', 'Sent', 'Accepted', 'Declined', 'Cancelled'] : activeList === 'purchase-orders' ? ['Draft', 'Sent', 'Approved', 'Complete', 'Cancelled'] : activeList === 'customers' ? ['Active', 'Inactive'] : activeList === 'swms' ? ['Draft', 'Active', 'Archived'] : activeList === 'form-submissions' ? ['Draft', 'Submitted', 'Approved'] : activeList === 'fleet-assets' ? ['Active', 'Inactive', 'Archived'] : activeList === 'drawings' ? ['Current', 'Superseded', 'For Review', 'Archived'] : activeList === 'milestones' ? ['Pending', 'In Progress', 'Complete', 'Overdue'] : activeList === 'asset-bookings' ? ['Confirmed', 'Pending', 'Cancelled', 'Complete'] : activeList === 'site-prestarts' ? ['Draft', 'Submitted', 'Approved'] : [];
  return <>
      <Helmet>
        {/* Authenticated portal page — must not be indexed by search engines */}
        <meta name="robots" content="noindex,nofollow" />
        <title>Office Lists — Reports &amp; Registers | IWIllBUIlD</title>
        <meta name="description" content="Generate, filter, and export construction records — jobs, incidents, SWMS, timesheets, fleet logs, and more. Part of the IWIllBUIlD job management portal." />
        <link rel="canonical" href="https://iwillbuild.com/lists" />
        <meta property="og:title" content="Office Lists — Reports &amp; Registers | IWIllBUIlD" />
        <meta property="og:description" content="Generate, filter, and export construction records — jobs, incidents, SWMS, timesheets, fleet logs, and more." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/lists" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Office Lists — Reports &amp; Registers | IWIllBUIlD" />
        <meta name="twitter:description" content="Generate, filter, and export construction records — jobs, incidents, SWMS, timesheets, fleet logs, and more." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": "https://iwillbuild.com/lists#webpage",
          "name": "Office Lists — Reports & Registers",
          "url": "https://iwillbuild.com/lists",
          "description": "Generate, filter, and export construction records — jobs, incidents, SWMS, timesheets, fleet logs, and more.",
          "isPartOf": {
            "@id": "https://iwillbuild.com/#website"
          },
          "about": {
            "@id": "https://iwillbuild.com/#organization"
          }
        })}</script>
      </Helmet>

      <div className="portal-page">
        <DesktopTopBar />
        <DesktopDock />
        <h1 className="sr-only">Lists — IWIllBUIlD</h1>
        <main className="portal-main flex flex-col min-h-0 overflow-hidden">

          {/* ── Breadcrumb ── */}
          <div className="shrink-0 px-5 pt-3 pb-2 bg-white flex items-center gap-1.5 border-b border-gray-100">
            <button onClick={() => goBack(navigate, '/home')} className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-violet-600 transition-colors group">
              <LayoutDashboard size={12} className="group-hover:text-violet-600 transition-colors" />
              <span>Home</span>
            </button>
            <Crumb size={11} className="text-gray-300" />
            <span className="text-[11px] font-medium text-gray-600">Lists</span>
            {activeLabel && <>
                <Crumb size={11} className="text-gray-300" />
                <span className="text-[11px] font-medium text-primary">{activeLabel}</span>
              </>}
          </div>

          {/* ── Toolbar ── */}
          <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-200 flex items-center gap-2 flex-wrap">

            {/* Generate List — primary action */}
            <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-white bg-primary rounded hover:bg-violet-700 transition-colors">
              <ListFilter size={13} />
              Generate List
            </button>

            {/* Divider — only show table controls when a list is active */}
            {activeList && <>
                <div className="w-px h-5 bg-gray-200 mx-0.5" />

                {/* Search */}
                <div className="relative min-w-[180px] max-w-[280px]">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${activeLabel.toLowerCase()}…`} className="w-full pl-7 pr-7 py-1.5 text-[12px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-400" />
                  {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={12} />
                    </button>}
                </div>

                {/* Filter toggle */}
                <button onClick={() => setShowFilters(v => !v)} className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded border transition-colors ${showFilters || hasFilters ? 'border-primary text-primary bg-violet-50' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>
                  <Filter size={12} />
                  Filters
                  {hasFilters && <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">
                      {[status, severity, dateFrom, dateTo, userId, jobId].filter(Boolean).length}
                    </span>}
                </button>

                {hasFilters && <button onClick={clearFilters} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                    <X size={11} /> Clear
                  </button>}
              </>}

            <div className="flex-1" />

            {/* Record count */}
            {activeList && !loading && <span className="text-[11px] text-gray-400 tabular-nums">
                {data.total.toLocaleString()} record{data.total !== 1 ? 's' : ''}
              </span>}

            {/* Export CSV — only when a list is active */}
            {activeList && <button onClick={handleCsvExport} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors">
                <Download size={13} />
                Export CSV
              </button>}
          </div>

          {/* ── Filter bar (inline, below toolbar) ── */}
          {activeList && showFilters && <div className="shrink-0 px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
              {statusOpts.length > 0 && <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-gray-500 font-medium">Status</label>
                  <select value={status} onChange={e => {
              setStatus(e.target.value);
              setPage(1);
            }} className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">All</option>
                    {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>}
              {activeList === 'incidents' && <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-gray-500 font-medium">Severity</label>
                  <select value={severity} onChange={e => {
              setSeverity(e.target.value);
              setPage(1);
            }} className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="">All</option>
                    {['Critical', 'High', 'Medium', 'Low'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>}
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-500 font-medium">From</label>
                <input type="date" value={dateFrom} onChange={e => {
              setDateFrom(e.target.value);
              setPage(1);
            }} className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-500 font-medium">To</label>
                <input type="date" value={dateTo} onChange={e => {
              setDateTo(e.target.value);
              setPage(1);
            }} className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>}

          {/* ── Table area ── */}
          <div className="flex-1 overflow-auto min-h-0">
            {!activeList ? (/* Empty state — no list generated yet */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <ListFilter size={22} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-700 mb-1">No list generated yet</p>
                  <p className="text-[12px] text-gray-400 max-w-xs">
                    Click <strong className="text-gray-600">Generate List</strong> to choose a list type and apply filters.
                  </p>
                </div>
                <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-primary rounded hover:bg-violet-700 transition-colors">
                  <ListFilter size={14} />
                  Generate List
                </button>
              </div>) : error ? <div className="flex items-center gap-2 p-6 text-red-600 text-[13px]">
                <AlertCircle size={16} /> {error}
              </div> : <table className="w-full border-collapse text-[12px]" style={{
            minWidth: 600
          }}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    {cols.map(col => <SortTh key={col.key} col={col} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />)}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr>
                      <td colSpan={cols.length} className="px-3 py-8 text-center text-gray-400">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          <span className="text-[12px]">Loading…</span>
                        </div>
                      </td>
                    </tr> : data.rows.length === 0 ? <tr>
                      <td colSpan={cols.length} className="px-3 py-12 text-center text-gray-400 text-[12px]">
                        No records found
                        {(debouncedQ || hasFilters) && <button onClick={() => {
                    setQ('');
                    clearFilters();
                  }} className="ml-2 text-primary hover:underline">
                            Clear filters
                          </button>}
                      </td>
                    </tr> : data.rows.map((row, i) => <tr key={String(row.id ?? i)} className="border-b border-gray-100 hover:bg-violet-50/40 transition-colors">
                        {cols.map(col => {
                  const val = row[col.key];
                  return <td key={col.key} style={{
                    width: col.width,
                    maxWidth: col.width ? undefined : 260
                  }} className="px-3 py-2 text-gray-700 align-top">
                              {col.render ? col.render(val, row) : val != null && val !== '' ? <span className="line-clamp-2">{String(val)}</span> : <span className="text-gray-300">—</span>}
                            </td>;
                })}
                      </tr>)}
                </tbody>
              </table>}
          </div>

          {/* ── Pagination ── */}
          {activeList && !loading && data.total > PAGE_SIZE && <div className="shrink-0 px-4 py-2.5 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-400">
                Page {page} of {totalPages} · {data.total.toLocaleString()} total
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({
              length: Math.min(7, totalPages)
            }, (_, i) => {
              let p: number;
              if (totalPages <= 7) p = i + 1;else if (page <= 4) p = i + 1;else if (page >= totalPages - 3) p = totalPages - 6 + i;else p = page - 3 + i;
              return <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 text-[11px] rounded border transition-colors ${p === page ? 'border-primary bg-primary text-white font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{p}</button>;
            })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>}

        </main>
      </div>

      {/* ── Generate List modal ── */}
      <GenerateModal open={modalOpen} initial={activeList} onClose={() => setModalOpen(false)} onGenerate={handleGenerate} />
    </>;
}
