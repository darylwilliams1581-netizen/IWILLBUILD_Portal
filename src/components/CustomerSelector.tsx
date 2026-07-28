/**
 * CustomerSelector — inline combobox for picking/clearing a linked customer.
 * Used in NewJobModal and job-detail edit form.
 */
import { useState, useEffect, useRef } from 'react';
import { Search, X, UserCheck, Plus, Loader2 } from 'lucide-react';
import type { Customer } from '@/lib/customers-api';

interface Props {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  onCreateNew?: () => void;
  disabled?: boolean;
}

export default function CustomerSelector({ value, onChange, onCreateNew, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load active customers on first open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/customers?status=active', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = customers.filter((c) =>
    !query ||
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    (c.contact_person ?? '').toLowerCase().includes(query.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(query.toLowerCase())
  );

  function select(c: Customer) {
    onChange(c);
    setOpen(false);
    setQuery('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm transition-colors text-left ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 border-border' :
          open ? 'border-primary ring-2 ring-primary/20 bg-white' :
          'border-border bg-white hover:border-primary/50'
        }`}
      >
        <UserCheck size={14} className={value ? 'text-primary shrink-0' : 'text-slate-400 shrink-0'} />
        {value ? (
          <span className="flex-1 truncate font-medium text-foreground">{value.name}</span>
        ) : (
          <span className="flex-1 text-muted-foreground">Search or select a customer…</span>
        )}
        {value && (
          <span
            role="button"
            onClick={clear}
            className="p-0.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-primary" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-5">
                {query ? 'No customers match' : 'No customers yet'}
              </p>
            )}
            {!loading && filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-violet-50 transition-colors border-b border-slate-50 last:border-0 ${
                  value?.id === c.id ? 'bg-violet-50' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-primary font-black text-xs">{c.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  {c.contact_person && (
                    <p className="text-xs text-muted-foreground truncate">{c.contact_person}</p>
                  )}
                  {c.email && !c.contact_person && (
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  )}
                </div>
                {value?.id === c.id && (
                  <UserCheck size={14} className="text-primary shrink-0 mt-1" />
                )}
              </button>
            ))}
          </div>

          {onCreateNew && (
            <div className="p-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setOpen(false); onCreateNew(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary hover:bg-violet-50 rounded-lg transition-colors"
              >
                <Plus size={14} />
                Add new customer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
