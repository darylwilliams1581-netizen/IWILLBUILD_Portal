import { AlertCircle, Calendar, X } from 'lucide-react';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  quickActions?: boolean;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function endOfThisWeek(): string {
  const date = new Date();
  const daysUntilSunday = date.getDay() === 0 ? 0 : 7 - date.getDay();
  date.setDate(date.getDate() + daysUntilSunday);
  return localDateString(date);
}

function endOfNextWeek(): string {
  const date = new Date();
  const daysUntilSunday = date.getDay() === 0 ? 7 : 14 - date.getDay();
  date.setDate(date.getDate() + daysUntilSunday);
  return localDateString(date);
}

function yearWarning(value: string): string | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  if (!Number.isFinite(year) || value.length < 4) return null;

  const currentYear = new Date().getFullYear();
  if (year < currentYear) return `Year ${year} is in the past — is that right?`;
  if (year > currentYear + 2) return `Year ${year} is more than 2 years away — is that right?`;
  return null;
}

export default function DateField({
  label,
  value,
  onChange,
  optional = false,
  quickActions = false,
}: DateFieldProps) {
  const warning = yearWarning(value);

  const quickDates = [
    { label: 'Today', value: dateAfter(0) },
    { label: 'Tomorrow', value: dateAfter(1) },
    { label: 'This week', value: endOfThisWeek() },
    { label: 'Next week', value: endOfNextWeek() },
  ];

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden">
      <label className="block text-xs font-semibold text-muted-foreground">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground/60">(optional)</span>}
      </label>

      {quickActions && (
        <div className="mb-1 flex max-w-full flex-wrap gap-1 overflow-hidden">
          {quickDates.map((quickDate) => (
            <button
              key={quickDate.label}
              type="button"
              onClick={() => onChange(quickDate.value)}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                value === quickDate.value
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary'
              }`}
            >
              {quickDate.label}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="flex items-center gap-0.5 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:border-red-200 hover:text-red-500"
            >
              <X size={9} /> Clear
            </button>
          )}
        </div>
      )}

      <div className="relative min-w-0 max-w-full">
        <Calendar size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-11 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {warning && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
          <AlertCircle size={10} /> {warning}
        </p>
      )}
    </div>
  );
}
