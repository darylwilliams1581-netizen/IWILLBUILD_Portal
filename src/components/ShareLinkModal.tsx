/**
 * ShareLinkModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a secure share link for any target (job file, form, SWMS, fleet, etc.)
 * Shows the raw link + QR code ONCE after creation.
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Copy, Check, Link2, ShieldCheck } from 'lucide-react';
import ShareQrPanel from './ShareQrPanel';

export type LinkType =
  | 'file_transfer'
  | 'form_completion'
  | 'swms_signon'
  | 'fleet_prestart'
  | 'document_view'
  | 'general';

export interface ShareLinkTarget {
  type: string;       // e.g. 'job', 'fleet', 'form', 'swms', 'document'
  id: string;         // target record id
  title: string;      // human-readable label
  linkType: LinkType;
  defaultPermissions?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  target: ShareLinkTarget;
}

const PERMISSION_OPTIONS = [
  { value: 'view',            label: 'View' },
  { value: 'download',        label: 'Download' },
  { value: 'upload',          label: 'Upload' },
  { value: 'complete_form',   label: 'Complete form' },
  { value: 'sign',            label: 'Sign' },
];

const FILE_TYPE_OPTIONS = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx', 'csv', 'zip'];

export default function ShareLinkModal({ open, onClose, target }: Props) {
  const [step, setStep] = useState<'form' | 'created'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState(target.title);
  const [permissions, setPermissions] = useState<string[]>(
    target.defaultPermissions ?? ['view'],
  );
  const [expiryDays, setExpiryDays] = useState<string>('30');
  const [password, setPassword] = useState('');
  const [maxUses, setMaxUses] = useState<string>('');
  const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
  const [maxSizeMb, setMaxSizeMb] = useState<string>('50');

  // Created state
  const [createdLink, setCreatedLink] = useState<{
    id: number;
    publicUrl: string;
    rawToken: string;
    permissions: string[];
    expires_at: string | null;
  } | null>(null);

  function togglePermission(p: string) {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function toggleFileType(t: string) {
    setAllowedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return; }
    if (permissions.length === 0) { setError('Select at least one permission'); return; }

    setLoading(true);
    setError(null);

    const expiresAt = expiryDays && expiryDays !== 'never'
      ? new Date(Date.now() + parseInt(expiryDays, 10) * 86400000).toISOString()
      : null;

    try {
      const res = await fetch('/api/share-links', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link_type: target.linkType,
          target_type: target.type,
          target_id: target.id,
          title: title.trim(),
          permissions,
          expires_at: expiresAt,
          password: password.trim() || undefined,
          max_uses: maxUses ? parseInt(maxUses, 10) : null,
          allowed_file_types: allowedTypes.length > 0 ? allowedTypes : undefined,
          max_file_size_mb: maxSizeMb ? parseInt(maxSizeMb, 10) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create link');

      setCreatedLink({
        id: data.id,
        publicUrl: data.publicUrl,
        rawToken: data.rawToken,
        permissions: data.permissions,
        expires_at: data.expires_at,
      });
      setStep('created');
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep('form');
    setCreatedLink(null);
    setError(null);
    setPassword('');
    onClose();
  }

  const showFileOptions = permissions.includes('upload');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-orange-500" />
            {step === 'form' ? 'Create Secure Share Link' : 'Link Created'}
          </DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1">
              <Label>Link title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Upload files for Job 001"
              />
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-2">
                {PERMISSION_OPTIONS.map((p) => (
                  <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={permissions.includes(p.value)}
                      onCheckedChange={() => togglePermission(p.value)}
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* File upload options */}
            {showFileOptions && (
              <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/30">
                <p className="text-sm font-medium text-muted-foreground">Upload rules</p>

                <div className="space-y-1">
                  <Label className="text-xs">Allowed file types (leave blank = all)</Label>
                  <div className="flex flex-wrap gap-2">
                    {FILE_TYPE_OPTIONS.map((t) => (
                      <label key={t} className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={allowedTypes.includes(t)}
                          onCheckedChange={() => toggleFileType(t)}
                        />
                        <span className="text-xs uppercase">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Max file size (MB)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={maxSizeMb}
                    onChange={(e) => setMaxSizeMb(e.target.value)}
                    className="w-28"
                  />
                </div>
              </div>
            )}

            {/* Expiry */}
            <div className="space-y-1">
              <Label>Expiry</Label>
              <Select value={expiryDays} onValueChange={setExpiryDays}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="never">No expiry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max uses */}
            <div className="space-y-1">
              <Label>Max uses (blank = unlimited)</Label>
              <Input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
                className="w-36"
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label>Password / PIN (optional)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {step === 'created' && createdLink && (
          <ShareQrPanel
            publicUrl={createdLink.publicUrl}
            title={title}
            permissions={createdLink.permissions}
            expiresAt={createdLink.expires_at}
            shareLinkId={createdLink.id}
          />
        )}

        <DialogFooter>
          {step === 'form' ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Create Link
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
