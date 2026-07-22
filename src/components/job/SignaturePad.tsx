import { useRef, useEffect, useCallback, useState } from 'react';
import { Trash2, PenLine, Plus, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignerBlock {
  id: string;
  name: string;
  signatureDataUrl: string;
  signedAt: string;
}

/** Single-signer answer (legacy / multiple=false) */
export interface SignatureAnswer {
  name: string;
  signatureDataUrl: string;
  signedAt: string;
}

/** Multi-signer answer */
export interface MultiSignatureAnswer {
  type: 'signature';
  multiple: true;
  signers: SignerBlock[];
}

export type AnySignatureAnswer = SignatureAnswer | MultiSignatureAnswer;

function isSignatureAnswer(v: unknown): v is SignatureAnswer {
  return (
    typeof v === 'object' &&
    v !== null &&
    'signatureDataUrl' in v &&
    typeof (v as SignatureAnswer).signatureDataUrl === 'string' &&
    !('multiple' in v)
  );
}

function isMultiSignatureAnswer(v: unknown): v is MultiSignatureAnswer {
  return (
    typeof v === 'object' &&
    v !== null &&
    'multiple' in v &&
    (v as MultiSignatureAnswer).multiple === true &&
    Array.isArray((v as MultiSignatureAnswer).signers)
  );
}

export function parseSignatureAnswer(raw: unknown): SignatureAnswer | null {
  if (isSignatureAnswer(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isSignatureAnswer(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return null;
}

export function parseMultiSignatureAnswer(raw: unknown): MultiSignatureAnswer | null {
  if (isMultiSignatureAnswer(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isMultiSignatureAnswer(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return null;
}

// ── Canvas drawing helpers ────────────────────────────────────────────────────

function getPoint(canvas: HTMLCanvasElement, event: MouseEvent | TouchEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const touch = 'touches' in event ? event.touches[0] : null;
  const clientX = touch ? touch.clientX : (event as MouseEvent).clientX;
  const clientY = touch ? touch.clientY : (event as MouseEvent).clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return !data.some((v, i) => i % 4 === 3 && v > 0);
}

// ── Single canvas drawing pad ─────────────────────────────────────────────────

interface SingleCanvasProps {
  /** Initial dataUrl to restore into canvas */
  initialDataUrl?: string;
  onStrokeEnd: (dataUrl: string | null) => void;
  error?: boolean;
  readOnly?: boolean;
}

function SingleCanvas({ initialDataUrl, onStrokeEnd, error, readOnly = false }: SingleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  // Restore saved image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = initialDataUrl;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  // Only re-run when the dataUrl itself changes (not on every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDataUrl]);

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    const p = getPoint(canvas, e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, []);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = getPoint(canvas, e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }, []);

  const stopDraw = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = isCanvasBlank(canvas) ? null : canvas.toDataURL('image/png');
    onStrokeEnd(dataUrl);
  }, [onStrokeEnd]);

  useEffect(() => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);
    return () => {
      canvas.removeEventListener('mousedown', startDraw);
      canvas.removeEventListener('mousemove', draw);
      window.removeEventListener('mouseup', stopDraw);
      canvas.removeEventListener('touchstart', startDraw);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDraw);
    };
  }, [readOnly, startDraw, draw, stopDraw]);

  const hasSignature = !!initialDataUrl;

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
        error && !hasSignature
          ? 'border-red-400 bg-red-50/30'
          : hasSignature
          ? 'border-slate-300 bg-white'
          : 'border-dashed border-slate-300 bg-slate-50 hover:border-primary/50'
      }`}
    >
      {!hasSignature && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none select-none">
          <PenLine size={18} className="text-slate-300" />
          <p className="text-xs text-slate-300 font-medium">Draw your signature here</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        style={{ width: '100%', height: '160px', display: 'block', touchAction: 'none', cursor: readOnly ? 'default' : 'crosshair' }}
      />
    </div>
  );
}

// ── Single-signer pad (multiple=false) ────────────────────────────────────────

interface SignaturePadProps {
  value: SignatureAnswer | null;
  onChange: (val: SignatureAnswer | null) => void;
  error?: string;
  readOnly?: boolean;
}

export default function SignaturePad({ value, onChange, error, readOnly = false }: SignaturePadProps) {
  const [name, setName] = useState(value?.name ?? '');

  useEffect(() => { setName(value?.name ?? ''); }, [value?.name]);

  function handleStrokeEnd(dataUrl: string | null) {
    if (!dataUrl) { onChange(null); return; }
    onChange({ name, signatureDataUrl: dataUrl, signedAt: new Date().toISOString() });
  }

  function handleNameChange(newName: string) {
    setName(newName);
    if (value?.signatureDataUrl) {
      onChange({ ...value, name: newName });
    }
  }

  function handleClear() { onChange(null); }

  // ── Read-only ──────────────────────────────────────────────────────────────
  if (readOnly) {
    if (!value?.signatureDataUrl) {
      return (
        <div className="flex items-center gap-2 text-sm text-slate-400 italic">
          <PenLine size={14} className="text-slate-300" /> No signature captured
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {value.name && <p className="text-sm font-semibold text-slate-700">{value.name}</p>}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <img src={value.signatureDataUrl} alt={`Signature${value.name ? ` of ${value.name}` : ''}`}
            className="w-full h-auto max-h-[160px] object-contain" />
        </div>
        {value.signedAt && (
          <p className="text-xs text-slate-400">
            Signed {new Date(value.signedAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    );
  }

  // ── Editable ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Full name</label>
        <input type="text" value={name} onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Type your full name…"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-slate-500">Signature</label>
          {value?.signatureDataUrl && (
            <button type="button" onClick={handleClear}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors">
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>
        <SingleCanvas
          initialDataUrl={value?.signatureDataUrl}
          onStrokeEnd={handleStrokeEnd}
          error={!!error && !value?.signatureDataUrl}
        />
        {error && !value?.signatureDataUrl && (
          <p className="text-xs text-red-600 mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}

// ── Multi-signer pad (multiple=true) ──────────────────────────────────────────

interface MultiSignaturePadProps {
  value: MultiSignatureAnswer | null;
  onChange: (val: MultiSignatureAnswer) => void;
  error?: string;
  readOnly?: boolean;
  buttonLabel?: string;
  maxSigners?: number;
}

function makeId() { return `signer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function emptyBlock(): SignerBlock { return { id: makeId(), name: '', signatureDataUrl: '', signedAt: '' }; }

export function MultiSignaturePad({ value, onChange, error, readOnly = false, buttonLabel = '+ Add Signer', maxSigners = 20 }: MultiSignaturePadProps) {
  // Initialise with at least one block
  const [signers, setSigners] = useState<SignerBlock[]>(() => {
    const saved = value?.signers;
    return saved && saved.length > 0 ? saved : [emptyBlock()];
  });

  // Sync from parent when value changes externally (e.g. reopen)
  useEffect(() => {
    if (value?.signers && value.signers.length > 0) {
      setSigners(value.signers);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit(updated: SignerBlock[]) {
    setSigners(updated);
    onChange({ type: 'signature', multiple: true, signers: updated });
  }

  function addSigner() {
    if (signers.length >= maxSigners) return;
    emit([...signers, emptyBlock()]);
  }

  function removeSigner(id: string) {
    const next = signers.filter((s) => s.id !== id);
    emit(next.length > 0 ? next : [emptyBlock()]);
  }

  function updateName(id: string, name: string) {
    emit(signers.map((s) => s.id === id ? { ...s, name } : s));
  }

  function updateSignature(id: string, dataUrl: string | null) {
    emit(signers.map((s) =>
      s.id === id
        ? { ...s, signatureDataUrl: dataUrl ?? '', signedAt: dataUrl ? new Date().toISOString() : '' }
        : s
    ));
  }

  function clearSigner(id: string) {
    emit(signers.map((s) => s.id === id ? { ...s, signatureDataUrl: '', signedAt: '' } : s));
  }

  const hasError = !!error;
  const completedCount = signers.filter((s) => s.name && s.signatureDataUrl).length;

  // ── Read-only ──────────────────────────────────────────────────────────────
  if (readOnly) {
    const completed = signers.filter((s) => s.signatureDataUrl);
    if (completed.length === 0) {
      return (
        <div className="flex items-center gap-2 text-sm text-slate-400 italic">
          <PenLine size={14} className="text-slate-300" /> No signatures captured
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        {completed.map((s, i) => (
          <div key={s.id} className="flex flex-col gap-1.5 p-3 rounded-xl border border-slate-200 bg-slate-50 break-inside-avoid">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Signer {i + 1}</p>
            {s.name && <p className="text-sm font-semibold text-slate-700">{s.name}</p>}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <img src={s.signatureDataUrl} alt={`Signature of ${s.name || `Signer ${i + 1}`}`}
                className="w-full h-auto max-h-[140px] object-contain" />
            </div>
            {s.signedAt && (
              <p className="text-xs text-slate-400">
                Signed {new Date(s.signedAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Editable ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {hasError && completedCount === 0 && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {signers.map((signer, i) => (
        <div key={signer.id} className="flex flex-col gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50">
          {/* Signer header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Signer {i + 1}</p>
            <div className="flex items-center gap-2">
              {signer.signatureDataUrl && (
                <button type="button" onClick={() => clearSigner(signer.id)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-amber-600 transition-colors">
                  <Trash2 size={11} /> Clear
                </button>
              )}
              {signers.length > 1 && (
                <button type="button" onClick={() => removeSigner(signer.id)}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors">
                  <X size={11} /> Remove
                </button>
              )}
            </div>
          </div>

          {/* Name */}
          <input type="text" value={signer.name} onChange={(e) => updateName(signer.id, e.target.value)}
            placeholder="Full name…"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white" />

          {/* Canvas */}
          <SingleCanvas
            initialDataUrl={signer.signatureDataUrl || undefined}
            onStrokeEnd={(dataUrl) => updateSignature(signer.id, dataUrl)}
            error={hasError && completedCount === 0 && !signer.signatureDataUrl}
          />

          {/* Signed timestamp */}
          {signer.signedAt && (
            <p className="text-xs text-emerald-600 font-medium">
              ✓ Signed {new Date(signer.signedAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      ))}

      {/* Add signer button */}
      {signers.length < maxSigners && (
        <button type="button" onClick={addSigner}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-primary/50 hover:bg-primary/5 text-sm font-semibold text-slate-500 hover:text-primary transition-all">
          <Plus size={14} /> {buttonLabel}
        </button>
      )}
    </div>
  );
}
