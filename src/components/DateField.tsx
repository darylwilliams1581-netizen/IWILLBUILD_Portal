import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Calendar, X } from 'lucide-react';
import { isNative } from '@/lib/capacitor-plugins';

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

function formatDateForField(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
  return monthName ? `${day} ${monthName} ${year}` : value;
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

function formatNumericInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export default function DateField({
  label,
  value,
  onChange,
  optional = false,
  quickActions = false,
}: DateFieldProps) {
  const native = isNative();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const warning = yearWarning(value);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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

      {native ? (
        <div className="flex h-11 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-lg border border-border bg-white px-3">
          <Calendar size={15} className="shrink-0 text-slate-400" />
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={value}
              onChange={(event) => onChange(formatNumericInput(event.target.value))}
              onBlur={() => setEditing(false)}
              placeholder="yyyy-mm-dd"
              aria-label={`${label}, yyyy-mm-dd`}
              className="h-full min-w-0 flex-1 overflow-hidden bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`${label}: ${value ? formatDateForField(value) : 'No date selected'}`}
              className={`h-full min-w-0 flex-1 truncate text-left text-sm ${value ? 'text-slate-700' : 'text-slate-400'}`}
            >
              {value ? formatDateForField(value) : 'No date selected'}
            </button>
          )}
        </div>
      ) : (
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}

      {warning && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
          <AlertCircle size={10} /> {warning}
        </p>
      )}
    </div>
  );
}
