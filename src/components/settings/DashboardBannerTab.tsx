import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone, Save, Loader2, CheckCircle2, AlertCircle, Info,
  ShieldAlert, Gift, Sparkles, Zap, Eye, EyeOff,
} from 'lucide-react';
import type { BannerConfig, SeasonalSkinsConfig } from '@/components/dashboard/DashboardBanner';
import { SEASONAL_EVENTS, getActiveSeasonalEvent } from '@/lib/seasonal';

interface DashboardBannerTabProps {
  isAdmin: boolean;
}

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white disabled:bg-slate-50 disabled:text-slate-400';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

const BANNER_STYLES: { value: BannerConfig['style']; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; desc: string }[] = [
  { value: 'standard',    label: 'Standard',    icon: Megaphone,   desc: 'General company notice' },
  { value: 'safety',      label: 'Safety',      icon: ShieldAlert, desc: 'Safety reminders and alerts' },
  { value: 'seasonal',    label: 'Seasonal',    icon: Gift,        desc: 'Holiday or seasonal message' },
  { value: 'celebration', label: 'Celebration', icon: Sparkles,    desc: 'Birthdays, milestones, wins' },
  { value: 'warning',     label: 'Warning',     icon: Zap,         desc: 'Urgent notices' },
];

const STYLE_PREVIEW: Record<string, { bg: string; border: string; text: string }> = {
  standard:    { bg: 'bg-slate-50',   border: 'border-slate-200', text: 'text-slate-800' },
  safety:      { bg: 'bg-amber-50',   border: 'border-amber-200', text: 'text-amber-900' },
  seasonal:    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900' },
  celebration: { bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-900' },
  warning:     { bg: 'bg-red-50',     border: 'border-red-200',   text: 'text-red-900' },
};

const DEFAULT_BANNER: BannerConfig = {
  enabled: false,
  title: '',
  message: '',
  linkLabel: '',
  linkUrl: '',
  style: 'standard',
  startDate: '',
  endDate: '',
  dismissible: true,
};

const DEFAULT_SEASONAL: SeasonalSkinsConfig = {
  enabled: false,
  showBanner: true,
  subtleMode: true,
};

export default function DashboardBannerTab({ isAdmin }: DashboardBannerTabProps) {
  const [banner, setBanner] = useState<BannerConfig>(DEFAULT_BANNER);
  const [seasonal, setSeasonal] = useState<SeasonalSkinsConfig>(DEFAULT_SEASONAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [previewVisible, setPreviewVisible] = useState(true);

  const activeSeasonalEvent = getActiveSeasonalEvent();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/company-settings', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { banner?: { dashboardBanner?: Partial<BannerConfig>; seasonalSkins?: Partial<SeasonalSkinsConfig> } };
      if (data.banner?.dashboardBanner) {
        setBanner({ ...DEFAULT_BANNER, ...data.banner.dashboardBanner });
      }
      if (data.banner?.seasonalSkins) {
        setSeasonal({ ...DEFAULT_SEASONAL, ...data.banner.seasonalSkins });
      }
    } catch {
      setError('Failed to load banner settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'banner',
          data: { dashboardBanner: banner, seasonalSkins: seasonal },
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Megaphone size={22} className="text-slate-400" />
        </div>
        <h3 className="font-bold text-slate-700 mb-2">Dashboard Banner</h3>
        <p className="text-sm text-slate-400">Only Owner and Admin users can configure the dashboard banner.</p>
      </div>
    );
  }

  const previewStyle = STYLE_PREVIEW[banner.style] ?? STYLE_PREVIEW.standard;
  const StyleIcon = BANNER_STYLES.find((s) => s.value === banner.style)?.icon ?? Megaphone;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Section header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-violet-50">
          <Megaphone size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-slate-900">Dashboard Banner</h2>
          <p className="text-xs text-slate-500 mt-0.5">Display a company notice or seasonal message in the dashboard header.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}

      {/* ── Company Banner ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">Company Banner</h3>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-slate-500 font-medium">{banner.enabled ? 'Enabled' : 'Disabled'}</span>
            <button
              type="button"
              onClick={() => setBanner((b) => ({ ...b, enabled: !b.enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${banner.enabled ? 'bg-primary' : 'bg-slate-200'}`}
              aria-pressed={banner.enabled}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${banner.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Banner Title <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={banner.title}
              onChange={(e) => setBanner((b) => ({ ...b, title: e.target.value }))}
              placeholder="e.g. Friday Site Reminder"
              maxLength={60}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Banner Style</label>
            <select
              value={banner.style}
              onChange={(e) => setBanner((b) => ({ ...b, style: e.target.value as BannerConfig['style'] }))}
              className={inputClass}
            >
              {BANNER_STYLES.map((s) => (
                <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Banner Message <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={banner.message}
            onChange={(e) => setBanner((b) => ({ ...b, message: e.target.value }))}
            placeholder="e.g. Upload job photos before leaving site."
            maxLength={160}
            className={inputClass}
          />
          <p className="text-[11px] text-slate-400 mt-1">{banner.message.length}/160 characters</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Action Button Label <span className="text-slate-300">(optional)</span></label>
            <input
              type="text"
              value={banner.linkLabel ?? ''}
              onChange={(e) => setBanner((b) => ({ ...b, linkLabel: e.target.value }))}
              placeholder="e.g. Open Jobs"
              maxLength={40}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Action URL <span className="text-slate-300">(optional)</span></label>
            <input
              type="text"
              value={banner.linkUrl ?? ''}
              onChange={(e) => setBanner((b) => ({ ...b, linkUrl: e.target.value }))}
              placeholder="e.g. /jobs or https://..."
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Start Date <span className="text-slate-300">(optional)</span></label>
            <input
              type="date"
              value={banner.startDate ?? ''}
              onChange={(e) => setBanner((b) => ({ ...b, startDate: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>End Date <span className="text-slate-300">(optional)</span></label>
            <input
              type="date"
              value={banner.endDate ?? ''}
              onChange={(e) => setBanner((b) => ({ ...b, endDate: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => setBanner((b) => ({ ...b, dismissible: !b.dismissible }))}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${banner.dismissible ? 'bg-primary' : 'bg-slate-200'}`}
              aria-pressed={banner.dismissible}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${banner.dismissible ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium text-slate-700">Dismissible</span>
          </label>
          <p className="text-xs text-slate-400">Users can dismiss the banner once per day. Other users are unaffected.</p>
        </div>

        {/* Live preview */}
        {(banner.title || banner.message) && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview</span>
              <button
                type="button"
                onClick={() => setPreviewVisible((v) => !v)}
                className="text-slate-600 hover:text-slate-800 transition-colors"
              >
                {previewVisible ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            {previewVisible && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${previewStyle.bg} ${previewStyle.border}`}>
                <StyleIcon size={14} className={previewStyle.text} />
                <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                  <span className={`text-xs font-bold ${previewStyle.text}`}>{banner.title || 'Banner Title'}</span>
                  <span className="text-xs text-slate-500 truncate">{banner.message || 'Banner message goes here.'}</span>
                </div>
                {banner.linkLabel && (
                  <span className={`text-xs font-semibold underline underline-offset-2 ${previewStyle.text}`}>{banner.linkLabel}</span>
                )}
                {banner.dismissible && (
                  <span className="text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">✕</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Seasonal Skins ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Seasonal Skins</h3>
            <p className="text-xs text-slate-400 mt-0.5">Show a subtle seasonal message when no company banner is active.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-slate-500 font-medium">{seasonal.enabled ? 'Enabled' : 'Disabled'}</span>
            <button
              type="button"
              onClick={() => setSeasonal((s) => ({ ...s, enabled: !s.enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${seasonal.enabled ? 'bg-primary' : 'bg-slate-200'}`}
              aria-pressed={seasonal.enabled}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${seasonal.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </label>
        </div>

        {seasonal.enabled && (
          <div className="flex flex-col gap-3 pt-1">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setSeasonal((s) => ({ ...s, showBanner: !s.showBanner }))}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${seasonal.showBanner ? 'bg-primary' : 'bg-slate-200'}`}
                aria-pressed={seasonal.showBanner}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${seasonal.showBanner ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm font-medium text-slate-700">Show seasonal banner in dashboard</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setSeasonal((s) => ({ ...s, subtleMode: !s.subtleMode }))}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${seasonal.subtleMode ? 'bg-primary' : 'bg-slate-200'}`}
                aria-pressed={seasonal.subtleMode}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${seasonal.subtleMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <span className="text-sm font-medium text-slate-700">Subtle mode</span>
                <p className="text-xs text-slate-400">Show title only — hide the full seasonal message</p>
              </div>
            </label>

            {/* Active event indicator */}
            {activeSeasonalEvent ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
                style={{ backgroundColor: `${activeSeasonalEvent.accentColor}12`, borderColor: `${activeSeasonalEvent.accentColor}40`, color: activeSeasonalEvent.accentColor }}>
                <Info size={12} />
                <span className="font-semibold">Active today:</span>
                <span>{activeSeasonalEvent.name} — "{activeSeasonalEvent.bannerTitle}"</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs text-slate-400">
                <Info size={12} />
                No seasonal event active today. Next events:&nbsp;
                {SEASONAL_EVENTS.slice(0, 3).map((e) => e.name).join(', ')}…
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Save button ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-primary hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Banner Settings
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <CheckCircle2 size={13} /> Saved
          </span>
        )}
      </div>

    </div>
  );
}
