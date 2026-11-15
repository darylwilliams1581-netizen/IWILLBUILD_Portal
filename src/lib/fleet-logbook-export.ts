import { Capacitor } from '@capacitor/core';

export function fleetLogbookExportUrl(vehicleId: number, periodId: string) {
  return `/api/fleet/${vehicleId}/trip-logs/export${periodId ? `?periodId=${encodeURIComponent(periodId)}` : ''}`;
}
/** Download the entire server-selected period, independent of table filters/page. */
export async function exportFleetLogbook(vehicleId: number, periodId: string) {
  const response = await fetch(fleetLogbookExportUrl(vehicleId, periodId), { credentials: 'include' });
  if (!response.ok) throw Error('Could not export the logbook. Please reconnect and retry.');
  const csv = await response.text();
  if (/^\s*[<{]/.test(csv)) throw Error('The server did not return a CSV. Please sign in and retry.');
  const name = `logbook-${vehicleId}${periodId ? `-period-${periodId}` : ''}.csv`;
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const path = `logbook-exports/${Date.now()}/${name}`;
    const file = await Filesystem.writeFile({ path, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
    try { await Share.share({ title: 'Fleet logbook CSV', files: [file.uri] }); }
    finally { await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}); }
  } else {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
