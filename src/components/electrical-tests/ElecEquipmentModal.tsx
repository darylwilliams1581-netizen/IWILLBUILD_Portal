/**
 * ElecEquipmentModal — Add / Edit test equipment register entry.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isCalibrationExpired } from '@/lib/electrical-test-calc';

interface Equipment {
  id?: number;
  owner?: string | null;
  equipment_type?: string;
  make_model?: string;
  serial_number?: string | null;
  calibration_date?: string | null;
  calibration_expiry?: string | null;
}

interface Props {
  equipment?: Equipment | null;
  onClose: () => void;
  onSaved: () => void;
}

const EQUIPMENT_TYPES = ['Earth Continuity Tester', 'Insulation Resistance Tester', 'Multimeter', 'Clamp Meter', 'Power Quality Analyser', 'Micro-ohmmeter', 'Other'];

export default function ElecEquipmentModal({ equipment, onClose, onSaved }: Props) {
  const isEdit = !!equipment?.id;
  const [owner, setOwner] = useState(equipment?.owner ?? '');
  const [equipmentType, setEquipmentType] = useState(equipment?.equipment_type ?? '');
  const [makeModel, setMakeModel] = useState(equipment?.make_model ?? '');
  const [serialNumber, setSerialNumber] = useState(equipment?.serial_number ?? '');
  const [calibrationDate, setCalibrationDate] = useState(equipment?.calibration_date ?? '');
  const [calibrationExpiry, setCalibrationExpiry] = useState(equipment?.calibration_expiry ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const expired = isCalibrationExpired(calibrationExpiry || null);

  async function handleSave() {
    if (!makeModel.trim()) { setError('Make / model is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body = { owner, equipmentType, makeModel, serialNumber, calibrationDate, calibrationExpiry };
      const url = isEdit ? `/api/electrical-test-equipment/${equipment!.id}` : '/api/electrical-test-equipment';
      const method = isEdit ? 'PUT' : 'POST';
      const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error ?? 'Save failed');
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4">
      <div className="bg-white w-full md:max-w-lg md:rounded-xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 md:rounded-t-xl">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit Equipment' : 'Add Equipment'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Make / Model *</Label>
            <Input value={makeModel} onChange={e => setMakeModel(e.target.value)} placeholder="e.g. Megger DLRO10X" />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Equipment Type</Label>
            <select value={equipmentType} onChange={e => setEquipmentType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Select…</option>
              {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Serial Number / Asset ID</Label>
              <Input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="e.g. SN12345" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Owner</Label>
              <Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Company / contractor" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Calibration Date</Label>
              <Input type="date" value={calibrationDate} onChange={e => setCalibrationDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Calibration Expiry</Label>
              <Input type="date" value={calibrationExpiry} onChange={e => setCalibrationExpiry(e.target.value)} />
            </div>
          </div>
          {expired && (
            <div className="flex gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>Calibration has expired. Update the calibration expiry date after recalibration.</span>
            </div>
          )}
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 flex gap-3 justify-end md:rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Equipment'}</Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
