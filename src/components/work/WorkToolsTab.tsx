/**
 * WorkToolsTab — launch cards for Builders Calculator and Takeoff Pad.
 *
 * Reuses existing routes. Does not duplicate calculator code.
 * Preserves /estimating and Settings → Costing.
 */
import { useNavigate } from 'react-router';
import { Calculator, Ruler, ShieldAlert, MapPin, ExternalLink, Zap } from 'lucide-react';

const MAPS_TOILET_URL = 'https://www.google.com/maps/search/?api=1&query=public+toilets';

interface ToolCard {
  title: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconFg: string;
  href: string;
  external?: boolean;
  badge?: string;
}

const TOOLS: ToolCard[] = [
  {
    title: 'Builders Calculator',
    description: 'Quick construction calculations — areas, volumes, materials, and cost estimates.',
    icon: Calculator,
    iconBg: 'bg-violet-100',
    iconFg: 'text-violet-600',
    href: '/builders-calc',
  },
  {
    title: 'Takeoff Pad',
    description: 'Measure and quantify from plans. Save takeoff notes and quantities for estimating.',
    icon: Ruler,
    iconBg: 'bg-blue-100',
    iconFg: 'text-blue-600',
    href: '/takeoff-pad',
  },
  {
    title: 'SDS / MSDS Register',
    description: 'Upload and view safety data sheets on-site. PDF register for your company.',
    icon: ShieldAlert,
    iconBg: 'bg-rose-100',
    iconFg: 'text-rose-600',
    href: '/sds-register',
  },
  {
    title: 'RL Register',
    description: 'Record site levels and calculate rise/fall differences. Export PDF or CSV.',
    icon: Ruler,
    iconBg: 'bg-emerald-100',
    iconFg: 'text-emerald-600',
    href: '/rl-register',
  },
  {
    title: 'Electrical Tests',
    description: 'Record electrical test results with equipment register, sign-off, and PDF report.',
    icon: Zap,
    iconBg: 'bg-yellow-100',
    iconFg: 'text-yellow-600',
    href: '/electrical-tests',
  },
  {
    title: 'Public Toilet Finder',
    description: 'Find nearby public toilets in Google Maps. Opens Google Maps — no location data is collected by IWILLBUILD.',
    icon: MapPin,
    iconBg: 'bg-teal-100',
    iconFg: 'text-teal-600',
    href: MAPS_TOILET_URL,
    external: true,
  },
];

function openExternalUrl(url: string) {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    alert('Unable to open Google Maps. Check your internet connection and try again.');
  }
}

export default function WorkToolsTab() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-4">
          Available tools
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            function handleClick() {
              if (tool.external) {
                openExternalUrl(tool.href);
              } else {
                navigate(tool.href);
              }
            }
            return (
              <button
                key={tool.href}
                onClick={handleClick}
                className="group flex flex-col gap-3 bg-card border border-border rounded-2xl p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-2xl ${tool.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon size={20} className={tool.iconFg} />
                  </div>
                  <ExternalLink
                    size={14}
                    className="text-muted-foreground group-hover:text-primary transition-colors mt-1"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">{tool.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tool.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Cost Guide and Recipe functionality remain available under{' '}
          <a href="/estimating" className="text-primary hover:underline underline-offset-2">
            Estimating
          </a>{' '}
          and Settings → Costing.
        </p>
      </div>
    </div>
  );
}
