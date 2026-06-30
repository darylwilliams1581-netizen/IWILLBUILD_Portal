/** Returns the API path to stream/download a stored file by its DB record id */
export function fileServePath(fileId: number): string {
  const base = '/api/files';
  return `${base}/${fileId}/download`;
}

export const DRAWING_DISCIPLINES = [
  'Architectural','Structural','Civil','Mechanical',
  'Electrical','Hydraulic','Landscape','Survey','Other',
] as const;

export const DRAWING_STATUSES = [
  'For Construction','For Review','Preliminary',
  'As Built','Superseded','Void',
] as const;

export const STATUS_BADGE: Record<string, string> = {
  'For Construction': 'bg-emerald-100 text-emerald-800',
  'For Review':       'bg-amber-100 text-amber-800',
  'Preliminary':      'bg-blue-100 text-blue-800',
  'As Built':         'bg-purple-100 text-purple-800',
  'Superseded':       'bg-slate-100 text-slate-500',
  'Void':             'bg-red-100 text-red-700',
};

export function fileIsPdf(mime: string | null, name: string | null): boolean {
  return mime === 'application/pdf' || (name?.toLowerCase().endsWith('.pdf') ?? false);
}

export function fileIsDwg(mime: string | null, name: string | null): boolean {
  const n = name?.toLowerCase() ?? '';
  return n.endsWith('.dwg') || n.endsWith('.dxf') ||
    (mime ?? '').includes('acad') || (mime ?? '').includes('dwg') || (mime ?? '').includes('dxf');
}
