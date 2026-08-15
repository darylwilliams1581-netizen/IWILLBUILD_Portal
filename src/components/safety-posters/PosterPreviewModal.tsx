/**
 * PosterPreviewModal
 * Shows a scaled live preview of a generated safety poster with Print/PDF button.
 */
import { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { downloadPosterAsPdf } from '@/lib/poster-pdf';
import {
  PosterRiskMatrix, PosterEmergencyContacts, PosterEmergencyAssembly,
  PosterLifeSavingRules, PosterPPE, PosterLiftSafely, PosterSiteRules,
} from './index';
import type {
  RiskMatrixData, EmergencyContactsData, EmergencyAssemblyData,
  LifeSavingRulesData, PPEData, LiftSafelyData, SiteRulesData,
} from './index';

type PosterType =
  | 'risk_matrix' | 'emergency_contacts' | 'emergency_assembly'
  | 'life_saving_rules' | 'ppe' | 'lift_safely' | 'site_rules';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  posterType: string;
  /** JSON string or parsed object of poster data */
  dataJson: string | Record<string, unknown>;
  /** When true the modal auto-triggers a PDF download once the poster has rendered */
  triggerDownload?: boolean;
}

const POSTER_WIDTH = 794; // A4 at 96 dpi

function renderPoster(type: PosterType, data: Record<string, string>) {
  switch (type) {
    case 'risk_matrix':        return <PosterRiskMatrix data={data as RiskMatrixData} />;
    case 'emergency_contacts': return <PosterEmergencyContacts data={data as EmergencyContactsData} />;
    case 'emergency_assembly': return <PosterEmergencyAssembly data={data as EmergencyAssemblyData} />;
    case 'life_saving_rules':  return <PosterLifeSavingRules data={data as LifeSavingRulesData} />;
    case 'ppe':                return <PosterPPE data={data as PPEData} />;
    case 'lift_safely':        return <PosterLiftSafely data={data as LiftSafelyData} />;
    case 'site_rules':         return <PosterSiteRules data={data as SiteRulesData} />;
    default:                   return <div className="p-8 text-slate-400 text-sm">Preview not available for this poster type.</div>;
  }
}

export default function PosterPreviewModal({ open, onClose, title, posterType, dataJson, triggerDownload }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const autoDownloadFired = useRef(false);

  const data: Record<string, string> = (() => {
    try {
      const parsed = typeof dataJson === 'string' ? JSON.parse(dataJson) : dataJson;
      return (parsed as Record<string, string>) ?? {};
    } catch {
      return {};
    }
  })();

  // Scale poster to fit the modal width
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0 && w < POSTER_WIDTH) {
        setScale(Math.round((w / POSTER_WIDTH) * 1000) / 1000);
      } else {
        setScale(1);
      }
    });
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [open]);

  // Auto-download when triggerDownload=true — fires once after the poster renders
  useEffect(() => {
    if (!open || !triggerDownload || autoDownloadFired.current) return;
    // Give the poster one animation frame to fully paint before capturing
    const id = requestAnimationFrame(() => {
      autoDownloadFired.current = true;
      void handleDownloadPdf();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerDownload]);

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setDownloadingPdf(true);
    try {
      const safeFilename = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      await downloadPosterAsPdf(printRef.current, safeFilename);
    } catch (err) {
      console.error('Poster PDF download failed:', err);
      alert('Failed to generate PDF. Please try Print / PDF instead.');
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center overflow-y-auto pt-6 pb-6 md:pt-[124px] px-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h2 className="font-heading font-bold text-slate-800 text-base leading-tight">{title}</h2>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">{posterType.replace(/_/g, ' ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {downloadingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Download PDF
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-400"
                  aria-label="Close preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Poster preview */}
            <div className="p-4 bg-slate-100 overflow-x-auto">
              {/* Outer wrapper measures available width */}
              <div ref={wrapRef} className="w-full">
                {/* Scale container */}
                <div
                  style={{
                    width: POSTER_WIDTH,
                    transformOrigin: 'top left',
                    transform: `scale(${scale})`,
                    // Shrink the layout height to match the scaled height
                    marginBottom: scale < 1 ? `calc((${scale} - 1) * 100%)` : undefined,
                  }}
                >
                  <div ref={printRef}>
                    {renderPoster(posterType as PosterType, data)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
              <Download size={13} className="text-slate-400 shrink-0" />
              <p className="text-xs text-slate-400">
                Click <strong className="text-slate-600">Download PDF</strong> to save a pixel-perfect copy of this poster.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
