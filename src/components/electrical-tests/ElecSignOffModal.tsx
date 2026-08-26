/**
 * ElecSignOffModal — Submit / Accept / Reject / Override a test record.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Action = 'submit' | 'accept' | 'reject' | 'override';

interface Props {
  recordId: number;
  currentStatus: string;
  currentResult: string;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ElecSignOffModal({ recordId, currentStatus, currentResult, isAdmin, onClose, onSaved }: Props) {
  const [action, setAction] = useState<Action>(() => {
    if (currentStatus === 'draft' || currentStatus === 'review_required') return 'submit';
    if (currentStatus === 'submitted' && isAdmin) return 'accept';
    return 'submit';
  });
  const [note, setNote] = useState('');
  const [checkedByName, setCheckedByName] = useState('');
  const [overrideJustification, setOverrideJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const availableActions: Action[] = [];
  if (currentStatus === 'draft' || currentStatus === 'review_required') availableActions.push('submit');
  if (currentStatus === 'submitted' && isAdmin) { availableActions.push('accept'); availableActions.push('reject'); }
  if (isAdmin) availableActions.push('override');

  async function handleSave() {
    if (action === 'override' && !overrideJustification.trim()) {
      setError('Supervisor override requires a justification');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const resp = await fetch(`/api/electrical-tests/${recordId}/sign-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note, checkedByName, overrideJustification }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error ?? 'Sign-off failed');
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-off failed');
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-md md:rounded-xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 md:rounded-t-xl">
          <h2 className="font-semibold text-gray-900">Sign-off</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Action</Label>
            <div className="flex flex-wrap gap-2">
              {availableActions.map(a => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${action === a ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {a === 'submit' ? 'Submit for Review' : a === 'accept' ? 'Accept' : a === 'reject' ? 'Reject / Review Required' : 'Supervisor Override'}
                </button>
              ))}
            </div>
          </div>

          {action === 'accept' && (
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Checked By (optional)</Label>
              <Input value={checkedByName} onChange={e => setCheckedByName(e.target.value)} placeholder="Name of checker" />
            </div>
          )}

          {action === 'reject' && (
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Reason for Rejection</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Describe what needs to be corrected…" />
            </div>
          )}

          {action === 'override' && (
            <>
              <div className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>Supervisor override is recorded in the immutable audit trail. A justification is mandatory.</span>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Override Justification *</Label>
                <Textarea value={overrideJustification} onChange={e => setOverrideJustification(e.target.value)} rows={3} placeholder="Mandatory — describe the reason for override…" />
              </div>
            </>
          )}

          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex gap-3 justify-end md:rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || availableActions.length === 0}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
