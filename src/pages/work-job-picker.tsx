/**
 * /work/:workTab — Job picker landing for job-scoped Work items.
 *
 * workTab values: tasks | notes | delays | progress | attendance
 *
 * Shows a job picker sheet immediately on mount. Selecting a job
 * navigates to the existing job-scoped route for that tab.
 * Closing without selecting returns to /jobs.
 *
 * Does NOT create any new data systems — reuses existing job routes.
 */
// @seo-exempt
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  CheckSquare,
  StickyNote,
  Clock,
  TrendingUp,
  Users,
} from 'lucide-react';
import JobPickerSheet from '@/components/JobPickerSheet';
import PortalSidebar from '@/components/PortalSidebar';

// ── Tab config ────────────────────────────────────────────────────────────────

type WorkTab = 'tasks' | 'notes' | 'delays' | 'progress' | 'attendance';

interface TabConfig {
  label: string;
  subtitle: string;
  icon: React.ElementType;
  iconBg: string;
  iconFg: string;
  jobRoute: (jobId: number) => string;
}

const TAB_CONFIG: Record<WorkTab, TabConfig> = {
  tasks: {
    label: 'Tasks',
    subtitle: 'Select a job to view its tasks',
    icon: CheckSquare,
    iconBg: 'bg-blue-100',
    iconFg: 'text-blue-600',
    jobRoute: (id) => `/jobs/${id}?tab=tasks`,
  },
  notes: {
    label: 'Notes',
    subtitle: 'Select a job to view its notes',
    icon: StickyNote,
    iconBg: 'bg-yellow-100',
    iconFg: 'text-yellow-600',
    jobRoute: (id) => `/jobs/${id}/notes`,
  },
  delays: {
    label: 'Delays',
    subtitle: 'Select a job to view its delays',
    icon: Clock,
    iconBg: 'bg-orange-100',
    iconFg: 'text-orange-600',
    jobRoute: (id) => `/jobs/${id}/delays`,
  },
  progress: {
    label: 'Progress',
    subtitle: 'Select a job to view its progress',
    icon: TrendingUp,
    iconBg: 'bg-cyan-100',
    iconFg: 'text-cyan-600',
    jobRoute: (id) => `/jobs/${id}/progress`,
  },
  attendance: {
    label: 'Attendance',
    subtitle: 'Select a job to view its attendance',
    icon: Users,
    iconBg: 'bg-green-100',
    iconFg: 'text-green-600',
    jobRoute: (id) => `/jobs/${id}?tab=attendance`,
  },
};

const VALID_TABS = Object.keys(TAB_CONFIG) as WorkTab[];

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorkJobPickerPage() {
  const { workTab } = useParams<{ workTab: string }>();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const tab: WorkTab = VALID_TABS.includes(workTab as WorkTab)
    ? (workTab as WorkTab)
    : 'tasks';

  const config = TAB_CONFIG[tab];
  const Icon = config.icon;

  // Open the picker immediately on mount
  useEffect(() => {
    setOpen(true);
  }, [tab]);

  function handleClose() {
    setOpen(false);
    navigate('/jobs');
  }

  function handleSelect(job: { id: number }) {
    setOpen(false);
    navigate(config.jobRoute(job.id));
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{config.label} — IWIllBUIlD</title>
        <meta name="description" content={`Select a job to open ${config.label}`} />
        <link rel="canonical" href={`https://iwillbuild.com/work/${tab}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      {/* Minimal background while picker is open */}
      <div className="portal-content flex flex-col items-center justify-center h-[100dvh] bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className={`w-14 h-14 rounded-3xl ${config.iconBg} flex items-center justify-center`}>
            <Icon size={26} className={config.iconFg} />
          </div>
          <h1 className="text-sm font-medium">{config.label}</h1>
          <p className="text-xs text-muted-foreground">{config.subtitle}</p>
        </div>
      </div>

      <JobPickerSheet
        open={open}
        onClose={handleClose}
        title={config.label}
        subtitle={config.subtitle}
        iconBg={config.iconBg}
        iconFg={config.iconFg}
        Icon={Icon}
        onSelect={handleSelect}
      />
    </div>
  );
}
