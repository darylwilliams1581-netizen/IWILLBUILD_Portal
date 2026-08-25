/**
 * /work-field — Work & Field launcher (Path B entry point).
 *
 * Shows a responsive icon grid of all 14 job-scoped features.
 * Selecting a feature opens the shared Job picker, then navigates
 * to the canonical standalone page for that feature + job.
 *
 * Route: /work-field  (launcher)
 *        /work-field/:featureSlug  (pre-selects a feature and opens picker)
 *
 * @seo-exempt
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobPickerSheet from '@/components/JobPickerSheet';
import { work_field } from 'virtual:content';
import {
  LAUNCHER_FEATURES,
  getFeatureByLauncherSlug,
  type JobFeature,
} from '@/lib/jobFeatureRegistry';

// ── Launcher card ─────────────────────────────────────────────────────────────

function FeatureCard({
  feature,
  onClick,
}: {
  feature: JobFeature;
  onClick: (f: JobFeature) => void;
}) {
  const Icon = feature.icon;
  return (
    <button
      type="button"
      onClick={() => onClick(feature)}
      data-testid={`launcher-card-${feature.key}`}
      className="flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-200 active:scale-[0.97] transition-all duration-150 min-h-[88px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className={`w-11 h-11 rounded-2xl ${feature.bg} flex items-center justify-center shrink-0`}>
        <Icon size={20} className={feature.fg} />
      </div>
      <span className="text-xs font-semibold text-gray-800 text-center leading-tight">
        {feature.label}
      </span>
    </button>
  );
}

// ── Group definitions (code constant — not content) ───────────────────────────

const LAUNCHER_GROUPS: ReadonlyArray<{ label: string; keys: ReadonlyArray<string> }> = [
  { label: 'Work',          keys: ['tasks', 'notes', 'delays', 'progress', 'attendance'] },
  { label: 'Field & Files', keys: ['photos', 'drawings', 'files'] },
  { label: 'Finance',       keys: ['estimates', 'purchase-orders', 'invoices', 'costs'] },
  { label: 'Safety',        keys: ['forms', 'safety'] },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkFieldPage() {
  const { featureSlug } = useParams<{ featureSlug?: string }>();
  const navigate = useNavigate();

  const [pendingFeature, setPendingFeature] = useState<JobFeature | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // If a featureSlug is in the URL open the picker immediately
  useEffect(() => {
    if (!featureSlug) return;
    const feature = getFeatureByLauncherSlug(featureSlug);
    if (feature) {
      setPendingFeature(feature);
      setPickerOpen(true);
    }
  }, [featureSlug]);

  function handleCardClick(feature: JobFeature) {
    setPendingFeature(feature);
    setPickerOpen(true);
    const slug = feature.launcherRoute.split('/').pop() ?? feature.key;
    navigate(`/work-field/${slug}`, { replace: false });
  }

  function handlePickerClose() {
    setPickerOpen(false);
    navigate('/work-field', { replace: true });
  }

  function handleJobSelect(job: { id: number }) {
    if (!pendingFeature) return;
    setPickerOpen(false);
    navigate(pendingFeature.standaloneRoute(job.id));
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>Work &amp; Field — IWILLBUILD</title>
        <meta name="description" content="Select a job feature to get started" />
        <link rel="canonical" href="https://iwillbuild.com/work-field" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-content">
        {/* Desktop page header */}
        <div className="op-page-header hidden md:flex sticky top-0 z-30">
          <button
            onClick={() => navigate(-1)}
            className="p-1 -ml-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={15} />
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="op-page-title">{work_field.title}</h1>
            <p className="op-page-subtitle">{work_field.subtitle}</p>
          </div>
        </div>

        {/* Mobile header */}
        <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 shrink-0 sticky top-0 z-30 safe-top">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-heading font-bold text-sm text-gray-900">{work_field.title}</h1>
        </header>

        {/* Feature groups */}
        <div className="max-w-2xl mx-auto px-1 py-4 space-y-6 pb-24">
          {LAUNCHER_GROUPS.map(group => {
            const features = LAUNCHER_FEATURES.filter(f => group.keys.includes(f.key));
            if (features.length === 0) return null;
            return (
              <section key={group.label} data-testid={`launcher-group-${group.label}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {features.map(feature => (
                    <FeatureCard
                      key={feature.key}
                      feature={feature}
                      onClick={handleCardClick}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Job picker */}
      {pendingFeature && (
        <JobPickerSheet
          open={pickerOpen}
          onClose={handlePickerClose}
          title={pendingFeature.label}
          subtitle={`Select a job to open ${pendingFeature.label}`}
          iconBg={pendingFeature.bg}
          iconFg={pendingFeature.fg}
          Icon={pendingFeature.icon}
          onSelect={handleJobSelect}
        />
      )}
    </div>
  );
}
