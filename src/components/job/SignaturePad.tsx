import { useRef, useEffect, useCallback, useState } from 'react';
import { Trash2, PenLine } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignatureAnswer {
  name: string;
  signatureDataUrl: string;
  signedAt: string;
}

function isSignatureAnswer(v: unknown): v is SignatureAnswer {
  return (
    typeof v === 'object' &&
    v !== null &&
    'signatureDataUrl' in v &&
    typeof (v as SignatureAnswer).signatureDataUrl === 'string'
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

// ── SignaturePad component ────────────────────────────────────────────────────

interface SignaturePadProps {
  /** Current answer value (the full SignatureAnswer object or null) */
  value: SignatureAnswer | null;
  onChange: (val: SignatureAnswer | null) => void;
  error?: string;
  readOnly?: boolean;
}

export default function SignaturePad({ value, onChange, error, readOnly = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasStrokesRef = useRef(false);

  // Local name state — kept in sync with value.name
  const [name, setName] = useState(value?.name ?? '');

  // ── Restore saved signature into canvas on mount / value change ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (value?.signatureDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        hasStrokesRef.current = true;
      };
      img.src = value.signatureDataUrl;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasStrokesRef.current = false;
    }
  // Only run when the dataUrl changes (not on every name edit)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.signatureDataUrl]);

  // ── Sync name field when value.name changes externally ──────────────────────
  useEffect(() => {
    setName(value?.name ?? '');
  }, [value?.name]);

  // ── Capture current canvas as PNG data URL ──────────────────────────────────
  const captureDataUrl = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Check if canvas is blank
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasPixels = data.some((v, i) => i % 4 === 3 && v > 0); // any non-transparent pixel
    if (!hasPixels) return null;
    return canvas.toDataURL('image/png');
  }, []);

  // ── Emit updated answer ─────────────────────────────────────────────────────
  const emitChange = useCallback((newName: string, newDataUrl: string | null) => {
    if (!newDataUrl) {
      // No signature drawn — emit null or preserve name-only state
      onChange(null);
      return;
    }
    onChange({
      name: newName,
      signatureDataUrl: newDataUrl,
      signedAt: new Date().toISOString(),
    });
  }, [onChange]);

  // ── Drawing event handlers ──────────────────────────────────────────────────
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
    hasStrokesRef.current = true;
  }, []);

  const stopDraw = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    // Capture and emit after each stroke ends
    const dataUrl = captureDataUrl();
    emitChange(name, dataUrl);
  }, [captureDataUrl, emitChange, name]);

  // ── Attach canvas event listeners ───────────────────────────────────────────
  useEffect(() => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    // Touch — passive: false to allow preventDefault (stops page scroll while signing)
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

  // ── Clear ───────────────────────────────────────────────────────────────────
  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokesRef.current = false;
    onChange(null);
  }

  // ── Name change ─────────────────────────────────────────────────────────────
  function handleNameChange(newName: string) {
    setName(newName);
    // Re-emit with current canvas state
    const dataUrl = captureDataUrl();
    emitChange(newName, dataUrl);
  }

  // ── Read-only view ──────────────────────────────────────────────────────────
  if (readOnly) {
    if (!value?.signatureDataUrl) {
      return (
        <div className="flex items-center gap-2 text-sm text-slate-400 italic">
          <PenLine size={14} className="text-slate-300" />
          No signature captured
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {value.name && (
          <p className="text-sm font-semibold text-slate-700">{value.name}</p>
        )}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <img
            src={value.signatureDataUrl}
            alt={`Signature${value.name ? ` of ${value.name}` : ''}`}
            className="w-full h-auto max-h-[180px] object-contain"
          />
        </div>
        {value.signedAt && (
          <p className="text-xs text-slate-400">
            Signed {new Date(value.signedAt).toLocaleString('en-AU', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>
    );
  }

  // ── Editable view ───────────────────────────────────────────────────────────
  const hasSignature = !!value?.signatureDataUrl;

  return (
    <div className="flex flex-col gap-3">
      {/* Name input */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">
          Full name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Type your full name…"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
        />
      </div>

      {/* Canvas */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-slate-500">Signature</label>
          {hasSignature && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>

        <div
          className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
            error && !hasSignature
              ? 'border-red-400 bg-red-50/30'
              : hasSignature
              ? 'border-slate-300 bg-white'
              : 'border-dashed border-slate-300 bg-slate-50 hover:border-primary/50'
          }`}
        >
          {/* Placeholder hint when empty */}
          {!hasSignature && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none select-none">
              <PenLine size={20} className="text-slate-300" />
              <p className="text-xs text-slate-300 font-medium">Draw your signature here</p>
            </div>
          )}

          {/* The actual canvas — 600×180 internal resolution, responsive CSS width */}
          <canvas
            ref={canvasRef}
            width={600}
            height={180}
            style={{
              width: '100%',
              height: '180px',
              display: 'block',
              touchAction: 'none', // prevents browser scroll/zoom while drawing
              cursor: 'crosshair',
            }}
          />
        </div>

        {error && !hasSignature && (
          <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">!</span>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
