import { Helmet } from '@dr.pogodin/react-helmet';
import { FileText, Clock, CheckCircle2, Layers } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

const planned = [
  'Reusable form templates with conditional logic',
  'Media upload and signature capture on mobile',
  'Completed form PDF output',
  'Link forms to jobs and fleet assets',
  'SWMS, JSA, site induction and prestart templates',
  'Form completion tracking per job',
];

export default function FormsPage() {
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Forms — IWILLBUILD Portal</title>
        <meta name="description" content="Build and complete safety and compliance forms linked to jobs in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/forms" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <PortalSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 shrink-0">
          <FileText size={20} className="text-primary mr-3" />
          <h1 className="font-heading font-bold text-lg">Forms</h1>
          <span className="ml-3 text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
            <Clock size={10} /> Coming Soon
          </span>
        </header>
        <div className="flex-1 overflow-auto flex items-center justify-center p-6">
          <div className="max-w-lg w-full text-center">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FileText size={28} className="text-white" />
            </div>
            <h2 className="font-heading font-black text-2xl text-slate-800 mb-3">Form Builder</h2>
            <p className="text-slate-500 mb-8 leading-relaxed">
              Build reusable safety and compliance forms, capture signatures on mobile, attach media and generate completed PDFs linked to your jobs.
            </p>
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-left mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Layers size={14} className="text-primary" />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Planned Features</span>
              </div>
              <ul className="flex flex-col gap-2.5">
                {planned.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 size={14} className="text-slate-300 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <span className="inline-block text-xs bg-amber-50 text-amber-700 font-bold px-4 py-2 rounded-full border border-amber-200">
              Releasing in a future update
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
