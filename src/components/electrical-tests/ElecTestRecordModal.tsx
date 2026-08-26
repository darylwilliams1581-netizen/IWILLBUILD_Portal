/**
 * ElecTestRecordModal — New / Edit test record.
 * Sections: Job Details, Test Identification, Test Template, Test Result, Equipment, Photos.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp, Camera, Upload, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  BUILTIN_TEMPLATES, assessTestRecord, resultBadgeClass, conditionBadgeClass,
  isCalibrationExpired, formatAuDateTime,
} from '@/lib/electrical-test-calc';

interface Equipment {
  id: number;
  owner: string | null;
  equipment_type: string;
  make_model: string;
  serial_number: string | null;
  calibration_expiry: string | null;
  calibrationExpired: boolean;
}

interface Props {
  jobId: number;
  jobName: string;
  record?: Record<string, unknown> | null;
  equipment: Equipment[];
  onClose: () => void;
  onSaved: () => void;
}

const PHASES = ['A', 'B', 'C', 'Neutral', 'Earth', 'N/A'];
const WORK_TYPES = [
  { value: 'new_installation', label: 'New Installation' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'retest', label: 'Retest' },
];
const UNITS = ['Ω', 'mΩ', 'µΩ', 'MΩ', 'V', 'A', 'kV', 'mA', 'W', 'kW', '%', 'custom'];

export default function ElecTestRecordModal({ jobId, jobName, record, equipment, onClose, onSaved }: Props) {
  const isEdit = !!record;

  const [templateId, setTemplateId] = useState(String(record?.['template_id'] ?? 'earth_continuity'));
  const [assetId, setAssetId] = useState(String(record?.['asset_id'] ?? ''));
  const [circuitFeeder, setCircuitFeeder] = useState(String(record?.['circuit_feeder'] ?? ''));
  const [phase, setPhase] = useState(String(record?.['phase'] ?? ''));
  const [jointDescription, setJointDescription] = useState(String(record?.['joint_description'] ?? ''));
  const [referenceTestPoint, setReferenceTestPoint] = useState(String(record?.['reference_test_point'] ?? ''));
  const [drawingReference, setDrawingReference] = useState(String(record?.['drawing_reference'] ?? ''));
  const [workType, setWorkType] = useState(String(record?.['work_type'] ?? 'new_installation'));
  const [location, setLocation] = useState(String(record?.['location'] ?? ''));
  const [workOrderRef, setWorkOrderRef] = useState(String(record?.['work_order_ref'] ?? ''));

  const [measuredValue, setMeasuredValue] = useState(record?.['measured_value'] != null ? String(record['measured_value']) : '');
  const [unit, setUnit] = useState(String(record?.['unit'] ?? ''));
  const [customUnit, setCustomUnit] = useState('');
  const [testCurrentVoltage, setTestCurrentVoltage] = useState(String(record?.['test_current_voltage'] ?? ''));
  const [ambientTemp, setAmbientTemp] = useState(record?.['ambient_temp'] != null ? String(record['ambient_temp']) : '');
  const [minAccept, setMinAccept] = useState(record?.['min_accept'] != null ? String(record['min_accept']) : '');
  const [maxAccept, setMaxAccept] = useState(record?.['max_accept'] != null ? String(record['max_accept']) : '');
  const [standardRef, setStandardRef] = useState(String(record?.['standard_ref'] ?? ''));
  const [documentNumber, setDocumentNumber] = useState(String(record?.['document_number'] ?? ''));
  const [documentVersion, setDocumentVersion] = useState(String(record?.['document_version'] ?? ''));
  const [notes, setNotes] = useState(String(record?.['notes'] ?? ''));
  const [defectAction, setDefectAction] = useState(String(record?.['defect_action'] ?? ''));
  const [equipmentId, setEquipmentId] = useState(record?.['equipment_id'] != null ? String(record['equipment_id']) : '');
  const [testDate, setTestDate] = useState(() => {
    if (record?.['test_date']) return String(record['test_date']).slice(0, 16);
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [testerName, setTesterName] = useState(String(record?.['tester_name'] ?? ''));
  const [editNote, setEditNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync template defaults
  const tpl = BUILTIN_TEMPLATES.find(t => t.id === templateId);
  useEffect(() => {
    if (!isEdit && tpl) {
      if (tpl.unit && !unit) setUnit(tpl.unit);
      if (tpl.testCurrentOrVoltage && !testCurrentVoltage) setTestCurrentVoltage(tpl.testCurrentOrVoltage);
      if (tpl.documentNumber && !documentNumber) setDocumentNumber(tpl.documentNumber);
      if (tpl.documentVersion && !documentVersion) setDocumentVersion(tpl.documentVersion);
      if (tpl.sourceStandard && !standardRef) setStandardRef(tpl.sourceStandard);
    }
  }, [templateId]);

  // Live assessment preview
  const mv = measuredValue !== '' ? parseFloat(measuredValue) : null;
  const assessment = assessTestRecord(
    templateId,
    mv,
    minAccept !== '' ? parseFloat(minAccept) : null,
    maxAccept !== '' ? parseFloat(maxAccept) : null,
    standardRef || null,
  );

  const selectedEquipment = equipment.find(e => String(e.id) === equipmentId);

  async function handleSave() {
    if (!assetId.trim()) { setError('Asset / Connection ID is required'); return; }
    setSaving(true);
    setError('');
    try {
      const effectiveUnit = unit === 'custom' ? customUnit : unit;
      const body = {
        jobId, templateId, templateName: tpl?.name ?? 'Custom Test',
        assetId, circuitFeeder, phase, jointDescription, referenceTestPoint,
        drawingReference, workType, location, workOrderRef,
        measuredValue: measuredValue !== '' ? measuredValue : null,
        unit: effectiveUnit, testCurrentVoltage, ambientTemp: ambientTemp !== '' ? ambientTemp : null,
        minAccept: minAccept !== '' ? minAccept : null,
        maxAccept: maxAccept !== '' ? maxAccept : null,
        standardRef, documentNumber, documentVersion,
        testDate, testerName, equipmentId: equipmentId || null,
        notes, defectAction,
        ...(isEdit ? { editNote } : {}),
      };
      const url = isEdit ? `/api/electrical-tests/${record!['id']}` : '/api/electrical-tests';
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
      <div className="bg-white w-full md:max-w-2xl md:rounded-xl shadow-2xl flex flex-col max-h-[95dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 md:rounded-t-xl">
          <div>
            <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit Test Record' : 'New Test Record'}</h2>
            <p className="text-xs text-gray-500">{jobName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Safety notice */}
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>Electrical testing must only be performed by appropriately licensed and competent persons using an approved test procedure.</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* ── Test Identification ── */}
          <Section title="Test Identification">
            <Field label="Asset / Connection ID *">
              <Input value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="e.g. ET-001, Pole 1234 Earth Tail" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Circuit / Feeder">
                <Input value={circuitFeeder} onChange={e => setCircuitFeeder(e.target.value)} placeholder="e.g. Feeder 1" />
              </Field>
              <Field label="Phase">
                <select value={phase} onChange={e => setPhase(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select…</option>
                  {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Joint / Connection Description">
              <Input value={jointDescription} onChange={e => setJointDescription(e.target.value)} placeholder="e.g. Compression joint, pole top" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reference Test Point">
                <Input value={referenceTestPoint} onChange={e => setReferenceTestPoint(e.target.value)} placeholder="e.g. TP-A" />
              </Field>
              <Field label="Drawing / Asset Reference">
                <Input value={drawingReference} onChange={e => setDrawingReference(e.target.value)} placeholder="e.g. DWG-001 Rev A" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Work Type">
                <select value={workType} onChange={e => setWorkType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  {WORK_TYPES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </Field>
              <Field label="Work Order / Project Ref">
                <Input value={workOrderRef} onChange={e => setWorkOrderRef(e.target.value)} placeholder="Optional" />
              </Field>
            </div>
            <Field label="Location">
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Substation A, Bay 3" />
            </Field>
          </Section>

          {/* ── Test Template ── */}
          <Section title="Test Template">
            <Field label="Test Type">
              <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {BUILTIN_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            {tpl?.applicableCustomer && (
              <div className="flex gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>Applicable customer: <strong>{tpl.applicableCustomer}</strong> — {tpl.applicableAssetClass}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Standard / Specification">
                <Input value={standardRef} onChange={e => setStandardRef(e.target.value)} placeholder="e.g. EQ STNW3359" />
              </Field>
              <Field label="Document Number">
                <Input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} placeholder="e.g. STNW3359" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Version / Revision">
                <Input value={documentVersion} onChange={e => setDocumentVersion(e.target.value)} placeholder="e.g. Rev 4" />
              </Field>
              <Field label="Test Current / Voltage">
                <Input value={testCurrentVoltage} onChange={e => setTestCurrentVoltage(e.target.value)} placeholder="e.g. 500 V DC" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min Acceptance">
                <Input type="number" value={minAccept} onChange={e => setMinAccept(e.target.value)} placeholder="Leave blank = manual" />
              </Field>
              <Field label="Max Acceptance">
                <Input type="number" value={maxAccept} onChange={e => setMaxAccept(e.target.value)} placeholder="Leave blank = manual" />
              </Field>
            </div>
          </Section>

          {/* ── Test Result ── */}
          <Section title="Test Result">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Measured Value">
                <Input type="number" step="any" value={measuredValue} onChange={e => setMeasuredValue(e.target.value)} placeholder="e.g. 4.2" />
              </Field>
              <Field label="Unit">
                <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select…</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
            </div>
            {unit === 'custom' && (
              <Field label="Custom Unit">
                <Input value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder="e.g. dBm" />
              </Field>
            )}
            <Field label="Ambient / Equipment Temperature (°C) — optional">
              <Input type="number" step="0.1" value={ambientTemp} onChange={e => setAmbientTemp(e.target.value)} placeholder="e.g. 25.0" />
            </Field>

            {/* Live assessment */}
            {mv !== null && (
              <div className="rounded-lg border p-3 bg-gray-50">
                <p className="text-xs text-gray-500 mb-1">Automatic assessment</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${resultBadgeClass(assessment.result)}`}>
                    {assessment.result === 'MANUAL' ? 'Manual assessment required' : assessment.result}
                  </span>
                  {assessment.condition && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${conditionBadgeClass(assessment.condition)}`}>
                      {assessment.condition}
                    </span>
                  )}
                  {assessment.standardRef && (
                    <span className="text-xs text-gray-500">{assessment.standardRef}</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">{assessment.label}</p>
              </div>
            )}
          </Section>

          {/* ── Test Equipment ── */}
          <Section title="Test Equipment">
            <Field label="Select Equipment">
              <select value={equipmentId} onChange={e => setEquipmentId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">None / not recorded</option>
                {equipment.map(e => (
                  <option key={e.id} value={String(e.id)}>
                    {e.make_model}{e.serial_number ? ` — ${e.serial_number}` : ''}
                    {e.calibrationExpired ? ' ⚠ CAL EXPIRED' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {selectedEquipment?.calibrationExpired && (
              <div className="flex gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>Calibration expired. A supervisor override with justification is required to accept a Pass result using this equipment.</span>
              </div>
            )}
          </Section>

          {/* ── Job Details ── */}
          <Section title="Job Details">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Test Date & Time">
                <Input type="datetime-local" value={testDate} onChange={e => setTestDate(e.target.value)} />
              </Field>
              <Field label="Tested By">
                <Input value={testerName} onChange={e => setTesterName(e.target.value)} placeholder="Name of tester" />
              </Field>
            </div>
          </Section>

          {/* ── Notes ── */}
          <Section title="Notes & Actions">
            <Field label="Notes / Comments">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any additional observations…" />
            </Field>
            <Field label="Defect / Corrective Action Required">
              <Textarea value={defectAction} onChange={e => setDefectAction(e.target.value)} rows={2} placeholder="Describe any defect or corrective action…" />
            </Field>
            {isEdit && (
              <Field label="Reason for Edit">
                <Input value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Briefly describe what changed and why" />
              </Field>
            )}
          </Section>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex gap-3 justify-end md:rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Record'}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
      >
        {title}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-gray-600 mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
