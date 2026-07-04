/**
 * KpiWidgets
 * ─────────────────────────────────────────────────────────────────────────────
 * Four KPI cards for the dashboard:
 *   1. Revenue MTD  — with 30-day sparkline + trend vs last month
 *   2. Open Jobs    — active job count + new in last 30 days
 *   3. Outstanding  — unpaid invoice count + total balance due
 *   4. Fleet Util   — active/total assets as a % with mini bar
 */
import { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  HardHat,
  FileText,
  Truck,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { fmtMoney } from '@/lib/invoices-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KpiData {
  revenueMtd: number;
  revenueLastMonth: number;
  revenueTrend: number | null;
  openJobs: number;
  newJobsLast30: number;
  outstandingCount: number;
  outstandingBalance: number;
  overdueCount: number;
  fleetTotal: number;
  fleetActive: number;
  fleetUtilisation: number;
  sparkline: number[];
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ data, color = '#F97316' }: { data: number[]; color?: string }) {
  const w = 80;
  const h = 28;
  const max = Math.max(...data, 1);

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M 0,${h} L ${points.join(' L ')} L ${w},${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-fill-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: number | null }) {
  if (trend === null) return null;
  const up = trend > 0;
  const flat = trend === 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
      flat
        ? 'bg-slate-100 text-slate-500'
        : up
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-red-50 text-red-600'
    }`}>
      {flat ? <Minus size={9} /> : up ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {flat ? 'Flat' : `${up ? '+' : ''}${trend}%`}
    </span>
  );
}

// ── Fleet utilisation bar ─────────────────────────────────────────────────────

function UtilBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f97316' : '#ef4444';
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' as const, delay: 0.3 }}
      />
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-border p-4 md:p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="w-8 h-8 rounded-lg bg-slate-100" />
        <div className="w-12 h-4 rounded bg-slate-100" />
      </div>
      <div className="w-20 h-7 rounded bg-slate-100" />
      <div className="w-28 h-3 rounded bg-slate-100" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as const, delay: i * 0.07 },
  }),
} as const;

export default function KpiWidgets() {
  const { isAdmin, isOwner, can, loading: permLoading } = usePermissions();
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  const seeDollars = isAdmin || isOwner || can('seeDollars');
  const canInvoices = isAdmin || isOwner || can('invoices');

  useEffect(() => {
    if (permLoading || fetchedRef.current) return;
    fetchedRef.current = true;
    fetch('/api/dashboard/kpi', { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<KpiData> : Promise.reject())
      .then((d) => { setKpi(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [permLoading]);

  if (loading || permLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-2">
        {[0, 1, 2, 3].map((i) => <KpiSkeleton key={i} />)}
      </div>
    );
  }

  if (error || !kpi) return null;

  const cards = [
    // ── Revenue MTD ──────────────────────────────────────────────────────────
    ...(seeDollars ? [{
      key: 'revenue',
      icon: DollarSign,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      label: 'Revenue MTD',
      value: fmtMoney(kpi.revenueMtd),
      sub: kpi.revenueLastMonth > 0
        ? `Last month: ${fmtMoney(kpi.revenueLastMonth)}`
        : 'No revenue last month',
      trend: kpi.revenueTrend,
      extra: (
        <div className="mt-2">
          <Sparkline data={kpi.sparkline} color="#10b981" />
        </div>
      ),
      href: '/invoices',
      cta: 'View invoices',
    }] : []),

    // ── Open Jobs ────────────────────────────────────────────────────────────
    {
      key: 'jobs',
      icon: HardHat,
      iconBg: 'bg-orange-50',
      iconColor: 'text-primary',
      label: 'Open Jobs',
      value: String(kpi.openJobs),
      sub: kpi.newJobsLast30 > 0
        ? `+${kpi.newJobsLast30} added last 30 days`
        : 'No new jobs this month',
      trend: null as number | null,
      extra: null as React.ReactNode,
      href: '/jobs',
      cta: 'View jobs',
    },

    // ── Outstanding ──────────────────────────────────────────────────────────
    ...(canInvoices && seeDollars ? [{
      key: 'outstanding',
      icon: FileText,
      iconBg: kpi.overdueCount > 0 ? 'bg-red-50' : 'bg-amber-50',
      iconColor: kpi.overdueCount > 0 ? 'text-red-600' : 'text-amber-600',
      label: 'Outstanding',
      value: fmtMoney(kpi.outstandingBalance),
      sub: kpi.outstandingCount > 0
        ? `${kpi.outstandingCount} invoice${kpi.outstandingCount !== 1 ? 's' : ''} unpaid${kpi.overdueCount > 0 ? ` · ${kpi.overdueCount} overdue` : ''}`
        : 'All invoices paid',
      trend: null as number | null,
      extra: kpi.overdueCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full mt-1">
          {kpi.overdueCount} overdue
        </span>
      ) : null as React.ReactNode,
      href: '/invoices',
      cta: 'View invoices',
    }] : []),

    // ── Fleet Utilisation ────────────────────────────────────────────────────
    {
      key: 'fleet',
      icon: Truck,
      iconBg: 'bg-cyan-50',
      iconColor: 'text-cyan-600',
      label: 'Fleet Utilisation',
      value: kpi.fleetTotal > 0 ? `${kpi.fleetUtilisation}%` : '—',
      sub: kpi.fleetTotal > 0
        ? `${kpi.fleetActive} of ${kpi.fleetTotal} asset${kpi.fleetTotal !== 1 ? 's' : ''} active`
        : 'No fleet assets added',
      trend: null as number | null,
      extra: kpi.fleetTotal > 0 ? (
        <UtilBar pct={kpi.fleetUtilisation} />
      ) : null as React.ReactNode,
      href: '/fleet',
      cta: 'View fleet',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-2">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          custom={i}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          whileHover={{ y: -2, boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}
          className="bg-white rounded-xl border border-border p-4 md:p-5 flex flex-col"
        >
          {/* Icon + trend */}
          <div className="flex items-start justify-between mb-3">
            <div className={`p-2 rounded-lg ${card.iconBg}`}>
              <card.icon size={15} className={card.iconColor} />
            </div>
            <TrendBadge trend={card.trend} />
          </div>

          {/* Value */}
          <p className="font-heading font-bold text-xl md:text-2xl text-foreground leading-none">
            {card.value}
          </p>

          {/* Label */}
          <p className="text-xs font-semibold text-muted-foreground mt-1">{card.label}</p>

          {/* Sub-text */}
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{card.sub}</p>

          {/* Extra (sparkline / bar / badge) */}
          {card.extra}

          {/* CTA */}
          <Link
            to={card.href}
            className="mt-auto pt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            {card.cta} <ChevronRight size={10} />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
