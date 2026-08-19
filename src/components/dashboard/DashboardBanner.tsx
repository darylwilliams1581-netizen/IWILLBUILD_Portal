import { useState, useEffect, useCallback } from 'react';
import { Link } from "react-router";
import { X, ExternalLink, Megaphone, ShieldAlert, Gift, Sparkles, Sun, Heart, Shield, TrendingUp, Zap, Clover } from 'lucide-react';
import { getActiveSeasonalEvent } from '@/lib/seasonal';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BannerConfig {
  enabled: boolean;
  title: string;
  message: string;
  linkLabel?: string;
  linkUrl?: string;
  style: 'standard' | 'safety' | 'seasonal' | 'celebration' | 'warning';
  startDate?: string; // ISO date string YYYY-MM-DD
  endDate?: string;
  dismissible: boolean;
}
export interface SeasonalSkinsConfig {
  enabled: boolean;
  showBanner: boolean;
  subtleMode: boolean;
}
interface DashboardBannerProps {
  userId?: string;
}

// ── Style maps ────────────────────────────────────────────────────────────────

const STYLE_MAP: Record<string, {
  bg: string;
  border: string;
  text: string;
  subtext: string;
  iconColor: string;
}> = {
  standard: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-800',
    subtext: 'text-slate-500',
    iconColor: 'text-slate-500'
  },
  safety: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-900',
    subtext: 'text-amber-700',
    iconColor: 'text-amber-600'
  },
  seasonal: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-900',
    subtext: 'text-emerald-700',
    iconColor: 'text-emerald-600'
  },
  celebration: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-900',
    subtext: 'text-purple-700',
    iconColor: 'text-purple-600'
  },
  warning: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-900',
    subtext: 'text-red-700',
    iconColor: 'text-red-600'
  }
};
const ICON_MAP: Record<string, React.ComponentType<{
  size?: number;
  className?: string;
}>> = {
  Megaphone,
  ShieldAlert,
  Gift,
  Sparkles,
  Sun,
  Heart,
  Shield,
  TrendingUp,
  Zap,
  Clover
};
function BannerIcon({
  name,
  style,
  size = 14
}: {
  name: string;
  style: string;
  size?: number;
}) {
  const colors = STYLE_MAP[style] ?? STYLE_MAP.standard;
  const Icon = ICON_MAP[name] ?? Megaphone;
  return <Icon size={size} className={colors.iconColor} />;
}

// ── Dismiss key helpers ───────────────────────────────────────────────────────

function makeDismissKey(userId: string, config: BannerConfig): string {
  // Key includes a hash of title+message+startDate so a new banner resets dismissal
  const sig = `${config.title}|${config.message}|${config.startDate ?? ''}`;
  return `banner_dismissed_${userId}_${btoa(sig).slice(0, 16)}`;
}
function isDismissed(userId: string, config: BannerConfig): boolean {
  try {
    const key = makeDismissKey(userId, config);
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    // Dismiss resets each calendar day
    const today = new Date().toISOString().slice(0, 10);
    return stored === today;
  } catch {
    return false;
  }
}
function storeDismiss(userId: string, config: BannerConfig) {
  try {
    const key = makeDismissKey(userId, config);
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(key, today);
  } catch {
    // ignore
  }
}

// ── Date range check ──────────────────────────────────────────────────────────

function isInDateRange(config: BannerConfig): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (config.startDate && today < config.startDate) return false;
  if (config.endDate && today > config.endDate) return false;
  return true;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardBanner({
  userId = 'anon'
}: DashboardBannerProps) {
  const [bannerConfig, setBannerConfig] = useState<BannerConfig | null>(null);
  const [seasonalConfig, setSeasonalConfig] = useState<SeasonalSkinsConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/company-settings', {
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        banner?: {
          dashboardBanner?: BannerConfig;
          seasonalSkins?: SeasonalSkinsConfig;
        };
      };
      const banner = data.banner?.dashboardBanner ?? null;
      const seasonal = data.banner?.seasonalSkins ?? null;
      setBannerConfig(banner);
      setSeasonalConfig(seasonal);
      if (banner && banner.dismissible) {
        setDismissed(isDismissed(userId, banner));
      }
    } catch {
      // silent
    } finally {
      setLoaded(true);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!loaded) return null;

  // ── Determine what to show ─────────────────────────────────────────────────

  // Company banner: active, in range, not dismissed
  const showCompany = bannerConfig?.enabled && isInDateRange(bannerConfig) && !dismissed;

  // Seasonal fallback: no active company banner, seasonal enabled
  const seasonalEvent = getActiveSeasonalEvent();
  const showSeasonal = !showCompany && seasonalConfig?.enabled && seasonalConfig?.showBanner && !!seasonalEvent;
  if (!showCompany && !showSeasonal) return null;

  // ── Render company banner ──────────────────────────────────────────────────
  if (showCompany && bannerConfig) {
    const s = STYLE_MAP[bannerConfig.style] ?? STYLE_MAP.standard;
    const iconName = bannerConfig.style === 'safety' ? 'ShieldAlert' : bannerConfig.style === 'warning' ? 'ShieldAlert' : bannerConfig.style === 'celebration' ? 'Sparkles' : bannerConfig.style === 'seasonal' ? 'Gift' : 'Megaphone';
    const isExternal = bannerConfig.linkUrl?.startsWith('http');
    return <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${s.bg} ${s.border} min-w-0 flex-1 mx-2 md:mx-4 print:hidden`} role="status" aria-live="polite">
        <BannerIcon name={iconName} style={bannerConfig.style} size={14} />
        <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
          <span className={`text-xs font-bold shrink-0 ${s.text}`}>{bannerConfig.title}</span>
          <span className={`text-xs truncate ${s.subtext}`}>{bannerConfig.message}</span>
        </div>
        {bannerConfig.linkLabel && bannerConfig.linkUrl && (isExternal ? <a href={bannerConfig.linkUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1 text-xs font-semibold shrink-0 underline underline-offset-2 ${s.text} hover:opacity-70 transition-opacity`}>
              {bannerConfig.linkLabel}
              <ExternalLink size={10} />
            </a> : <Link to={bannerConfig.linkUrl} className={`text-xs font-semibold shrink-0 underline underline-offset-2 ${s.text} hover:opacity-70 transition-opacity`}>
              {bannerConfig.linkLabel}
            </Link>)}
        {bannerConfig.dismissible && <button onClick={() => {
        storeDismiss(userId, bannerConfig);
        setDismissed(true);
      }} className={`p-0.5 rounded hover:bg-black/10 transition-colors shrink-0 ${s.iconColor}`} aria-label="Dismiss banner">
            <X size={12} />
          </button>}
      </div>;
  }

  // ── Render seasonal fallback ───────────────────────────────────────────────
  if (showSeasonal && seasonalEvent) {
    const subtle = seasonalConfig?.subtleMode ?? true;
    const iconName = seasonalEvent.icon;
    return <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border min-w-0 flex-1 mx-2 md:mx-4 print:hidden" style={{
      backgroundColor: `${seasonalEvent.accentColor}12`,
      borderColor: `${seasonalEvent.accentColor}40`
    }} role="status" aria-live="polite">
        <span style={{
        color: seasonalEvent.accentColor
      }}>
          <BannerIcon name={iconName} style="standard" size={14} />
        </span>
        <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-bold shrink-0" style={{
          color: seasonalEvent.accentColor
        }}>
            {seasonalEvent.bannerTitle}
          </span>
          {!subtle && <span className="text-xs truncate text-slate-500">{seasonalEvent.bannerMessage}</span>}
        </div>
      </div>;
  }
  return null;
}
