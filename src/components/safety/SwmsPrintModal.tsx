import { useRef } from 'react';
import { motion } from 'motion/react';
import { Printer, X } from 'lucide-react';
import { openPrintWindow } from '@/lib/print-html';
import PPEBanner from '@/components/safety-posters/PPEBanner';
import type { SwmsPrintData } from './safety-types';
import { fmtDate } from './safety-types';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Strip leading bullet chars and split into lines. */
function toLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
}

/**
 * Apply inline rich-text markers to a line:
 *   **bold**  →  <strong>bold</strong>
 *   __underline__  →  <u>underline</u>
 */
function richText(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

// ─── PPE icon data (mirrors PPEBanner.tsx) ───────────────────────────────────
const PPE_ITEMS = [
  { icon: '🪖', label: 'SAFETY\nHELMET' },
  { icon: '👟', label: 'SAFETY\nFOOTWEAR' },
  { icon: '🥽', label: 'EYE\nPROTECTION' },
  { icon: '🧤', label: 'GLOVES' },
  { icon: '🎧', label: 'HEARING\nPROTECTION' },
  { icon: '🦺', label: 'HI-VIS\nCLOTHING' },
  { icon: '😷', label: 'RESPIRATORY\nPROTECTION' },
  { icon: '🪢', label: 'FALL ARREST\nHARNESS' },
  { icon: '⚡', label: 'ELEC.\nGLOVES' },
];

// ─── print HTML builder ──────────────────────────────────────────────────────

function buildSection(title: string, text: string | null | undefined): string {
  const lines = toLines(text);
  if (!lines.length) return '';
  const items = lines.map((l) => `<li>${richText(esc(l))}</li>`).join('');
  return `
    <div class="section">
      <div class="section-title">${esc(title)}</div>
      <ul class="bullets">${items}</ul>
    </div>`;
}

function buildPpeBannerHtml(): string {
  const icons = PPE_ITEMS.map((p) => `
    <div class="ppe-icon-cell">
      <div class="ppe-icon-circle">${p.icon}</div>
      <div class="ppe-icon-label">${p.label.replace('\n', '<br/>')}</div>
    </div>`).join('');
  return `
    <div class="ppe-wrap">
      <div class="ppe-label">
        <div class="ppe-label-icon">🦺</div>
        <div class="ppe-label-text">PPE<br/>REQUIRED</div>
      </div>
      <div class="ppe-icons">${icons}</div>
    </div>`;
}

function buildSignOnTable(rows = 12): string {
  const headers = ['#', 'Full Name', 'Company / Trade', 'Date', 'Signature'];
  const ths = headers.map((h) => `<th>${h}</th>`).join('');
  const tds = Array.from({ length: rows }, (_, i) => `
    <tr>
      <td class="row-num">${i + 1}</td>
      <td></td><td></td><td></td><td></td>
    </tr>`).join('');
  return `
    <table class="sign-table">
      <thead><tr>${ths}</tr></thead>
      <tbody>${tds}</tbody>
    </table>`;
}

function buildPrintHtml(swms: SwmsPrintData, today: string): string {
  const safeTitle = esc(swms.title);
  const status = (swms.status ?? 'draft').toUpperCase();
  const revNum = swms.revision_number ?? '1';

  // Meta cells
  const metaCells: [string, string][] = [
    ['Revision', `Rev ${revNum}`],
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
  const metaHtml = metaCells.map(([l, v]) => `
    <div class="meta-cell">
      <div class="meta-label">${esc(l)}</div>
      <div class="meta-value">${esc(v)}</div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>SWMS — ${safeTitle}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #1e293b;
      background: #fff;
      padding: 14mm 16mm;
    }

    /* ── Header bar — printer-friendly: 3pt top rule + dark text on white ── */
    .header-bar {
      border-top: 3px solid #7c3aed;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 0 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .header-left { flex: 1; min-width: 0; }
    .header-eyebrow {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #64748b;
      margin-bottom: 5px;
    }
    .header-title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.3px;
      line-height: 1.2;
      margin-bottom: 5px;
      color: #0f172a;
    }
    .header-activity {
      font-size: 9.5px;
      color: #475569;
      line-height: 1.5;
    }
    /* Status badge — outline only, no filled background */
    .header-badge {
      color: #7c3aed;
      border: 1.5px solid #7c3aed;
      font-size: 8.5px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
      align-self: flex-start;
      background: transparent;
    }

    /* ── Meta grid ── */
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-bottom: 14px;
    }
    .meta-cell {
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 6px 9px;
    }
    .meta-label {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #94a3b8;
      margin-bottom: 2px;
    }
    .meta-value {
      font-size: 10.5px;
      font-weight: 600;
      color: #1e293b;
    }

    hr { border: none; border-top: 1px solid #e2e8f0; margin: 13px 0; }

    /* ── Content sections — ALL single column ── */
    .section { margin-bottom: 14px; }
    .section-title {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 7px;
    }
    ul.bullets { list-style: none; padding: 0; }
    ul.bullets li {
      display: flex;
      gap: 7px;
      margin-bottom: 3.5px;
      font-size: 10.5px;
      color: #334155;
      line-height: 1.45;
    }
    ul.bullets li::before {
      content: "•";
      color: #7c3aed;
      font-weight: 700;
      flex-shrink: 0;
    }
    /* Rich text inside bullets */
    ul.bullets li strong { font-weight: 700; }
    ul.bullets li u { text-decoration: underline; }

    /* ── PPE Banner — outline only, no filled purple label ── */
    .ppe-wrap {
      border: 1.5px solid #7c3aed;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      align-items: stretch;
      margin-bottom: 14px;
    }
    .ppe-label {
      background: transparent;
      border-right: 1.5px solid #7c3aed;
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 58px;
      flex-shrink: 0;
    }
    .ppe-label-icon { font-size: 17px; }
    .ppe-label-text {
      font-size: 6.5px;
      font-weight: 900;
      color: #7c3aed;
      text-align: center;
      letter-spacing: 0.5px;
      margin-top: 4px;
      line-height: 1.3;
    }
    .ppe-icons {
      flex: 1;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: space-around;
      padding: 7px 8px;
      gap: 3px;
    }
    .ppe-icon-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }
    .ppe-icon-circle {
      width: 32px;
      height: 32px;
      background: #fff9f5;
      border: 1.5px solid #7c3aed;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      /* flex centering fallback for print */
      text-align: center;
      line-height: 32px;
    }
    .ppe-icon-label {
      font-size: 5.5px;
      font-weight: 700;
      color: #c2410c;
      text-align: center;
      line-height: 1.2;
    }

    /* ── Sign-on table ── */
    .sign-section-title {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 7px;
    }
    .sign-intro {
      font-size: 8.5px;
      color: #64748b;
      line-height: 1.5;
      margin-bottom: 8px;
    }
    .sign-table {
      width: 100%;
      border-collapse: collapse;
    }
    .sign-table th {
      background: #f8fafc;
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      padding: 5px 7px;
      border: 1px solid #e2e8f0;
      text-align: left;
    }
    .sign-table td {
      border: 1px solid #e2e8f0;
      padding: 0;
      height: 24px;
    }
    .sign-table td.row-num {
      padding: 0 6px;
      font-size: 8px;
      color: #94a3b8;
      width: 20px;
    }

    /* ── Disclaimer ── */
    .disclaimer {
      margin-top: 14px;
      background: #fef9f0;
      border: 1px solid #fed7aa;
      border-radius: 4px;
      padding: 9px 11px;
    }
    .disclaimer p {
      font-size: 8.5px;
      color: #92400e;
      line-height: 1.55;
    }

    /* ── Footer ── */
    .doc-footer {
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 7px;
    }

    /* ── Print rules ── */
    @page { margin: 10mm; size: A4 portrait; }
    @media print {
      body { padding: 0; }
      .section { page-break-inside: avoid; }
      .ppe-wrap { page-break-inside: avoid; }
      .sign-table tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header-bar">
    <div class="header-left">
      <div class="header-eyebrow">Safe Work Method Statement</div>
      <div class="header-title">${safeTitle}</div>
      ${swms.work_activity ? `<div class="header-activity">${esc(swms.work_activity)}</div>` : ''}
    </div>
    <div class="header-badge">${status}</div>
  </div>

  <!-- Meta grid -->
  <div class="meta-grid">${metaHtml}</div>

  <hr/>

  <!-- Hazard & Risk sections — single column -->
  ${buildSection('Hazards Identified', swms.hazards)}
  ${buildSection('Risks', swms.risks)}
  ${buildSection('Control Measures / Risk Mitigation', swms.controls)}

  <hr/>

  <!-- PPE Banner -->
  ${buildPpeBannerHtml()}

  ${buildSection('PPE Required', swms.ppe)}

  <hr/>

  ${buildSection('Plant & Equipment', swms.plant_equipment)}
  ${buildSection('Training & Competency', swms.training_competency)}
  ${buildSection('Sign-off Requirements', swms.sign_off_requirements)}
  ${buildSection('Emergency Controls', swms.emergency_controls)}
  ${buildSection('Environmental Controls', swms.environmental_controls)}
  ${swms.permits_approvals ? buildSection('Permits & Approvals', swms.permits_approvals) : ''}
  ${swms.monitoring_review ? buildSection('Monitoring & Review', swms.monitoring_review) : ''}
  ${swms.notes ? buildSection('Notes', swms.notes) : ''}

  <hr/>

  <!-- Worker sign-on register -->
  <div class="section">
    <div class="sign-section-title">Worker Sign-On Register</div>
    <p class="sign-intro">All workers must read and understand this SWMS before commencing work. By signing below, you confirm you have read, understood, and agree to comply with all controls listed in this document.</p>
    ${buildSignOnTable(12)}
  </div>

  <!-- Disclaimer -->
  <div class="disclaimer">
    <p><strong>Disclaimer:</strong> This Safe Work Method Statement has been prepared to assist in managing workplace health and safety risks associated with the described work activity. It is the responsibility of the principal contractor, site supervisor, and all workers to ensure this document is reviewed, understood, and followed at all times. This document must be reviewed and updated whenever there is a change in work conditions, personnel, equipment, or legislation. Compliance with this SWMS does not guarantee the elimination of all risks — workers must remain vigilant and report any new hazards immediately to their supervisor.</p>
  </div>

  <!-- Footer -->
  <div class="doc-footer">
    <span>Safety Management System</span>
    <span>Rev ${revNum} · Printed ${today}</span>
  </div>

</body>
</html>`;
}

// ─── preview section (React / Tailwind) ─────────────────────────────────────

function PreviewSection({ title, content }: { title: string; content: string | null | undefined }) {
  const lines = toLines(content);
  if (!lines.length) return null;
  return (
    <div className="mb-5">
      <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1.5 mb-2.5">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2 text-[11px] text-slate-700 leading-snug">
            <span className="text-violet-400 font-bold shrink-0 mt-0.5">•</span>
            <span dangerouslySetInnerHTML={{ __html: richText(esc(line)) }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

interface Props {
  swms: SwmsPrintData;
  onClose: () => void;
}

export default function SwmsPrintModal({ swms, onClose }: Props) {
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  function handlePrint() {
    openPrintWindow(buildPrintHtml(swms, today), true);
  }

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
        {/* ── Modal toolbar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-slate-100 rounded-md">
              <Printer size={15} className="text-slate-600" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-sm">Print Preview</h2>
              <p className="text-xs text-slate-400">{swms.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
            >
              <Printer size={14} />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Scrollable preview ── */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-3xl mx-auto">

            {/* Header bar */}
            <div className="bg-slate-900 text-white rounded-lg px-5 py-4 flex justify-between items-start gap-3 mb-5">
              <div className="flex-1 min-w-0">
                <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Safe Work Method Statement
                </div>
                <h1 className="text-base font-extrabold leading-tight mb-1">{swms.title}</h1>
                {swms.work_activity && (
                  <p className="text-[10px] text-slate-300 leading-relaxed">{swms.work_activity}</p>
                )}
              </div>
              <span className="bg-primary text-white text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0">
                {(swms.status ?? 'draft').toUpperCase()}
              </span>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {metaCells.map(([label, value]) => (
                <div key={label} className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</div>
                  <div className="text-[11px] font-semibold text-slate-800">{value}</div>
                </div>
              ))}
            </div>

            <hr className="border-slate-200 mb-5" />

            {/* Hazard & Risk — single column */}
            <PreviewSection title="Hazards Identified" content={swms.hazards} />
            <PreviewSection title="Risks" content={swms.risks} />
            <PreviewSection title="Control Measures / Risk Mitigation" content={swms.controls} />

            <hr className="border-slate-200 my-5" />

            {/* PPE Banner — white bg, orange border */}
            <div className="mb-5">
              <PPEBanner />
            </div>

            <PreviewSection title="PPE Required" content={swms.ppe} />

            <hr className="border-slate-200 my-5" />

            <PreviewSection title="Plant & Equipment" content={swms.plant_equipment} />
            <PreviewSection title="Training & Competency" content={swms.training_competency} />
            <PreviewSection title="Sign-off Requirements" content={swms.sign_off_requirements} />
            <PreviewSection title="Emergency Controls" content={swms.emergency_controls} />
            <PreviewSection title="Environmental Controls" content={swms.environmental_controls} />
            {swms.permits_approvals && <PreviewSection title="Permits & Approvals" content={swms.permits_approvals} />}
            {swms.monitoring_review && <PreviewSection title="Monitoring & Review" content={swms.monitoring_review} />}
            {swms.notes && <PreviewSection title="Notes" content={swms.notes} />}

            <hr className="border-slate-200 my-5" />

            {/* Worker sign-on register */}
            <div className="mb-5">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1.5 mb-3">
                Worker Sign-On Register
              </h3>
              <p className="text-[9px] text-slate-500 mb-3 leading-relaxed">
                All workers must read and understand this SWMS before commencing work. By signing below, you confirm you have read, understood, and agree to comply with all controls listed in this document.
              </p>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-50">
                    {['#', 'Full Name', 'Company / Trade', 'Date', 'Signature'].map((h) => (
                      <th key={h} className="border border-slate-200 px-2 py-1.5 text-left text-[8px] font-bold uppercase tracking-wide text-slate-500">
                        {h}
                      </th>
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

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-[9px] text-amber-800 leading-relaxed">
                <strong>Disclaimer:</strong> This Safe Work Method Statement has been prepared to assist in managing workplace health and safety risks associated with the described work activity. It is the responsibility of the principal contractor, site supervisor, and all workers to ensure this document is reviewed, understood, and followed at all times. This document must be reviewed and updated whenever there is a change in work conditions, personnel, equipment, or legislation. Compliance with this SWMS does not guarantee the elimination of all risks — workers must remain vigilant and report any new hazards immediately to their supervisor.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center text-[8px] text-slate-400 border-t border-slate-200 pt-3">
              <span>Safety Management System</span>
              <span>Rev {swms.revision_number ?? '1'} · Printed {today}</span>
            </div>

          </div>
        </div>
      </motion.div>
    </div>
  );
}
