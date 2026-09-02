import { useState, useEffect, useRef } from 'react';
import {
  Save, Globe, Phone, Mail, MapPin, Loader2, CheckCircle2, AlertCircle,
  Hash, Factory, Upload, X, ImageIcon,
} from 'lucide-react';
import { INDUSTRY_LIST, type IndustryId } from '@/lib/industry-config';
import ImageSafeguardNotice from '@/components/ImageSafeguardNotice';

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
  logo_url?: string | null;
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

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoSaved, setLogoSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/company', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { company?: Company; error?: string }) => {
        if (data.company) {
          const c = data.company;
          setName(c.name ?? ''); setAbn(c.abn ?? ''); setPhone(c.phone ?? '');
          setEmail(c.email ?? ''); setWebsite(c.website ?? ''); setAddress(c.address ?? '');
          setIndustry((c.industry as IndustryId) ?? 'construction');
          if (c.logo_url) setLogoUrl(c.logo_url);
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    setLogoSaved(false);

    // Client-side validation
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setLogoError('Unsupported file type. Use PNG, JPG, WebP or SVG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('File too large. Max 5 MB.');
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    void uploadLogo(file);
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    setLogoError('');
    try {
      const form = new FormData();
      form.append('logo', file);
      const res = await fetch('/api/company/logo', { method: 'POST', credentials: 'include', body: form });
      const data = await res.json() as { logoUrl?: string; error?: string };
      if (!res.ok) { setLogoError(data.error ?? 'Upload failed'); return; }
      setLogoUrl(data.logoUrl!);
      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 3000);
    } catch { setLogoError('Upload failed. Please try again.'); } finally { setLogoUploading(false); }
  }

  function clearLogo() {
    setLogoPreview(null);
    setLogoUrl(null);
    setLogoError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 gap-2"><Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading company profile…</span></div>;
  }

  const displayLogo = logoPreview ?? logoUrl;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4">Company Profile</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Company Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="IWIIlBUILD Pty Ltd" /></div>
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
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* ── PDF Branding / Logo Upload ── */}
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-1">PDF Branding</h2>
        <p className="text-xs text-slate-400 mb-4">Your company logo appears on quotes, invoices, forms and reports. PNG, JPG, WebP or SVG — max 5 MB.</p>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start gap-5">

            {/* Logo preview / drop zone */}
            <div className="shrink-0">
              {displayLogo ? (
                <div className="relative group w-28 h-28">
                  <img
                    src={displayLogo}
                    alt="Company logo"
                    className="w-28 h-28 object-contain rounded-xl border border-slate-200 bg-slate-50 p-2"
                  />
                  {/* Overlay on hover */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
                  >
                    <Upload size={20} className="text-white" />
                  </div>
                  {/* Clear button */}
                  <button
                    type="button"
                    onClick={clearLogo}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow transition-colors"
                    title="Remove logo"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-28 h-28 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all cursor-pointer"
                >
                  <ImageIcon size={24} />
                  <span className="text-xs font-semibold text-center leading-tight">Upload Logo</span>
                </button>
              )}
            </div>

            {/* Right side info + actions */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 mb-1">Company Logo</p>
              <p className="text-xs text-slate-500 mb-3">Used in PDF headers on quotes, invoices, SWMS and safety forms. Recommended: PNG with transparent background, min 400 px wide.</p>

              {logoError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-3">
                  <AlertCircle size={12} />{logoError}
                </div>
              )}

              {logoSaved && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 mb-3">
                  <CheckCircle2 size={12} />Logo saved successfully
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-60"
              >
                {logoUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {logoUploading ? 'Uploading…' : displayLogo ? 'Replace Logo' : 'Choose File'}
              </button>

              {logoUrl && !logoPreview && (
                <p className="text-xs text-slate-400 mt-2 truncate">Saved: {logoUrl.split('/').pop()}</p>
              )}
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
          {/* CP12A: Subtle safeguard notice */}
          <ImageSafeguardNotice className="mt-1" />
        </div>
      </div>
    </form>
  );
}

