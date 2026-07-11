import { useRef } from 'react';
import { motion } from 'motion/react';
import { Printer, X } from 'lucide-react';
import { openPrintWindow } from '@/lib/print-html';
import PPEBanner from '@/components/safety-posters/PPEBanner';
import type { SwmsPrintData } from './safety-types';
import { fmtDate } from './safety-types';

/** Parse bullet-separated text into an array of lines. */
function nl2bullets(text: string | null | undefined): string[] | null {
  if (!text?.trim()) return null;
  const lines = text.split('\n').map((l) => l.replace(/^[-\u2022*]\s*/, '').trim()).filter(Boolean);
  return lines.length ? lines : null;
}

/** Render a section with a heading and bullet list. */
function PrintSection({ title, content }: { title: string; content: string | null | undefined }) {
  const bullets = nl2bullets(content);
  if (!bullets) return null;
  return (
    <div className="mb-5">
      <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1 mb-2">{title}</h3>
      <ul className="list-none space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className="text-[11px] text-slate-700 flex gap-2 leading-snug">
            <span className="text-orange-400 shrink-0 mt-0.5 font-bold">&bull;</span>
            <span dangerouslySetInnerHTML={{ __html: b }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  swms: SwmsPrintData;
  onClose: () => void;
}

export default function SwmsPrintModal({ swms, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const safeTitle = swms.title.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
    const html = `<!DOCTYPE html><html><head>
      <title>SWMS \u2014 ${safeTitle}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 16mm 16mm; }
        .print-root { max-width: 100%; }

        /* Header bar — dark with orange badge */
        .header-bar { background: #0f172a; color: #fff; padding: 14px 18px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
        .header-bar .eyebrow { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 4px; }
        .header-bar h1 { font-size: 17px; font-weight: 800; letter-spacing: -0.3px; margin-bottom: 4px; }
        .header-bar .activity { font-size: 10px; color: #cbd5e1; line-height: 1.5; }
        .header-bar .badge { background: #f97316; color: #fff; font-size: 9px; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; margin-left: 16px; flex-shrink: 0; }

        /* Meta grid */
        .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .meta-cell { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; }
        .meta-cell .label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 2px; }
        .meta-cell .value { font-size: 11px; font-weight: 600; color: #1e293b; }

        .divider { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }

        /* Sections — ALL single column */
        .section { margin-bottom: 16px; }
        .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
        ul.bullets { list-style: none; padding: 0; }
        ul.bullets li { display: flex; gap: 7px; margin-bottom: 4px; font-size: 10.5px; color: #334155; line-height: 1.45; }
        ul.bullets li::before { content: "\u2022"; color: #f97316; font-weight: 700; flex-shrink: 0; }

        /* PPE Banner */
        .ppe-wrap { margin-bottom: 16px; border: 2px solid #f97316; border-radius: 6px; overflow: hidden; display: flex; align-items: stretch; }
        .ppe-label { background: #f97316; padding: 8px 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 60px; flex-shrink: 0; }
        .ppe-label .icon { font-size: 18px; }
        .ppe-label .text { font-size: 7px; font-weight: 900; color: #fff; text-align: center; letter-spacing: 0.5px; margin-top: 4px; line-height: 1.3; }
        .ppe-icons { flex: 1; background: #fff; display: flex; align-items: center; justify-content: space-around; padding: 8px 10px; gap: 4px; }
        .ppe-icon-cell { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .ppe-icon-circle { width: 34px; height: 34px; background: #fff9f5; border: 1.5px solid #f97316; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; }
        .ppe-icon-label { font-size: 6px; font-weight: 700; color: #c2410c; text-align: center; line-height: 1.2; white-space: pre-line; }

        /* Sign-on table */
        .sign-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .sign-table th { background: #f8fafc; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 6px 8px; border: 1px solid #e2e8f0; text-align: left; }
        .sign-table td { border: 1px solid #e2e8f0; padding: 0; height: 26px; }

        /* Disclaimer */
        .disclaimer { margin-top: 16px; background: #fef9f0; border: 1px solid #fed7aa; border-radius: 4px; padding: 10px 12px; }
        .disclaimer p { font-size: 9px; color: #92400e; line-height: 1.5; }

        /* Footer */
        .footer { margin-top: 16px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }

        @page { margin: 10mm; size: A4; }
        @media print {
          body { padding: 0; }
          .section { page-break-inside: avoid; }
          .ppe-wrap { page-break-inside: avoid; }
        }
      </style>
    </head><body><div class="print-root">${content.innerHTML}</div></body></html>`;
    openPrintWindow(html, true);
  }

  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const metaCells: [string, string][] = [
    ['Revision', `Rev ${swms.revision_number ?? '1'}`],
    ['Review Date', swms.review_date ? fmtDate(swms.review_date) : '—'],
    ['Print Date', today],
    ...(swms.author_name ? [['Author', swms.author_name] as [string, string]] : []),
    ...(swms.approved_by_name ? [['Approved By', swms.approved_by_name] as [string, string]] : []),
    ...(swms.job_number ? [['Job No.', swms.job_number] as [string, string]] : []),
    ...(swms.job_name ? [['Job', swms.job_name] as [string, string]] : []),
    ...(swms.client_name ? [['Client', swms.client_name] as [string, string]] : []),
    ...(swms.job_site_address ? [['Site Address', swms.job_site_address] as [string, string]] : []),
    ...(swms.supervisor ? [['Supervisor', swms.supervisor] as [string, string]] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-slate-100 rounded-md"><Printer size={15} className="text-slate-600" /></div>
            <div>
              <h2 className="font-heading font-bold text-sm">Print Preview</h2>
              <p className="text-xs text-slate-400">{swms.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
            >
              <Printer size={14} />Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable preview */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div
            ref={printRef}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-3xl mx-auto"
          >
            {/* ── Header bar ── */}
            <div className="bg-slate-900 text-white rounded-lg px-5 py-4 flex justify-between items-start mb-5">
              <div className="flex-1 min-w-0">
                <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Safe Work Method Statement
                </div>
                <h1 className="text-base font-extrabold leading-tight mb-1">{swms.title}</h1>
                {swms.work_activity && (
                  <p className="text-[10px] text-slate-300 leading-relaxed">{swms.work_activity}</p>
                )}
              </div>
              <span className="bg-primary text-white text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-4">
                {(swms.status ?? 'draft').toUpperCase()}
              </span>
            </div>

            {/* ── Meta grid ── */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {metaCells.map(([label, value]) => (
                <div key={label} className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</div>
                  <div className="text-[11px] font-semibold text-slate-800">{value}</div>
                </div>
              ))}
            </div>

            <hr className="border-slate-200 mb-5" />

            {/* ── All sections — single column ── */}
            <PrintSection title="Hazards Identified" content={swms.hazards} />
            <PrintSection title="Risks" content={swms.risks} />
            <PrintSection title="Control Measures / Risk Mitigation" content={swms.controls} />

            <hr className="border-slate-200 my-5" />

            {/* ── PPE Banner — light, orange border ── */}
            <div className="mb-5">
              <PPEBanner />
            </div>

            <PrintSection title="PPE Required" content={swms.ppe} />

            <hr className="border-slate-200 my-5" />

            <PrintSection title="Plant & Equipment" content={swms.plant_equipment} />
            <PrintSection title="Training & Competency" content={swms.training_competency} />
            <PrintSection title="Sign-off Requirements" content={swms.sign_off_requirements} />
            <PrintSection title="Emergency Controls" content={swms.emergency_controls} />
            <PrintSection title="Environmental Controls" content={swms.environmental_controls} />
            {swms.permits_approvals && <PrintSection title="Permits & Approvals" content={swms.permits_approvals} />}
            {swms.monitoring_review && <PrintSection title="Monitoring & Review" content={swms.monitoring_review} />}
            {swms.notes && <PrintSection title="Notes" content={swms.notes} />}

            <hr className="border-slate-200 my-5" />

            {/* ── Worker sign-on register ── */}
            <div className="mb-5">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1.5 mb-3">
                Worker Sign-On Register
              </h3>
              <p className="text-[9px] text-slate-500 mb-3">
                All workers must read and understand this SWMS before commencing work. By signing below, you confirm you have read, understood, and agree to comply with all controls listed in this document.
              </p>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-50">
                    {['#', 'Full Name', 'Company / Trade', 'Date', 'Signature'].map((h) => (
                      <th key={h} className="border border-slate-200 px-2 py-1.5 text-left text-[8px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i}>
                      <td className="border border-slate-200 px-2 py-0 h-7 text-slate-400 text-[9px] w-6">{i + 1}</td>
                      <td className="border border-slate-200 px-2 py-0 h-7 w-40" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-32" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-20" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-36" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Disclaimer ── */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-[9px] text-amber-800 leading-relaxed">
                <strong>Disclaimer:</strong> This Safe Work Method Statement has been prepared to assist in managing workplace health and safety risks associated with the described work activity. It is the responsibility of the principal contractor, site supervisor, and all workers to ensure this document is reviewed, understood, and followed at all times. This document must be reviewed and updated whenever there is a change in work conditions, personnel, equipment, or legislation. Compliance with this SWMS does not guarantee the elimination of all risks &mdash; workers must remain vigilant and report any new hazards immediately to their supervisor.
              </p>
            </div>

            {/* ── Footer ── */}
            <div className="flex justify-between items-center text-[8px] text-slate-400 border-t border-slate-200 pt-3">
              <span>IWILLBUILD Portal &mdash; Safety Management System</span>
              <span>Rev {swms.revision_number ?? '1'} &middot; Printed {today}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
