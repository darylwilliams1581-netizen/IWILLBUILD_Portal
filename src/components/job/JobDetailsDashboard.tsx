import { Link } from "react-router";
import { HardHat, FileText, User, MapPin, Calendar, CalendarClock, CalendarCheck, UserCheck, Users, Phone, Mail, Building2, ExternalLink, CheckSquare, DollarSign, Clock, Camera, AlertCircle, Edit2, X, Save, Loader2, UserCircle } from 'lucide-react';
import type { Job } from '@/lib/jobs-api';
import { getStatusStyle } from '@/lib/jobs-api';

// ── Types passed in from job-detail.tsx ──────────────────────────────────────
export interface JobSummary {
  tasksTotal: number;
  tasksDone: number;
  onSiteCount: number;
  photosCount: number;
}
export interface Customer {
  id: number;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
}
interface TeamMember {
  userId: string;
  name: string;
  role: string;
}
interface EditForm {
  name: string;
  jobNumber: string;
  client: string;
  address: string;
  status: string;
  notes: string;
  scheduledStartDate: string;
  scheduledStartTime: string;
  expectedCompletionDate: string;
  scheduledEndTime: string;
  actualStartDate: string;
  actualCompletionDate: string;
  assignedSupervisorUserId: string;
  assignedTeamLabel: string;
}
interface Props {
  job: Job;
  summary: JobSummary | null;
  costSummary: {
    actual: number;
    approved: number;
  } | null;
  linkedCustomer: Customer | null;
  linkedAssetId: number | null;
  linkedAssetName: string;
  teamMembers: TeamMember[];
  editing: boolean;
  saving: boolean;
  saveError: string;
  form: EditForm;
  editingCustomer: Customer | null;
  editingAssetId: number | null;
  JOB_STATUSES: readonly string[];
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onFormChange: (patch: Partial<EditForm>) => void;
  onTabSwitch: (tab: string) => void;
  CustomerSelector: React.ComponentType<{
    value: Customer | null;
    onChange: (c: Customer | null) => void;
  }>;
  AssetSelector: React.ComponentType<{
    value: number | null;
    onChange: (id: number | null, name?: string) => void;
  }>;
  onEditingCustomerChange: (c: Customer | null) => void;
  onEditingAssetIdChange: (id: number | null, name?: string) => void;
  workSingular: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}
function fmtDate(raw: string | null | undefined) {
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
function DetailRow({
  icon: Icon,
  label,
  value,
  href,
  mono = false
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return <div className="flex items-start gap-2.5">
      <Icon size={13} className="text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        {href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="text-sm text-primary hover:underline font-medium">
            {value}
          </a> : <p className={`text-sm text-foreground font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>}
      </div>
    </div>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  onClick
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  onClick?: () => void;
}) {
  const cls = `bg-white border border-border rounded-xl p-4 flex items-start gap-3 ${onClick ? 'cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all duration-150' : ''}`;
  const inner = <>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
        <p className="text-xl font-black text-foreground leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </>;
  return onClick ? <button className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JobDetailsDashboard({
  job,
  summary,
  costSummary,
  linkedCustomer,
  linkedAssetId,
  linkedAssetName,
  teamMembers,
  editing,
  saving,
  saveError,
  form,
  editingCustomer,
  editingAssetId,
  JOB_STATUSES,
  onEdit,
  onCancelEdit,
  onSave,
  onFormChange,
  onTabSwitch,
  CustomerSelector,
  AssetSelector,
  onEditingCustomerChange,
  onEditingAssetIdChange,
  workSingular
}: Props) {
  const statusStyle = getStatusStyle(job.status);

  // ── Schedule display ───────────────────────────────────────────────────────
  const schedStart = fmtDate(job.scheduledStartDate);
  const schedEnd = fmtDate(job.expectedCompletionDate);
  const actualStart = fmtDate(job.actualStartDate);
  const actualEnd = fmtDate(job.actualCompletionDate);

  // ── Task progress ──────────────────────────────────────────────────────────
  const taskPct = summary && summary.tasksTotal > 0 ? Math.round(summary.tasksDone / summary.tasksTotal * 100) : null;
  return <div className="flex flex-col gap-5">

      {/* ── Save error ── */}
      {saveError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {saveError}
        </div>}

      {/* ── Stat cards row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">

        {/* Status */}
        <div className={`bg-white border rounded-xl p-4 flex items-start gap-3 col-span-2 md:col-span-1 ${statusStyle.bg}`}>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/60`}>
            <span className={`w-2.5 h-2.5 rounded-full ${statusStyle.dot}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Status</p>
            <p className={`text-sm font-black leading-tight ${statusStyle.color}`}>{job.status}</p>
          </div>
        </div>

        {/* Tasks */}
        <StatCard icon={CheckSquare} label="Tasks" value={summary ? `${summary.tasksDone}/${summary.tasksTotal}` : '—'} sub={taskPct !== null ? `${taskPct}% complete` : 'No tasks yet'} color="bg-blue-50 text-blue-600" onClick={() => onTabSwitch('tasks')} />

        {/* Costs */}
        <StatCard icon={DollarSign} label="Costs" value={costSummary ? `$${fmt(costSummary.actual)}` : '—'} sub={costSummary?.approved ? `$${fmt(costSummary.approved)} approved` : undefined} color="bg-emerald-50 text-emerald-600" onClick={() => onTabSwitch('costs')} />

        {/* On site */}
        <StatCard icon={UserCircle} label="On Site" value={summary ? summary.onSiteCount : '—'} sub={summary?.onSiteCount === 1 ? 'person signed in' : 'people signed in'} color="bg-green-50 text-green-600" onClick={() => onTabSwitch('attendance')} />

        {/* Photos */}
        <StatCard icon={Camera} label="Photos" value={summary ? summary.photosCount : '—'} sub="tap to view" color="bg-violet-50 text-violet-600" onClick={() => onTabSwitch('photos')} />
      </div>

      {/* ── Schedule strip (only if dates set) ── */}
      {(schedStart || schedEnd || actualStart || actualEnd) && <div className="bg-white border border-border rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-2">
          {schedStart && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock size={12} className="text-blue-500 shrink-0" />
              <span className="font-semibold">Scheduled start:</span>
              <span>{schedStart}</span>
            </div>}
          {schedEnd && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarCheck size={12} className="text-indigo-500 shrink-0" />
              <span className="font-semibold">Expected completion:</span>
              <span>{schedEnd}</span>
            </div>}
          {actualStart && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock size={12} className="text-emerald-500 shrink-0" />
              <span className="font-semibold">Actual start:</span>
              <span>{actualStart}</span>
            </div>}
          {actualEnd && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarCheck size={12} className="text-green-600 shrink-0" />
              <span className="font-semibold">Actual completion:</span>
              <span>{actualEnd}</span>
            </div>}
        </div>}

      {/* ── Main content: two-col on desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left: job info / edit form (2/3 width) ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-4">

            {/* Card header */}
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">
                {workSingular} Details
              </h2>
              {!editing ? <button onClick={onEdit} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-violet-700 transition-colors">
                  <Edit2 size={12} /> Edit
                </button> : <div className="flex items-center gap-2">
                  <button onClick={onCancelEdit} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                    <X size={12} /> Cancel
                  </button>
                  <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Save
                  </button>
                </div>}
            </div>

            {/* ── Read view ── */}
            {!editing && <div className="flex flex-col gap-3">
                <DetailRow icon={HardHat} label="Job Title" value={job.name} />
                {job.jobNumber && <DetailRow icon={FileText} label="Job Number" value={job.jobNumber} mono />}
                {job.client && <DetailRow icon={User} label="Client" value={job.client} />}
                {linkedAssetId && linkedAssetName && <DetailRow icon={Building2} label="Linked Asset" value={linkedAssetName} href={`/asset-manager?assetId=${linkedAssetId}`} />}
                {job.address && <DetailRow icon={MapPin} label="Site Address" value={job.address} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`} />}
                <DetailRow icon={Calendar} label="Created" value={new Date(job.createdAt).toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })} />
                {(job.assignedSupervisorUserId || job.assignedTeamLabel) && <div className="pt-2 border-t border-border flex flex-col gap-3">
                    {job.assignedSupervisorUserId && <DetailRow icon={UserCheck} label="Supervisor" value={teamMembers.find(m => m.userId === job.assignedSupervisorUserId)?.name ?? 'Assigned'} />}
                    {job.assignedTeamLabel && <DetailRow icon={Users} label="Team / Crew" value={job.assignedTeamLabel} />}
                  </div>}
                {job.notes && <div className="pt-2 border-t border-border">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{job.notes}</p>
                  </div>}
                {!job.client && !job.address && !job.notes && <p className="text-sm text-muted-foreground italic">
                    No additional details. Click Edit to add client, address, and notes.
                  </p>}
              </div>}

            {/* ── Edit form ── */}
            {editing && <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Job Title <span className="text-red-500">*</span></label>
                  <input type="text" value={form.name} onChange={e => onFormChange({
                name: e.target.value
              })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Job Number</label>
                    <input type="text" value={form.jobNumber} onChange={e => onFormChange({
                  jobNumber: e.target.value
                })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">Status</label>
                    <select value={form.status} onChange={e => onFormChange({
                  status: e.target.value
                })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white">
                      {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Link Customer <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <CustomerSelector value={editingCustomer} onChange={c => {
                onEditingCustomerChange(c);
                if (c && !form.client) onFormChange({
                  client: c.name
                });
              }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Link Asset <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <AssetSelector value={editingAssetId} onChange={(id, name) => onEditingAssetIdChange(id, name)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Client Name</label>
                  <input type="text" value={form.client} onChange={e => onFormChange({
                client: e.target.value
              })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Site Address / Suburb</label>
                  <input type="text" value={form.address} onChange={e => onFormChange({
                address: e.target.value
              })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Description / Notes</label>
                  <textarea value={form.notes} onChange={e => onFormChange({
                notes: e.target.value
              })} rows={4} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none" />
                </div>

                {/* Schedule */}
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Schedule</p>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold mb-1.5">Scheduled Start</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={form.scheduledStartDate} onChange={e => onFormChange({
                    scheduledStartDate: e.target.value
                  })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                      <input type="time" value={form.scheduledStartTime} placeholder="Start time" onChange={e => onFormChange({
                    scheduledStartTime: e.target.value
                  })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold mb-1.5">Expected Completion</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={form.expectedCompletionDate} onChange={e => onFormChange({
                    expectedCompletionDate: e.target.value
                  })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                      <input type="time" value={form.scheduledEndTime} placeholder="End time" onChange={e => onFormChange({
                    scheduledEndTime: e.target.value
                  })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Actual Start</label>
                      <input type="date" value={form.actualStartDate} onChange={e => onFormChange({
                    actualStartDate: e.target.value
                  })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5">Actual Completion</label>
                      <input type="date" value={form.actualCompletionDate} onChange={e => onFormChange({
                    actualCompletionDate: e.target.value
                  })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-semibold mb-1.5">Assigned Supervisor</label>
                    <select value={form.assignedSupervisorUserId} onChange={e => onFormChange({
                  assignedSupervisorUserId: e.target.value
                })} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white">
                      <option value="">— Unassigned —</option>
                      {teamMembers.map(m => <option key={m.userId} value={m.userId}>
                          {m.name}{m.role === 'owner' ? ' (Owner)' : m.role === 'admin' ? ' (Admin)' : ''}
                        </option>)}
                    </select>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-semibold mb-1.5">Team / Crew Label</label>
                    <input type="text" value={form.assignedTeamLabel} onChange={e => onFormChange({
                  assignedTeamLabel: e.target.value
                })} placeholder="e.g. Crew A, Framing Team" className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                  </div>
                </div>
              </div>}
          </div>
        </div>

        {/* ── Right: linked customer + quick links (1/3 width) ── */}
        <div className="flex flex-col gap-4">

          {/* Linked customer */}
          {linkedCustomer && <div className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</h3>
                <Link to={`/customers/${linkedCustomer.id}`} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Open <ExternalLink size={10} />
                </Link>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-black text-sm">{linkedCustomer.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground">{linkedCustomer.name}</p>
                  {linkedCustomer.contact_person && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <User size={10} />{linkedCustomer.contact_person}
                    </p>}
                  <div className="flex flex-col gap-0.5 mt-1.5">
                    {linkedCustomer.phone && <a href={`tel:${linkedCustomer.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                        <Phone size={10} />{linkedCustomer.phone}
                      </a>}
                    {linkedCustomer.mobile && <a href={`tel:${linkedCustomer.mobile}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                        <Phone size={10} />{linkedCustomer.mobile}
                      </a>}
                    {linkedCustomer.email && <a href={`mailto:${linkedCustomer.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                        <Mail size={10} />{linkedCustomer.email}
                      </a>}
                  </div>
                </div>
              </div>
            </div>}

          {/* Quick nav links */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Quick Access</h3>
            <div className="flex flex-col gap-1">
              {([{
              label: 'Tasks',
              tab: 'tasks',
              icon: CheckSquare
            }, {
              label: 'Notes',
              tab: 'notes',
              icon: FileText
            }, {
              label: 'Costs',
              tab: 'costs',
              icon: DollarSign
            }, {
              label: 'Progress',
              tab: 'progress',
              icon: Clock
            }, {
              label: 'Safety',
              tab: 'safety',
              icon: AlertCircle
            }, {
              label: 'Attendance',
              tab: 'attendance',
              icon: UserCircle
            }] as const).map(({
              label,
              tab,
              icon: Icon
            }) => <button key={tab} onClick={() => onTabSwitch(tab)} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left w-full">
                  <Icon size={13} className="shrink-0 text-primary" />
                  {label}
                </button>)}
            </div>
          </div>
        </div>
      </div>
    </div>;
}
