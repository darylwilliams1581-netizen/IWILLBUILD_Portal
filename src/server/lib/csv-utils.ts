/**
 * Shared CSV parsing / serialisation helpers.
 * Pure functions — no DB, no auth.
 */

export interface ParsedCostGuideRow {
  description: string;
  unit: string;
  rate: string;
}

export interface ParsedEstimateLineRow {
  description: string;
  quantity: string;
  unit: string;
  rate: string;
}

export interface CsvRowError {
  row: number;       // 1-based (header = 0)
  raw: string;
  reason: string;
}

export interface CostGuideCsvResult {
  valid: ParsedCostGuideRow[];
  errors: CsvRowError[];
}

export interface EstimateCsvResult {
  valid: ParsedEstimateLineRow[];
  errors: CsvRowError[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  // Simple RFC-4180-ish split: handles quoted fields with commas inside.
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function isNumeric(v: string): boolean {
  return v !== '' && !isNaN(Number(v));
}

// ── Cost Guide ────────────────────────────────────────────────────────────────

export function parseCostGuideCsv(raw: string): CostGuideCsvResult {
  const lines = raw.split(/\r?\n/);
  const valid: ParsedCostGuideRow[] = [];
  const errors: CsvRowError[] = [];

  // Find header row (skip BOM / blank lines)
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase().replace(/\s/g, '');
    if (lower.includes('description') && lower.includes('rate')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    errors.push({ row: 0, raw: '', reason: 'Could not find header row. Expected columns: description, unit, rate' });
    return { valid, errors };
  }

  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const descIdx  = headers.indexOf('description');
  const unitIdx  = headers.indexOf('unit');
  const rateIdx  = headers.indexOf('rate');

  if (descIdx === -1) { errors.push({ row: 0, raw: '', reason: 'Missing "description" column' }); return { valid, errors }; }
  if (rateIdx === -1) { errors.push({ row: 0, raw: '', reason: 'Missing "rate" column' }); return { valid, errors }; }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // skip blank rows

    const cols = splitCsvLine(line);
    const description = (cols[descIdx] ?? '').trim();
    const unit        = unitIdx >= 0 ? (cols[unitIdx] ?? '').trim() : '';
    const rateRaw     = (cols[rateIdx] ?? '').trim();

    if (!description) {
      errors.push({ row: i + 1, raw: line, reason: 'Description is required' });
      continue;
    }
    if (!isNumeric(rateRaw)) {
      errors.push({ row: i + 1, raw: line, reason: `Rate "${rateRaw}" is not a valid number` });
      continue;
    }

    valid.push({ description, unit, rate: rateRaw });
  }

  return { valid, errors };
}

export function costGuideItemsToCsv(items: { description: string; unit: string | null; rate: string }[]): string {
  const header = 'description,unit,rate\n';
  const rows = items.map((i) => {
    const desc = `"${(i.description ?? '').replace(/"/g, '""')}"`;
    const unit = `"${(i.unit ?? '').replace(/"/g, '""')}"`;
    const rate = i.rate ?? '0';
    return `${desc},${unit},${rate}`;
  });
  return header + rows.join('\n');
}

export const COST_GUIDE_TEMPLATE = `description,unit,rate\nFix out labour,hr,92\n`;

// ── Estimate Lines ────────────────────────────────────────────────────────────

export function parseEstimateCsv(raw: string): EstimateCsvResult {
  const lines = raw.split(/\r?\n/);
  const valid: ParsedEstimateLineRow[] = [];
  const errors: CsvRowError[] = [];

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase().replace(/\s/g, '');
    if (lower.includes('description') && lower.includes('rate')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    errors.push({ row: 0, raw: '', reason: 'Could not find header row. Expected columns: description, quantity, unit, rate' });
    return { valid, errors };
  }

  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const descIdx  = headers.indexOf('description');
  const qtyIdx   = headers.indexOf('quantity');
  const unitIdx  = headers.indexOf('unit');
  const rateIdx  = headers.indexOf('rate');

  if (descIdx === -1) { errors.push({ row: 0, raw: '', reason: 'Missing "description" column' }); return { valid, errors }; }
  if (rateIdx === -1) { errors.push({ row: 0, raw: '', reason: 'Missing "rate" column' }); return { valid, errors }; }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = splitCsvLine(line);
    const description = (cols[descIdx] ?? '').trim();
    const qtyRaw      = qtyIdx >= 0 ? (cols[qtyIdx] ?? '').trim() : '';
    const unit        = unitIdx >= 0 ? (cols[unitIdx] ?? '').trim() : '';
    const rateRaw     = (cols[rateIdx] ?? '').trim();

    if (!description) {
      errors.push({ row: i + 1, raw: line, reason: 'Description is required' });
      continue;
    }

    // quantity: default to '1' if blank
    const quantity = qtyRaw === '' ? '1' : qtyRaw;
    if (!isNumeric(quantity)) {
      errors.push({ row: i + 1, raw: line, reason: `Quantity "${qtyRaw}" is not a valid number` });
      continue;
    }
    if (!isNumeric(rateRaw)) {
      errors.push({ row: i + 1, raw: line, reason: `Rate "${rateRaw}" is not a valid number` });
      continue;
    }

    valid.push({ description, quantity, unit, rate: rateRaw });
  }

  return { valid, errors };
}

export function estimateLinesToCsv(lines: { description: string; quantity: string; unit: string | null; rate: string }[]): string {
  const header = 'description,quantity,unit,rate\n';
  const rows = lines.map((l) => {
    const desc = `"${(l.description ?? '').replace(/"/g, '""')}"`;
    const qty  = l.quantity ?? '1';
    const unit = `"${(l.unit ?? '').replace(/"/g, '""')}"`;
    const rate = l.rate ?? '0';
    return `${desc},${qty},${unit},${rate}`;
  });
  return header + rows.join('\n');
}

export const ESTIMATE_TEMPLATE = `description,quantity,unit,rate\nSupply and install internal door,1,each,183\n`;
