import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Settings,
  Building2,
  Users,
  Shield,
  Bell,
  Database,
  ChevronRight,
  Save,
  Globe,
  Phone,
  Mail,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Hash,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

const tabs = [
  { id: 'company',       label: 'Company',       icon: Building2 },
  { id: 'users',         label: 'Users',         icon: Users },
  { id: 'permissions',   label: 'Permissions',   icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data',          label: 'Data & Backup', icon: Database },
];

interface Company {
  id: number;
  name: string;
  abn: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

// ── Company Tab ───────────────────────────────────────────────────────────────
function CompanyTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    fetch('/api/company', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { company?: Company; error?: string }) => {
        if (data.company) {
          const c = data.company;
          setName(c.name ?? '');
          setAbn(c.abn ?? '');
          setPhone(c.phone ?? '');
          setEmail(c.email ?? '');
          setWebsite(c.website ?? '');
          setAddress(c.address ?? '');
        }
      })
      .catch(() => setErrorMsg('Failed to load company profile'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErrorMsg('Company name is required'); return; }
    setErrorMsg('');
    setSaving(true);
    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, abn, phone, email, website, address }),
      });
      const data = await res.json() as { company?: Company; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Save failed');
        setSaveState('error');
      } else {
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading company profile…</span>
      </div>
    );
  }

  const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';
  const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4">Company Profile</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Company Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="IWILLBUILD Pty Ltd" />
            </div>
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1"><Hash size={11} /> ABN</span>
              </label>
              <input value={abn} onChange={(e) => setAbn(e.target.value)} className={inputClass} placeholder="12 345 678 901" />
            </div>
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1"><Phone size={11} /> Phone</span>
              </label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="07 3000 0000" />
            </div>
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1"><Mail size={11} /> Email</span>
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="admin@company.com.au" />
            </div>
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1"><Globe size={11} /> Website</span>
              </label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} placeholder="https://iwillbuild.com" />
            </div>
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-1"><MapPin size={11} /> Address</span>
              </label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="Brisbane, QLD 4000" />
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} />
              {errorMsg}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className={`flex items-center gap-1.5 text-xs font-semibold transition-all duration-300 ${saveState === 'saved' ? 'text-emerald-600' : 'text-transparent'}`}>
              <CheckCircle2 size={13} />
              Saved
            </span>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4">PDF Branding</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-xs text-center leading-tight cursor-pointer hover:border-primary hover:text-primary transition-colors">
              Upload Logo
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-600">Upload your company logo for PDF output on quotes, forms and reports.</p>
              <p className="text-xs text-slate-400 mt-1">PNG or SVG, min 400px wide. Used in PDF headers.</p>
              <p className="text-xs text-amber-600 mt-2 font-semibold">⚠ PDF engine coming in next release</p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function ComingSoonTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
        <Settings size={22} className="text-slate-400" />
      </div>
      <h3 className="font-bold text-slate-700 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mx-auto">{description}</p>
      <span className="inline-block mt-4 text-xs bg-amber-50 text-amber-700 font-bold px-3 py-1.5 rounded-full border border-amber-200">
        Coming in next release
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company');

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Settings — IWILLBUILD Portal</title>
        <meta name="description" content="Configure company profile, users, permissions and data settings for the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/settings" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 shrink-0">
          <Settings size={20} className="text-primary mr-3" />
          <h1 className="font-heading font-bold text-lg">Settings</h1>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-6 flex gap-6">

            {/* Sidebar tabs */}
            <div className="w-52 shrink-0">
              <nav className="flex flex-col gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors text-left ${
                        activeTab === tab.id
                          ? 'bg-primary text-white'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={15} />
                        {tab.label}
                      </span>
                      <ChevronRight size={13} className="opacity-50" />
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {activeTab === 'company' && <CompanyTab />}
              {activeTab === 'users' && (
                <ComingSoonTab
                  title="User Management"
                  description="Manage portal users from the Team page. Full user management controls coming in the next release."
                />
              )}
              {activeTab === 'permissions' && (
                <ComingSoonTab
                  title="Role Permissions"
                  description="Fine-grained permission control per role — Admin, Supervisor, Operator and Viewer. Edit individual permissions from the Team page."
                />
              )}
              {activeTab === 'notifications' && (
                <ComingSoonTab
                  title="Notifications"
                  description="Configure email and in-app notifications for job updates, fleet alerts, form completions and Dazza AI summaries."
                />
              )}
              {activeTab === 'data' && (
                <ComingSoonTab
                  title="Data & Backup"
                  description="Export your portal data, schedule automated backups to Supabase Storage or SharePoint, and manage data retention policies."
                />
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
