/**
 * ElecRetestModal — Create a linked retest from a failed/review record.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  recordId: number;
  assetId: string;
  onClose: () => void;
  onCreated: (newId: number) => void;
}

export default function ElecRetestModal({ recordId, assetId, onClose, onCreated }: Props) {
  const [correctiveWork, setCorrectiveWork] = useState('');
  const [testerName, setTesterName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const resp = await fetch(`/api/electrical-tests/${recordId}/retest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctiveWork, testerName }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to create retest');
      }
      const data = await resp.json();
      onCreated(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create retest');
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-md md:rounded-xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 md:rounded-t-xl">
          <div>
            <h2 className="font-semibold text-gray-900">Create Retest</h2>
            <p className="text-xs text-gray-500">Asset: {assetId}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            A new test record will be created linked to the original. The original result and photos are preserved.
          </p>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Corrective Work Performed</Label>
            <Textarea value={correctiveWork} onChange={e => setCorrectiveWork(e.target.value)} rows={3} placeholder="Describe what was done before retesting…" />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Tester Name (optional)</Label>
            <Input value={testerName} onChange={e => setTesterName(e.target.value)} placeholder="Defaults to your name" />
          </div>
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex gap-3 justify-end md:rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Retest'}</Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
