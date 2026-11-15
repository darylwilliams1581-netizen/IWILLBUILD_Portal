import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, configure } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import StartDrivingModal from '@/components/fleet/StartDrivingModal';
import DrivingSessionBadge from '@/components/fleet/DrivingSessionBadge';
import EndDriveLogbookDialog, { CompletionForm } from '@/components/fleet/EndDriveLogbookDialog';
import { completionKey, saveDriveCompletion, emptyAnswers, recoverDriveLogbook } from '@/lib/end-drive-logbook';
import { readRecentDestinations, rememberDestination } from '@/lib/recent-destinations';
import RecentDestinationChips from '@/components/fleet/RecentDestinationChips';
import { putActiveTrip, getPendingTrips, loadActiveTrip, type InProgressTrip } from '@/lib/tripLogbookStore';
configure({ asyncUtilTimeout: 5000 });
const mocks = vi.hoisted(() => ({ user: 'driver', company: 1, start: vi.fn(), stop: vi.fn(), captures: [] as any[] }));
vi.mock('@/lib/auth/auth-client', () => ({ useSession: () => ({ user: { id: mocks.user } }) }));
vi.mock('@/lib/usePermissions', () => ({ useMe: () => ({ me: { user: { id: mocks.user }, profile: { companyId: mocks.company } } }) }));
vi.mock('@/lib/fleet-drive-logbook', async original => ({
  ...(await original<typeof import('@/lib/fleet-drive-logbook')>()),
  startLogbookDrive: mocks.start, stopLogbookDrive: mocks.stop,
  pendingCaptures: async () => mocks.captures, retryDriveStops: async () => {},
}));
vi.mock('@/lib/useSessionTelemetry', () => ({ useSessionTelemetry: () => {} }));
vi.mock('@/lib/useFleetAnalytics', () => ({ useFleetAnalytics: () => ({ settings: {} }) }));
const trip: InProgressTrip = {
  ownerKey: '1:driver:7', companyId: 1, userId: 'driver', vehicleId: 7, assetName: 'Hilux',
  driverSessionId: 42, periodId: 3, clientTripId: '12345678-1234-4234-8234-123456789abc',
  startDatetime: '2026-11-14T00:00:00.000Z', endDatetime: '2026-11-14T01:00:00.000Z',
  odometerStart: '1000', startPoint: null,
};
const owner = { companyId: 1, userId: 'driver' };
let enabled = true, online = false, responseUser = 'driver', saveStatus = 200;
const reply = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
beforeEach(() => {
  vi.clearAllMocks(); globalThis.indexedDB = new IDBFactory(); localStorage.clear();
  mocks.user = 'driver'; mocks.company = 1; mocks.captures = []; enabled = true; online = false; responseUser = 'driver'; saveStatus = 200;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url === '/api/fleet/vehicles') return reply({ vehicles: [{ id: 7, name: 'Hilux', logbook_active: enabled }] });
    if (url === '/api/me') return reply({ user: { id: responseUser }, profile: { companyId: 1 } });
    if (String(url).endsWith('/trip-logs')) return reply(saveStatus === 200 ? { trip: { id: 9 } } : { error: saveStatus === 409 ? 'Trip content conflicts' : 'Server unavailable' }, saveStatus);
    throw Error('Unexpected URL ' + url);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('enabled Start requires the reading and retains it after failure', async () => {
  const done = vi.fn(); mocks.start.mockRejectedValueOnce(Error('Network failed')).mockResolvedValueOnce({ id: 42 });
  render(<StartDrivingModal onClose={() => {}} onStarted={done} />);
  fireEvent.pointerDown(await screen.findByRole('button', { name: /Hilux/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const start = await screen.findByRole('button', { name: 'Start Driving' });
  fireEvent.click(start); expect(await screen.findByText(/Enter a valid odometer/)).toBeTruthy();
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } });
  fireEvent.click(start); expect(await screen.findByText('Network failed')).toBeTruthy();
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('1000');
  fireEvent.click(start); await waitFor(() => expect(done).toHaveBeenCalledWith({ id: 42 }));
  expect(mocks.start).toHaveBeenLastCalledWith(7, '1000');
});
it('disabled Start uses ordinary driving without an odometer', async () => {
  enabled = false; mocks.start.mockResolvedValue({ id: 42 });
  render(<StartDrivingModal onClose={() => {}} onStarted={() => {}} />);
  fireEvent.pointerDown(await screen.findByRole('button', { name: /Hilux/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Drive Hilux' }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(7, null));
  expect(screen.queryByRole('spinbutton')).toBeNull();
});
it.each([true, false])('Stop badge waits for the server flow, enabled=%s', async logbookRequired => {
  let resolve!: (v: unknown) => void;
  mocks.stop.mockReturnValue(new Promise(r => { resolve = r; })); const done = vi.fn();
  render(<DrivingSessionBadge session={{ id: 42, asset_name: 'Hilux', start_at: trip.startDatetime } as any} onStopped={done} />);
  fireEvent.click(screen.getByRole('button', { name: /Driving: Hilux/ }));
  fireEvent.click(screen.getByRole('button', { name: /Stop driving/ }));
  expect(mocks.stop).toHaveBeenCalledWith(42); expect(done).not.toHaveBeenCalled();
  resolve({ fleetAssetId: 7, logbookRequired });
  await waitFor(() => expect(done).toHaveBeenCalled());
});
it('completion requires classification and odometer; saves an offline record with original stop time', async () => {
  await putActiveTrip(trip); const done = vi.fn();
  render(<CompletionForm trip={trip} owner={owner} onClose={() => {}} onSaved={done} />);
  const save = screen.getByRole('button', { name: 'Save trip' }); fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Select Business or Private.');
  fireEvent.click(screen.getByRole('button', { name: 'Private' }));
  fireEvent.change(screen.getByLabelText('Ending odometer (km)'), { target: { value: '999' } }); fireEvent.click(save);
  expect(await screen.findByText(/at least equal/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Ending odometer (km)'), { target: { value: '1100' } }); fireEvent.click(save);
  await waitFor(() => expect(done).toHaveBeenCalledWith(false));
  const records = await getPendingTrips(1, 'driver', 7); expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ km: '100.0', endDatetime: trip.endDatetime, driverSessionId: 42, businessOrPrivate: 'private' });
});
it('Business requires destination; closing and remounting preserves all answers', async () => {
  await putActiveTrip(trip);
  const renderForm = () => render(<CompletionForm trip={trip} owner={owner} onClose={() => {}} onSaved={() => {}} />);
  const ui = renderForm();
  fireEvent.click(screen.getByRole('button', { name: 'Business' }));
  fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'Site travel' } });
  fireEvent.change(screen.getByLabelText('Ending odometer (km)'), { target: { value: '1100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));
  expect(await screen.findByText('Enter a destination or journey description.')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Destination / journey description'), { target: { value: '42 Smith St, repair visit' } });
  ui.unmount(); renderForm();
  expect((screen.getByLabelText('Destination / journey description') as HTMLInputElement).value).toBe('42 Smith St, repair visit');
  expect((screen.getByLabelText('Ending odometer (km)') as HTMLInputElement).value).toBe('1100');
  expect((await loadActiveTrip(1, 'driver', 7))?.endDatetime).toBe(trip.endDatetime);
});
it('immediate save rejects a switched account before queuing or posting', async () => {
  online = true; responseUser = 'other'; await putActiveTrip(trip);
  await expect(saveDriveCompletion(trip, { ...emptyAnswers, tripType: 'private', odometerEnd: '1100' }, owner)).rejects.toThrow('Account changed');
  expect(await getPendingTrips(1, 'driver', 7)).toHaveLength(0);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/trip-logs'))).toBe(false);
});
it.each([500, 409])('failed upload (%s) remains queued unchanged for retry', async status => {
  online = true; saveStatus = status; await putActiveTrip(trip);
  expect(await saveDriveCompletion(trip, { ...emptyAnswers, tripType: 'private', odometerEnd: '1100' }, owner)).toEqual({ synced: false });
  const pending = (await getPendingTrips(1, 'driver', 7))[0];
  expect(pending.syncStatus).toBe('error'); expect(pending.endDatetime).toBe(trip.endDatetime);
  expect(pending.clientTripId).toBe(trip.clientTripId);
  if (status === 409) expect(pending.errorMsg).toBe('Trip content conflicts');
  saveStatus = 200; const recovered = await recoverDriveLogbook(owner); expect(recovered.pending).toHaveLength(0);
});
it('global popup recovers after restart and disappears immediately on user/company switch', async () => {
  await putActiveTrip(trip);
  const ui = render(<EndDriveLogbookDialog />); await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Private' }));
  fireEvent.change(screen.getByLabelText('Ending odometer (km)'), { target: { value: '1100' } });
  ui.unmount(); const restarted = render(<EndDriveLogbookDialog />); await screen.findByRole('dialog');
  expect((screen.getByLabelText('Ending odometer (km)') as HTMLInputElement).value).toBe('1100');
  mocks.company = 2; restarted.rerender(<EndDriveLogbookDialog />); expect(screen.queryByRole('dialog')).toBeNull();
  mocks.company = 1; mocks.user = 'other'; restarted.rerender(<EndDriveLogbookDialog />); expect(screen.queryByRole('dialog')).toBeNull();
  expect(JSON.parse(localStorage.getItem(completionKey(trip))!).odometerEnd).toBe('1100');
});
it('administrator-ended capture opens for its original driver without consulting current logbook checkbox', async () => {
  online = true; mocks.captures = [{ company_id: 1, user_id: 'driver', vehicle_id: 7, session_id: 42,
    client_trip_id: trip.clientTripId, odometer_start: '1000', start_at: trip.startDatetime, end_at: trip.endDatetime,
    period_id: 3, asset_name: 'Hilux' }];
  render(<EndDriveLogbookDialog />); await screen.findByRole('dialog');
  expect(await screen.findByText('Starting odometer: 1000 km')).toBeTruthy();
  expect((await loadActiveTrip(1, 'driver', 7))?.endDatetime).toBe(trip.endDatetime);
});

it('recent chips fill an editable field without saving; only the saved destination enters history', async () => {
  rememberDestination(1, 'driver', '42 Smith St — site inspection');
  await putActiveTrip(trip); const done = vi.fn();
  render(<CompletionForm trip={trip} owner={owner} onClose={() => {}} onSaved={done} />);
  expect(screen.queryByRole('group', { name: 'Recent destinations' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Business' }));
  const field = screen.getByLabelText('Destination / journey description') as HTMLInputElement;
  expect(field.value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '42 Smith St — site inspection' }));
  expect(field.value).toBe('42 Smith St — site inspection');
  expect(done).not.toHaveBeenCalled();
  expect(await getPendingTrips(1, 'driver', 7)).toHaveLength(0);
  fireEvent.change(field, { target: { value: '42 Smith St — repair visit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));
  await screen.findByRole('alert');
  expect(readRecentDestinations(1, 'driver')).toEqual(['42 Smith St — site inspection']);
  fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'Site travel' } });
  fireEvent.change(screen.getByLabelText('Ending odometer (km)'), { target: { value: '1100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(false));
  expect(readRecentDestinations(1, 'driver')).toEqual(['42 Smith St — repair visit', '42 Smith St — site inspection']);
  expect((await getPendingTrips(1, 'driver', 7))[0].destination).toBe('42 Smith St — repair visit');
});
it('chips never retain the previous company or driver on rerender', () => {
  rememberDestination(1, 'driver', 'First company site');
  rememberDestination(2, 'driver', 'Second company site');
  const ui = render(<RecentDestinationChips companyId={1} userId="driver" onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: 'First company site' })).toBeTruthy();
  ui.rerender(<RecentDestinationChips companyId={2} userId="driver" onSelect={() => {}} />);
  expect(screen.queryByRole('button', { name: 'First company site' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Second company site' })).toBeTruthy();
  ui.rerender(<RecentDestinationChips companyId={2} userId="other" onSelect={() => {}} />);
  expect(screen.queryByRole('group', { name: 'Recent destinations' })).toBeNull();
});
it('private completion does not remember a leftover business destination', async () => {
  await putActiveTrip(trip);
  await saveDriveCompletion(trip, { ...emptyAnswers, tripType: 'private', odometerEnd: '1100', destination: 'Private address' }, owner);
  expect(readRecentDestinations(1, 'driver')).toEqual([]);
});
it('business completion succeeds when the optional suggestion cache is full', async () => {
  await putActiveTrip(trip);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Full'); });
  await expect(saveDriveCompletion(trip, { ...emptyAnswers, tripType: 'business', purpose: 'Site travel',
    odometerEnd: '1100', destination: '42 Smith St — repair visit' }, owner)).resolves.toEqual({ synced: false });
  expect(await getPendingTrips(1, 'driver', 7)).toHaveLength(1);
});
