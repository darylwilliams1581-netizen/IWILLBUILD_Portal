/**
 * ShareLinkModal — Create a secure share / QR link for any target.
 * ─────────────────────────────────────────────────────────────────────────────
 * Supports: file_transfer, document_view, swms_signon, form_complete
 * After creation shows the ShareQrPanel with copy/QR/print/revoke.
 */
import { useState } from 'react';
import { X, Link2, Shield, Clock, Key, Hash, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ShareQrPanel from '@/components/ShareQrPanel';

export interface ShareTarget {
  type: string;
  id: string;
  title: string;
  linkType: string;
  defaultPermissions: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
}

const PERMISSION_LABELS: Record<string, string> = {
  view: 'View',
  download: 'Download',
  upload: 'Upload files',
  sign: 'Sign / submit',
  print: 'Print',
};

const EXPIRY_OPTIONS = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'No expiry', days: 0 },
];

export default function ShareLinkModal({ open, onClose, target }: Props) {
  const [step, setStep] = useState<'create' | 'created'>('create');
  const [title, setTitle] = useState(target.title);
  const [permissions, setPermissions] = useState<Set<string>>(new Set(target.defaultPermissions));
  const [expiryDays, setExpiryDays] = useState(30);
  const [password, setPassword] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdLink, setCreatedLink] = useState<{
    token: string; shareUrl: string; id: number; expiresAt: string | null;
  } | null>(null);

  if (!open) return null;

  function togglePermission(p: string) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  async function handleCreate() {
    if (permissions.size === 0) {
      setError('Select at least one permission.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/secure-share', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || target.title,
          linkType: target.linkType,
          targetType: target.type,
          targetId: target.id,
          permissions: [...permissions],
          expiryDays: expiryDays > 0 ? expiryDays : undefined,
          password: password.trim() || undefined,
          maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
        }),
      });
      const data = await res.json() as {
        ok?: boolean; token?: string; shareUrl?: string; id?: number;
        expiresAt?: string | null; error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed to create link');
      setCreatedLink({
        token: data.token!,
        shareUrl: data.shareUrl!,
        id: data.id!,
        expiresAt: data.expiresAt ?? null,
      });
      setStep('created');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Link2 size={16} className="text-orange-600" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-sm text-slate-800">
                {step === 'create' ? 'Create Secure Link' : 'Link Created'}
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[220px]">{target.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {step === 'create' && (
          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Title */}
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">Link title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Site access — Smith Residence"
                className="h-9 text-sm"
              />
            </div>

            {/* Permissions */}
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1.5 block flex items-center gap-1">
                <Shield size={11} /> Permissions
              </Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => togglePermission(key)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                      permissions.has(key)
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry */}
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1.5 block flex items-center gap-1">
                <Clock size={11} /> Expiry
              </Label>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setExpiryDays(opt.days)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                      expiryDays === opt.days
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Password (optional) */}
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1.5 block flex items-center gap-1">
                <Key size={11} /> Password <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password"
                className="h-9 text-sm"
                autoComplete="new-password"
              />
            </div>

            {/* Max uses (optional) */}
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1.5 block flex items-center gap-1">
                <Hash size={11} /> Max uses <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Input
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
                className="h-9 text-sm w-32"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onClose} className="flex-1 h-9">
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={creating} className="flex-1 h-9 gap-1.5">
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                Create Link
              </Button>
            </div>
          </div>
        )}

        {step === 'created' && createdLink && (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-4 text-emerald-600">
              <CheckCircle2 size={16} />
              <span className="text-sm font-semibold">Link created successfully</span>
            </div>
            <ShareQrPanel
              shareUrl={createdLink.shareUrl}
              linkId={createdLink.id}
              title={title || target.title}
              expiresAt={createdLink.expiresAt}
              onRevoked={onClose}
            />
            <Button variant="outline" size="sm" onClick={onClose} className="w-full mt-4 h-9">
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
