import { useState } from 'react';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Truck,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  Calendar,
  Fuel,
  MapPin,
  ChevronRight,
  ShieldAlert,
  ClipboardList,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

type AssetStatus = 'active' | 'maintenance' | 'attention' | 'inactive';

interface FleetAsset {
  id: string;
  name: string;
  type: string;
  rego: string;
  status: AssetStatus;
  location: string;
  lastPrestart: string;
  nextService: string;
  regoExpiry: string;
  odometer: string;
  issues: string[];
  prestartsDone: number;
}

const fleet: FleetAsset[] = [
  {
    id: 'FLT-001',
    name: 'Isuzu NPR 300 — White',
    type: 'Truck',
    rego: '123 ABC',
    status: 'active',
    location: 'Bulimba Site',
    lastPrestart: 'Today 6:42am',
    nextService: '15 Jul 2026',
    regoExpiry: '31 Oct 2026',
    odometer: '87,420 km',
    issues: [],
    prestartsDone: 142,
  },
  {
    id: 'FLT-002',
    name: 'Toyota HiLux SR5 — Grey',
    type: 'Ute',
    rego: '456 DEF',
    status: 'active',
    location: 'CBD Fitout',
    lastPrestart: 'Today 7:15am',
    nextService: '22 Aug 2026',
    regoExpiry: '28 Feb 2027',
    odometer: '54,100 km',
    issues: [],
    prestartsDone: 98,
  },
  {
    id: 'FLT-003',
    name: 'Bobcat S650 — Yellow',
    type: 'Skid Steer',
    rego: 'N/A',
    status: 'attention',
    location: 'Yard — Hemmant',
    lastPrestart: 'Yesterday 5:55am',
    nextService: '01 Jul 2026',
    regoExpiry: 'N/A',
    odometer: '2,340 hrs',
    issues: ['Service overdue by 3 days', 'Left track tension flagged in prestart'],
    prestartsDone: 67,
  },
  {
    id: 'FLT-004',
    name: 'Ford Ranger XLT — Blue',
    type: 'Ute',
    rego: '789 GHI',
    status: 'maintenance',
    location: 'Mechanic — Tingalpa',
    lastPrestart: '3 days ago',
    nextService: 'In progress',
    regoExpiry: '30 Jun 2027',
    odometer: '112,800 km',
    issues: ['Brake pads replacement', 'AC regas'],
    prestartsDone: 203,
  },
  {
    id: 'FLT-005',
    name: 'Kennards 3T Excavator',
    type: 'Hired Plant',
    rego: 'N/A',
    status: 'active',
    location: 'Kenmore Site',
    lastPrestart: 'Today 7:00am',
    nextService: 'Return 10 Jul 2026',
    regoExpiry: 'N/A',
    odometer: 'N/A',
    issues: [],
    prestartsDone: 8,
  },
  {
    id: 'FLT-006',
    name: 'Mitsubishi Canter — White',
    type: 'Truck',
    rego: '321 JKL',
    status: 'inactive',
    location: 'Yard — Hemmant',
    lastPrestart: '14 days ago',
    nextService: '10 Sep 2026',
    regoExpiry: '31 Aug 2026',
    odometer: '198,400 km',
    issues: ['Rego expires in 67 days'],
    prestartsDone: 310,
  },
];

const statusConfig: Record<AssetStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  active:      { label: 'Active',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  maintenance: { label: 'Maintenance', color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       icon: Wrench },
  attention:   { label: 'Attention',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: AlertTriangle },
  inactive:    { label: 'Inactive',    color: 'text-slate-500',   bg: 'bg-slate-100 border-slate-200',    icon: Clock },
};

const filters: { label: string; value: AssetStatus | 'all' }[] = [
  { label: 'All Assets', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Attention', value: 'attention' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Inactive', value: 'inactive' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
} as const;

export default function FleetPage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<AssetStatus | 'all'>('all');
  const [selectedAsset, setSelectedAsset] = useState<FleetAsset | null>(null);

  const filtered = fleet.filter((a) => {
    const matchesFilter = activeFilter === 'all' || a.status === activeFilter;
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.type.toLowerCase().includes(search.toLowerCase()) ||
      a.rego.toLowerCase().includes(search.toLowerCase()) ||
      a.location.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const attentionCount = fleet.filter(a => a.status === 'attention' || a.status === 'maintenance').length;

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Fleet — IWILLBUILD Portal</title>
        <meta name="description" content="Track fleet assets, daily prestarts, service dates and rego in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/fleet" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <Truck size={20} className="text-primary" />
            <h1 className="font-heading font-bold text-lg">Fleet</h1>
            <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
              {fleet.length} assets
            </span>
            {attentionCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle size={10} />
                {attentionCount} need attention
              </span>
            )}
          </div>
          <button className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} />
            Add Asset
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5">

            {/* Search + filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assets, rego, location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {filters.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setActiveFilter(f.value)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                      activeFilter === f.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Active', count: fleet.filter(a => a.status === 'active').length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Attention', count: fleet.filter(a => a.status === 'attention').length, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Maintenance', count: fleet.filter(a => a.status === 'maintenance').length, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Inactive', count: fleet.filter(a => a.status === 'inactive').length, color: 'text-slate-500', bg: 'bg-slate-100' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white`}>
                  <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Asset list */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-3"
            >
              {filtered.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-sm">No assets match your search.</div>
              )}
              {filtered.map((asset) => {
                const s = statusConfig[asset.status];
                const StatusIcon = s.icon;
                const isSelected = selectedAsset?.id === asset.id;
                return (
                  <motion.div
                    key={asset.id}
                    variants={fadeUp}
                    onClick={() => setSelectedAsset(isSelected ? null : asset)}
                    className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all duration-150"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono text-slate-400">{asset.id}</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>
                            <StatusIcon size={11} />
                            {s.label}
                          </span>
                          <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                            {asset.type}
                          </span>
                        </div>
                        <h2 className="font-bold text-base text-slate-900 truncate">{asset.name}</h2>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1"><Fuel size={11} />Rego: {asset.rego}</span>
                          <span className="flex items-center gap-1"><MapPin size={11} />{asset.location}</span>
                          <span className="flex items-center gap-1"><Clock size={11} />Prestart: {asset.lastPrestart}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black text-slate-800">{asset.odometer}</div>
                        <div className="text-xs text-slate-400 mt-0.5">odometer</div>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`text-slate-300 shrink-0 mt-1 transition-transform duration-150 ${isSelected ? 'rotate-90' : ''}`}
                      />
                    </div>

                    {/* Issues banner */}
                    {asset.issues.length > 0 && (
                      <div className="mt-3 flex flex-col gap-1">
                        {asset.issues.map((issue) => (
                          <div key={issue} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                            <ShieldAlert size={12} className="shrink-0" />
                            {issue}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Expanded detail */}
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.2 }}
                        className="mt-4 pt-4 border-t border-slate-100"
                      >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          {[
                            { icon: Wrench,       label: 'Next Service',   value: asset.nextService },
                            { icon: Calendar,     label: 'Rego Expiry',    value: asset.regoExpiry },
                            { icon: ClipboardList,label: 'Prestarts Done', value: `${asset.prestartsDone}` },
                            { icon: MapPin,       label: 'Location',       value: asset.location },
                          ].map((d) => (
                            <div key={d.label} className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                <d.icon size={11} />
                                {d.label}
                              </div>
                              <div className="text-sm font-bold text-slate-700">{d.value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            <ClipboardList size={12} /> View Prestarts
                          </button>
                          <span className="text-slate-200">|</span>
                          <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            <Wrench size={12} /> Log Service
                          </button>
                          <span className="text-slate-200">|</span>
                          <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            <Calendar size={12} /> Update Rego
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}
