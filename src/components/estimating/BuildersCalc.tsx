import { useState } from 'react';
import {
  RotateCcw, Copy, CheckCircle2, ChevronDown, ChevronRight,
  Triangle, AlignJustify, Layers, Mountain, Shovel, Square, Ruler,
  Calculator,
} from 'lucide-react';

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
const lbl = 'block text-xs font-semibold text-slate-500 mb-1';
const sel = `${inp} appearance-none cursor-pointer`;

function n(v: string | number): number { return typeof v === 'number' ? v : parseFloat(String(v)) || 0; }
function fmt(v: number, dp = 3): string {
  if (!isFinite(v)) return '—';
  return v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy} title="Copy result"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors">
      {copied ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────
function ResultRow({ label, value, unit, highlight, copyText }: {
  label: string; value: string; unit?: string; highlight?: boolean; copyText?: string;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${highlight ? 'bg-primary/8 border border-primary/20' : 'bg-slate-50 border border-slate-100'}`}>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${highlight ? 'text-primary' : 'text-slate-800'}`}>
          {value}{unit ? <span className="text-xs font-normal text-slate-500 ml-1">{unit}</span> : null}
        </span>
        {copyText && <CopyBtn text={copyText} />}
      </div>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function CalcCard({ title, icon: Icon, children, accent = '#F97316' }: {
  title: string; icon: React.ElementType; children: React.ReactNode; accent?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="p-2 rounded-xl shrink-0" style={{ background: `${accent}18` }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        <span className="flex-1 text-sm font-bold text-slate-800">{title}</span>
        {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}

function ResetBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-500 transition-colors">
      <RotateCcw size={12} /> Reset
    </button>
  );
}

// ── 1. 3-4-5 Check Square ─────────────────────────────────────────────────────
function CheckSquareCalc() {
  const PRESETS = [
    { label: '3 / 4 / 5', a: 3, b: 4 },
    { label: '6 / 8 / 10', a: 6, b: 8 },
    { label: '9 / 12 / 15', a: 9, b: 12 },
    { label: '12 / 16 / 20', a: 12, b: 16 },
  ];
  const [unit, setUnit] = useState<'mm' | 'm'>('m');
  const [sideA, setSideA] = useState('');
  const [sideB, setSideB] = useState('');
  const [measuredC, setMeasuredC] = useState('');

  const a = n(sideA), b = n(sideB), c = n(measuredC);
  const requiredC = a > 0 && b > 0 ? Math.sqrt(a * a + b * b) : null;
  const diff = requiredC !== null && c > 0 ? c - requiredC : null;
  const isSquare = diff !== null && Math.abs(diff) < (unit === 'mm' ? 1 : 0.001);

  function applyPreset(a: number, b: number) {
    setSideA(String(a));
    setSideB(String(b));
    setMeasuredC('');
  }

  return (
    <CalcCard title="3-4-5 Check Square" icon={Triangle} accent="#6366f1">
      <div className="flex flex-col gap-3 mt-2">
        {/* Presets */}
        <div>
          <p className={lbl}>Presets</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => applyPreset(p.a, p.b)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary transition-colors bg-white">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* Unit */}
        <div>
          <label className={lbl}>Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as 'm' | 'mm')} className={sel}>
            <option value="m">Metres (m)</option>
            <option value="mm">Millimetres (mm)</option>
          </select>
        </div>
        {/* Inputs */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>Side A ({unit})</label>
            <input type="number" value={sideA} onChange={(e) => setSideA(e.target.value)} placeholder="e.g. 3" className={inp} />
          </div>
          <div>
            <label className={lbl}>Side B ({unit})</label>
            <input type="number" value={sideB} onChange={(e) => setSideB(e.target.value)} placeholder="e.g. 4" className={inp} />
          </div>
          <div>
            <label className={lbl}>Measured diagonal ({unit})</label>
            <input type="number" value={measuredC} onChange={(e) => setMeasuredC(e.target.value)} placeholder="optional" className={inp} />
          </div>
        </div>
        {/* Results */}
        {requiredC !== null && (
          <div className="flex flex-col gap-1.5">
            <ResultRow label="Required diagonal" value={fmt(requiredC, 4)} unit={unit} highlight copyText={`${fmt(requiredC, 4)} ${unit}`} />
            {diff !== null && (
              <ResultRow
                label={isSquare ? '✓ Square' : '✗ Not square — difference'}
                value={isSquare ? 'Square' : `${diff > 0 ? '+' : ''}${fmt(diff, 4)}`}
                unit={isSquare ? undefined : unit}
                highlight={isSquare}
              />
            )}
          </div>
        )}
        <div className="flex justify-end">
          <ResetBtn onClick={() => { setSideA(''); setSideB(''); setMeasuredC(''); }} />
        </div>
      </div>
    </CalcCard>
  );
}

// ── 2. Equal Spacing ──────────────────────────────────────────────────────────
function EqualSpacingCalc() {
  const [totalLength, setTotalLength] = useState('');
  const [numItems, setNumItems] = useState('');
  const [itemWidth, setItemWidth] = useState('');
  const [mode, setMode] = useState<'between' | 'ends'>('ends');
  const [unit, setUnit] = useState('mm');

  const L = n(totalLength), N = n(numItems), W = n(itemWidth);

  let gap: number | null = null;
  let ctc: number | null = null;
  let positions: number[] = [];
  let impossible = false;

  if (L > 0 && N > 0) {
    const totalItemWidth = W * N;
    if (mode === 'ends') {
      // S = (L - W*N) / (N+1)
      gap = (L - totalItemWidth) / (N + 1);
    } else {
      // S = (L - W*N) / (N-1)  (gaps between items only, no end gaps)
      gap = N > 1 ? (L - totalItemWidth) / (N - 1) : 0;
    }
    if (gap < 0) { impossible = true; gap = null; }
    else {
      ctc = W + gap;
      // Positions from start (to centre of each item)
      if (mode === 'ends') {
        for (let i = 0; i < N; i++) {
          positions.push(gap + W / 2 + i * (W + gap));
        }
      } else {
        for (let i = 0; i < N; i++) {
          positions.push(W / 2 + i * (W + gap));
        }
      }
    }
  }

  return (
    <CalcCard title="Equal Spacing" icon={AlignJustify} accent="#0ea5e9">
      <div className="flex flex-col gap-3 mt-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={sel}>
              <option value="mm">mm</option>
              <option value="m">m</option>
              <option value="mm (posts)">mm (posts)</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Spacing mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'between' | 'ends')} className={sel}>
              <option value="ends">Gaps including both ends</option>
              <option value="between">Gaps between items only</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>Total length ({unit})</label>
            <input type="number" value={totalLength} onChange={(e) => setTotalLength(e.target.value)} placeholder="e.g. 3600" className={inp} />
          </div>
          <div>
            <label className={lbl}>No. of items</label>
            <input type="number" value={numItems} onChange={(e) => setNumItems(e.target.value)} placeholder="e.g. 5" className={inp} />
          </div>
          <div>
            <label className={lbl}>Item width ({unit})</label>
            <input type="number" value={itemWidth} onChange={(e) => setItemWidth(e.target.value)} placeholder="e.g. 90" className={inp} />
          </div>
        </div>
        {impossible && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
            ⚠ Impossible — items are wider than the total length.
          </div>
        )}
        {gap !== null && ctc !== null && (
          <div className="flex flex-col gap-1.5">
            <ResultRow label="Gap size" value={fmt(gap, 2)} unit={unit} highlight copyText={`${fmt(gap, 2)} ${unit}`} />
            <ResultRow label="Centre-to-centre" value={fmt(ctc, 2)} unit={unit} copyText={`${fmt(ctc, 2)} ${unit}`} />
            {positions.length > 0 && positions.length <= 20 && (
              <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Item centres from start ({unit})</p>
                <div className="flex flex-wrap gap-1.5">
                  {positions.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-mono text-slate-700">
                      {i + 1}: {fmt(p, 1)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <ResetBtn onClick={() => { setTotalLength(''); setNumItems(''); setItemWidth(''); }} />
        </div>
      </div>
    </CalcCard>
  );
}

// ── 3. Concrete Calculator ────────────────────────────────────────────────────
function ConcreteCalc() {
  const [mode, setMode] = useState<'slab' | 'pier'>('slab');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [diameter, setDiameter] = useState('');
  const [numPiers, setNumPiers] = useState('1');
  const [wastage, setWastage] = useState('10');

  let m3 = 0;
  if (mode === 'slab') {
    m3 = n(length) * n(width) * n(depth);
  } else {
    const r = n(diameter) / 2;
    m3 = Math.PI * r * r * n(depth) * n(numPiers);
  }
  const w = n(wastage) / 100;
  const m3WithWaste = m3 * (1 + w);

  const copyText = `${fmt(m3WithWaste, 3)} m³ (incl. ${wastage}% wastage)`;

  return (
    <CalcCard title="Let's Pour Concrete" icon={Layers} accent="#f59e0b">
      <div className="flex flex-col gap-3 mt-2">
        <div>
          <label className={lbl}>Mode</label>
          <div className="flex gap-2">
            {(['slab', 'pier'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors ${mode === m ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-200 text-slate-600 hover:border-amber-400'}`}>
                {m === 'slab' ? 'Slab / Rectangle' : 'Pier / Round Hole'}
              </button>
            ))}
          </div>
        </div>
        {mode === 'slab' ? (
          <div className="grid grid-cols-3 gap-2">
            <div><label className={lbl}>Length (m)</label><input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 6" className={inp} /></div>
            <div><label className={lbl}>Width (m)</label><input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="e.g. 4" className={inp} /></div>
            <div><label className={lbl}>Depth (m)</label><input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="e.g. 0.1" className={inp} /></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Diameter (m)</label><input type="number" value={diameter} onChange={(e) => setDiameter(e.target.value)} placeholder="e.g. 0.3" className={inp} /></div>
            <div><label className={lbl}>Depth (m)</label><input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="e.g. 1.2" className={inp} /></div>
            <div><label className={lbl}>No. of piers</label><input type="number" value={numPiers} onChange={(e) => setNumPiers(e.target.value)} placeholder="1" className={inp} /></div>
          </div>
        )}
        <div>
          <label className={lbl}>Wastage %</label>
          <input type="number" value={wastage} onChange={(e) => setWastage(e.target.value)} placeholder="10" className={inp} />
        </div>
        {m3 > 0 && (
          <div className="flex flex-col gap-1.5">
            <ResultRow label="Volume (net)" value={fmt(m3, 3)} unit="m³" />
            <ResultRow label={`Volume incl. ${wastage}% wastage`} value={fmt(m3WithWaste, 3)} unit="m³" highlight copyText={copyText} />
          </div>
        )}
        <div className="flex justify-end">
          <ResetBtn onClick={() => { setLength(''); setWidth(''); setDepth(''); setDiameter(''); setNumPiers('1'); setWastage('10'); }} />
        </div>
      </div>
    </CalcCard>
  );
}

// ── 4. Gravel Calculator ──────────────────────────────────────────────────────
function GravelCalc() {
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [density, setDensity] = useState('1.5');

  const m3 = n(length) * n(width) * n(depth);
  const tonnes = m3 * n(density);

  return (
    <CalcCard title="Yard Gravel Calculator" icon={Mountain} accent="#84cc16">
      <div className="flex flex-col gap-3 mt-2">
        <div className="grid grid-cols-3 gap-2">
          <div><label className={lbl}>Length (m)</label><input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 10" className={inp} /></div>
          <div><label className={lbl}>Width (m)</label><input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="e.g. 5" className={inp} /></div>
          <div><label className={lbl}>Depth (m)</label><input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="e.g. 0.1" className={inp} /></div>
        </div>
        <div>
          <label className={lbl}>Density (t/m³)</label>
          <input type="number" value={density} onChange={(e) => setDensity(e.target.value)} placeholder="1.5" className={inp} />
          <p className="text-[10px] text-slate-400 mt-1">Typical: gravel 1.4–1.7, crushed rock 1.6–1.8, sand 1.5–1.7</p>
        </div>
        {m3 > 0 && (
          <div className="flex flex-col gap-1.5">
            <ResultRow label="Volume" value={fmt(m3, 3)} unit="m³" />
            <ResultRow label="Estimated weight" value={fmt(tonnes, 2)} unit="tonnes" highlight copyText={`${fmt(m3, 3)} m³ / ${fmt(tonnes, 2)} t`} />
          </div>
        )}
        <div className="flex justify-end">
          <ResetBtn onClick={() => { setLength(''); setWidth(''); setDepth(''); setDensity('1.5'); }} />
        </div>
      </div>
    </CalcCard>
  );
}

// ── 5. Soil Calculator ────────────────────────────────────────────────────────
function SoilCalc() {
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [density, setDensity] = useState('1.3');

  const m3 = n(length) * n(width) * n(depth);
  const litres = m3 * 1000;
  const tonnes = m3 * n(density);

  return (
    <CalcCard title="Soil Calculator" icon={Shovel} accent="#a16207">
      <div className="flex flex-col gap-3 mt-2">
        <div className="grid grid-cols-3 gap-2">
          <div><label className={lbl}>Length (m)</label><input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 5" className={inp} /></div>
          <div><label className={lbl}>Width (m)</label><input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="e.g. 3" className={inp} /></div>
          <div><label className={lbl}>Depth (m)</label><input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="e.g. 0.3" className={inp} /></div>
        </div>
        <div>
          <label className={lbl}>Density (t/m³) — optional</label>
          <input type="number" value={density} onChange={(e) => setDensity(e.target.value)} placeholder="1.3" className={inp} />
          <p className="text-[10px] text-slate-400 mt-1">Typical: topsoil 0.9–1.3, fill 1.2–1.6</p>
        </div>
        {m3 > 0 && (
          <div className="flex flex-col gap-1.5">
            <ResultRow label="Volume" value={fmt(m3, 3)} unit="m³" highlight copyText={`${fmt(m3, 3)} m³`} />
            <ResultRow label="Litres" value={fmt(litres, 0)} unit="L" />
            <ResultRow label="Estimated weight" value={fmt(tonnes, 2)} unit="tonnes" />
          </div>
        )}
        <div className="flex justify-end">
          <ResetBtn onClick={() => { setLength(''); setWidth(''); setDepth(''); setDensity('1.3'); }} />
        </div>
      </div>
    </CalcCard>
  );
}

// ── 6. Blocks Calculator ──────────────────────────────────────────────────────
function BlocksCalc() {
  const [wallLength, setWallLength] = useState('');
  const [wallHeight, setWallHeight] = useState('');
  const [blockLength, setBlockLength] = useState('390');
  const [blockHeight, setBlockHeight] = useState('190');
  const [wastage, setWastage] = useState('5');

  const wallArea = n(wallLength) * n(wallHeight);
  const blockArea = (n(blockLength) / 1000) * (n(blockHeight) / 1000);
  const blocks = blockArea > 0 ? wallArea / blockArea : 0;
  const blocksWithWaste = blocks * (1 + n(wastage) / 100);

  return (
    <CalcCard title="Blocks Calculator" icon={Square} accent="#8b5cf6">
      <div className="flex flex-col gap-3 mt-2">
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>Wall length (m)</label><input type="number" value={wallLength} onChange={(e) => setWallLength(e.target.value)} placeholder="e.g. 6" className={inp} /></div>
          <div><label className={lbl}>Wall height (m)</label><input type="number" value={wallHeight} onChange={(e) => setWallHeight(e.target.value)} placeholder="e.g. 2.4" className={inp} /></div>
          <div><label className={lbl}>Block length (mm)</label><input type="number" value={blockLength} onChange={(e) => setBlockLength(e.target.value)} placeholder="390" className={inp} /></div>
          <div><label className={lbl}>Block height (mm)</label><input type="number" value={blockHeight} onChange={(e) => setBlockHeight(e.target.value)} placeholder="190" className={inp} /></div>
        </div>
        <div>
          <label className={lbl}>Wastage %</label>
          <input type="number" value={wastage} onChange={(e) => setWastage(e.target.value)} placeholder="5" className={inp} />
        </div>
        {wallArea > 0 && blocks > 0 && (
          <div className="flex flex-col gap-1.5">
            <ResultRow label="Wall area" value={fmt(wallArea, 2)} unit="m²" />
            <ResultRow label="Blocks (net)" value={fmt(Math.ceil(blocks), 0)} unit="blocks" />
            <ResultRow label={`Blocks incl. ${wastage}% wastage`} value={fmt(Math.ceil(blocksWithWaste), 0)} unit="blocks" highlight copyText={`${Math.ceil(blocksWithWaste)} blocks`} />
          </div>
        )}
        <div className="flex justify-end">
          <ResetBtn onClick={() => { setWallLength(''); setWallHeight(''); setBlockLength('390'); setBlockHeight('190'); setWastage('5'); }} />
        </div>
      </div>
    </CalcCard>
  );
}

// ── 7. Running Measurement ────────────────────────────────────────────────────
function RunningMeasurementCalc() {
  const [segments, setSegments] = useState<string[]>(['', '', '']);
  const [unit, setUnit] = useState('mm');
  const [copied, setCopied] = useState(false);

  const values = segments.map((s) => n(s));
  const runningTotals: number[] = [];
  let acc = 0;
  for (const v of values) {
    acc += v;
    runningTotals.push(acc);
  }
  const total = acc;

  function addRow() { setSegments((s) => [...s, '']); }
  function removeRow(i: number) { setSegments((s) => s.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, v: string) { setSegments((s) => s.map((x, idx) => idx === i ? v : x)); }

  const tableText = segments
    .map((s, i) => `${i + 1}\t${s || '0'} ${unit}\t${fmt(runningTotals[i], 2)} ${unit}`)
    .join('\n') + `\nTotal\t\t${fmt(total, 2)} ${unit}`;

  function copyTable() {
    void navigator.clipboard.writeText(tableText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <CalcCard title="Running Measurement" icon={Ruler} accent="#ec4899">
      <div className="flex flex-col gap-3 mt-2">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className={lbl}>Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={sel}>
              <option value="mm">mm</option>
              <option value="m">m</option>
            </select>
          </div>
        </div>
        {/* Table */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold text-slate-500 w-8">#</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500">Segment ({unit})</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500">Running total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {segments.map((s, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      value={s}
                      onChange={(e) => updateRow(i, e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary bg-white"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-slate-700">
                    {fmt(runningTotals[i], 2)}
                  </td>
                  <td className="px-2 py-1">
                    {segments.length > 1 && (
                      <button onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-400 transition-colors text-xs">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-primary/5 border-t-2 border-primary/20">
                <td colSpan={2} className="px-3 py-2 text-xs font-bold text-slate-700">Total</td>
                <td className="px-3 py-2 text-right text-sm font-bold text-primary">{fmt(total, 2)} <span className="text-xs font-normal text-slate-500">{unit}</span></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center justify-between">
          <button onClick={addRow}
            className="text-xs font-semibold text-primary hover:text-orange-600 transition-colors">
            + Add row
          </button>
          <div className="flex gap-2">
            <button onClick={copyTable}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors">
              {copied ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy table'}
            </button>
            <ResetBtn onClick={() => setSegments(['', '', ''])} />
          </div>
        </div>
      </div>
    </CalcCard>
  );
}

// ── Simple calculators ────────────────────────────────────────────────────────
function SimpleCalcs() {
  // Area
  const [aL, setAL] = useState(''); const [aW, setAW] = useState('');
  // Volume
  const [vL, setVL] = useState(''); const [vW, setVW] = useState(''); const [vD, setVD] = useState('');
  // Lineal
  const [linQty, setLinQty] = useState(''); const [linLen, setLinLen] = useState('');
  // Labour
  const [labHrs, setLabHrs] = useState(''); const [labRate, setLabRate] = useState('');
  // Markup/GST
  const [mkCost, setMkCost] = useState(''); const [mkPct, setMkPct] = useState('10');

  const area = n(aL) * n(aW);
  const vol = n(vL) * n(vW) * n(vD);
  const lin = n(linQty) * n(linLen);
  const labour = n(labHrs) * n(labRate);
  const mkSell = n(mkCost) * (1 + n(mkPct) / 100);
  const mkGst = mkSell * 0.1;

  return (
    <CalcCard title="Quick Calculators" icon={Calculator} accent="#64748b">
      <div className="flex flex-col gap-4 mt-2">
        {/* Area */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Area (m²)</p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div><label className={lbl}>Length (m)</label><input type="number" value={aL} onChange={(e) => setAL(e.target.value)} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>Width (m)</label><input type="number" value={aW} onChange={(e) => setAW(e.target.value)} placeholder="0" className={inp} /></div>
            <ResultRow label="Area" value={fmt(area, 3)} unit="m²" highlight copyText={`${fmt(area, 3)} m²`} />
          </div>
        </div>
        {/* Volume */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Volume (m³)</p>
          <div className="grid grid-cols-4 gap-2 items-end">
            <div><label className={lbl}>L (m)</label><input type="number" value={vL} onChange={(e) => setVL(e.target.value)} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>W (m)</label><input type="number" value={vW} onChange={(e) => setVW(e.target.value)} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>D (m)</label><input type="number" value={vD} onChange={(e) => setVD(e.target.value)} placeholder="0" className={inp} /></div>
            <ResultRow label="Vol" value={fmt(vol, 3)} unit="m³" highlight copyText={`${fmt(vol, 3)} m³`} />
          </div>
        </div>
        {/* Lineal */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Lineal metres</p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div><label className={lbl}>Qty</label><input type="number" value={linQty} onChange={(e) => setLinQty(e.target.value)} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>Length (m)</label><input type="number" value={linLen} onChange={(e) => setLinLen(e.target.value)} placeholder="0" className={inp} /></div>
            <ResultRow label="Total LM" value={fmt(lin, 2)} unit="m" highlight copyText={`${fmt(lin, 2)} m`} />
          </div>
        </div>
        {/* Labour */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Labour total</p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div><label className={lbl}>Hours</label><input type="number" value={labHrs} onChange={(e) => setLabHrs(e.target.value)} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>Rate ($/hr)</label><input type="number" value={labRate} onChange={(e) => setLabRate(e.target.value)} placeholder="0" className={inp} /></div>
            <ResultRow label="Total" value={`$${fmt(labour, 2)}`} highlight copyText={`$${fmt(labour, 2)}`} />
          </div>
        </div>
        {/* Markup / GST */}
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Markup / GST</p>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div><label className={lbl}>Cost ($)</label><input type="number" value={mkCost} onChange={(e) => setMkCost(e.target.value)} placeholder="0" className={inp} /></div>
            <div><label className={lbl}>Markup %</label><input type="number" value={mkPct} onChange={(e) => setMkPct(e.target.value)} placeholder="10" className={inp} /></div>
            <div className="flex flex-col gap-1">
              <ResultRow label="Sell price" value={`$${fmt(mkSell, 2)}`} highlight copyText={`$${fmt(mkSell, 2)}`} />
              <ResultRow label="GST (10%)" value={`$${fmt(mkGst, 2)}`} />
            </div>
          </div>
        </div>
      </div>
    </CalcCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function BuildersCalc() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-slate-700">Builders Calculators</h2>
        <span className="text-xs text-slate-400">— browser-side, no data saved</span>
      </div>
      <CheckSquareCalc />
      <EqualSpacingCalc />
      <ConcreteCalc />
      <GravelCalc />
      <SoilCalc />
      <BlocksCalc />
      <RunningMeasurementCalc />
      <SimpleCalcs />
    </div>
  );
}
