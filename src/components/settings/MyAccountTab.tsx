import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save, Mail, Loader2, CheckCircle2, AlertCircle,
  Lock, Eye, EyeOff, KeyRound, Smartphone, BadgeCheck, RefreshCw,
  FileText, User, ShieldAlert, Phone, Paperclip, Upload, Trash2, Download, X, ZoomIn,
} from 'lucide-react';
import { useMe } from '@/lib/usePermissions';
import SecurityTab from '@/components/settings/SecurityTab';
import AppLockSettings from '@/components/settings/AppLockSettings';
import PhoneInput from '@/components/ui/PhoneInput';

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw))   score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Weak',        color: 'bg-red-400' };
  if (score <= 2) return { score, label: 'Fair',        color: 'bg-amber-400' };
  if (score <= 3) return { score, label: 'Good',        color: 'bg-yellow-400' };
  if (score <= 4) return { score, label: 'Strong',      color: 'bg-emerald-400' };
  return              { score, label: 'Very Strong',  color: 'bg-emerald-500' };
}

function StrengthBar({ password }: { password: string }) {
  const { score, label, color } = getStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < score ? color : 'bg-slate-200'}`} />
        ))}
      </div>
      <p className={`text-xs font-semibold ${score <= 1 ? 'text-red-500' : score <= 2 ? 'text-amber-500' : score <= 3 ? 'text-yellow-600' : 'text-emerald-600'}`}>{label}</p>
    </div>
  );
}

function validateNewPassword(pw: string): string | null {
  if (pw.length < 8)  return 'At least 8 characters required.';
  if (!/\d/.test(pw)) return 'Must include at least one number.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) return 'Must include at least one symbol.';
  return null;
}

function RequirementRow({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 transition-colors ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
      <CheckCircle2 size={11} className={met ? 'opacity-100' : 'opacity-30'} />
      {label}
    </div>
  );
}

function PhoneVerificationSection() {
  const [savedPhone, setSavedPhone]       = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [loadingPhone, setLoadingPhone]   = useState(true);
  const [editPhone, setEditPhone]         = useState('');
  const [savingPhone, setSavingPhone]     = useState(false);
  const [savePhoneError, setSavePhoneError] = useState('');
  const [savePhoneOk, setSavePhoneOk]     = useState(false);
  const [verifyStep, setVerifyStep]       = useState<'idle' | 'sent' | 'done'>('idle');
  const [sendingCode, setSendingCode]     = useState(false);
  const [sendError, setSendError]         = useState('');
  const [code, setCode]                   = useState('');
  const [verifying, setVerifying]         = useState(false);
  const [verifyError, setVerifyError]     = useState('');
  const [smsAvailable, setSmsAvailable]   = useState(true);

  const loadPhone = useCallback(async () => {
    try {
      const res = await fetch('/api/me/phone', { credentials: 'include' });
      const data = await res.json() as { phoneNumber?: string | null; phoneVerified?: boolean };
      setSavedPhone(data.phoneNumber ?? null);
      setPhoneVerified(data.phoneVerified ?? false);
      setEditPhone(data.phoneNumber ?? '');
    } catch { /* ignore */ } finally { setLoadingPhone(false); }
  }, []);

  useEffect(() => {
    loadPhone();
    fetch('/api/auth/sms-configured', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setSmsAvailable(d.configured ?? false))
      .catch(() => setSmsAvailable(false));
  }, [loadPhone]);

  async function handleSavePhone(e: React.FormEvent) {
    e.preventDefault();
    setSavePhoneError(''); setSavePhoneOk(false);
    if (!editPhone || editPhone === '+') { setSavePhoneError('Please enter a phone number.'); return; }
    setSavingPhone(true);
    try {
      const res = await fetch('/api/me/phone', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ phone: editPhone }) });
      const data = await res.json() as { ok?: boolean; error?: string; phoneNumber?: string };
      if (!res.ok) { setSavePhoneError(data.error ?? 'Failed to save phone number.'); }
      else { setSavePhoneOk(true); setSavedPhone(data.phoneNumber ?? editPhone); setPhoneVerified(false); setVerifyStep('idle'); setTimeout(() => setSavePhoneOk(false), 3000); }
    } catch { setSavePhoneError('Network error. Please try again.'); } finally { setSavingPhone(false); }
  }

  async function handleSendCode() {
    setSendError(''); setSendingCode(true);
    try {
      const res = await fetch('/api/auth/send-sms-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ phone: savedPhone }) });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setSendError(data.error ?? 'Failed to send code.'); }
      else { setVerifyStep('sent'); setCode(''); setVerifyError(''); }
    } catch { setSendError('Network error. Please try again.'); } finally { setSendingCode(false); }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError('');
    if (!code.trim()) { setVerifyError('Please enter the 6-digit code.'); return; }
    setVerifying(true);
    try {
      const res = await fetch('/api/auth/verify-sms-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ code: code.trim() }) });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setVerifyError(data.error ?? 'Verification failed.'); }
      else { setVerifyStep('done'); setPhoneVerified(true); }
    } catch { setVerifyError('Network error. Please try again.'); } finally { setVerifying(false); }
  }

  if (loadingPhone) return null;

  return (
    <div>
      <h2 className="font-bold text-base text-slate-800 mb-4 flex items-center gap-2"><Smartphone size={16} className="text-slate-400" />SMS Account Recovery</h2>
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
        <p className="text-sm text-slate-500 leading-relaxed">
          Add and verify your mobile number to recover your account via SMS if you lose access to your email.
          {!smsAvailable && <span className="block mt-1 text-amber-600 font-medium">SMS is not yet configured on this portal. Add your Twilio credentials in Settings to enable this feature.</span>}
        </p>
        <form onSubmit={handleSavePhone} className="flex flex-col gap-3">
          <label className={labelClass}><span className="flex items-center gap-1"><Phone size={11} /> Mobile Number</span></label>
          <div className="flex gap-2">
            <div className="flex-1">
              <PhoneInput
                value={editPhone}
                onChange={setEditPhone}
                disabled={savingPhone}
              />
            </div>
            <button type="submit" disabled={savingPhone || !editPhone || editPhone === savedPhone} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
              {savingPhone ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save
            </button>
          </div>
          {savePhoneError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{savePhoneError}</p>}
          {savePhoneOk && <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} />Phone number saved. Now verify it below.</p>}
        </form>
        {savedPhone && (
          <div className="border-t border-slate-100 pt-4">
            {phoneVerified && verifyStep !== 'sent' ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold"><BadgeCheck size={16} className="text-emerald-500" /><span>{savedPhone} — Verified</span></div>
                <button onClick={() => { setVerifyStep('idle'); setPhoneVerified(false); }} className="text-xs text-slate-600 hover:text-slate-800 flex items-center gap-1 transition-colors"><RefreshCw size={11} />Re-verify</button>
              </div>
            ) : verifyStep === 'done' ? (
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold"><BadgeCheck size={16} className="text-emerald-500" />Phone verified! You can now use SMS for account recovery.</div>
            ) : verifyStep === 'sent' ? (
              <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
                <p className="text-sm text-slate-600">A 6-digit code was sent to <span className="font-semibold text-slate-800">{savedPhone}</span>. Enter it below — expires in 10 minutes.</p>
                <div className="flex gap-2 items-center">
                  <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className={`${inputClass} tracking-[0.3em] text-center font-mono text-lg max-w-[160px]`} autoFocus />
                  <button type="submit" disabled={verifying || code.length !== 6} className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {verifying ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />}Verify
                  </button>
                  <button type="button" onClick={() => setVerifyStep('idle')} className="text-sm text-slate-600 hover:text-slate-800 px-3 transition-colors">Cancel</button>
                </div>
                {verifyError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{verifyError}</p>}
                <button type="button" onClick={handleSendCode} disabled={sendingCode} className="text-xs text-primary hover:text-violet-700 transition-colors self-start">Resend code</button>
              </form>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-600 text-sm"><AlertCircle size={14} /><span>{savedPhone} — Not verified</span></div>
                {sendError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{sendError}</p>}
                <button onClick={handleSendCode} disabled={sendingCode || !smsAvailable} className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors self-start">
                  {sendingCode ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}Send verification code
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
  mimeType?: string;
}

export default function MyAccountTab() {
  const { me, reload: reloadMe } = useMe();
  const isOwner = me?.profile?.role === 'owner';

  const [displayName, setDisplayName] = useState('');
  const [emailField, setEmailField]   = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileState, setProfileState]   = useState<'idle' | 'saved' | 'error'>('idle');
  const [profileError, setProfileError]   = useState('');

  useEffect(() => {
    if (me?.user) { setDisplayName(me.user.name ?? ''); setEmailField(me.user.email ?? ''); }
  }, [me?.user?.id]);

  // ── Licences / Notes / Emergency / Attachments ────────────────────────────
  const [whiteCardNumber, setWhiteCardNumber] = useState('');
  const [licenses,        setLicenses]        = useState('');
  const [notes,           setNotes]           = useState('');
  const [emergencyName,   setEmergencyName]   = useState('');
  const [emergencyPhone,  setEmergencyPhone]  = useState('');
  const [extrasSaving,    setExtrasSaving]    = useState(false);
  const [extrasState,     setExtrasState]     = useState<'idle' | 'saved' | 'error'>('idle');
  const [extrasError,     setExtrasError]     = useState('');

  const [attachments,  setAttachments]  = useState<Attachment[]>([]);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState('');
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [lightboxAtt,  setLightboxAtt]  = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/me/profile-extras', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { white_card_number?: string; licenses?: string; profile_notes?: string; emergency_contact_name?: string; emergency_contact_phone?: string; attachments?: Attachment[] }) => {
        setWhiteCardNumber(d.white_card_number ?? '');
        setLicenses(d.licenses ?? '');
        setNotes(d.profile_notes ?? '');
        setEmergencyName(d.emergency_contact_name ?? '');
        setEmergencyPhone(d.emergency_contact_phone ?? '');
        setAttachments(d.attachments ?? []);
      })
      .catch(() => {/* ignore */});
  }, []);

  async function handleExtrasSave(e: React.FormEvent) {
    e.preventDefault();
    setExtrasError(''); setExtrasState('idle');
    setExtrasSaving(true);
    try {
      const res = await fetch('/api/me/profile-extras', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ white_card_number: whiteCardNumber, licenses, profile_notes: notes, emergency_contact_name: emergencyName, emergency_contact_phone: emergencyPhone }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setExtrasError(data.error ?? 'Failed to save.'); setExtrasState('error'); }
      else { setExtrasState('saved'); setTimeout(() => setExtrasState('idle'), 3000); }
    } catch { setExtrasError('Network error.'); setExtrasState('error'); } finally { setExtrasSaving(false); }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachments.length >= 5) { setUploadError('Maximum 5 attachments allowed.'); return; }
    setUploadError(''); setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/me/profile-attachments', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json() as { ok?: boolean; attachments?: Attachment[]; error?: string };
      if (!res.ok) { setUploadError(data.error ?? 'Upload failed.'); }
      else { setAttachments(data.attachments ?? []); }
    } catch { setUploadError('Network error.'); } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteAttachment(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/me/profile-attachments/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json() as { ok?: boolean; attachments?: Attachment[]; error?: string };
      if (res.ok) setAttachments(data.attachments ?? []);
    } catch { /* ignore */ } finally { setDeletingId(null); }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(''); setProfileState('idle');
    const trimName = displayName.trim(); const trimEmail = emailField.trim();
    if (!trimName)  { setProfileError('Display name is required.'); return; }
    if (!trimEmail) { setProfileError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) { setProfileError('Please enter a valid email address.'); return; }
    setProfileSaving(true);
    try {
      const res = await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: trimName, email: trimEmail }) });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setProfileError(data.error ?? 'Failed to save profile.'); setProfileState('error'); }
      else { setProfileState('saved'); await reloadMe(); setTimeout(() => setProfileState('idle'), 3000); }
    } catch { setProfileError('Network error. Please try again.'); setProfileState('error'); } finally { setProfileSaving(false); }
  }

  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveState, setSaveState]     = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]       = useState('');

  const newPwError     = newPw     ? validateNewPassword(newPw)                       : null;
  const confirmPwError = confirmPw && newPw !== confirmPw ? 'Passwords do not match.' : null;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(''); setSaveState('idle');
    if (!currentPw.trim()) { setErrorMsg('Current password is required.'); return; }
    const pwErr = validateNewPassword(newPw);
    if (pwErr) { setErrorMsg(pwErr); return; }
    if (newPw !== confirmPw) { setErrorMsg('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/me/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) { setErrorMsg(data.error ?? 'Failed to change password.'); setSaveState('error'); }
      else { setSaveState('success'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setTimeout(() => setSaveState('idle'), 4000); }
    } catch { setErrorMsg('Network error. Please try again.'); setSaveState('error'); } finally { setSaving(false); }
  }

  const initials = (me?.user?.name ?? me?.user?.email ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4">Profile</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-black text-xl shrink-0">{initials}</div>
            <div>
              <div className="font-bold text-slate-900 text-base">{me?.user?.name ?? '—'}</div>
              <div className="text-sm text-slate-400">{me?.user?.email ?? '—'}</div>
              {me?.profile?.role && <div className="text-xs font-semibold text-primary capitalize mt-0.5">{me.profile.role}</div>}
            </div>
          </div>
          {isOwner ? (
            <p className="text-xs text-slate-500 mb-4 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">You can update your own account details here.</p>
          ) : (
            <p className="text-xs text-slate-400 mb-4">To update your name or email, contact your portal administrator.</p>
          )}
          {isOwner && (
            <form onSubmit={handleProfileSave} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Display Name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="Your full name" autoComplete="name" />
                </div>
                <div>
                  <label className={labelClass}><span className="flex items-center gap-1"><Mail size={11} /> Email</span></label>
                  <input type="email" value={emailField} onChange={(e) => setEmailField(e.target.value)} className={inputClass} placeholder="you@example.com" autoComplete="email" />
                </div>
              </div>
              {profileError && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"><AlertCircle size={13} />{profileError}</div>}
              {profileState === 'saved' && <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 font-semibold"><CheckCircle2 size={13} />Profile updated successfully.</div>}
              <div className="pt-1 border-t border-slate-100 flex justify-end">
                <button type="submit" disabled={profileSaving} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Profile
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <PhoneVerificationSection />

      {/* ── Licences + Notes + Emergency ─────────────────────────────── */}
      <form onSubmit={handleExtrasSave} className="flex flex-col gap-4">

        {/* Licences */}
        <div>
          <h2 className="font-bold text-base text-slate-800 mb-3 flex items-center gap-2">
            <FileText size={16} className="text-violet-400" />Licences
          </h2>
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
            <div>
              <label className={labelClass}>White Card Number</label>
              <input
                value={whiteCardNumber}
                onChange={(e) => setWhiteCardNumber(e.target.value)}
                placeholder="e.g. WC123456789"
                maxLength={100}
                className={inputClass}
              />
              <p className="text-xs text-slate-400 mt-1">Your Construction Induction (White Card) number</p>
            </div>
            <div>
              <label className={labelClass}>Other licences &amp; details</label>
              <textarea
                value={licenses}
                onChange={(e) => setLicenses(e.target.value)}
                rows={3}
                placeholder="e.g. Builder's Licence: BLD123456, Forklift: FL789, EWP..."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h2 className="font-bold text-base text-slate-800 mb-3 flex items-center gap-2">
            <User size={16} className="text-blue-400" />Notes
          </h2>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any personal notes..."
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {/* Emergency Contact */}
        <div>
          <h2 className="font-bold text-base text-slate-800 mb-3 flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-400" />Emergency Contact
          </h2>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Contact Name</label>
                <input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Full name" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}><span className="flex items-center gap-1"><Phone size={11} />Contact Number</span></label>
                <input type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+61 4xx xxx xxx" className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {extrasError && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"><AlertCircle size={13} />{extrasError}</div>}
        {extrasState === 'saved' && <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 font-semibold"><CheckCircle2 size={13} />Details saved.</div>}
        <div className="flex justify-end">
          <button type="submit" disabled={extrasSaving} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {extrasSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Details
          </button>
        </div>
      </form>

      {/* ── Attachments ──────────────────────────────────────────────── */}
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-3 flex items-center gap-2">
          <Paperclip size={16} className="text-slate-400" />Licence Attachments
          <span className="text-xs font-normal text-slate-400">({attachments.length}/5)</span>
          {attachments.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? 'Uploading…' : 'Add File'}
            </button>
          )}
        </h2>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-4">Upload copies of your licences and cards — always have them on hand when on site.</p>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          {uploadError && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={12} />{uploadError}
            </div>
          )}
          {attachments.length === 0 ? (
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={24} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No attachments yet</p>
              <p className="text-xs text-slate-300 mt-1">Click to upload — up to 5 files, 10 MB each</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {attachments.map((att) => {
                const isImage = att.mimeType?.startsWith('image/') ?? false;
                return (
                  <div key={att.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setLightboxAtt(att)}
                        className="relative shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-violet-400 transition-all group"
                        title="View image"
                      >
                        <img
                          src={`/api/me/profile-attachments/${att.id}/thumbnail`}
                          alt={att.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                          <ZoomIn size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ) : (
                      <div className="shrink-0 w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center">
                        <FileText size={20} className="text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{att.filename}</p>
                      <p className="text-xs text-slate-400">{formatBytes(att.size)} · {new Date(att.uploadedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <a
                      href={`/api/me/profile-attachments/${att.id}/download`}
                      download={att.filename}
                      className="text-slate-600 hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-slate-200"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id)}
                      disabled={deletingId === att.id}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === att.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                );
              })}
              {attachments.length < 5 && (
                <p className="text-xs text-slate-400 text-center pt-2">{5 - attachments.length} slot{5 - attachments.length !== 1 ? 's' : ''} remaining</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="font-bold text-base text-slate-800 mb-4 flex items-center gap-2"><KeyRound size={16} className="text-slate-400" />Change Password</h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4" autoComplete="off">
            <div>
              <label className={labelClass}>Current Password</label>
              <div className="relative">
                <input type={showCurrent ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" placeholder="Enter your current password" className={`${inputClass} pr-10`} />
                <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800 transition-colors" tabIndex={-1}>{showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
            </div>
            <div>
              <label className={labelClass}>New Password</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder="Min 8 chars, 1 number, 1 symbol" className={`${inputClass} pr-10 ${newPwError ? 'border-red-300 focus:ring-red-200 focus:border-red-400' : ''}`} />
                <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800 transition-colors" tabIndex={-1}>{showNew ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              {newPwError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} />{newPwError}</p>}
              <StrengthBar password={newPw} />
            </div>
            <div>
              <label className={labelClass}>Confirm New Password</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" placeholder="Re-enter new password" className={`${inputClass} pr-10 ${confirmPwError ? 'border-red-300 focus:ring-red-200 focus:border-red-400' : confirmPw && !confirmPwError ? 'border-emerald-300 focus:ring-emerald-200 focus:border-emerald-400' : ''}`} />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800 transition-colors" tabIndex={-1}>{showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              {confirmPwError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} />{confirmPwError}</p>}
              {confirmPw && !confirmPwError && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 size={11} />Passwords match</p>}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 flex flex-col gap-1">
              <p className="font-semibold text-slate-600 mb-1">Password requirements:</p>
              <RequirementRow met={newPw.length >= 8}          label="At least 8 characters" />
              <RequirementRow met={/\d/.test(newPw)}           label="At least one number" />
              <RequirementRow met={/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPw)} label="At least one symbol" />
              <RequirementRow met={newPw.length > 0 && newPw === confirmPw} label="Passwords match" />
            </div>
            {errorMsg && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"><AlertCircle size={13} />{errorMsg}</div>}
            {saveState === 'success' && <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 font-semibold"><CheckCircle2 size={13} />Password changed successfully. You're still logged in.</div>}
            <div className="pt-1 border-t border-slate-100 flex justify-end">
              <button type="submit" disabled={saving || !!newPwError || !!confirmPwError || !currentPw || !newPw || !confirmPw} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}Update Password
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Two-Factor Authentication ─────────────────────────────────── */}
      <div>
        <AppLockSettings userEmail={me?.user?.email ?? ''} />
        <SecurityTab />
      </div>

      {/* ── Image Lightbox ───────────────────────────────────────────── */}
      {lightboxAtt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxAtt(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="w-full flex items-center justify-between bg-black/60 rounded-t-xl px-4 py-2.5">
              <p className="text-white text-sm font-medium truncate max-w-[calc(100%-80px)]">{lightboxAtt.filename}</p>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/me/profile-attachments/${lightboxAtt.id}/download`}
                  download={lightboxAtt.filename}
                  className="text-white/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                  title="Download"
                >
                  <Download size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxAtt(null)}
                  className="text-white/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Image */}
            <div className="bg-black rounded-b-xl overflow-hidden flex items-center justify-center max-h-[80vh] w-full">
              <img
                src={`/api/me/profile-attachments/${lightboxAtt.id}/thumbnail`}
                alt={lightboxAtt.filename}
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

