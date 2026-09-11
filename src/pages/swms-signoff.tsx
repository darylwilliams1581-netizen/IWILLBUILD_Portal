/**
 * /safety/sign/:token — Public SWMS sign-off page
 * No login required. Workers read the SWMS and add their signature.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, User, Building2, CreditCard, Pen, ChevronDown, ChevronUp, X, Clock, Users, AlertCircle, FileText } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwmsData {
  id: number;
  title: string;
  work_activity: string | null;
  hazards: string | null;
  risks: string | null;
  controls: string | null;
  ppe: string | null;
  plant_equipment: string | null;
  training_competency: string | null;
  emergency_controls: string | null;
  environmental_controls: string | null;
  sign_off_requirements: string | null;
  revision_number: string | null;
  review_date: string | null;
  status: string;
  job_name: string | null;
  job_address: string | null;
  // Studio / company-document fields returned by SELECT js.*
  studio_document_id?: number | null;
  content_snapshot_json?: string | null;
}
interface Signoff {
  id: number;
  worker_name: string;
  company_name: string | null;
  role: string | null;
  white_card_number: string | null;
  signed_at: string;
}
interface CompanyInfo {
  name: string;
  logo_url?: string;
}

// ── Builder block types (read-only renderer) ──────────────────────────────────

interface BuilderBlock {
  type?: string;
  level?: number;
  content?: string;
  text?: string;
  height?: number;
  variant?: string;
  title?: string;
  body?: string;
  columns?: Array<{ id: string; header?: string }>;
  rows?: Array<{ cells?: Record<string, string> }>;
}

/**
 * Resolve content_snapshot_json to an array of BuilderBlocks.
 * Supports two snapshot shapes:
 *   1. Wrapped:  { "builderJson": { "blocks": [...] } }
 *   2. Direct:   { "blocks": [...] }  or  [...]
 * Returns null when the snapshot is absent, malformed, or yields no blocks.
 */
function resolveSnapshotBlocks(snapshotJson: string | null | undefined): BuilderBlock[] | null {
  if (!snapshotJson?.trim()) return null;
  try {
    const parsed = JSON.parse(snapshotJson) as unknown;
    // Wrapped format
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (obj.builderJson !== undefined) {
        const inner = typeof obj.builderJson === 'string'
          ? JSON.parse(obj.builderJson) as unknown
          : obj.builderJson;
        if (Array.isArray(inner)) return inner.length > 0 ? (inner as BuilderBlock[]) : null;
        if (inner && typeof inner === 'object') {
          const blocks = (inner as Record<string, unknown>).blocks;
          if (Array.isArray(blocks)) return blocks.length > 0 ? (blocks as BuilderBlock[]) : null;
        }
        return null;
      }
      // Direct format with blocks key
      if (Array.isArray(obj.blocks)) return obj.blocks.length > 0 ? (obj.blocks as BuilderBlock[]) : null;
    }
    // Direct array
    if (Array.isArray(parsed)) return parsed.length > 0 ? (parsed as BuilderBlock[]) : null;
    return null;
  } catch {
    return null;
  }
}

// ── Read-only block renderer (no dangerouslySetInnerHTML) ─────────────────────

function BlockRenderer({ blocks }: { blocks: BuilderBlock[] }) {
  return (
    <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
      {blocks.map((b, i) => {
        if (!b?.type) return null;

        if (b.type === 'heading') {
          const lvl = Math.min(Math.max(Number(b.level) || 2, 1), 6);
          const text = String(b.content || b.text || '');
          const cls = lvl <= 2
            ? 'font-bold text-base text-slate-900 mt-4 mb-1 border-b border-slate-200 pb-1'
            : lvl === 3
              ? 'font-bold text-sm text-slate-800 mt-3 mb-0.5'
              : 'font-semibold text-sm text-slate-700 mt-2';
          return <p key={i} className={cls}>{text}</p>;
        }

        if (b.type === 'text') {
          return <p key={i} className="text-slate-700">{String(b.content || '')}</p>;
        }

        if (b.type === 'rich_text' || b.type === 'richtext' || b.type === 'html') {
          // Render as plain text — strip any HTML tags for safety on the client.
          // The PDF endpoint handles rich HTML server-side with full sanitisation.
          const raw = String(b.content || b.html || '');
          const plain = raw.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
          return plain ? <p key={i} className="text-slate-700">{plain}</p> : null;
        }

        if (b.type === 'divider') {
          return <hr key={i} className="border-slate-200" />;
        }

        if (b.type === 'spacer') {
          const h = Math.min(Math.max(Number(b.height) || 8, 0), 80);
          return <div key={i} style={{ height: h }} />;
        }

        if (b.type === 'banner') {
          const variantMap: Record<string, string> = {
            warning: 'bg-amber-50 border-amber-300 text-amber-800',
            info:    'bg-blue-50 border-blue-300 text-blue-800',
            success: 'bg-emerald-50 border-emerald-300 text-emerald-800',
            danger:  'bg-red-50 border-red-300 text-red-800',
          };
          const v = /^[a-z]+$/.test(b.variant || '') ? (b.variant || 'info') : 'info';
          const cls = variantMap[v] ?? variantMap.info;
          return (
            <div key={i} className={`border-l-4 px-3 py-2 rounded-r-lg text-sm ${cls}`}>
              {b.title && <strong>{b.title}</strong>}
              {b.body && <span>{b.title ? ' — ' : ''}{b.body}</span>}
            </div>
          );
        }

        if (b.type === 'table' && Array.isArray(b.columns) && Array.isArray(b.rows)) {
          return (
            <div key={i} className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {b.columns.map((c) => (
                      <th key={c.id} className="px-3 py-2 text-left font-semibold">{c.header || c.id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri} className={ri % 2 === 1 ? 'bg-slate-50' : ''}>
                      {b.columns!.map((c) => (
                        <td key={c.id} className="px-3 py-2 border-t border-slate-100">{(r.cells || {})[c.id] || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ── Signature Pad ─────────────────────────────────────────────────────────────

function SignaturePad({
  onSave,
  onClear
}: {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }
  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    const ctx = canvas.getContext('2d')!;
    const {
      x,
      y
    } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    const {
      x,
      y
    } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  }
  function endDraw() {
    drawing.current = false;
    if (hasStrokes && canvasRef.current) {
      onSave(canvasRef.current.toDataURL('image/png'));
    }
  }
  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onClear();
  }
  return <div className="space-y-2">
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-hidden">
        <canvas ref={canvasRef} width={600} height={160} className="w-full touch-none cursor-crosshair" onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
        {!hasStrokes && <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-slate-400">
              <Pen size={16} />
              <span className="text-sm">Sign here</span>
            </div>
          </div>}
      </div>
      {hasStrokes && <button type="button" onClick={clear} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors">
          <X size={12} /> Clear signature
        </button>}
    </div>;
}

// ── Section accordion (legacy SWMS) ──────────────────────────────────────────

function Section({
  title,
  content,
  defaultOpen = false
}: {
  title: string;
  content: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content?.trim()) return null;
  return <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
        <span className="text-sm font-bold text-slate-700">{title}</span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      <AnimatePresence initial={false}>
        {open && <motion.div initial={{
        height: 0,
        opacity: 0
      }} animate={{
        height: 'auto',
        opacity: 1
      }} exit={{
        height: 0,
        opacity: 0
      }} transition={{
        duration: 0.2
      }} className="overflow-hidden">
            <div className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {content}
            </div>
          </motion.div>}
      </AnimatePresence>
    </div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SwmsSignoffPage() {
  const {
    token
  } = useParams<{
    token: string;
  }>();
  const [swms, setSwms] = useState<SwmsData | null>(null);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [workerName, setWorkerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [whiteCardNumber, setWhiteCardNumber] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [hasRead, setHasRead] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/swms/${token}`).then(r => r.json()).then((data: {
      swms?: SwmsData;
      signoffs?: Signoff[];
      company?: CompanyInfo;
      error?: string;
    }) => {
      if (data.error) {
        setError(data.error);
        return;
      }
      setSwms(data.swms ?? null);
      setSignoffs(data.signoffs ?? []);
      setCompany(data.company ?? null);
    }).catch(() => setError('Failed to load document')).finally(() => setLoading(false));
  }, [token]);
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) {
      setSubmitError('Your name is required');
      return;
    }
    if (!hasRead) {
      setSubmitError('Please confirm you have read and understood the safety document');
      return;
    }
    if (!signatureData) {
      setSubmitError('Please provide your signature');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/public/swms/${token}/signoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workerName: workerName.trim(),
          companyName: companyName.trim() || undefined,
          role: role.trim() || undefined,
          whiteCardNumber: whiteCardNumber.trim() || undefined,
          signatureData
        })
      });
      const data = (await res.json()) as {
        signoff?: Signoff;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit');
      if (data.signoff) setSignoffs(prev => [...prev, data.signoff!]);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit sign-off');
    } finally {
      setSubmitting(false);
    }
  }, [token, workerName, companyName, role, whiteCardNumber, signatureData, hasRead]);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-emerald-500" />
      </div>;
  }
  if (error) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Link Unavailable</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>;
  }
  if (!swms) return null;

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // ── Determine document type ───────────────────────────────────────────────
  // A Studio/company document has studio_document_id set.
  // For Studio docs we resolve the immutable snapshot blocks.
  // If studio_document_id is set but the snapshot is absent or malformed,
  // we block signing and show a clear error — workers must not sign unseen content.
  const isStudioDoc = !!swms.studio_document_id;
  const snapshotBlocks = isStudioDoc ? resolveSnapshotBlocks(swms.content_snapshot_json) : null;
  const snapshotMalformed = isStudioDoc && snapshotBlocks === null;

  return <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>{swms.title} — Safety Document Sign-off</title>
        <meta name="description" content={`Sign off on the safety document: ${swms.title}`} />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`https://iwillbuild.com/safety/sign/${token ?? ''}`} />
      </Helmet>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 safe-top">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
              {isStudioDoc ? 'Safety Document Sign-off' : 'SWMS Sign-off'}
            </p>
            <p className="text-sm font-bold text-slate-800 truncate">{swms.title}</p>
          </div>
          {company?.name && <p className="ml-auto text-xs text-slate-400 shrink-0 hidden sm:block">{company.name}</p>}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Job info */}
        {(swms.job_name || swms.job_address) && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 text-sm text-emerald-800">
            {swms.job_name && <span className="font-semibold">{swms.job_name}</span>}
            {swms.job_address && <span className="text-emerald-600">{swms.job_address}</span>}
            {swms.revision_number && <span className="ml-auto text-xs text-emerald-500">Rev {swms.revision_number}</span>}
          </div>}

        {/* ── Studio / company document content ─────────────────────────── */}
        {isStudioDoc && (
          snapshotMalformed ? (
            /* Malformed snapshot — block signing, show clear error */
            <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-5 flex flex-col items-center gap-3 text-center">
              <AlertTriangle size={28} className="text-red-500" />
              <div>
                <p className="font-bold text-red-800 text-sm mb-1">Document Unavailable</p>
                <p className="text-xs text-red-700 leading-relaxed">
                  The attached document content could not be loaded. You cannot sign this document until the content is available.
                  Please contact the company that issued this link.
                </p>
              </div>
            </div>
          ) : (
            /* Valid snapshot — render immutable content before sign-off controls */
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <FileText size={14} className="text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">Document Content</h2>
                <span className="ml-auto text-[10px] text-slate-400 font-medium uppercase tracking-wide">Read-only · Locked revision</span>
              </div>
              <div className="px-4 py-4">
                <BlockRenderer blocks={snapshotBlocks!} />
              </div>
            </div>
          )
        )}

        {/* ── Legacy SWMS content sections (unchanged) ──────────────────── */}
        {!isStudioDoc && (
          <div className="space-y-2">
            <Section title="Work Activity" content={swms.work_activity} defaultOpen />
            <Section title="Hazards Identified" content={swms.hazards} defaultOpen />
            <Section title="Risk Assessment" content={swms.risks} />
            <Section title="Control Measures" content={swms.controls} defaultOpen />
            <Section title="PPE Required" content={swms.ppe} defaultOpen />
            <Section title="Plant & Equipment" content={swms.plant_equipment} />
            <Section title="Training & Competency" content={swms.training_competency} />
            <Section title="Emergency Controls" content={swms.emergency_controls} />
            <Section title="Environmental Controls" content={swms.environmental_controls} />
            {swms.sign_off_requirements && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Sign-off Requirements</p>
                <p className="text-sm text-amber-800 whitespace-pre-wrap">{swms.sign_off_requirements}</p>
              </div>}
          </div>
        )}

        {/* Existing signoffs */}
        {signoffs.length > 0 && <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <Users size={14} className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-700">Signed by {signoffs.length} worker{signoffs.length !== 1 ? 's' : ''}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {signoffs.map(s => <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{s.worker_name}</p>
                    <p className="text-xs text-slate-400">
                      {[s.role, s.company_name, s.white_card_number ? `WC: ${s.white_card_number}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                    <Clock size={10} />
                    {fmtDate(s.signed_at)}
                  </div>
                </div>)}
            </div>
          </div>}

        {/* Sign-off form — hidden when snapshot is malformed */}
        {!snapshotMalformed && (
          submitted ? <motion.div initial={{
          opacity: 0,
          scale: 0.95
        }} animate={{
          opacity: 1,
          scale: 1
        }} className="bg-white border border-emerald-200 rounded-2xl p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Sign-off Recorded</h2>
              <p className="text-sm text-slate-500">
                Thank you, <strong>{workerName}</strong>. Your sign-off has been recorded.
              </p>
              <p className="text-xs text-slate-400">You can now close this page.</p>
            </motion.div> : <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <Pen size={14} className="text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">Add Your Sign-off</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {submitError && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle size={14} />{submitError}
                  </div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Full Name *</label>
                    <div className="relative">
                      <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" value={workerName} onChange={e => setWorkerName(e.target.value)} placeholder="Your full name" required className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Company</label>
                    <div className="relative">
                      <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company" className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Role / Trade</label>
                    <input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Electrician, Labourer" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">White Card #</label>
                    <div className="relative">
                      <CreditCard size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" value={whiteCardNumber} onChange={e => setWhiteCardNumber(e.target.value)} placeholder="Construction induction card" className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                  </div>
                </div>

                {/* Signature */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Signature *</label>
                  <SignaturePad onSave={setSignatureData} onClear={() => setSignatureData('')} />
                </div>

                {/* Acknowledgement — generic wording for Studio docs, SWMS-specific for legacy */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div onClick={() => setHasRead(r => !r)} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${hasRead ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 group-hover:border-emerald-400'}`}>
                    {hasRead && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                  <span className="text-sm text-slate-600 leading-snug">
                    {isStudioDoc
                      ? 'I confirm that I have read, understood, and will comply with this safety document.'
                      : 'I confirm that I have read, understood, and will comply with this Safe Work Method Statement. I understand the hazards, risks, and control measures described above.'}
                  </span>
                </label>

                <button type="submit" disabled={submitting || !workerName.trim() || !hasRead || !signatureData} className="w-full py-3 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  {submitting ? 'Submitting…' : 'Submit Sign-off'}
                </button>
              </form>
            </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pb-4">
          Powered by IWIllBUIlD · This document is legally binding
        </p>
      </div>
    </div>;
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, User, Building2, CreditCard, Pen, ChevronDown, ChevronUp, X, Clock, Users, AlertCircle } from 'lucide-react';



