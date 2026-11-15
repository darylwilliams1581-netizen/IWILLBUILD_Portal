import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, configure } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import FleetDetail from '@/pages/fleet-detail';
import FleetLogbookPanel from '@/components/fleet/FleetLogbookPanel';
import type { FleetAsset } from '@/lib/fleet-api';
configure({ asyncUtilTimeout: 5000 });
const state = vi.hoisted(() => ({ company: 1, user: 'driver', admin: true, exportCsv: vi.fn() }));
vi.mock('@/lib/auth/auth-client', () => ({ useSession: () => ({ user: { id: state.user } }) }));
vi.mock('@/lib/usePermissions', () => ({
  useMe: () => ({ me: { user: { id: state.user }, profile: { companyId: state.company, role: state.admin ? 'admin' : 'worker' } } }),
  usePermissions: () => ({ isAdmin: state.admin, isOwner: false, role: state.admin ? 'admin' : 'worker' }),
}));
vi.mock('@/lib/fleet-logbook-export', () => ({ exportFleetLogbook: state.exportCsv }));
vi.mock('@dr.pogodin/react-helmet', () => ({ Helmet: () => null }));
vi.mock('@/components/FilePanel', () => ({ default: () => null }));
vi.mock('@/components/notes/NotesPanel', () => ({ default: () => null }));
const asset = { id: 7, companyId: 1, name: 'Hilux', type: 'Vehicle', status: 'Active',
  logbookActive: true, logbookStartedAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z', createdAt: '2026-11-01T00:00:00Z' } as FleetAsset;
let fail = false;
const reply = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
beforeEach(() => {
  state.company = 1; state.user = 'driver'; state.admin = true; fail = false;
  state.exportCsv.mockReset().mockResolvedValue(undefined); globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = String(url);
    if (path === '/api/fleet/7') return reply({ asset: options?.method === 'PUT' ? { ...asset, logbookActive: false, logbookEndedAt: '2026-11-15T00:00:00Z' } : asset });
    if (path.endsWith('/driver-sessions')) return reply({ sessions: [] });
    if (path.endsWith('/logbook-records')) return reply({ annual: [], periods: [
      { id: 3, started_at: '2026-11-14T00:00:00Z', ended_at: null, odometer_start: '1000' },
      { id: 2, started_at: '2026-08-01T00:00:00Z', ended_at: '2026-10-30T00:00:00Z', odometer_start: '500', odometer_end: '900' },
    ] });
    if (path.includes('/trip-logs?')) {
      if (fail) return reply({ error: 'Offline test' }, 503);
      const query = new URL(path, 'https://example.test').searchParams;
      const page = Number(query.get('page') || 1), count = Number(query.get('perPage') || 25);
      const filtered = !!query.get('bop') || !!query.get('search');
      return reply({ trips: Array.from({ length: count }, (_, index) => ({ id: (page-1)*25 + index + 1,
        userId: 'driver', vehicleId: 7, companyId: 1, purpose: `Trip ${(page-1)*25 + index + 1}`,
        businessOrPrivate: 'business', destination: 'Site inspection', startDatetime: '2026-11-14T00:00:00Z',
        endDatetime: '2026-11-14T01:00:00Z', km: '10', odometerStart: '1000', odometerEnd: '1010' })),
        total: filtered ? 400 : 840, totalKm: filtered ? 4000 : 8400, totalBusiness: 4000, totalPrivate: filtered ? 0 : 4400, page, perPage: count });
    }
    throw Error('Unexpected request ' + path);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('actual Fleet page exposes Logbook and paginates 840 entries without changing whole-period totals', async () => {
  render(<MemoryRouter initialEntries={['/fleet/7']}><Routes><Route path="/fleet/:id" element={<FleetDetail />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Logbook' }));
  await screen.findByText('1–25 of 840');
  expect(screen.getAllByRole('button', { expanded: false }).filter(b => b.textContent?.includes('Trip '))).toHaveLength(25);
  expect(within(screen.getByRole('region', { name: 'Whole-period totals' })).getByText('8400.0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('26–50 of 840');
  expect(screen.queryByText('Trip 1')).toBeNull();
  fireEvent.change(screen.getByLabelText('Trip type'), { target: { value: 'business' } });
  await screen.findByText('1–25 of 400');
  expect(within(screen.getByRole('region', { name: 'Whole-period totals' })).getByText('8400.0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Download / share CSV' }));
  await waitFor(() => expect(state.exportCsv).toHaveBeenCalledWith(7, '3'));
});
it('selected historical period controls both queries and the full CSV export', async () => {
  render(<FleetLogbookPanel asset={asset} onAssetUpdated={() => {}} />);
  await screen.findByText('1–25 of 840');
  fireEvent.change(screen.getByLabelText('Recording period'), { target: { value: '2' } });
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('periodId=2'))).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Download / share CSV' }));
  await waitFor(() => expect(state.exportCsv).toHaveBeenCalledWith(7, '2'));
});
it('recording toggle requires a period odometer and uses the shared server setting', async () => {
  const changed = vi.fn(); render(<FleetLogbookPanel asset={asset} onAssetUpdated={changed} />);
  fireEvent.click(screen.getByRole('switch', { name: 'Logbook active' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText('Enter the actual odometer reading.');
  expect(vi.mocked(fetch).mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
  fireEvent.change(screen.getByLabelText('Period ending odometer (km)'), { target: { value: '1200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ logbookActive: false })));
  const call = vi.mocked(fetch).mock.calls.find(([, o]) => o?.method === 'PUT');
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ logbookActive: false, logbookOdometerEnd: '1200' });
});
it('workers cannot toggle and switching company removes the previous company records', async () => {
  state.admin = false;
  const ui = render(<FleetLogbookPanel asset={asset} onAssetUpdated={() => {}} />);
  await screen.findByText('1–25 of 840');
  expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  state.company = 2; ui.rerender(<FleetLogbookPanel asset={asset} onAssetUpdated={() => {}} />);
  expect(screen.queryByText('Trip 1')).toBeNull();
  expect(screen.queryByRole('switch')).toBeNull();
});
it('failed page requests show an error and can retry without invented totals or records', async () => {
  fail = true; render(<FleetLogbookPanel asset={asset} onAssetUpdated={() => {}} />);
  await screen.findByText('Offline test');
  expect(screen.queryByText('Trip 1')).toBeNull();
  fail = false; fireEvent.click(screen.getByRole('button', { name: 'Refresh logbook' }));
  await screen.findByText('1–25 of 840');
});
