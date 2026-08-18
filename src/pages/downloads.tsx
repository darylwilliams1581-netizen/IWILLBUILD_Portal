import { Helmet } from '@dr.pogodin/react-helmet';
import { Download, FileText, BookOpen, ExternalLink } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

const downloads = [
  {
    id: 'DL-001',
    name: 'Clean Blocks v96',
    description: 'The latest edition of the IWILLBUILD Clean Blocks cost guide. Use this as the foundation for all estimates.',
    type: 'PDF',
    size: '4.2 MB',
    version: 'v96',
    date: '01 Jun 2026',
    icon: BookOpen,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    id: 'DL-002',
    name: 'Site Induction Template',
    description: 'Standard site induction form template. Print or complete digitally before any new worker starts on site.',
    type: 'PDF',
    size: '1.1 MB',
    version: 'v3',
    date: '15 Mar 2026',
    icon: FileText,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    id: 'DL-003',
    name: 'SWMS Blank Template',
    description: 'Safe Work Method Statement blank template. Complete per task before high-risk construction work begins.',
    type: 'DOCX',
    size: '0.8 MB',
    version: 'v2',
    date: '10 Jan 2026',
    icon: FileText,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
];

export default function DownloadsPage() {
  return (
    <div className="portal-page">
      <Helmet>
        <title>Downloads — IWILLBUILD Portal</title>
        <meta name="description" content="Download Clean Blocks, templates and compliance documents from the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/downloads" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Downloads — IWILLBUILD Portal" />
        <meta property="og:description" content="Download Clean Blocks, templates and compliance documents from the IWILLBUILD portal." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/downloads" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Downloads — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Download Clean Blocks, templates and compliance documents from the IWILLBUILD portal." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden lg-portal">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 shrink-0">
          <Download size={20} className="text-primary mr-3" />
          <h1 className="font-heading font-bold text-lg">Downloads</h1>
          <span className="ml-3 text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
            {downloads.length} files
          </span>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col gap-4 max-w-3xl">
            {downloads.map((file) => {
              const Icon = file.icon;
              return (
                <div
                  key={file.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex items-start gap-4 hover:border-primary/30 hover:shadow-sm transition-all duration-150"
                >
                  <div className={`w-11 h-11 ${file.bg} rounded-xl flex items-center justify-center shrink-0`}>
                    <Icon size={20} className={file.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-slate-900">{file.name}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">{file.type}</span>
                      <span className="text-xs text-slate-400">{file.version}</span>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">{file.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>{file.size}</span>
                      <span>·</span>
                      <span>Updated {file.date}</span>
                    </div>
                  </div>
                  <button className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-violet-700 transition-colors shrink-0 mt-1">
                    <ExternalLink size={13} />
                    Download
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
