import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Settings,
  Building2,
  Users,
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
  User,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Bot,
  Megaphone,
  FileText,
  Factory,
  Plug,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { useMe, usePermissions } from '@/lib/usePermissions';
import { INDUSTRY_LIST, type IndustryId } from '@/lib/industry-config';
import CompanyStructureTab from '@/components/settings/CompanyStructureTab';
import DazzaAITab from '@/components/settings/DazzaAITab';
import DashboardBannerTab from '@/components/settings/DashboardBannerTab';
import NotificationsTab from '@/components/settings/NotificationsTab';
import TeamPermissionsTab from '@/components/settings/TeamPermissionsTab';
import PdfStyleTab from '@/components/settings/PdfStyleTab';
import DataBackupTab from '@/components/settings/DataBackupTab';
import IntegrationsTab from '@/components/settings/IntegrationsTab';

const tabs = [
  { id: 'account',      label: 'My Account',        icon: User },
  { id: 'company',      label: 'Company Profile',    icon: Building2 },
  { id: 'team',         label: 'Team & Permissions', icon: Users },
  { id: 'structure',    label: 'Company Structure',  icon: Layers },
  { id: 'pdf',          label: 'PDF / Print Style',  icon: FileText },
  { id: 'accounting',   label: 'Accounting',         icon: Receipt },
  { id: 'dazza',        label: 'Dazza AI',           icon: Bot },
  { id: 'banner',       label: 'Dashboard Banner',   icon: Megaphone },
  { id: 'notifications',label: 'Notifications',      icon: Bell },
  { id: 'integrations', label: 'Integrations',       icon: Plug },
  { id: 'data',         label: 'Data & Backup',      icon: Database },
];

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

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

// ── Password strength ─────────────────────────────────────────────────────────
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw))   score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;

  if (score <= 1) return { score, label: 'Weak',   color: 'bg-red-400' };
  if (score <= 2) return { score, label: 'Fair',   color: 'bg-amber-400' };
  if (score <= 3) return { score, label: 'Good',   color: 'bg-yellow-400' };
  if (score <= 4) return { score, label: 'Strong', color: 'bg-emerald-400' };
  return { score, label: 'Very Strong', color: 'bg-emerald-500' };
}

function StrengthBar({ password }: { password: string }) {
  const { score, label, color } = getStrength(password);
  if (!password) return null;
  const bars = 5;
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < score ? color : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <p className={`text-xs font-semibold ${score <= 1 ? 'text-red-500' : score <= 2 ? 'text-amber-500' : score <= 3 ? 'text-yellow-600' : 'text-emerald-600'}`}>
        {label}
      </p>
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateNewPassword(pw: string): string | null {
  if (pw.length < 8)                return 'At least 8 characters required.';
  if (!/\d/.test(pw))               return 'Must include at least one number.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) return 'Must include at least one symbol.';
  return null;
}

// ── My Account Tab ────────────────────────────────────────────────────────────
function MyAccountTab() {
  const { me, reload: reloadMe } = useMe();
  const isOwner = me?.profile?.role === 'owner';

  // Profile edit state
  const [displayName, setDisplayName] = useState('');
  const [emailField, setEmailField]   = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileState, setProfileState]   = useState<'idle' | 'saved' | 'error'>('idle');
  const [profileError, setProfileError]   = useState('');

  // Seed fields once me loads
  useEffect(() => {
    if (me?.user) {
      setDisplayName(me.user.name ?? '');
      setEmailField(me.user.email ?? '');
    }
  }, [me?.user?.id]); // only re-seed on user identity change, not on every re-render

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileError('');
    setProfileState('idle');

    const trimName  = displayName.trim();
    const trimEmail = emailField.trim();
    if (!trimName)  { setProfileError('Display name is required.'); return; }
    if (!trimEmail) { setProfileError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      setProfileError('Please enter a valid email address.');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimName, email: trimEmail }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setProfileError(data.error ?? 'Failed to save profile.');
        setProfileState('error');
      } else {
        setProfileState('saved');
        // Bust the useMe cache so sidebar + other components pick up the new name/email
        await reloadMe();
        setTimeout(() => setProfileState('idle'), 3000);
      }
    } catch {
      setProfileError('Network error. Please try again.');
      setProfileState('error');
    } finally {
      setProfileSaving(false);
    }
  }

  // Change password state
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveState, setSaveState]     = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]       = useState('');

  // Inline validation
  const newPwError     = newPw     ? validateNewPassword(newPw)                       : null;
  const confirmPwError = confirmPw && newPw !== confirmPw ? 'Passwords do not match.' : null;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSaveState('idle');

    if (!currentPw.trim()) { setErrorMsg('Current password is required.'); return; }
    const pwErr = validateNewPassword(newPw);
    if (pwErr) { setErrorMsg(pwErr); return; }
    if (newPw !== confirmPw) { setErrorMsg('Passwords do not match.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to change password.');
        setSaveState('error');
      } else {
        setSaveState('success');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
        setTimeout(() => setSaveState('idle'), 4000);
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }

  const initials = (me?.user?.name ?? me?.user?.email ?? '?')
    .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      {/* Profile edit */}
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4">Profile</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          {/* Avatar + role badge */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-black text-xl shrink-0">
              {initials}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-base">{me?.user?.name ?? '—'}</div>
              <div className="text-sm text-slate-400">{me?.user?.email ?? '—'}</div>
              {me?.profile?.role && (
                <div className="text-xs font-semibold text-primary capitalize mt-0.5">{me.profile.role}</div>
              )}
            </div>
          </div>

          {isOwner ? (
            <p className="text-xs text-slate-500 mb-4 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              You can update your own account details here.
            </p>
          ) : (
            <p className="text-xs text-slate-400 mb-4">
              To update your name or email, contact your portal administrator.
            </p>
          )}

          {/* Editable fields — owner only */}
          {isOwner && (
            <form onSubmit={handleProfileSave} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Display Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <span className="flex items-center gap-1"><Mail size={11} /> Email</span>
                  </label>
                  <input
                    type="email"
                    value={emailField}
                    onChange={(e) => setEmailField(e.target.value)}
                    className={inputClass}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {profileError && (
                <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle size={13} />{profileError}
                </div>
              )}
              {profileState === 'saved' && (
                <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 font-semibold">
                  <CheckCircle2 size={13} />Profile updated successfully.
                </div>
              )}

              <div className="pt-1 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Profile
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Change password */}
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4 flex items-center gap-2">
          <KeyRound size={16} className="text-slate-400" />
          Change Password
        </h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4" autoComplete="off">

            {/* Current password */}
            <div>
              <label className={labelClass}>Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your current password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className={labelClass}>New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Min 8 chars, 1 number, 1 symbol"
                  className={`${inputClass} pr-10 ${newPwError ? 'border-red-300 focus:ring-red-200 focus:border-red-400' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {newPwError && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} />{newPwError}
                </p>
              )}
              <StrengthBar password={newPw} />
            </div>

            {/* Confirm password */}
            <div>
              <label className={labelClass}>Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  className={`${inputClass} pr-10 ${confirmPwError ? 'border-red-300 focus:ring-red-200 focus:border-red-400' : confirmPw && !confirmPwError ? 'border-emerald-300 focus:ring-emerald-200 focus:border-emerald-400' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirmPwError && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} />{confirmPwError}
                </p>
              )}
              {confirmPw && !confirmPwError && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 size={11} />Passwords match
                </p>
              )}
            </div>

            {/* Requirements hint */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 flex flex-col gap-1">
              <p className="font-semibold text-slate-600 mb-1">Password requirements:</p>
              <RequirementRow met={newPw.length >= 8}          label="At least 8 characters" />
              <RequirementRow met={/\d/.test(newPw)}           label="At least one number" />
              <RequirementRow met={/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPw)} label="At least one symbol" />
              <RequirementRow met={newPw.length > 0 && newPw === confirmPw} label="Passwords match" />
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <AlertCircle size={13} />{errorMsg}
              </div>
            )}

            {/* Success */}
            {saveState === 'success' && (
              <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 font-semibold">
                <CheckCircle2 size={13} />Password changed successfully. You're still logged in.
              </div>
            )}

            <div className="pt-1 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving || !!newPwError || !!confirmPwError || !currentPw || !newPw || !confirmPw}
                className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function RequirementRow({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 transition-colors ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
      <CheckCircle2 size={11} className={met ? 'opacity-100' : 'opacity-30'} />
      {label}
    </div>
  );
}

// ── Company Tab ───────────────────────────────────────────────────────────────
function CompanyTab() {
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
          setName(c.name ?? '');
          setAbn(c.abn ?? '');
          setPhone(c.phone ?? '');
          setEmail(c.email ?? '');
          setWebsite(c.website ?? '');
          setAddress(c.address ?? '');
          setIndustry((c.industry as IndustryId) ?? 'construction');
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
        body: JSON.stringify({ name, abn, phone, email, website, address, industry }),
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

          {/* Industry Mode */}
          <div className="pt-4 border-t border-slate-100">
            <label className={labelClass}>
              <span className="flex items-center gap-1"><Factory size={11} /> Industry Mode</span>
            </label>
            <p className="text-xs text-slate-400 mb-3">
              Sets default job types, form templates and Dazza AI context for your industry.
              Existing data is not affected when you change this.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {INDUSTRY_LIST.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  onClick={() => setIndustry(ind.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm text-left transition-all ${
                    industry === ind.id
                      ? 'border-primary bg-primary/5 text-primary font-semibold'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base leading-none shrink-0">{ind.icon}</span>
                  <span className="font-medium">{ind.label}</span>
                  {industry === ind.id && (
                    <CheckCircle2 size={13} className="ml-auto text-primary shrink-0" />
                  )}
                </button>
              ))}
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
  const [activeTab, setActiveTab] = useState('account');
  const { me, isAdmin } = usePermissions();

  // Run migration once on mount to ensure company_settings table exists
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/migrate-company-settings', { method: 'POST', credentials: 'include' })
      .catch(() => { /* silent — table may already exist */ });
  }, [isAdmin]);

  return (
    <div className="portal-page">
      <Helmet>
        <title>Settings — IWILLBUILD Portal</title>
        <meta name="description" content="Configure company profile, users, permissions and data settings for the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/settings" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 shrink-0">
          <Settings size={20} className="text-primary mr-3" />
          <h1 className="font-heading font-bold text-lg">Settings</h1>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6">

            {/* Mobile: dropdown tab selector */}
            <div className="md:hidden">
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>{tab.label}</option>
                ))}
              </select>
            </div>

            {/* Desktop: sidebar tabs */}
            <div className="hidden md:block w-52 shrink-0">
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
              {activeTab === 'account'    && <MyAccountTab />}
              {activeTab === 'company'    && <CompanyTab />}
              {activeTab === 'team'       && <TeamPermissionsTab isAdmin={isAdmin} />}
              {activeTab === 'structure'  && <CompanyStructureTab isAdmin={isAdmin} />}
              {activeTab === 'pdf'        && <PdfStyleTab isAdmin={isAdmin} />}
              {activeTab === 'accounting' && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h2 className="font-heading font-bold text-base text-foreground mb-1">Accounting Integrations</h2>
                    <p className="text-sm text-muted-foreground">Connect your accounting software to sync invoices automatically.</p>
                  </div>
                  {[
                    { name: 'Xero', desc: 'Sync invoices, contacts and payments with Xero.', color: 'bg-blue-50 border-blue-200' },
                    { name: 'QuickBooks', desc: 'Push invoices and customers to QuickBooks Online.', color: 'bg-green-50 border-green-200' },
                    { name: 'MYOB', desc: 'Sync invoices and contacts with MYOB AccountRight or Essentials.', color: 'bg-purple-50 border-purple-200' },
                  ].map((provider) => (
                    <div key={provider.name} className={`flex items-center justify-between gap-4 p-4 border rounded-xl ${provider.color}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                          <Receipt size={16} className="text-slate-500" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-foreground">{provider.name}</p>
                          <p className="text-xs text-muted-foreground">{provider.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold px-2.5 py-1 bg-white border border-slate-200 text-slate-500 rounded-full">Not Connected</span>
                        <button disabled className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-400 rounded-lg text-xs font-bold cursor-not-allowed">
                          Connect <span className="text-[10px] font-bold bg-slate-300 text-slate-500 px-1.5 py-0.5 rounded-full ml-1">Soon</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground">
                      <strong>Coming soon:</strong> Once connected, you'll be able to sync invoices to your accounting software with one click. Invoice data including line items, GST, customer details and payment status will be pushed automatically.
                    </p>
                  </div>
                </div>
              )}
              {activeTab === 'dazza'      && <DazzaAITab isAdmin={isAdmin} />}
              {activeTab === 'banner'     && <DashboardBannerTab isAdmin={isAdmin} />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'integrations' && <IntegrationsTab />}
              {activeTab === 'data' && (
                <DataBackupTab isAdmin={isAdmin} />
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
