import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, AlertCircle, MapPin, Link, SplitSquareHorizontal,
  Navigation, ExternalLink, Briefcase, Truck, Search, ChevronDown, X,
  ImagePlus, CheckCircle2,
} from 'lucide-react';
import { type FormField, parseOptions, parseSettings, fetchGlobalLists } from '../FormFieldBuilder';
import SignaturePad, {
  MultiSignaturePad,
  type SignatureAnswer,
  type MultiSignatureAnswer,
  parseSignatureAnswer,
  parseMultiSignatureAnswer,
} from './SignaturePad';
import { isGpsAnswer, type GpsAnswer } from './form-types';

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
    } else if (field.fieldType === 'long_text' || field.fieldType === 'textarea') {
      display = <p className="text-sm text-slate-700 whitespace-pre-wrap">{String(value)}</p>;
    } else if (field.fieldType === 'short_text' || field.fieldType === 'text') {
      display = <p className="text-sm text-slate-700">{String(value)}</p>;
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
    } else if (field.fieldType === 'job_link') {
      // Value is the job ID as a string — show a link to the job
      const jobId = String(value);
      display = (
        <a
          href={`/jobs/${jobId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <Briefcase size={13} />
          Job #{jobId}
          <ExternalLink size={11} className="text-slate-400" />
        </a>
      );
    } else if (field.fieldType === 'asset_link') {
      const assetId = String(value);
      display = (
        <a
          href={`/fleet/${assetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <Truck size={13} />
          Asset #{assetId}
          <ExternalLink size={11} className="text-slate-400" />
        </a>
      );
    } else if (field.fieldType === 'photo') {
      const photoUrls: string[] = (() => {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
        if (typeof value === 'string') {
          try { const p = JSON.parse(value); return Array.isArray(p) ? p : [value]; } catch { return [value]; }
        }
        return [];
      })();
      display = photoUrls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photoUrls.map((url, idx) => (
            <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 hover:opacity-90 transition-opacity">
              <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      ) : <span className="text-sm text-slate-400 italic">No photo</span>;
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
  companyId?: number;
}

// ── Shared searchable dropdown for job_link / asset_link ─────────────────────

interface LinkOption { id: number; label: string; sublabel?: string }

function LinkDropdown({
  options, value, onChange, placeholder, loading, error, disabled, icon: Icon,
}: {
  options: LinkOption[];
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
  placeholder: string;
  loading: boolean;
  error?: string;
  disabled?: boolean;
  icon: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => String(o.id) === String(value)) ?? null;

  const filtered = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const baseInput = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const borderCls = error ? 'border-red-400' : 'border-slate-200';

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
        className={`${baseInput} ${borderCls} flex items-center gap-2 text-left w-full`}
      >
        {loading
          ? <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
          : <Icon size={14} className="text-slate-400 shrink-0" />}
        <span className={`flex-1 truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected && !disabled && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
          >
            <X size={13} />
          </span>
        )}
        {!selected && <ChevronDown size={13} className="text-slate-400 shrink-0" />}
      </button>

      {/* Dropdown panel */}
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder:text-slate-400"
            />
          </div>
          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No results</p>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(String(opt.id)); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex flex-col gap-0.5 ${
                  String(opt.id) === String(value) ? 'bg-primary/5' : ''
                }`}
              >
                <span className="text-sm font-medium text-slate-800 truncate">{opt.label}</span>
                {opt.sublabel && <span className="text-xs text-slate-400 truncate">{opt.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FieldInput({ field, value, onChange, error, disabled, companyId }: FieldInputProps) {
  const settings = parseSettings(field.settingsJson);
  const globalListId = typeof settings.globalListId === 'number' && settings.globalListId > 0 ? settings.globalListId : null;

  // Resolve options: global list takes precedence over optionsJson
  const [resolvedOptions, setResolvedOptions] = useState<string[]>(() => parseOptions(field.optionsJson));
  useEffect(() => {
    if (!globalListId) { setResolvedOptions(parseOptions(field.optionsJson)); return; }
    fetchGlobalLists().then((lists) => {
      const found = lists.find((l) => l.id === globalListId);
      if (found) setResolvedOptions(found.items);
    }).catch(console.error);
  }, [globalListId, field.optionsJson]);

  const options = resolvedOptions;

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
      {/* 'text' is a legacy alias for short_text */}
      {field.fieldType === 'text' && (
        <input type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder}`} placeholder="Type your answer…" disabled={disabled} />
      )}
      {field.fieldType === 'long_text' && (
        <textarea value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} rows={4} className={`${baseInput} ${errorBorder} resize-none`} placeholder="Type your answer…" disabled={disabled} />
      )}
      {/* 'textarea' is a legacy alias for long_text */}
      {field.fieldType === 'textarea' && (
        <textarea value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} rows={4} className={`${baseInput} ${errorBorder} resize-none`} placeholder="Type your answer…" disabled={disabled} />
      )}
      {/* 'select' is a legacy alias for single_choice */}
      {field.fieldType === 'select' && (
        <div className="flex flex-col gap-2">
          {options.length > 0 ? options.map((opt) => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer group">
              <div onClick={() => !disabled && onChange(value === opt ? null : opt)} className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${value === opt ? 'border-primary' : 'border-slate-300 group-hover:border-primary'}`}>
                {value === opt && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <span className="text-sm text-slate-700">{opt}</span>
            </label>
          )) : (
            <input type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder}`} placeholder="Type your answer…" disabled={disabled} />
          )}
        </div>
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
      {field.fieldType === 'photo' && (() => {
        const allowMultiple = settings.multiple !== false; // default true — multiple photos always allowed
        // value is stored as a JSON array of URLs, or a single URL string, or null
        const urls: string[] = (() => {
          if (!value) return [];
          if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
          if (typeof value === 'string') {
            try { const p = JSON.parse(value); return Array.isArray(p) ? p : [value]; } catch { return [value]; }
          }
          return [];
        })();

        const [uploading, setUploading] = useState(false);
        const [uploadError, setUploadError] = useState<string | null>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);

        const handleFiles = useCallback(async (files: File[]) => {
          if (!files.length) return;
          setUploading(true);
          setUploadError(null);
          try {
            const newUrls: string[] = [];
            for (const file of files) {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('fileCategory', 'Forms');
              const res = await fetch('/api/files', { method: 'POST', body: fd, credentials: 'include' });
              if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? 'Upload failed'); }
              const data = await res.json() as { file?: { id: number } };
              const fileId = data.file?.id;
              if (fileId) newUrls.push('/api/files/' + String(fileId) + '/download');
            }
            const combined = allowMultiple ? [...urls, ...newUrls] : newUrls.slice(-1);
            onChange(combined.length === 1 ? combined[0] : JSON.stringify(combined));
          } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Upload failed');
          } finally {
            setUploading(false);
          }
        }, [urls, allowMultiple, onChange]);


        const removePhoto = (idx: number) => {
          const next = urls.filter((_, i) => i !== idx);
          onChange(next.length === 0 ? null : next.length === 1 ? next[0] : JSON.stringify(next));
        };

        return (
          <div className="flex flex-col gap-2">
            {/* Thumbnails */}
            {urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {urls.map((url, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                      >
                        <X size={10} className="text-white" />
                      </button>
                    )}
                    <div className="absolute bottom-0.5 right-0.5">
                      <CheckCircle2 size={12} className="text-emerald-400 drop-shadow" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload / capture button — always shown when not disabled */}
            {!disabled && (
              <>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed transition-colors ${
                    error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50 hover:border-primary/40 hover:bg-primary/5'
                  } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  {uploading
                    ? <><Loader2 size={18} className="animate-spin text-primary" /><span className="text-xs text-slate-500">Uploading…</span></>
                    : <><ImagePlus size={18} className="text-slate-400" /><span className="text-xs font-medium text-slate-500">{urls.length > 0 ? 'Add another photo' : 'Take or upload a photo'}</span></>
                  }
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple={allowMultiple}
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ''; } }}
                />
              </>
            )}

            {uploadError && (
              <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} />{uploadError}</p>
            )}
          </div>
        );
      })()}
      {field.fieldType === 'signature' && (() => {
        const isMultiple = !!settings.multiple;
        const buttonLabel = typeof settings.buttonLabel === 'string' && settings.buttonLabel.trim() ? settings.buttonLabel : '+ Add Signer';
        const maxSigners = typeof settings.maxSigners === 'number' ? settings.maxSigners : 20;
        if (isMultiple) {
          return <MultiSignaturePad value={parseMultiSignatureAnswer(value)} onChange={(sig) => onChange(sig)} error={error} buttonLabel={buttonLabel} maxSigners={maxSigners} />;
        }
        return <SignaturePad value={parseSignatureAnswer(value)} onChange={(sig) => onChange(sig)} error={error} />;
      })()}
      {field.fieldType === 'job_link' && (() => {
        // Rendered as a plain text field — type the job name or number
        return (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter job name or number…"
            disabled={disabled}
            className={`${baseInput} ${errorBorder}`}
          />
        );
      })()}
      {field.fieldType === 'asset_link' && (() => {
        // Rendered as a plain text field — type the asset name or ID
        return (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter asset name or ID…"
            disabled={disabled}
            className={`${baseInput} ${errorBorder}`}
          />
        );
      })()}
      {error && field.fieldType !== 'signature' && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {error}</p>}

      {/* Fallback: unknown field type — render as plain text input so the field is never invisible */}
      {!['short_text','text','long_text','textarea','number','url','date','datetime','yes_no','checkbox','single_choice','select','multi_select','linear_scale','rating','location','photo','signature','job_link','asset_link','section','instruction','instruction_image','page_break'].includes(field.fieldType) && (
        <input type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={`${baseInput} ${errorBorder}`} placeholder="Type your answer…" disabled={disabled} />
      )}
    </div>
  );
}
