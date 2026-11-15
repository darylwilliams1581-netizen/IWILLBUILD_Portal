import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { exportFleetLogbook, fleetLogbookExportUrl } from '@/lib/fleet-logbook-export';
const mocks = vi.hoisted(() => ({ write: vi.fn(), share: vi.fn(), remove: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: mocks.write, deleteFile: mocks.remove }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));
beforeEach(() => { vi.clearAllMocks(); mocks.write.mockResolvedValue({ uri: 'file:///cache/logbook.csv' }); mocks.share.mockResolvedValue({}); mocks.remove.mockResolvedValue({}); });
afterEach(() => vi.unstubAllGlobals());
it('exports the whole period to the native share sheet with UTF-8 text and cleans its temporary file', async () => {
  const csv = 'Destination,Km\nCafé site,12\n';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => csv })));
  expect(fleetLogbookExportUrl(7, '3')).toBe('/api/fleet/7/trip-logs/export?periodId=3');
  await exportFleetLogbook(7, '3');
  expect(fetch).toHaveBeenCalledWith('/api/fleet/7/trip-logs/export?periodId=3', { credentials: 'include' });
  expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ data: csv, encoding: 'utf8' }));
  expect(mocks.share).toHaveBeenCalledWith({ title: 'Fleet logbook CSV', files: ['file:///cache/logbook.csv'] });
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it('never shares a failed export response as CSV', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  await expect(exportFleetLogbook(7, '')).rejects.toThrow('Could not export');
  expect(mocks.share).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
});
