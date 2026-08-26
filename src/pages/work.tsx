/**
 * /work — Work Workspace
 *
 * The Work page is the Jobs register and entry point.
 * Job-specific features (Tasks, Notes, Delays, Progress, Attendance) live on
 * the Job detail page — not here — to avoid duplicate entry points.
 *
 * Desktop (lg+): Jobs list with search/filter + Tools dropdown
 * Mobile/tablet (<lg): Jobs list launcher + Tools sub-launcher
 *
 * Route: /work
 *
 * @seo-exempt
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Briefcase, Wrench,
  Plus, Calculator, Ruler, ChevronDown, Home, ArrowLeft,
  Search, ChevronRight, HardHat, Loader2,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import NewJobModal from '@/components/NewJobModal';
import { usePermissions } from '@/lib/usePermissions';
import WorkToolsTab from '@/components/work/WorkToolsTab';

// ── Tools sub-items ───────────────────────────────────────────────────────────

const TOOL_ITEMS = [
  { label: 'Builders Calculator', icon: Calculator, href: '/builders-calc', iconBg: 'bg-violet-100', iconFg: 'text-violet-600', description: 'Areas, volumes, materials and cost estimates' },
  { label: 'Takeoff Pad',         icon: Ruler,      href: '/takeoff-pad',   iconBg: 'bg-blue-100',   iconFg: 'text-blue-600',   description: 'Measure and quantify from plans'             },
] as const;

// ── Desktop Tools dropdown ────────────────────────────────────────────────────

function ToolsDropdown() {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  function openMenu() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openMenu()}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Tools menu"
        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold whitespace-nowrap rounded-lg transition-colors shrink-0 min-h-[36px] my-1.5 ${
          open ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'
        }`}
      >
        <Wrench size={13} />
        Tools
        <ChevronDown size={11} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && menuPos && createPortal(
        <div
          role="menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            zIndex: 9999,
            minWidth: 200,
            maxWidth: 'calc(100vw - 1rem)',
          }}
          className="bg-background border border-border rounded-xl shadow-xl overflow-hidden"
        >
          {TOOL_ITEMS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.href}
                role="menuitem"
                onClick={() => { setOpen(false); navigate(tool.href); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left min-h-[44px]"
              >
                <Icon size={15} className="text-muted-foreground shrink-0" />
                {tool.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Job list (shared between mobile + desktop) ────────────────────────────────

interface JobItem {
  id: number;
  name: string;
  jobNumber: string | null;
  status: string;
  client: string | null;
}

interface JobsListProps {
  onNewJob: () => void;
  isViewOnly: boolean;
}

function JobsList({ onNewJob, isViewOnly }: JobsListProps) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/jobs?status=active&limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => setJobs(Array.isArray(data.jobs) ? data.jobs : []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter(j => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      j.name.toLowerCase().includes(q) ||
      (j.jobNumber ?? '').toLowerCase().includes(q) ||
      (j.client ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full" data-testid="jobs-list">
      {/* Search + New Job */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background shrink-0">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search jobs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {!isViewOnly && (
          <button
            onClick={onNewJob}
            className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 h-9 rounded-lg transition-colors shrink-0 min-h-[44px]"
          >
            <Plus size={13} /> New Job
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading jobs…</span>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <HardHat size={28} className="text-muted-foreground/40" />
            <p className="text-sm">{search ? 'No jobs match your search' : 'No active jobs'}</p>
          </div>
        )}
        {!loading && filtered.map(job => (
          <button
            key={job.id}
            onClick={() => navigate(`/jobs/${job.id}`)}
            data-testid={`job-row-${job.id}`}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors text-left min-h-[56px]"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <HardHat size={15} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {job.jobNumber ? `${job.jobNumber} — ${job.name}` : job.name}
              </p>
              {job.client && (
                <p className="text-xs text-muted-foreground truncate">{job.client}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {job.status}
              </span>
              <ChevronRight size={14} className="text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Mobile Tools sub-launcher ─────────────────────────────────────────────────

function MobileToolsLauncher({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full">
      {/* Header with Back */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background shrink-0">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
          aria-label="Back to Work"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <Wrench size={14} className="text-violet-600" />
          </div>
          <h2 className="text-sm font-bold text-foreground">Tools</h2>
        </div>
        <a
          href="/"
          className="ml-auto flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
          aria-label="Home"
        >
          <Home size={16} />
        </a>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-1 gap-3">
          {TOOL_ITEMS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.href}
                onClick={() => navigate(tool.href)}
                className="flex items-center gap-4 bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/40 active:scale-[0.98] transition-all min-h-[72px]"
              >
                <div className={`w-12 h-12 rounded-2xl ${tool.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon size={22} className={tool.iconFg} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground">{tool.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{tool.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Mobile launcher (Jobs list + Tools button) ────────────────────────────────

interface MobileLauncherProps {
  onToolsOpen: () => void;
  onNewJob: () => void;
  isViewOnly: boolean;
}

function MobileWorkLauncher({ onToolsOpen, onNewJob, isViewOnly }: MobileLauncherProps) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full" data-testid="mobile-work-launcher">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/home')}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0 hover:bg-muted/80 transition-colors"
            aria-label="Back to Home"
          >
            <ArrowLeft size={15} className="text-muted-foreground" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Briefcase size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Work</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">Jobs register</p>
          </div>
        </div>
        <button
          onClick={onToolsOpen}
          className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 h-9 rounded-lg transition-colors min-h-[44px]"
          data-testid="mobile-tools-btn"
        >
          <Wrench size={13} />
          Tools
        </button>
      </div>

      {/* Jobs list fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <JobsList onNewJob={onNewJob} isViewOnly={isViewOnly} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isViewOnly } = usePermissions();

  const [newJobOpen, setNewJobOpen] = useState(false);

  // Desktop + mobile: show tools when ?workTab=tools
  const rawTab = searchParams.get('workTab') ?? '';
  const showDesktopTools = rawTab === 'tools';
  // On mobile, open the tools launcher directly if ?workTab=tools is in the URL
  const [mobileToolsOpen, setMobileToolsOpen] = useState(rawTab === 'tools');

  return (
    <div className="portal-page">
      <Helmet>
        <title>Work — IWILLBUILD</title>
        <meta name="description" content="Jobs register — open a job to access Tasks, Notes, Delays, Progress, Attendance and more." />
        <link rel="canonical" href="https://iwillbuild.com/work" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      {/* ── Desktop layout (lg+) ── */}
      <div className="hidden lg:flex flex-col flex-1 min-w-0 lg-portal overflow-hidden" data-testid="desktop-work">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-background">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase size={16} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-foreground leading-tight">Work</h1>
                <p className="text-[11px] text-muted-foreground leading-tight">Jobs register</p>
              </div>
            </div>
            {!isViewOnly && (
              <button
                onClick={() => setNewJobOpen(true)}
                className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 h-9 rounded-lg transition-colors min-h-[44px]"
              >
                <Plus size={13} /> New Job
              </button>
            )}
          </div>

          {/* Tools tab strip */}
          <nav
            className="flex overflow-x-auto scrollbar-none border-t border-border px-2 md:px-4"
            aria-label="Work sections"
          >
            <ToolsDropdown />
          </nav>
        </header>

        {/* Content — Jobs list (default) or Tools */}
        <main className="flex-1 overflow-hidden">
          {showDesktopTools
            ? <WorkToolsTab />
            : <JobsList onNewJob={() => setNewJobOpen(true)} isViewOnly={isViewOnly} />
          }
        </main>
      </div>

      {/* ── Mobile / tablet layout (<lg) ── */}
      <div className="flex lg:hidden flex-col flex-1 min-w-0 overflow-hidden" data-testid="mobile-work">
        {mobileToolsOpen
          ? <MobileToolsLauncher onBack={() => setMobileToolsOpen(false)} />
          : <MobileWorkLauncher
              onToolsOpen={() => setMobileToolsOpen(true)}
              onNewJob={() => setNewJobOpen(true)}
              isViewOnly={isViewOnly}
            />
        }
      </div>

      {/* New Job modal */}
      <NewJobModal
        open={newJobOpen}
        onClose={() => setNewJobOpen(false)}
        onCreated={(job) => {
          setNewJobOpen(false);
          navigate(`/jobs/${job.id}`);
        }}
      />
    </div>
  );
}
