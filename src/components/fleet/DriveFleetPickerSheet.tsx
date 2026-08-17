/**
 * DriveFleetPickerSheet — shared vehicle picker modal.
 *
 * Opens a floating modal listing all fleet assets. Selecting one navigates
 * to /driver?vehicleId=<id> which auto-starts the session.
 *
 * Used by: HomeScreen (Drive tile), FleetPage (Drive launcher button).
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Car, ChevronRight, Loader2, Search, X } from 'lucide-react';

interface FleetOption {
  id: number;
  name: string;
  type?: string | null;
  rego?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DriveFleetPickerSheet({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<FleetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setLoading(true);
    fetch('/api/fleet?limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { assets?: FleetOption[] } | FleetOption[]) => {
        setAssets(Array.isArray(data) ? data : (data.assets ?? []));
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = query.trim()
    ? assets.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        (a.rego ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (a.type ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : assets;

  const openedAtRef = useRef<number>(0);
  useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={() => { if (Date.now() - openedAtRef.current >= 300) onClose(); }}
          />

          {/* Centred floating modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="pointer-events-auto w-full max-w-sm bg-white rounded-3xl flex flex-col overflow-hidden shadow-2xl"
              style={{ maxHeight: 'min(520px, calc(100dvh - 120px))' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Car size={17} className="text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-gray-900 font-bold text-base leading-tight">Start Driving</h2>
                    <p className="text-gray-400 text-xs leading-tight mt-0.5">Select a vehicle to begin your session</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Search */}
              <div className="px-4 pb-2 shrink-0">
                <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
                  <Search size={14} className="text-gray-400 shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search vehicles, rego…"
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none min-w-0"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="h-px bg-gray-100 shrink-0 mx-4" />

              {/* Vehicle list */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
                {loading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Loading fleet…</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">
                    {query ? 'No vehicles match your search' : 'No fleet assets found'}
                  </p>
                ) : filtered.map(asset => (
                  <button
                    key={asset.id}
                    onClick={() => { onClose(); navigate(`/driver?vehicleId=${asset.id}`); }}
                    className="w-full flex items-center gap-3 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 active:bg-blue-100 border border-gray-200 rounded-2xl px-4 py-3 text-left transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0 bg-blue-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{asset.name}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{[asset.type, asset.rego].filter(Boolean).join(' · ')}</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>

              <div className="shrink-0" style={{ height: 'max(env(safe-area-inset-bottom), 8px)' }} />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
