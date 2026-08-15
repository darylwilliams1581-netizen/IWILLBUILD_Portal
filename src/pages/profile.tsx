/**
 * /profile — Standalone full-page user profile
 * Includes: account details, licenses, notes, emergency contact, attachments (up to 5)
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle,
  FileText, Phone, User, Paperclip, Trash2, Download,
  ShieldAlert, Upload, Lock, Eye, EyeOff, KeyRound,
  Smartphone, X,
} from 'lucide-react';
import { useMe } from '@/lib/usePermissions';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import SecurityTab from '@/components/settings/SecurityTab';
import InstallAppTab from '@/components/settings/InstallAppTab';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

const inputClass = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

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
}

function validateNewPassword(pw: string): string | null {
  if (pw.length < 8)  return 'At least 8 characters required.';
  if (!/\d/.test(pw)) return 'Must include at least one number.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) return 'Must include at least one symbol.';
  return null;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { me, reload: reloadMe } = useMe();

  // ── Account fields ────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [emailField,  setEmailField]  = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileState,  setProfileState]  = useState<'idle' | 'saved' | 'error'>('idle');
  const [profileError,  setProfileError]  = useState('');

  // ── Extended fields ───────────────────────────────────────────────────────
  const [whiteCardNumber, setWhiteCardNumber] = useState('');
  const [licenses,        setLicenses]        = useState('');
  const [notes,           setNotes]           = useState('');
  const [emergencyName,   setEmergencyName]   = useState('');
  const [emergencyPhone,  setEmergencyPhone]  = useState('');
  const [extrasSaving,   setExtrasSaving]   = useState(false);
  const [extrasState,    setExtrasState]    = useState<'idle' | 'saved' | 'error'>('idle');
  const [extrasError,    setExtrasError]    = useState('');

  // ── Attachments ───────────────────────────────────────────────────────────
  const [attachments,    setAttachments]    = useState<Attachment[]>([]);
  const [uploadError,    setUploadError]    = useState('');
  const [deletingId,     setDeletingId]     = useState<string | null>(null);

  const attachQ = useUploadQueue({
    endpoint: '/api/me/profile-attachments',
    fieldName: 'file',
    accept: '*/*',
    multiple: false,
    onSuccess: (results) => {
      const resp = results[0]?.response as { attachments?: Attachment[] } | undefined;
      if (resp?.attachments) setAttachments(resp.attachments);
    },
    onError: (_id, msg) => setUploadError(msg),
    validate: () => {
      if (attachments.length >= 5) return 'Maximum 5 attachments allowed.';
      return null;
    },
  });
  const uploading = attachQ.isUploading;
  const fileInputRef = attachQ.inputRef;

  // ── Install modal ────────────────────────────────────────────────────────
  const [installOpen, setInstallOpen] = useState(false);

  // ── Password ──────────────────────────────────────────────────────────────
  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSaving,    setPwSaving]    = useState(false);
  const [pwState,     setPwState]     = useState<'idle' | 'success' | 'error'>('idle');
  const [pwError,     setPwError]     = useState('');

  const newPwError     = newPw     ? validateNewPassword(newPw)                       : null;
  const confirmPwError = confirmPw && newPw !== confirmPw ? 'Passwords do not match.' : null;

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (me?.user) {
      setDisplayName(me.user.name ?? '');
      setEmailField(me.user.email ?? '');
    }
  }, [me?.user?.id]);

  useEffect(() => {
    fetch('/api/me/profile-extras', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { licenses?: string; white_card_number?: string; profile_notes?: string; emergency_contact_name?: string; emergency_contact_phone?: string; attachments?: Attachment[] }) => {
        setWhiteCardNumber(d.white_card_number ?? '');
        setLicenses(d.licenses ?? '');
        setNotes(d.profile_notes ?? '');
        setEmergencyName(d.emergency_contact_name ?? '');
        setEmergencyPhone(d.emergency_contact_phone ?? '');
        setAttachments(d.attachments ?? []);
      })
      .catch(() => {/* ignore */});
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
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
    } catch { setProfileError('Network error.'); setProfileState('error'); } finally { setProfileSaving(false); }
  }

  async function handleExtrasSave(e: React.FormEvent) {
    e.preventDefault();
    setExtrasError(''); setExtrasState('idle');
    setExtrasSaving(true);
    try {
      const res = await fetch('/api/me/profile-extras', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ licenses, white_card_number: whiteCardNumber, profile_notes: notes, emergency_contact_name: emergencyName, emergency_contact_phone: emergencyPhone }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setExtrasError(data.error ?? 'Failed to save.'); setExtrasState('error'); }
      else { setExtrasState('saved'); setTimeout(() => setExtrasState('idle'), 3000); }
    } catch { setExtrasError('Network error.'); setExtrasState('error'); } finally { setExtrasSaving(false); }
  }



  async function handleDeleteAttachment(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/me/profile-attachments/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json() as { ok?: boolean; attachments?: Attachment[]; error?: string };
      if (res.ok) setAttachments(data.attachments ?? []);
    } catch { /* ignore */ } finally { setDeletingId(null); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwState('idle');
    if (!currentPw.trim()) { setPwError('Current password is required.'); return; }
    const err = validateNewPassword(newPw);
    if (err) { setPwError(err); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwSaving(true);
    try {
      const res = await fetch('/api/me/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setPwError(data.error ?? 'Failed to change password.'); setPwState('error'); }
      else { setPwState('success'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setTimeout(() => setPwState('idle'), 4000); }
    } catch { setPwError('Network error.'); setPwState('error'); } finally { setPwSaving(false); }
  }

  const initials = (me?.user?.name ?? me?.user?.email ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const isOwner = me?.profile?.role === 'owner';

  return (
    <div className="flex-1 bg-gray-50 flex flex-col lg:pt-[116px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>My Profile — IWILLBUILD Portal</title>
        <meta name="description" content="Manage your profile, licences, emergency contact and security settings." />
        <link rel="canonical" href="https://iwillbuild.com/profile" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <h1 className="sr-only">My Profile</h1>

      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 safe-top">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Home</span>
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-sm font-semibold text-gray-800">My Profile</span>

        {/* Right side — user name + install button */}
        <div className="ml-auto flex items-center gap-2">
          {me?.user?.name && (
            <span className="hidden sm:block text-sm text-slate-500 font-medium truncate max-w-[160px]">
              {me.user.name}
            </span>
          )}
          <button
            onClick={() => setInstallOpen(true)}
            title="Install App on your device"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-primary hover:bg-violet-50 border border-slate-200 hover:border-violet-200 transition-colors"
          >
            <Smartphone size={14} />
            <span className="hidden sm:inline">Install App</span>
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full flex flex-col gap-6">

        {/* ── Profile card ─────────────────────────────────────────────── */}
        <section>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            {/* Avatar + name */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-black text-2xl shrink-0">
                {initials}
              </div>
              <div>
                <div className="font-bold text-slate-900 text-lg leading-tight">{me?.user?.name ?? '—'}</div>
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
              <p className="text-xs text-slate-400 mb-4">To update your name or email, contact your portal administrator.</p>
            )}

            {isOwner && (
              <form onSubmit={handleProfileSave} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Display Name</label>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="Your full name" />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input type="email" value={emailField} onChange={(e) => setEmailField(e.target.value)} className={inputClass} placeholder="you@example.com" />
                  </div>
                </div>
                {profileError && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"><AlertCircle size={13} />{profileError}</div>}
                {profileState === 'saved' && <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 font-semibold"><CheckCircle2 size={13} />Profile updated.</div>}
                <div className="flex justify-end border-t border-slate-100 pt-3">
                  <button type="submit" disabled={profileSaving} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
                    {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Profile
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        {/* ── Licenses + Notes + Emergency ─────────────────────────────── */}
        <section>
          <form onSubmit={handleExtrasSave} className="flex flex-col gap-4">

            {/* Licenses */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                <FileText size={15} className="text-violet-400" />Licences
              </h2>
              <div className="flex flex-col gap-4">
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
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                <User size={15} className="text-blue-400" />Notes
              </h2>
              <label className={labelClass}>Personal notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any notes about this team member..."
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Emergency Contact */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                <ShieldAlert size={15} className="text-red-400" />Emergency Contact
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Contact Name</label>
                  <input
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="Full name"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}><span className="flex items-center gap-1"><Phone size={11} />Contact Number</span></label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="+61 4xx xxx xxx"
                    className={inputClass}
                  />
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
        </section>

        {/* ── Attachments ──────────────────────────────────────────────── */}
        <section>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Paperclip size={15} className="text-slate-400" />Attachments
                <span className="text-xs font-normal text-slate-400">({attachments.length}/5)</span>
              </h2>
              {attachments.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploading ? 'Uploading…' : 'Add File'}
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={attachQ.handleInputChange} />

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
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <FileText size={16} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{att.filename}</p>
                      <p className="text-xs text-slate-400">{formatBytes(att.size)} · {new Date(att.uploadedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <a href={att.url} download={att.filename} className="text-slate-600 hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-slate-200">
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
                ))}
                {attachments.length < 5 && (
                  <p className="text-xs text-slate-400 text-center pt-1">{5 - attachments.length} slot{5 - attachments.length !== 1 ? 's' : ''} remaining</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Change Password ───────────────────────────────────────────── */}
        <section>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
              <KeyRound size={15} className="text-slate-400" />Change Password
            </h2>
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
                  <input type={showNew ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder="Min 8 chars, 1 number, 1 symbol" className={`${inputClass} pr-10 ${newPwError ? 'border-red-300' : ''}`} />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800 transition-colors" tabIndex={-1}>{showNew ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
                {newPwError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} />{newPwError}</p>}
              </div>
              <div>
                <label className={labelClass}>Confirm New Password</label>
                <div className="relative">
                  <input type={showConfirm ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" placeholder="Re-enter new password" className={`${inputClass} pr-10 ${confirmPwError ? 'border-red-300' : confirmPw && !confirmPwError ? 'border-emerald-300' : ''}`} />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800 transition-colors" tabIndex={-1}>{showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
                {confirmPwError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} />{confirmPwError}</p>}
                {confirmPw && !confirmPwError && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 size={11} />Passwords match</p>}
              </div>
              {pwError && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"><AlertCircle size={13} />{pwError}</div>}
              {pwState === 'success' && <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 font-semibold"><CheckCircle2 size={13} />Password changed successfully.</div>}
              <div className="flex justify-end border-t border-slate-100 pt-3">
                <button type="submit" disabled={pwSaving || !!newPwError || !!confirmPwError || !currentPw || !newPw || !confirmPw} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
                  {pwSaving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}Update Password
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ── Two-Factor Authentication ─────────────────────────────────── */}
        <section>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <SecurityTab />
          </div>
        </section>

      </div>

      {/* ── Install App modal ───────────────────────────────────────────── */}
      {installOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setInstallOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
                <Smartphone size={16} className="text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-slate-900 text-base leading-tight">Install App</h2>
                <p className="text-xs text-slate-400 mt-0.5">Add IWILLBUILD to your home screen</p>
              </div>
              <button
                onClick={() => setInstallOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 p-5">
              <InstallAppTab />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
