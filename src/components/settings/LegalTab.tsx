/**
 * LegalTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings → Legal & Policies
 *
 * Visible to every logged-in user (no role gate).
 * Each row links to the public legal page in a new tab.
 */

import { ExternalLink, FileText, ShieldCheck, Scale, Cpu } from 'lucide-react';

interface PolicyItem {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
}

const policies: PolicyItem[] = [
  {
    id: 'terms',
    icon: Scale,
    title: 'Terms of Use',
    description:
      'The agreement that governs your use of the IWILLBUILD platform — your rights, responsibilities, and the rules that apply to all users.',
    href: '/terms',
  },
  {
    id: 'fair-use',
    icon: ShieldCheck,
    title: 'Fair Use Policy',
    description:
      'What you may and may not do on the platform, including zero-tolerance rules for harmful content and misuse of the service.',
    href: '/fair-use',
  },
  {
    id: 'privacy',
    icon: FileText,
    title: 'Privacy Policy',
    description:
      'How IWILLBUILD collects, stores, uses and protects your personal information, and your rights under Australian and New Zealand privacy law.',
    href: '/privacy',
  },
  {
    id: 'system-policy',
    icon: Cpu,
    title: 'System Policy',
    description:
      'Technical and operational policies covering data retention, security practices, AI tools, and the Image Safeguard Protocol.',
    href: '/system-policy',
  },
];

export default function LegalTab() {
  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-1">Legal &amp; Policies</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          These documents govern your use of IWILLBUILD. They are publicly accessible and apply to
          all users — company owners, administrators, workers and subcontractors.
        </p>
      </div>

      {/* Policy rows */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {policies.map(({ id, icon: Icon, title, description, href }) => (
          <div key={id} className="flex items-start gap-4 px-5 py-4">
            {/* Icon */}
            <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Icon size={15} className="text-violet-600" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{description}</p>
            </div>

            {/* View button */}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 mt-0.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 hover:border-violet-300 active:scale-[0.97] transition-all duration-150"
            >
              View
              <ExternalLink size={11} />
            </a>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-xs text-slate-400 text-center px-2 leading-relaxed">
        These policies are governed by the laws of Queensland, Australia.
        New Zealand consumer law provisions apply where relevant. v2.0 — 3 Sep 2026.
      </p>
    </div>
  );
}
