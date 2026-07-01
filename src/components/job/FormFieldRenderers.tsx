import { useState } from 'react';
import {
  Loader2, AlertCircle, MapPin, Camera, Link, SplitSquareHorizontal,
  Navigation, ExternalLink,
} from 'lucide-react';
import { type FormField, parseOptions, parseSettings } from '../FormFieldBuilder';
import SignaturePad, {
  MultiSignaturePad,
  type SignatureAnswer,
  type MultiSignatureAnswer,
  parseSignatureAnswer,
  parseMultiSignatureAnswer,
} from './SignaturePad';
import { isGpsAnswer, type GpsAnswer } from './FormRunner';

type AnswerValue = string | string[] | boolean | SignatureAnswer | MultiSignatureAnswer | GpsAnswer | null;

// ── Read-only answer display ──────────────────────────────────────────────────

export function ReadOnlyAnswer({ field, value }: { field: FormField; value: AnswerValue }) {
  const settings = parseSettings(field.settingsJson);

  if (['section', 'instruction', 'instruction_image', 'page_break'].includes(field.fieldType)) {
    return null;
  }

  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

  if (field.fieldType === 'signature') {
    const isMultiple = !!settings.multiple;
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {isMultiple
          ? <MultiSignaturePad value={parseMultiSignatureAnswer(value)} onChange={() => {}} readOnly />
          : <SignaturePad value={parseSignatureAnswer(value)} onChange={() => {}} readOnly />}
      </div>
    );
  }

  let display: React.ReactNode = <span className="text-slate-400 italic text-sm">No answer</span>;

  if (!empty) {
    if (field.fieldType === 'yes_no') {
      const v = String(value);
      display = <span className={`inline-flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-lg ${v === 'yes' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{v === 'yes' ? '✓ Yes' : '✗ No'}</span>;
    } else if (field.fieldType === 'checkbox') {
      display = <span className={`inline-flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-lg ${value === true ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{value === true ? '✓ Checked' : '✗ Unchecked'}</span>;
    } else if (field.fieldType === 'multi_select' && Array.isArray(value)) {
      display = <div className="flex flex-wrap gap-1.5">{value.map((v) => <span key={v} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">{v}</span>)}</div>;
    } else if (field.fieldType === 'rating') {
      const style = typeof settings.style === 'string' ? settings.style : 'stars';
      const num = Number(value);
      const max = typeof settings.max === 'number' ? settings.max : 5;
      if (style === 'stars') {
        display = <span className="text-xl">{Array.from({ length: Math.min(max, 10) }, (_, i) => <span key={i} className={i < num ? 'text-amber-400' : 'text-slate-200'}>★</span>)}</span>;
      } else {
        display = <span className="text-sm font-semibold text-slate-700">{String(value)} / {max}</span>;
      }
    } else if (field.fieldType === 'url') {
      display = <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">{String(value)}</a>;
    } else if (field.fieldType === 'long_text') {
      display = <p className="text-sm text-slate-700 whitespace-pre-wrap">{String(value)}</p>;
    } else if (field.fieldType === 'location') {
      const gps = isGpsAnswer(value) ? value : null;
      if (gps) {
        const mapsUrl = `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
        display = (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
            <MapPin size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              {gps.address && <p className="text-sm font-medium text-emerald-800">{gps.address}</p>}
              <p className="text-xs font-mono text-emerald-700">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}<span className="text-emerald-500 ml-1.5">±{gps.accuracy}m</span></p>
              <p className="text-[11px] text-emerald-500">{new Date(gps.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-emerald-600 hover:underline w-fit mt-0.5"><ExternalLink size={10} /> View on map</a>
            </div>
          </div>
        );
      } else {
        display = <span className="text-sm text-slate-700 font-mono">{String(value)}</span>;
      }
    } else {
      display = <span className="text-sm text-slate-700">{String(value)}</span>;
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <div>{display}</div>
    </div>
  );
}

// ── Individual field input ────────────────────────────────────────────────────

interface FieldInputProps {
  field: FormField;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
  error?: string;
  disabled?: boolean;
}

export function FieldInput({ field, value, onChange, error, disabled }: FieldInputProps) {
  const options = parseOptions(field.optionsJson);
  const settings = parseSettings(field.settingsJson);

  const baseInput = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const errorBorder = error ? 'border-red-400' : 'border-slate-200';

  if (field.fieldType === 'section') return <div className="border-b-2 border-slate-300 pb-1"><h3 className="text-base font-bold text-slate-800">{field.label}</h3></div>;
  if (field.fieldType === 'instruction') return <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3"><p className="text-sm text-blue-800">{field.label}</p></div>;
  if (field.fieldType === 'instruction_image') {
    const thumbnailUrl = typeof settings.thumbnailUrl === 'string' ? settings.thumbnailUrl : null;
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3 items-start">
        {thumbnailUrl && <img src={thumbnailUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-blue-200" />}
        <p className="text-sm text-blue-800">{field.label}</p>
      </div>
    );
  }
  if (field.fieldType === 'page_break') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 border-t-2 border-dashed border-slate-300" />
        <SplitSquareHorizontal size={13} className="text-slate-400 shrink-0" />
        <div className="flex-1 border-t-2 border-dashed border-slate-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</label>

      {field.fieldType === 'short_text' && (
        <input type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder}`} placeholder="Type your answer…" disabled={disabled} />
      )}
      {field.fieldType === 'long_text' && (
        <textarea value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} rows={4} className={`${baseInput} ${errorBorder} resize-none`} placeholder="Type your answer…" disabled={disabled} />
      )}
      {field.fieldType === 'number' && (
        <input type="number" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder}`} placeholder="0" disabled={disabled} />
      )}
      {field.fieldType === 'url' && (
        <div className="relative">
          <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="url" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder} pl-9`} placeholder={typeof settings.placeholder === 'string' ? settings.placeholder : 'https://'} disabled={disabled} />
        </div>
      )}
      {field.fieldType === 'date' && (
        <input type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder}`} disabled={disabled} />
      )}
      {field.fieldType === 'datetime' && (
        <input type="datetime-local" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder}`} disabled={disabled} />
      )}
      {field.fieldType === 'yes_no' && (
        <div className="flex gap-2">
          {(['yes', 'no'] as const).map((opt) => (
            <button key={opt} onClick={() => onChange(value === opt ? null : opt)} disabled={disabled}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${value === opt ? (opt === 'yes' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-red-500 border-red-500 text-white') : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
              {opt === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )}
      {field.fieldType === 'checkbox' && (
        <label className="flex items-center gap-3 cursor-pointer group">
          <div onClick={() => !disabled && onChange(!value)} className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${value === true ? 'bg-primary border-primary' : 'bg-white border-slate-300 group-hover:border-primary'}`}>
            {value === true && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
          <span className="text-sm text-slate-700">Check to confirm</span>
        </label>
      )}
      {field.fieldType === 'single_choice' && (
        <div className="flex flex-col gap-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer group">
              <div onClick={() => !disabled && onChange(value === opt ? null : opt)} className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${value === opt ? 'border-primary' : 'border-slate-300 group-hover:border-primary'}`}>
                {value === opt && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <span className="text-sm text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
      )}
      {field.fieldType === 'multi_select' && (
        <div className="flex flex-col gap-2">
          {options.map((opt) => {
            const selected = Array.isArray(value) ? value.includes(opt) : false;
            return (
              <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                <div onClick={() => { if (disabled) return; const current = Array.isArray(value) ? value : []; onChange(selected ? current.filter((v) => v !== opt) : [...current, opt]); }}
                  className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${selected ? 'bg-primary border-primary' : 'bg-white border-slate-300 group-hover:border-primary'}`}>
                  {selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            );
          })}
        </div>
      )}
      {field.fieldType === 'linear_scale' && (() => {
        const min = typeof settings.min === 'number' ? settings.min : 1;
        const max = typeof settings.max === 'number' ? settings.max : 10;
        const step = typeof settings.step === 'number' ? settings.step : 1;
        const leftLabel = typeof settings.leftLabel === 'string' ? settings.leftLabel : '';
        const rightLabel = typeof settings.rightLabel === 'string' ? settings.rightLabel : '';
        const vals = Array.from({ length: Math.min(max - min + 1, 20) }, (_, i) => min + i * step);
        const sel = typeof value === 'string' ? Number(value) : null;
        return (
          <div>
            <div className="flex gap-1.5 flex-wrap mb-1">
              {vals.map((v) => (
                <button key={v} onClick={() => !disabled && onChange(sel === v ? null : String(v))} disabled={disabled}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${sel === v ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-primary hover:text-primary'}`}>{v}</button>
              ))}
            </div>
            {(leftLabel || rightLabel) && <div className="flex justify-between text-[11px] text-slate-400 mt-1"><span>{leftLabel}</span><span>{rightLabel}</span></div>}
          </div>
        );
      })()}
      {field.fieldType === 'rating' && (() => {
        const style = typeof settings.style === 'string' ? settings.style : 'stars';
        const max = typeof settings.max === 'number' ? settings.max : 5;
        const sel = typeof value === 'string' ? Number(value) : null;
        const emojis = ['😞', '😐', '🙂', '😊', '😄'];
        return (
          <div className="flex gap-2">
            {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((v) => (
              <button key={v} onClick={() => !disabled && onChange(sel === v ? null : String(v))} disabled={disabled}
                className={`text-2xl transition-transform hover:scale-110 ${sel !== null && v <= sel ? 'opacity-100' : 'opacity-40'}`}>
                {style === 'stars' ? (sel !== null && v <= sel ? '★' : '☆') : style === 'emoji' ? emojis[Math.min(v - 1, 4)] : (
                  <span className={`text-sm px-2 py-1 rounded-lg border font-semibold transition-colors ${sel === v ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{v}</span>
                )}
              </button>
            ))}
          </div>
        );
      })()}
      {field.fieldType === 'location' && (() => {
        const gps = isGpsAnswer(value) ? value : null;
        const [capturing, setCapturing] = useState(false);
        const [gpsError, setGpsError] = useState<string | null>(null);

        const captureGps = () => {
          if (!navigator.geolocation) { setGpsError('GPS not available on this device.'); return; }
          setCapturing(true); setGpsError(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const answer: GpsAnswer = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), timestamp: new Date().toISOString() };
              onChange(answer); setCapturing(false);
            },
            (err) => { setGpsError(err.code === 1 ? 'Location permission denied.' : 'Could not get location. Try again.'); setCapturing(false); },
            { enableHighAccuracy: true, timeout: 15000 },
          );
        };

        const mapsUrl = gps ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}` : null;

        return (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={captureGps} disabled={capturing || disabled}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 w-fit transition-colors disabled:opacity-60">
              {capturing ? <Loader2 size={14} className="animate-spin text-primary" /> : <Navigation size={14} className="text-primary" />}
              {capturing ? 'Getting location…' : gps ? 'Re-capture GPS' : 'Capture GPS location'}
            </button>
            {gps && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                <MapPin size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-700">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}<span className="font-normal text-emerald-500 ml-1.5">±{gps.accuracy}m</span></p>
                  <p className="text-[11px] text-emerald-500">Captured {new Date(gps.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-emerald-600 hover:underline w-fit mt-0.5"><ExternalLink size={10} /> View on map</a>}
                </div>
              </div>
            )}
            {gpsError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {gpsError}</p>}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-400">Manual address (optional override)</label>
              <input type="text" value={gps?.address ?? (typeof value === 'string' ? value : '')}
                onChange={(e) => { if (gps) { onChange({ ...gps, address: e.target.value }); } else { onChange(e.target.value); } }}
                placeholder="e.g. 123 Main St, Brisbane QLD 4000" disabled={disabled} className={`${baseInput} ${errorBorder}`} />
            </div>
          </div>
        );
      })()}
      {field.fieldType === 'photo' && (
        <div className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
          <Camera size={20} className="text-slate-300" />
          <p className="text-xs text-slate-400">Photo upload coming soon</p>
        </div>
      )}
      {field.fieldType === 'signature' && (() => {
        const isMultiple = !!settings.multiple;
        const buttonLabel = typeof settings.buttonLabel === 'string' && settings.buttonLabel.trim() ? settings.buttonLabel : '+ Add Signer';
        const maxSigners = typeof settings.maxSigners === 'number' ? settings.maxSigners : 20;
        if (isMultiple) {
          return <MultiSignaturePad value={parseMultiSignatureAnswer(value)} onChange={(sig) => onChange(sig)} error={error} buttonLabel={buttonLabel} maxSigners={maxSigners} />;
        }
        return <SignaturePad value={parseSignatureAnswer(value)} onChange={(sig) => onChange(sig)} error={error} />;
      })()}
      {error && field.fieldType !== 'signature' && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {error}</p>}
    </div>
  );
}
