import { useEffect, useState } from "react";
import { repairPendingTrip, type PendingTrip } from "@/lib/tripLogbookStore";
import { exportFleetLogbook } from '@/lib/fleet-logbook-export';

type Period = {
  id: number;
  started_at: string;
  ended_at: string | null;
  odometer_start: string | null;
  odometer_end: string | null;
};
type Annual = {
  id: number;
  income_year: number;
  boundary: string;
  reading_date: string;
  odometer: string;
  supersedes_id: number | null;
};
const input = "border rounded-lg p-2 text-sm w-full";
async function request(url: string, body?: unknown) {
  const r = await fetch(url, {
    credentials: "include",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Could not save");
  return d;
}
export default function LogbookRecordsPanel({
  vehicleId,
  pendingCount,
  refreshKey,
  onPeriodChange,
}: {
  vehicleId: number;
  pendingCount: number;
  refreshKey: string;
  onPeriodChange?: (periodId: string) => void;
}) {
  const [periods, setPeriods] = useState<Period[]>([]),
    [annual, setAnnual] = useState<Annual[]>([]),
    [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear())),
    [boundary, setBoundary] = useState("start");
  const [date, setDate] = useState(""),
    [odo, setOdo] = useState(""),
    [supersedesId, setSupersedesId] = useState<number | undefined>();
  const [recover, setRecover] = useState<Period | null>(null),
    [startReading, setStartReading] = useState(""),
    [endReading, setEndReading] = useState(""),
    [endDate, setEndDate] = useState("");
  const url = `/api/fleet/${vehicleId}/logbook-records`;
  async function load() {
    try {
      const d = await request(url);
      setPeriods(d.periods);
      setAnnual(d.annual);
      if (!loaded) {
        const current = d.periods.find((p: Period) => !p.ended_at) ?? d.periods[0];
        const value = current ? String(current.id) : '';
        setSelected(value); onPeriodChange?.(value); setLoaded(true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [vehicleId, refreshKey]);
  async function save(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(url, body);
      await load();
      setRecover(null);
      setSupersedesId(undefined);
      setOdo("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">Logbook records &amp; CSV</h3>
      <label className="block text-sm">
        Recording period
        <select
          className={input}
          value={selected}
          onChange={(e) => { setSelected(e.target.value); onPeriodChange?.(e.target.value); }}
        >
          <option value="">All saved records</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {new Date(p.started_at).toLocaleDateString()} —{" "}
              {p.ended_at ? new Date(p.ended_at).toLocaleDateString() : "Open"}{" "}
              (#{p.id})
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">
        {pendingCount
          ? `${pendingCount} records on this device have not synced. `
          : "No unsynced completed records detected on this device. "}
        CSV includes server-saved records only. Other devices may still have
        pending entries.
      </p>
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await exportFleetLogbook(vehicleId, selected); }
        catch (e) { setError(e instanceof Error ? e.message : 'Export failed'); }
        finally { setBusy(false); }
      }}
        className="inline-block rounded-lg bg-primary text-white p-2 text-sm"
      >
        {busy ? 'Please wait…' : 'Download / share CSV'}
      </button>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Recording periods and annual odometers
        </summary>
        <div className="space-y-3 mt-3">
          {periods.map((p) => (
            <div key={p.id} className="text-sm border rounded-lg p-2">
              <p>
                Period #{p.id}: {new Date(p.started_at).toLocaleString()} —{" "}
                {p.ended_at
                  ? new Date(p.ended_at).toLocaleString()
                  : "End not recorded"}
              </p>
              <p>
                Odometer: {p.odometer_start ?? "Missing"} →{" "}
                {p.odometer_end ?? "Not recorded"}
              </p>
              {(p.odometer_start == null ||
                p.odometer_end == null ||
                !p.ended_at) && (
                <button
                  className="text-primary underline"
                  onClick={() => {
                    setRecover(p);
                    setStartReading(p.odometer_start ?? "");
                    setEndReading(p.odometer_end ?? "");
                    setEndDate("");
                  }}
                >
                  Complete missing original details
                </button>
              )}
            </div>
          ))}
        </div>
        {recover && (
          <div className="space-y-2 border p-3 my-3">
            <p className="text-sm">
              Enter the original readings only. Existing evidence is retained.
              Close an active period using its recording toggle.
            </p>
            <label className="block text-sm">
              Original start odometer
              <input
                className={input}
                value={startReading}
                disabled={recover.odometer_start != null}
                onChange={(e) => setStartReading(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Original end odometer, if known
              <input
                className={input}
                value={endReading}
                disabled={recover.odometer_end != null}
                onChange={(e) => setEndReading(e.target.value)}
              />
            </label>
            {!recover.ended_at && (
              <label className="block text-sm">
                Original end date/time, if previously closed
                <input
                  className={input}
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            )}
            <button
              disabled={busy}
              className="text-primary underline"
              onClick={() =>
                void save({
                  action: "recover-period",
                  periodId: recover.id,
                  odometerStart: startReading,
                  odometerEnd: endReading,
                  endedAt: endDate ? new Date(endDate).toISOString() : null,
                })
              }
            >
              Save missing details
            </button>
          </div>
        )}
        <form
          className="space-y-2 mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              action: "annual",
              incomeYear: Number(year),
              boundary,
              readingDate: date,
              odometer: odo,
              supersedesId,
            });
          }}
        >
          <h4 className="font-semibold text-sm">
            {supersedesId
              ? "Correct annual reading (history retained)"
              : "Annual odometer reading"}
          </h4>
          <label className="block text-sm">
            Income year ending
            <input
              className={input}
              type="number"
              min="2000"
              max="2200"
              required
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Boundary
            <select
              className={input}
              value={boundary}
              onChange={(e) => setBoundary(e.target.value)}
            >
              <option value="start">Start</option>
              <option value="end">End</option>
            </select>
          </label>
          <label className="block text-sm">
            Actual reading date
            <input
              className={input}
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Odometer (km)
            <input
              className={input}
              type="number"
              min="0"
              step="0.1"
              required
              value={odo}
              onChange={(e) => setOdo(e.target.value)}
            />
          </label>
          <button className="rounded-lg border p-2 text-sm" disabled={busy}>
            Save reading
          </button>
        </form>
        {annual.map((a) => (
          <div key={a.id} className="text-sm py-2">
            {a.income_year} {a.boundary}: {a.odometer} km (
            {String(a.reading_date).slice(0, 10)}){" "}
            {a.supersedes_id ? `— corrects #${a.supersedes_id}` : ""}
            {!annual.some((x) => x.supersedes_id === a.id) && (
              <button
                className="ml-2 text-primary underline"
                onClick={() => {
                  setSupersedesId(a.id);
                  setYear(String(a.income_year));
                  setBoundary(a.boundary);
                  setDate(String(a.reading_date).slice(0, 10));
                  setOdo(a.odometer);
                }}
              >
                Correct
              </button>
            )}
          </div>
        ))}
      </details>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function PendingTripRepair({
  trip,
  onSaved,
}: {
  trip: PendingTrip;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [destination, setDestination] = useState(trip.destination ?? ""),
    [reason, setReason] = useState(trip.reason ?? "");
  const [start, setStart] = useState(trip.odometerStart ?? ""),
    [end, setEnd] = useState(trip.odometerEnd ?? ""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (
      !confirmed ||
      !/^\d+(\.\d{1,3})?$/.test(start) ||
      !/^\d+(\.\d{1,3})?$/.test(end) ||
      Number(end) < Number(start) ||
      (trip.businessOrPrivate === "business" &&
        destination.trim().length < 2) ||
      (/^Other/.test(trip.purpose) && reason.trim().length < 2)
    ) {
      setError(
        "Confirm the original record and complete valid odometers and business details.",
      );
      return;
    }
    try {
      await repairPendingTrip(trip.ownerKey, trip.localId, {
        destination,
        reason,
        odometerStart: start,
        odometerEnd: end,
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="border rounded-lg p-3 text-sm">
      <p>
        Pending journey: {new Date(trip.startDatetime).toLocaleString()} —{" "}
        {trip.purpose}
      </p>
      {trip.errorMsg && (
        <p role="alert" className="text-red-700">
          {trip.errorMsg}
        </p>
      )}
      <button className="text-primary underline" onClick={() => setOpen(!open)}>
        Review / complete pending record
      </button>
      {open && (
        <div className="space-y-2 mt-2">
          <p>
            Dates, original driver and trip ID are retained. This edits only the
            unsynced copy. A different saved server record will produce a
            conflict.
          </p>
          <label className="block">
            Original start odometer
            <input
              className={input}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="block">
            Original end odometer
            <input
              className={input}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {trip.businessOrPrivate === "business" && (
            <>
              <label className="block">
                Destination / journey description
                <input
                  className={input}
                  maxLength={500}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </label>
              <label className="block">
                Reason
                <input
                  className={input}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="block">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I have checked the original dates, readings and journey details.
          </label>
          <button className="border rounded p-2" onClick={() => void save()}>
            Save pending details
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
