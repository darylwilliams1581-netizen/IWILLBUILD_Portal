import { Link, useNavigate } from "react-router";
import { FileText, ClipboardList, Calculator, Layers, FolderOpen, DollarSign, ShieldAlert, Truck, ExternalLink, ArrowRight } from 'lucide-react';
import type { Job } from '@/lib/jobs-api';
interface Props {
  job: Job;
}
interface ModuleCard {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  iconColor: string;
  standaloneUrl: string;
  sameTabUrl?: string;
}
export default function JobLaunchTab({
  job
}: Props) {
  const navigate = useNavigate();
  const jq = `?jobId=${job.id}`;
  const jqEncoded = `?jobId=${job.id}&jobName=${encodeURIComponent(job.name)}&jobNumber=${encodeURIComponent(job.jobNumber ?? '')}`;
  const modules: ModuleCard[] = [{
    label: 'Studio',
    description: 'Build documents, contracts, SWMS and reports for this job.',
    icon: FileText,
    color: 'bg-violet-50',
    iconColor: 'text-violet-600',
    standaloneUrl: `/studio/builder/new${jqEncoded}&type=custom-document`,
    sameTabUrl: `/studio/builder/new${jqEncoded}&type=custom-document`
  }, {
    label: 'Forms',
    description: 'Fill in, assign and review forms linked to this job.',
    icon: ClipboardList,
    color: 'bg-blue-50',
    iconColor: 'text-blue-500',
    standaloneUrl: `/forms${jq}`,
    sameTabUrl: `/forms${jq}`
  }, {
    label: 'Estimates',
    description: 'Create or review estimates for this job.',
    icon: Calculator,
    color: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    standaloneUrl: `/estimating${jq}`,
    sameTabUrl: `/estimating${jq}`
  }, {
    label: 'Plan Manager',
    description: 'View, annotate and manage drawings for this job.',
    icon: Layers,
    color: 'bg-violet-50',
    iconColor: 'text-violet-600',
    standaloneUrl: `/plan-manager${jq}`,
    sameTabUrl: `/plan-manager${jq}`
  }, {
    label: 'Files',
    description: 'Browse and upload files attached to this job.',
    icon: FolderOpen,
    color: 'bg-amber-50',
    iconColor: 'text-amber-600',
    standaloneUrl: `/files${jq}`,
    sameTabUrl: `/files${jq}`
  }, {
    label: 'Invoices',
    description: 'Create and send invoices for this job.',
    icon: DollarSign,
    color: 'bg-green-50',
    iconColor: 'text-green-600',
    standaloneUrl: `/invoices${jq}`,
    sameTabUrl: `/invoices${jq}`
  }, {
    label: 'Safety',
    description: 'Manage SWMS, safety plans and incidents for this job.',
    icon: ShieldAlert,
    color: 'bg-red-50',
    iconColor: 'text-red-500',
    standaloneUrl: `/safety${jq}`,
    sameTabUrl: `/safety${jq}`
  }, {
    label: 'Fleet',
    description: 'View fleet assets and equipment assigned to this job.',
    icon: Truck,
    color: 'bg-slate-100',
    iconColor: 'text-slate-600',
    standaloneUrl: `/fleet${jq}`,
    sameTabUrl: `/fleet${jq}`
  }];
  return <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-800">Open a module for this job</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Each module opens with this job linked — you can work in a new tab or stay here.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {modules.map(mod => <ModuleCard key={mod.label} mod={mod} onOpenHere={() => navigate(mod.sameTabUrl ?? mod.standaloneUrl)} />)}
      </div>

      {/* Context note */}
      <p className="mt-6 text-xs text-slate-400 text-center">
        All modules open with <span className="font-semibold text-slate-500">
          {job.jobNumber ? `#${job.jobNumber} — ` : ''}{job.name}
        </span> linked. You can bookmark any standalone page.
      </p>
    </div>;
}
function ModuleCard({
  mod,
  onOpenHere
}: {
  mod: ModuleCard;
  onOpenHere: () => void;
}) {
  const Icon = mod.icon;
  return <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover:border-slate-300 hover:shadow-sm transition-all">
      {/* Icon + label */}
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${mod.color} flex items-center justify-center shrink-0`}>
          <Icon size={17} className={mod.iconColor} />
        </div>
        <span className="text-sm font-bold text-slate-800">{mod.label}</span>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 leading-relaxed flex-1">{mod.description}</p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={onOpenHere} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowRight size={11} />
          Open here
        </button>
        <Link to={mod.standaloneUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-violet-700 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 transition-colors ml-auto">
          <ExternalLink size={11} />
          New tab
        </Link>
      </div>
    </div>;
}
