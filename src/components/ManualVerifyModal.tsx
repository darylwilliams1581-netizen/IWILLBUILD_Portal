/**
 * ManualVerifyModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Confirmation dialog for the Owner Console "Verify manually" action.
 * Shows a warning, requires explicit confirmation, then calls the API.
 * On success fires onVerified(userId) so the parent can update local state
 * without a full page reload.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  /** The user to verify */
  user: { id: string; name: string; email: string } | null;
  /** Called when the dialog should close (cancel or after success) */
  onClose: () => void;
  /** Called after a successful verification with the verified userId */
  onVerified: (userId: string) => void;
}

export default function ManualVerifyModal({ user, onClose, onVerified }: Props) {
  const [loading, setLoading] = useState(false);

  const open = !!user;

  async function handleConfirm() {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/owner-console/users/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Verification failed. Please try again.');
        return;
      }

      toast.success('User manually verified.', {
        description: `${user.name} (${user.email}) can now log in.`,
      });
      onVerified(user.id);
      onClose();
    } catch {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <ShieldCheck size={18} className="text-amber-600" />
            </div>
            <DialogTitle className="text-base font-bold text-slate-900">
              Manually verify this user?
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              {/* Warning banner */}
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Only do this if you know this person and their email verification is blocked.
                  This action is logged with your account details and a timestamp.
                </p>
              </div>

              {/* User detail */}
              {user && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">Verifying</p>
                  <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={loading}
            className="flex-1 sm:flex-none bg-primary hover:bg-violet-700 text-white font-bold"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheck size={14} className="mr-2" />
                Verify manually
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
