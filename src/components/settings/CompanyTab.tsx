import { useState, useEffect } from 'react';
import {
  Save, Globe, Phone, Mail, MapPin, Loader2, CheckCircle2, AlertCircle,
  Hash, Factory,
} from 'lucide-react';
import { INDUSTRY_LIST, type IndustryId } from '@/lib/industry-config';

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

interface Company {
  id: number;
  name: string;
  abn: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
}

export default function CompanyTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [industry, setIndustry] = useState<IndustryId>('construction');

  useEffect(() => {
    fetch('/api/company', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { company?: Company; error?: string }) => {
        if (data.company) {
          const c = data.company;
          setName(c.name ?? ''); setAbn(c.abn ?? ''); setPhone(c.phone ?? '');
          setEmail(c.email ?? ''); setWebsite(c.website ?? ''); setAddress(c.address ?? '');
          setIndustry((c.industry as IndustryId) ?? 'construction');
        }
      })
      .catch(() => setErrorMsg('Failed to load company profile'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErrorMsg('Company name is required'); return; }
    setErrorMsg(''); setSaving(true);
    try {
      const res = await fetch('/api/company', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name, abn, phone, email, website, address, industry }) });
      const data = await res.json() as { company?: Company; error?: string };
      if (!res.ok) { setErrorMsg(data.error ?? 'Save failed'); setSaveState('error'); }
      else { setSaveState('saved'); setTimeout(() => setSaveState('idle'), 2500); }
    } catch { setErrorMsg('Network error. Please try again.'); setSaveState('error'); } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 gap-2"><Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading company profile…</span></div>;
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4">Company Profile</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Company Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="IWILLBUILD Pty Ltd" /></div>
            <div><label className={labelClass}><span className="flex items-center gap-1"><Hash size={11} /> ABN</span></label><input value={abn} onChange={(e) => setAbn(e.target.value)} className={inputClass} placeholder="12 345 678 901" /></div>
            <div><label className={labelClass}><span className="flex items-center gap-1"><Phone size={11} /> Phone</span></label><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="07 3000 0000" /></div>
            <div><label className={labelClass}><span className="flex items-center gap-1"><Mail size={11} /> Email</span></label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="admin@company.com.au" /></div>
            <div><label className={labelClass}><span className="flex items-center gap-1"><Globe size={11} /> Website</span></label><input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} placeholder="https://iwillbuild.com" /></div>
            <div><label className={labelClass}><span className="flex items-center gap-1"><MapPin size={11} /> Address</span></label><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="Brisbane, QLD 4000" /></div>
          </div>
          <div className="pt-4 border-t border-slate-100">
            <label className={labelClass}><span className="flex items-center gap-1"><Factory size={11} /> Industry Mode</span></label>
            <p className="text-xs text-slate-400 mb-3">Sets default job types and form templates for your industry. Existing data is not affected when you change this.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {INDUSTRY_LIST.map((ind) => (
                <button key={ind.id} type="button" onClick={() => setIndustry(ind.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm text-left transition-all ${industry === ind.id ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <span className="text-base leading-none shrink-0">{ind.icon}</span>
                  <span className="font-medium">{ind.label}</span>
                  {industry === ind.id && <CheckCircle2 size={13} className="ml-auto text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>
          {errorMsg && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2"><AlertCircle size={13} />{errorMsg}</div>}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className={`flex items-center gap-1.5 text-xs font-semibold transition-all duration-300 ${saveState === 'saved' ? 'text-emerald-600' : 'text-transparent'}`}><CheckCircle2 size={13} />Saved</span>
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Changes
            </button>
          </div>
        </div>
      </div>
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4">PDF Branding</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-xs text-center leading-tight cursor-pointer hover:border-primary hover:text-primary transition-colors">Upload Logo</div>
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
