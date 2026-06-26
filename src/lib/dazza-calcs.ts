// ── Dazza Construction Calculators ───────────────────────────────────────────
// All calculations run browser-side. No API calls needed.

export interface CalcResult {
  value: number;
  unit: string;
  label: string;
  detail?: string;
}

// ── Concrete volumes ──────────────────────────────────────────────────────────

/** Pier (cylinder) volume in m³ */
export function calcPier(diameterMm: number, depthM: number, qty: number = 1): CalcResult {
  const r = (diameterMm / 1000) / 2;
  const vol = Math.PI * r * r * depthM * qty;
  return {
    value: Math.round(vol * 1000) / 1000,
    unit: 'm³',
    label: `${qty} × Ø${diameterMm}mm pier${qty > 1 ? 's' : ''} @ ${depthM}m deep`,
    detail: `Add 10–15% for waste. Order: ${Math.ceil(vol * 1.12 * 100) / 100} m³ recommended.`,
  };
}

/** Slab volume in m³ */
export function calcSlab(lengthM: number, widthM: number, thicknessMm: number): CalcResult {
  const vol = lengthM * widthM * (thicknessMm / 1000);
  return {
    value: Math.round(vol * 1000) / 1000,
    unit: 'm³',
    label: `Slab ${lengthM}m × ${widthM}m × ${thicknessMm}mm`,
    detail: `Add 10% for waste. Order: ${Math.ceil(vol * 1.10 * 100) / 100} m³ recommended.`,
  };
}

/** Pit / box volume in m³ */
export function calcPit(lengthM: number, widthM: number, depthM: number): CalcResult {
  const vol = lengthM * widthM * depthM;
  return {
    value: Math.round(vol * 1000) / 1000,
    unit: 'm³',
    label: `Pit ${lengthM}m × ${widthM}m × ${depthM}m deep`,
    detail: `Add 10% for waste. Order: ${Math.ceil(vol * 1.10 * 100) / 100} m³ recommended.`,
  };
}

/** Trench / footing volume in m³ */
export function calcTrench(lengthM: number, widthM: number, depthM: number): CalcResult {
  const vol = lengthM * widthM * depthM;
  return {
    value: Math.round(vol * 1000) / 1000,
    unit: 'm³',
    label: `Trench ${lengthM}m × ${widthM}m wide × ${depthM}m deep`,
    detail: `Add 10% for waste. Order: ${Math.ceil(vol * 1.10 * 100) / 100} m³ recommended.`,
  };
}

/** Pipe / cylinder volume in m³ */
export function calcPipe(outerDiamMm: number, innerDiamMm: number, lengthM: number): CalcResult {
  const ro = (outerDiamMm / 1000) / 2;
  const ri = (innerDiamMm / 1000) / 2;
  const vol = Math.PI * (ro * ro - ri * ri) * lengthM;
  return {
    value: Math.round(vol * 1000) / 1000,
    unit: 'm³',
    label: `Pipe Ø${outerDiamMm}mm OD / Ø${innerDiamMm}mm ID × ${lengthM}m`,
  };
}

// ── GST ───────────────────────────────────────────────────────────────────────

export function calcGstAdd(exGst: number): CalcResult {
  const gst = exGst * 0.1;
  return {
    value: Math.round((exGst + gst) * 100) / 100,
    unit: '$',
    label: `$${exGst.toFixed(2)} + GST`,
    detail: `GST: $${gst.toFixed(2)} | Total inc. GST: $${(exGst + gst).toFixed(2)}`,
  };
}

export function calcGstRemove(incGst: number): CalcResult {
  const exGst = incGst / 1.1;
  const gst = incGst - exGst;
  return {
    value: Math.round(exGst * 100) / 100,
    unit: '$',
    label: `$${incGst.toFixed(2)} inc. GST`,
    detail: `Ex-GST: $${exGst.toFixed(2)} | GST component: $${gst.toFixed(2)}`,
  };
}

// ── Fall / grade ──────────────────────────────────────────────────────────────

export function calcFall(runM: number, fallMm: number): CalcResult {
  const grade = fallMm / (runM * 1000);
  const ratio = Math.round(1 / grade);
  const percent = Math.round(grade * 10000) / 100;
  return {
    value: percent,
    unit: '%',
    label: `${fallMm}mm fall over ${runM}m run`,
    detail: `Grade: 1:${ratio} (${percent}%) — Min for drainage is typically 1:100 (1%). Verify with engineer.`,
  };
}

export function calcFallFromGrade(runM: number, gradeRatio: number): CalcResult {
  const fallMm = (runM * 1000) / gradeRatio;
  return {
    value: Math.round(fallMm * 10) / 10,
    unit: 'mm',
    label: `1:${gradeRatio} grade over ${runM}m`,
    detail: `Fall required: ${(Math.round(fallMm * 10) / 10)}mm`,
  };
}

// ── Simple math ───────────────────────────────────────────────────────────────

export function calcSimple(expression: string): CalcResult | null {
  try {
    // Safe eval: only allow numbers, operators, spaces, parentheses, dots
    if (!/^[\d\s+\-*/().%]+$/.test(expression)) return null;
    // eslint-disable-next-line no-eval
    const result = eval(expression) as number;
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return {
      value: Math.round(result * 10000) / 10000,
      unit: '',
      label: expression,
    };
  } catch {
    return null;
  }
}
