/**
 * /job-cards/new — Full-page New Job Card form
 * Clean full-page layout with ← Job Cards back nav
 */
import { useState, useEffect } from 'react';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import PortalSidebar from '@/components/PortalSidebar';
import { ChevronLeft, Zap, Plus, RefreshCw, AlertCircle } from 'lucide-react';
interface Customer {
  id: number;
  name: string;
}
interface TeamMember {
  id: string;
  name: string;
}
const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-shadow";
const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5";
export default function JobCardNewPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    customerId: '',
    customerNameOverride: '',
    siteAddress: '',
    serviceDate: new Date().toISOString().slice(0, 10),
    assignedUserId: '',
    workDescription: ''
  });
  useEffect(() => {
    fetch('/api/customers?status=active', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((d: {
      customers?: Customer[];
    } | null) => setCustomers(d?.customers ?? [])).catch(() => {});
    fetch('/api/team/members', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((d: {
      members?: TeamMember[];
    } | null) => setTeam(d?.members ?? [])).catch(() => {});
  }, []);
  function set(k: keyof typeof form, v: string) {
    setForm(f => ({
      ...f,
      [k]: v
    }));
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workDescription.trim()) {
      setError('Work description is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        workDescription: form.workDescription,
        siteAddress: form.siteAddress || undefined,
        serviceDate: form.serviceDate || undefined,
        status: 'draft'
      };
      if (form.customerId) body.customerId = Number(form.customerId);else if (form.customerNameOverride) body.customerNameOverride = form.customerNameOverride;
      if (form.assignedUserId) {
        body.assignedUserId = form.assignedUserId;
        const m = team.find(t => t.id === form.assignedUserId);
        if (m) body.assignedName = m.name;
      }
      const res = await fetch('/api/job-cards', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as {
        jobCard?: {
          id: number;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create');
      navigate(`/job-cards/${data.jobCard!.id}`);
    } catch (err) {
      setError(String((err as Error).message));
      setSaving(false);
    }
  }
  return <div className="flex h-screen bg-[#f5f6f8] overflow-hidden">
      <Helmet>
        <title>New Job Card — IWIllBUILD</title>
        <meta name="description" content="Create a new job card for reactive or call-out work." />
        <link rel="canonical" href="https://iwillbuild.com/job-cards/new" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden lg-portal">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-100 px-4 lg:px-6 py-4 shrink-0 safe-top">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/job-cards')} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors">
              <ChevronLeft size={18} />
              <span>Job Cards</span>
            </button>
            <span className="text-gray-200">/</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0">
                <Zap size={14} className="text-yellow-600" />
              </div>
              <h1 className="text-[16px] font-bold text-gray-900">New Job Card</h1>
            </div>
          </div>
        </div>

        {/* ── Scrollable form body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-4 lg:px-6 py-6">

            {error && <div className="flex items-center gap-2 px-4 py-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </div>}

            <form id="new-jc-form" onSubmit={handleSubmit} className="flex flex-col gap-5">

              {/* Customer */}
              <div>
                <label className={labelCls}>Customer</label>
                <select value={form.customerId} onChange={e => set('customerId', e.target.value)} className={inputCls + ' appearance-none'}>
                  <option value="">— Select existing customer —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!form.customerId && <input type="text" value={form.customerNameOverride} onChange={e => set('customerNameOverride', e.target.value)} placeholder="Or type a one-off customer name…" className={inputCls + ' mt-2'} />}
              </div>

              {/* Site address */}
              <div>
                <label className={labelCls}>Site address</label>
                <input type="text" value={form.siteAddress} onChange={e => set('siteAddress', e.target.value)} placeholder="123 Main St, Suburb" className={inputCls} />
              </div>

              {/* Service date */}
              <div>
                <label className={labelCls}>Service date</label>
                <input type="date" value={form.serviceDate} onChange={e => set('serviceDate', e.target.value)} className={inputCls} />
              </div>

              {/* Work description */}
              <div>
                <label className={labelCls}>
                  Work description <span className="text-red-400 normal-case tracking-normal font-normal">*</span>
                </label>
                <textarea value={form.workDescription} onChange={e => set('workDescription', e.target.value)} rows={5} placeholder="Describe the work to be done…" className={inputCls + ' resize-none'} />
              </div>

              {/* Assigned worker */}
              <div>
                <label className={labelCls}>Assigned worker</label>
                <select value={form.assignedUserId} onChange={e => set('assignedUserId', e.target.value)} className={inputCls + ' appearance-none'}>
                  <option value="">— Unassigned —</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed -mt-1">
                Labour, materials, PO number and completion details can be added after creation.
              </p>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2 pb-8">
                <button type="button" onClick={() => navigate('/job-cards')} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" form="new-jc-form" disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-bold transition-colors disabled:opacity-50 shadow-sm">
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
                  Create Job Card
                </button>
              </div>

            </form>
          </div>
        </div>

      </main>
    </div>;
}
