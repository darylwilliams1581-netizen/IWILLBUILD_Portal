export interface CompanyFile {
  id: number; companyId: number; jobId: number | null; fleetAssetId: number | null;
  uploadedByUserId: string; uploaderName: string | null; originalName: string;
  storedName: string; mimeType: string; sizeBytes: number; fileCategory: string;
  label: string | null; notes: string | null; createdAt: string;
}
export const FILE_CATEGORIES = ['Job','Fleet','Company','Forms','Photos','Reports','Templates','Other'] as const;
export type FileCategory = typeof FILE_CATEGORIES[number];
export const ALLOWED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — must match server MAX_FILE_SIZE_BYTES
export function formatBytes(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
type MimeIcon = 'pdf' | 'img' | 'doc' | 'xls' | 'txt' | 'zip' | 'file';
export function mimeIcon(m: string): MimeIcon {
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'img';
  if (m.includes('word') || m.includes('document')) return 'doc';
  if (m.includes('excel') || m.includes('spreadsheet') || m === 'text/csv') return 'xls';
  if (m === 'text/plain') return 'txt';
  if (m.includes('zip')) return 'zip';
  return 'file';
}
export function mimeColor(m: string): string {
  const t = mimeIcon(m);
  if (t === 'pdf') return 'text-red-500 bg-red-50 border-red-200';
  if (t === 'img') return 'text-blue-500 bg-blue-50 border-blue-200';
  if (t === 'doc') return 'text-blue-700 bg-blue-50 border-blue-200';
  if (t === 'xls') return 'text-green-600 bg-green-50 border-green-200';
  if (t === 'txt') return 'text-slate-500 bg-slate-100 border-slate-200';
  if (t === 'zip') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-slate-500 bg-slate-100 border-slate-200';
}
export function mimeLabel(m: string): string {
  const t = mimeIcon(m);
  if (t === 'pdf') return 'PDF'; if (t === 'img') return 'Image';
  if (t === 'doc') return 'Word'; if (t === 'xls') return 'Excel';
  if (t === 'txt') return 'Text'; if (t === 'zip') return 'ZIP';
  return 'File';
}
export async function fetchFiles(params?: { jobId?: number; fleetAssetId?: number }): Promise<CompanyFile[]> {
  let url = '/api/files';
  if (params?.jobId) url = '/api/jobs/' + params.jobId + '/files';
  else if (params?.fleetAssetId) url = '/api/fleet/' + params.fleetAssetId + '/files';
  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json() as { files?: CompanyFile[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch files');
  return data.files ?? [];
}
export async function uploadFile(o: { file: File; fileCategory?: string; label?: string; notes?: string; jobId?: number; fleetAssetId?: number; }): Promise<CompanyFile> {
  const fd = new FormData(); fd.append('file', o.file);
  if (o.fileCategory) fd.append('fileCategory', o.fileCategory);
  if (o.label) fd.append('label', o.label);
  if (o.notes) fd.append('notes', o.notes);
  if (o.jobId) fd.append('jobId', String(o.jobId));
  if (o.fleetAssetId) fd.append('fleetAssetId', String(o.fleetAssetId));
  const res = await fetch('/api/files', { method: 'POST', credentials: 'include', body: fd });
  const d = await res.json() as { file?: CompanyFile; error?: string };
  if (!res.ok) throw new Error(d.error ?? 'Upload failed');
  return d.file!;
}
export async function deleteFile(id: number): Promise<void> {
  const res = await fetch('/api/files/' + id, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? 'Delete failed'); }
}
export function downloadFile(id: number, originalName: string): void {
  const a = document.createElement('a');
  a.href = '/api/files/' + id + '/download';
  a.download = originalName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
