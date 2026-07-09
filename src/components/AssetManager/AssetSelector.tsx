/**
 * AssetSelector — searchable dropdown to link a job to an asset.
 * Used in job detail edit form.
 */
import { useState, useEffect, useRef } from 'react';
import { Building2, Search, X, ChevronDown, Loader2 } from 'lucide-react';

interface Asset {
  id: number;
  name: string;
  acronym: string | null;
  asset_type: string;
  status: string;
}

interface Props {
  value: number | null;
  onChange: (id: number | null, name: string | null) => void;
}

export default function AssetSelector({ value, onChange }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  // Load assets once on mount
  useEffect(() => {
    setLoading(true);
    fetch('/api/asset-manager/assets', { credentials: 'include' })
      .then(r => r.json() as Promise<{ assets?: Asset[] }>)
      .then(d => setAssets(d.assets ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Resolve name when value changes externally
  useEffect(() => {
    if (!value) { setSelectedName(''); return; }
    const found = assets.find(a => a.id === value);
    if (found) setSelectedName(found.name);
  }, [value, assets]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = assets.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.acronym ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function select(asset: Asset) {
    onChange(asset.id, asset.name);
    setSelectedName(asset.name);
    setOpen(false);
    setSearch('');
  }

  function clear() {
    onChange(null, null);
    setSelectedName('');
    setSearch('');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors text-left"
      >
        <Building2 size={14} className="text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>
          {value ? selectedName || `Asset #${value}` : 'No asset linked'}
        </span>
        {value ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); clear(); }}
            className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        ) : (
          <ChevronDown size={13} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="flex-1 text-sm text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-400"
            />
            {loading && <Loader2 size={13} className="animate-spin text-slate-400 shrink-0" />}
          </div>

          {/* Clear option */}
          {value && (
            <button
              type="button"
              onClick={clear}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors border-b border-slate-100"
            >
              <X size={13} className="text-slate-400" />
              Clear link
            </button>
          )}

          {/* Asset list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">
                {loading ? 'Loading assets…' : 'No assets found'}
              </div>
            ) : (
              filtered.map(asset => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => select(asset)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-orange-50 transition-colors text-left ${asset.id === value ? 'bg-orange-50 font-semibold' : ''}`}
                >
                  <Building2 size={13} className="text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-800 truncate block">{asset.name}</span>
                    {asset.acronym && (
                      <span className="text-[10px] text-slate-400 font-mono">{asset.acronym} · {asset.asset_type}</span>
                    )}
                  </div>
                  {asset.id === value && (
                    <span className="text-[10px] font-bold text-orange-500 shrink-0">Linked</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
