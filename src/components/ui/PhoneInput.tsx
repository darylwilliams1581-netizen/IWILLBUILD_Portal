/**
 * PhoneInput — country-code selector + local number field.
 *
 * Always emits a full E.164 string via onChange (e.g. "+61412345678").
 * Accepts an existing E.164 value via `value` and parses it back into
 * the correct country + local number on mount.
 */
import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface Country {
  code: string;   // e.g. "AU"
  dial: string;   // e.g. "61"
  flag: string;   // emoji
  name: string;
  placeholder: string;
}

export const COUNTRIES: Country[] = [
  { code: 'AU', dial: '61',  flag: '🇦🇺', name: 'Australia',      placeholder: '04xx xxx xxx' },
  { code: 'NZ', dial: '64',  flag: '🇳🇿', name: 'New Zealand',    placeholder: '02x xxx xxxx' },
  { code: 'US', dial: '1',   flag: '🇺🇸', name: 'United States',  placeholder: '(555) 000-0000' },
  { code: 'GB', dial: '44',  flag: '🇬🇧', name: 'United Kingdom', placeholder: '07xxx xxxxxx' },
  { code: 'CA', dial: '1',   flag: '🇨🇦', name: 'Canada',         placeholder: '(555) 000-0000' },
  { code: 'IE', dial: '353', flag: '🇮🇪', name: 'Ireland',        placeholder: '087 xxx xxxx' },
  { code: 'ZA', dial: '27',  flag: '🇿🇦', name: 'South Africa',   placeholder: '071 xxx xxxx' },
  { code: 'SG', dial: '65',  flag: '🇸🇬', name: 'Singapore',      placeholder: '8xxx xxxx' },
  { code: 'AE', dial: '971', flag: '🇦🇪', name: 'UAE',            placeholder: '050 xxx xxxx' },
  { code: 'IN', dial: '91',  flag: '🇮🇳', name: 'India',          placeholder: '98xxx xxxxx' },
  { code: 'PH', dial: '63',  flag: '🇵🇭', name: 'Philippines',    placeholder: '0917 xxx xxxx' },
  { code: 'FJ', dial: '679', flag: '🇫🇯', name: 'Fiji',           placeholder: '7xx xxxx' },
  { code: 'PG', dial: '675', flag: '🇵🇬', name: 'Papua New Guinea', placeholder: '7xxx xxxx' },
];

/** Parse an E.164 string back into { country, local } */
function parseE164(e164: string): { country: Country; local: string } | null {
  if (!e164.startsWith('+')) return null;
  const digits = e164.slice(1); // strip leading +
  // Try longest dial code first to avoid +1 matching +1xxx (CA/US)
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial)) {
      return { country: c, local: digits.slice(c.dial.length) };
    }
  }
  return null;
}

/** Convert local number + country into E.164 */
export function toE164(local: string, country: Country): string {
  // Strip spaces, dashes, parens
  const stripped = local.replace(/[\s\-().]/g, '');
  // Remove leading zero (common in AU/NZ/UK local format)
  const withoutLeadingZero = stripped.startsWith('0') ? stripped.slice(1) : stripped;
  if (!withoutLeadingZero) return '';
  return `+${country.dial}${withoutLeadingZero}`;
}

interface PhoneInputProps {
  value: string;           // E.164 or empty string
  onChange: (e164: string) => void;
  disabled?: boolean;
  inputClassName?: string;
  selectClassName?: string;
  darkMode?: boolean;      // true = white text on dark bg (verify-required page)
}

export default function PhoneInput({
  value,
  onChange,
  disabled,
  inputClassName,
  selectClassName,
  darkMode = false,
}: PhoneInputProps) {
  const defaultCountry = COUNTRIES[0]; // AU
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [local, setLocal]     = useState('');

  // Parse incoming E.164 value on mount / when value changes externally
  useEffect(() => {
    if (!value) return;
    const parsed = parseE164(value);
    if (parsed) {
      setCountry(parsed.country);
      setLocal(parsed.local);
    } else {
      // Not E.164 — show as-is in local field
      setLocal(value);
    }
  }, [value]);

  function handleLocalChange(raw: string) {
    setLocal(raw);
    onChange(toE164(raw, country));
  }

  const base = darkMode
    ? 'bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:border-primary'
    : 'bg-white border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-200';

  const selectBase = darkMode
    ? 'bg-white/10 border border-white/10 text-white'
    : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100';

  return (
    <div className="flex gap-1.5">
      {/* Country selector */}
      <div className="relative shrink-0">
        <select
          value={country.dial + ':' + country.code}
          onChange={(e) => {
            const [dial, code] = e.target.value.split(':');
            const c = COUNTRIES.find((x) => x.dial === dial && x.code === code) ?? defaultCountry;
            setCountry(c);
            onChange(toE164(local, c));
          }}
          disabled={disabled}
          className={`appearance-none h-full pl-2 pr-6 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${selectBase} ${selectClassName ?? ''}`}
          aria-label="Country code"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={`${c.dial}:${c.code}`}>
              {c.flag} +{c.dial}
            </option>
          ))}
        </select>
        <ChevronDown size={12} className={`absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${darkMode ? 'text-white/50' : 'text-slate-400'}`} />
      </div>

      {/* Local number field */}
      <input
        type="tel"
        value={local}
        onChange={(e) => handleLocalChange(e.target.value)}
        placeholder={country.placeholder}
        autoComplete="tel-national"
        disabled={disabled}
        className={`flex-1 rounded-lg px-3 py-2 text-sm transition-colors outline-none disabled:opacity-50 ${base} ${inputClassName ?? ''}`}
      />
    </div>
  );
}
