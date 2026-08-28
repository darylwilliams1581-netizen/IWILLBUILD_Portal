/**
 * Smart Document Builder — Main Orchestrator (Structure-First Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * Build Mode: edit structure, preview, publish template, download draft
 * Use Mode:   fill form fields, submit, download completed PDF, save to job
 *
 * Underlying block engine is unchanged — PDF export, logic, fields all work.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Save, Undo2, Redo2, Eye, Loader2, CheckCircle,
  AlertCircle, FileText, Layers,
  ChevronDown, Printer, Download, Upload,
  Table2, FormInput, Cpu,
  Hash, Type, List, Minus, AlignLeft,
  LayoutGrid, PenLine, Zap, Camera,
  CheckSquare, Calendar, MapPin, User,
  Building2, ClipboardList,
  Info, AlertTriangle, AlertOctagon, Shield, ShieldAlert, ShieldCheck,
  Image, BarChart2,
  ZoomIn, ZoomOut, Monitor, RotateCcw,
  Wrench, Briefcase, AlignCenter, AlignRight, PlayCircle,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useDocumentStore } from './useDocumentStore';
import StructurePanel from './StructurePanel';
import DocSidebar from './DocSidebar';
import DocxImporter from './DocxImporter';
import BlocksJsonImporter from './BlocksJsonImporter';
import DocumentPdfTab from './DocumentPdfTab';
import { usePermissions } from '@/lib/usePermissions';
import type { DocumentTemplate, DocumentBlock, BuilderTab, TemplatePdfSettings, BannerVariant, PaperSize, Orientation, MarginPreset } from './types';
import { DEFAULT_TEMPLATE_PDF_SETTINGS } from './types';
import HtmlDocumentCanvas from './HtmlDocumentCanvas';
import JobPhotoPicker from './JobPhotoPicker';

interface Props {
  template?: DocumentTemplate | null;
  onClose: () => void;
  onSaved?: (id: number) => void;
  /** Open directly in 'build' (default) or 'use' mode */
  initialMode?: 'build' | 'use';
}

/** Top-level mode: building the template vs using/filling it */
type AppMode = 'build' | 'use';

// Document type labels for the toolbar badge
const DOC_TYPE_LABELS: Record<string, string> = {
  swms:       'SWMS',
  procedure:  'Procedure',
  policy:     'Policy',
  form:       'Form',
  inspection: 'Inspection',
  checklist:  'Checklist',
  report:     'Report',
  toolbox:    'Toolbox Talk',
  prestart:   'Pre-Start',
  handover:   'Handover',
};

export default function DocumentBuilder({ template, onClose, onSaved, initialMode = 'build' }: Props) {
  const {
    isDirty, isSaving, setIsSaving, markSaved,
    loadTemplate, resetToBlank, getSerialised, templateId, templateName, templateType,
    undo, redo, canUndo, canRedo, reorderBlocks, prependBlocks, appendBlocks, blocks,
    pageLayout, mode, setMode,
    // Doc Studio is always kind=doc — form fields kept in store for DB compat only
    requiresAcknowledgement, acknowledgementLabel, acknowledgementText,
    setKindSettings,
  } = useDocumentStore();

  const [showDocxImporter, setShowDocxImporter]     = useState(false);
  const [showBlocksImporter, setShowBlocksImporter] = useState(false);
  const [saveStatus, setSaveStatus]                 = useState<'idle' | 'saved' | 'error'>('idle');
  const [docStatus, setDocStatus]                   = useState<'draft' | 'published' | 'archived'>(
    (template?.docStatus as 'draft' | 'published' | 'archived') ?? 'draft'
  );
  const [saveErrorMsg, setSaveErrorMsg]             = useState<string>('');
  const [activeTab, setActiveTab]                   = useState<BuilderTab>('document_tools');
  const [pdfSettings, setPdfSettings]               = useState<TemplatePdfSettings>(
    template?.pdfSettings ?? { ...DEFAULT_TEMPLATE_PDF_SETTINGS }
  );
  const [showDocTypeMenu, setShowDocTypeMenu]       = useState(false);
  const [zoomLevel, setZoomLevel]                   = useState(100); // percent
  /** Mobile: show the tools bottom sheet */
  const [showMobileTools, setShowMobileTools]       = useState(false);

  // ── HTML canvas state (source_type = 'html') ──────────────────────────────
  const isHtmlDoc = template?.sourceType === 'html';
  const [liveHtmlContent, setLiveHtmlContent] = useState<string>(template?.htmlContent ?? '');
  // Sync if a new template is loaded
  useEffect(() => {
    setLiveHtmlContent(template?.htmlContent ?? '');
  }, [template?.id, template?.htmlContent]);

  /** Top-level app mode: build the template or use/fill it */
  const [appMode] = useState<AppMode>(initialMode);
  /** Build sub-mode: 'edit' (canvas) or 'preview' (rendered) */
  const [buildSubMode, setBuildSubMode] = useState<'edit' | 'preview'>('edit');

  // Sync store mode with UI state
  // Doc Studio is always read-only in Use Mode — no fill/form mode here
  useEffect(() => {
    if (appMode === 'use') {
      setMode('preview');
    } else {
      setMode(buildSubMode);
    }
  }, [appMode, buildSubMode, setMode]);

  // Auto-adjust zoom when orientation changes so the page fits comfortably
  useEffect(() => {
    setZoomLevel(pageLayout.orientation === 'landscape' ? 75 : 100);
  }, [pageLayout.orientation]);
  const { isPlatformOwner } = usePermissions();

  /** Convenience: append a single block to the document */
  const appendBlock = useCallback((block: DocumentBlock) => {
    appendBlocks([block]);
  }, [appendBlocks]);

  /** Insert a system field token as an inline rich_text block */
  const appendSysToken = useCallback((key: string, label: string) => {
    appendBlocks([{
      id: nanoid(10),
      type: 'rich_text',
      html: `<p><span class="sys-field-token" data-sys-field="${key}" contenteditable="false">⚙ ${label}</span></p>`,
    }]);
  }, [appendBlocks]);

  // Load template on mount
  useEffect(() => {
    if (template) {
      loadTemplate(template);
      setPdfSettings({ ...DEFAULT_TEMPLATE_PDF_SETTINGS, ...(template.pdfSettings ?? {}) });
    } else {
      resetToBlank();
      setPdfSettings({ ...DEFAULT_TEMPLATE_PDF_SETTINGS });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void handleSave(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const payload = { ...getSerialised(), pdfSettings, docStatus };
      let res: Response;
      if (templateId) {
        res = await fetch(`/api/document-templates/${templateId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/document-templates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(payload),
        });
      }
      const data = await res.json() as { id?: number; ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const savedId = data.id ?? templateId!;
      markSaved(savedId);
      setSaveStatus('saved');
      setSaveErrorMsg('');
      onSaved?.(savedId);
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveErrorMsg(msg);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, templateId, getSerialised, markSaved, onSaved, pdfSettings]);

  const handleDocxImported = (
    importedBlocks: DocumentBlock[],
    _docxName: string,
    insertMode: 'replace' | 'prepend' | 'append',
  ) => {
    if (insertMode === 'prepend') prependBlocks(importedBlocks);
    else if (insertMode === 'append') appendBlocks(importedBlocks);
    else reorderBlocks(importedBlocks);
  };

  const handleSaveFirst = useCallback(async (): Promise<number | null> => {
    const liveId = useDocumentStore.getState().templateId;
    if (liveId) return liveId;
    if (useDocumentStore.getState().isSaving) {
      const start = Date.now();
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!useDocumentStore.getState().isSaving || Date.now() - start > 8000) {
            clearInterval(check); resolve();
          }
        }, 100);
      });
      const currentId = useDocumentStore.getState().templateId;
      if (currentId) return currentId;
    }
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const payload = { ...getSerialised(), pdfSettings, docStatus };
      const res = await fetch('/api/document-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      });
      const data = await res.json() as { id?: number; ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const savedId = data.id!;
      markSaved(savedId);
      setSaveStatus('saved');
      setSaveErrorMsg('');
      onSaved?.(savedId);
      setTimeout(() => setSaveStatus('idle'), 2500);
      return savedId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSaveErrorMsg(msg);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [getSerialised, markSaved, onSaved, pdfSettings]);

  // ── Print: @media print CSS in globals.css handles isolation.
  //    .studio-doc-page becomes the only visible element; all .studio-no-print
  //    controls are hidden. Just call window.print() here.
  const handlePrint = useCallback(() => {
    // Inject a dynamic @page rule to honour the document's orientation setting
    const orientation = pageLayout.orientation ?? 'portrait';
    const styleId = '__studio_print_orientation__';
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = `@page { size: A4 ${orientation}; margin: 0; }`;
    window.print();
  }, [pageLayout.orientation]);

  const docTypeLabel = DOC_TYPE_LABELS[templateType ?? ''] ?? 'Document';

  /**
   * Render the correct canvas for this document type.
   * HTML-canvas documents (source_type='html') use HtmlDocumentCanvas.
   * Block-canvas documents use the existing StructurePanel / BlockCanvas.
   */
  const renderCanvas = (canvasMode: 'build' | 'preview' | 'use') => {
    if (isHtmlDoc && template?.id) {
      return (
        <HtmlDocumentCanvas
          templateId={template.id}
          htmlContent={liveHtmlContent}
          importCss={template.importCss ?? ''}
          importReport={template.importReport ?? null}
          mode={canvasMode}
          zoom={zoomLevel}
          onSaved={(html) => setLiveHtmlContent(html)}
        />
      );
    }
    return <StructurePanel zoom={zoomLevel} />;
  };

  // Ribbon tab definitions — Apply Widget retired; import is the primary entry point
  const RIBBON_TABS: { id: BuilderTab; label: string; icon: React.ReactNode }[] = [
    { id: 'document_tools', label: 'Document Tools', icon: <Layers size={13} /> },
    { id: 'layout',        label: 'Layout',        icon: <LayoutGrid size={13} /> },
    { id: 'theme',         label: 'Theme',         icon: <Image size={13} /> },
    { id: 'view',          label: 'View',          icon: <Monitor size={13} /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      onClick={() => setShowDocTypeMenu(false)}
    >
      {/* ── Row 1: Title bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
        <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors flex-shrink-0" title="Close">
          <X size={14} />
        </button>
        <div className="w-px h-4 bg-slate-300 flex-shrink-0" />
        <FileText size={13} className="text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={templateName}
          onChange={(e) => useDocumentStore.getState().setTemplateName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-semibold text-slate-800 bg-transparent border-none outline-none w-80 min-w-0 hover:bg-white focus:bg-white focus:ring-1 focus:ring-primary/40 rounded px-1.5 py-0.5 transition-colors"
          placeholder="Untitled document"
        />
        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}

        {/* ── Document status badge ── */}
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
          docStatus === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : docStatus === 'archived' ? 'bg-slate-100 text-slate-500 border-slate-200'
          : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {docStatus}
        </span>

        {/* ── Mode indicator (read-only — mode is set from the list) ── */}
        <div className="flex-1 flex justify-center">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            appMode === 'use'
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {appMode === 'use' ? <><PlayCircle size={11} /> Use Mode</> : <><Wrench size={11} /> Build Mode</>}
          </div>
        </div>

        {/* ── Right actions — context-sensitive ── */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {appMode === 'build' ? (
            <>
              <button onClick={undo} disabled={!canUndo()} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Undo (⌘Z)"><Undo2 size={13} /></button>
              <button onClick={redo} disabled={!canRedo()} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Redo (⌘Y)"><Redo2 size={13} /></button>
              <div className="w-px h-4 bg-slate-300" />
              {/* Preview toggle */}
              <button
                onClick={() => setBuildSubMode(buildSubMode === 'preview' ? 'edit' : 'preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  buildSubMode === 'preview'
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Eye size={12} /> {buildSubMode === 'preview' ? 'Editing' : 'Preview'}
              </button>
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"><Printer size={12} /> Print</button>
              <div className="w-px h-4 bg-slate-300" />
              {/* ── Save button — saves to Studio library under the correct tab (job_report, swms, etc.) */}
              <div className="relative">
                <button
                  onClick={() => void handleSave()}
                  disabled={isSaving || (!isDirty && !!templateId)}
                  title={saveStatus === 'error' ? saveErrorMsg : 'Save document'}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${saveStatus === 'saved' ? 'bg-green-500 text-white' : saveStatus === 'error' ? 'bg-red-500 text-white' : 'bg-primary text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                >
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : saveStatus === 'saved' ? <CheckCircle size={13} /> : saveStatus === 'error' ? <AlertCircle size={13} /> : <Save size={13} />}
                  {isSaving ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
                </button>
                {/* Error tooltip — shows the real error message on hover */}
                {saveStatus === 'error' && saveErrorMsg && (
                  <div className="absolute top-full right-0 mt-1 z-50 bg-red-600 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs whitespace-pre-wrap pointer-events-none">
                    {saveErrorMsg}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Use Mode actions — Doc Studio: read, print, download, optional sign-on */
            <>
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors border border-slate-200">
                <Printer size={12} /> Print
              </button>
              <button
                onClick={() => {
                  // Inject orientation rule then open browser Save-as-PDF dialog
                  const orientation = pageLayout.orientation ?? 'portrait';
                  const styleId = '__studio_print_orientation__';
                  let el = document.getElementById(styleId) as HTMLStyleElement | null;
                  if (!el) { el = document.createElement('style'); el.id = styleId; document.head.appendChild(el); }
                  el.textContent = `@page { size: A4 ${orientation}; margin: 0; }`;
                  window.print();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors border border-slate-200"
              >
                <Download size={12} /> Download PDF
              </button>
              {requiresAcknowledgement && (
                <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                  <CheckSquare size={13} /> {acknowledgementLabel || 'Sign Onto / Acknowledge'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Row 2: Ribbon tab strip (Build Mode only — desktop only) ──────────── */}
      {appMode === 'build' && buildSubMode === 'edit' && (
        <div className="hidden sm:flex items-end px-3 bg-white border-b border-slate-200 flex-shrink-0">
          {/* Doc type pill — sits before the tabs */}
          <div className="relative flex-shrink-0 self-center mr-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowDocTypeMenu((v) => !v); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold hover:bg-primary/20 transition-colors"
            >
              {docTypeLabel}<ChevronDown size={10} />
            </button>
            {showDocTypeMenu && (
              <div className="absolute top-9 left-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
                {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                  <button key={key} onClick={() => { useDocumentStore.getState().setTemplateType(key as DocumentTemplate['templateType']); setShowDocTypeMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${templateType === key ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-px h-5 bg-slate-200 self-center mr-2 flex-shrink-0" />
          {RIBBON_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Use Mode sub-header — Doc Studio is always read-only */}
      {appMode === 'use' && (
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          <Eye size={14} className="text-slate-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-600">Review Mode</span>
          <span className="text-xs text-slate-400">
            Read-only document. Print or download below{requiresAcknowledgement ? `, or use "${acknowledgementLabel}" to sign on.` : '.'}
          </span>
        </div>
      )}

      {/* ── Main body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* USE MODE — full-width fill canvas */}
        {appMode === 'use' && (
          <div className="flex-1 flex min-h-0">
            {renderCanvas('use')}
          </div>
        )}

        {/* BUILD MODE — preview sub-mode: full-width canvas, no ribbon panel */}
        {appMode === 'build' && buildSubMode === 'preview' && (
          <div className="flex-1 flex min-h-0">
            {renderCanvas('preview')}
          </div>
        )}

        {/* BUILD MODE — edit sub-mode: ribbon panel + canvas */}
        {appMode === 'build' && buildSubMode === 'edit' && (
          <>
            {/* LAYOUT tab — document + page settings */}
            {activeTab === 'layout' && (
              <div className="flex-1 overflow-y-auto bg-slate-50">
                <div className="max-w-lg mx-auto py-6 px-6 flex flex-col gap-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Document</h3>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Name</label>
                        <input
                          type="text"
                          value={templateName}
                          onChange={(e) => useDocumentStore.getState().setTemplateName(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
                          placeholder="Untitled document"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                        <select
                          value={templateType ?? ''}
                          onChange={(e) => useDocumentStore.getState().setTemplateType(e.target.value as DocumentTemplate['templateType'])}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white appearance-none"
                        >
                          <option value="">document</option>
                          {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
                        <select
                          value={docStatus}
                          onChange={(e) => setDocStatus(e.target.value as 'draft' | 'published' | 'archived')}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white appearance-none"
                        >
                          <option value="draft">Draft</option>
                          <option value="published">Published</option>
                          <option value="archived">Archived</option>
                        </select>
                        {docStatus === 'published' && (
                          <p className="text-[10px] text-emerald-600 mt-1">Published documents are read-only for workers. Edit here to create a new version.</p>
                        )}
                        {docStatus === 'archived' && (
                          <p className="text-[10px] text-slate-400 mt-1">Archived documents are hidden from workers.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Sign-On / Acknowledgement Settings ──────────────────── */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Sign-On / Acknowledgement</h3>
                    <p className="text-[11px] text-slate-400 mb-3">When enabled, workers must sign on before they can close this document.</p>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requiresAcknowledgement}
                          onChange={(e) => setKindSettings({ requiresAcknowledgement: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Requires sign-on / acknowledgement</p>
                          <p className="text-[11px] text-slate-400">Workers must sign on before they can close this document.</p>
                        </div>
                      </label>
                      {requiresAcknowledgement && (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Button label</label>
                            <input
                              type="text"
                              value={acknowledgementLabel}
                              onChange={(e) => setKindSettings({ acknowledgementLabel: e.target.value })}
                              placeholder="Sign Onto / Acknowledge"
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Confirmation statement</label>
                            <textarea
                              value={acknowledgementText}
                              onChange={(e) => setKindSettings({ acknowledgementText: e.target.value })}
                              rows={3}
                              placeholder="By signing, I confirm I have read, understood, and agree to comply with this document."
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white resize-none"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Page</h3>
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Paper Size</label>
                        <select
                          value={pdfSettings.paperSize ?? 'A4'}
                          onChange={(e) => setPdfSettings({ ...pdfSettings, paperSize: e.target.value as PaperSize })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white appearance-none"
                        >
                          {(['A4', 'Letter', 'Legal'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Orientation</label>
                        <select
                          value={pdfSettings.orientation ?? 'portrait'}
                          onChange={(e) => setPdfSettings({ ...pdfSettings, orientation: e.target.value as Orientation })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white appearance-none"
                        >
                          <option value="portrait">Portrait</option>
                          <option value="landscape">Landscape</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Margins</label>
                        <select
                          value={pdfSettings.margins ?? 'standard'}
                          onChange={(e) => setPdfSettings({ ...pdfSettings, margins: e.target.value as MarginPreset })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white appearance-none"
                        >
                          <option value="none">None</option>
                          <option value="narrow">Narrow</option>
                          <option value="standard">Standard</option>
                          <option value="wide">Wide</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* THEME tab — fonts, colours, branding */}
            {activeTab === 'theme' && (
              <div className="flex-1 overflow-y-auto bg-slate-50">
                <div className="max-w-lg mx-auto py-6 px-6">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Theme &amp; Branding</h3>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <DocumentPdfTab settings={pdfSettings} onChange={setPdfSettings} templateName={templateName} />
                  </div>
                </div>
              </div>
            )}

            {/* SYSTEM FIELDS / ADVANCED / VIEW — ribbon panel + canvas (Structure/Tables/Form Fields moved to DocSidebar) */}
            {(activeTab !== 'layout' && activeTab !== 'theme') && (
              <>
                  {/* DOCUMENT TOOLS panel — DocSidebar rendered as the left ribbon panel */}
                  {activeTab === 'document_tools' && (
                    <DocSidebar
                      onImportDocx={() => setShowDocxImporter(true)}
                      collapsed={false}
                      onToggleCollapse={() => {}}
                    />
                  )}

                  {/* Apply Widget tab retired — block builders still available internally */}

                  {/* SYSTEM FIELDS insert strip */}
                  {activeTab === 'system_fields' && (
                    <RibbonPanel title="System Fields">
                      <p className="px-3 pb-1 text-[10px] text-slate-400 leading-tight">Live tokens — resolve on export.</p>
                      <RibbonGroup label="Job">
                        <RibbonInsertBtn icon={<Briefcase size={12} />} label="Job Number"    onClick={() => appendSysToken('job.number',       'Job Number')} />
                        <RibbonInsertBtn icon={<Briefcase size={12} />} label="Job Name"      onClick={() => appendSysToken('job.name',         'Job Name')} />
                        <RibbonInsertBtn icon={<MapPin size={12} />}    label="Site Address"  onClick={() => appendSysToken('job.site_address', 'Site Address')} />
                        <RibbonInsertBtn icon={<Building2 size={12} />} label="Client"        onClick={() => appendSysToken('job.client',       'Client')} />
                        <RibbonInsertBtn icon={<User size={12} />}      label="Supervisor"    onClick={() => appendSysToken('job.supervisor',   'Supervisor')} />
                        <RibbonInsertBtn icon={<Calendar size={12} />}  label="Start Date"    onClick={() => appendSysToken('job.start_date',   'Start Date')} />
                      </RibbonGroup>
                      <RibbonGroup label="Company">
                        <RibbonInsertBtn icon={<Building2 size={12} />} label="Company Name"  onClick={() => appendSysToken('company.name', 'Company Name')} />
                        <RibbonInsertBtn icon={<Building2 size={12} />} label="Company ABN"   onClick={() => appendSysToken('company.abn',  'Company ABN')} />
                      </RibbonGroup>
                      <RibbonGroup label="Document">
                        <RibbonInsertBtn icon={<User size={12} />}           label="Current User"    onClick={() => appendSysToken('user.name',     'Current User')} />
                        <RibbonInsertBtn icon={<Calendar size={12} />}       label="Today's Date"    onClick={() => appendSysToken('date.today',    "Today's Date")} />
                        <RibbonInsertBtn icon={<ClipboardList size={12} />}  label="Doc Number"      onClick={() => appendSysToken('doc.number',    'Document Number')} />
                        <RibbonInsertBtn icon={<ClipboardList size={12} />}  label="Revision"        onClick={() => appendSysToken('doc.revision',  'Revision')} />
                      </RibbonGroup>
                    </RibbonPanel>
                  )}

                  {/* ADVANCED insert strip */}
                  {activeTab === 'advanced' && (
                    <RibbonPanel title="Advanced">
                      <RibbonGroup label="Banners">
                        <RibbonInsertBtn icon={<Info size={12} />}          label="Info"          accent="blue"   onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'info'         as BannerVariant, title:'Note',          body:'Enter information here.',   size:'standard', align:'left', showOnExport:true })} />
                        <RibbonInsertBtn icon={<AlertTriangle size={12} />}  label="Warning"       accent="amber"  onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'warning'      as BannerVariant, title:'Warning',        body:'Enter warning here.',       size:'standard', align:'left', showOnExport:true })} />
                        <RibbonInsertBtn icon={<AlertOctagon size={12} />}   label="Danger"        accent="red"    onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'danger'       as BannerVariant, title:'Danger',         body:'Enter danger notice here.', size:'standard', align:'left', showOnExport:true })} />
                        <RibbonInsertBtn icon={<CheckCircle size={12} />}    label="Success"       accent="green"  onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'success'      as BannerVariant, title:'Complete',       body:'Enter success note here.',  size:'standard', align:'left', showOnExport:true })} />
                        <RibbonInsertBtn icon={<Shield size={12} />}         label="Safety"        accent="orange" onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'safety'       as BannerVariant, title:'Safety Notice',  body:'Enter safety info here.',   size:'standard', align:'left', showOnExport:true })} />
                        <RibbonInsertBtn icon={<ShieldAlert size={12} />}    label="Safety First"  accent="yellow" onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'safety_first' as BannerVariant, title:'SAFETY FIRST',  body:'THINK SAFE. WORK SAFE.',    size:'standard', align:'left', showOnExport:true })} />
                        <RibbonInsertBtn icon={<ShieldAlert size={12} />}    label="First Aid"     accent="red"    onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'first_aid'    as BannerVariant, title:'FIRST AID',      body:'KNOW YOUR NEAREST KIT',     size:'standard', align:'left', showOnExport:true })} />
                        <RibbonInsertBtn icon={<ShieldAlert size={12} />}    label="Custom"                        onClick={() => appendBlock({ id:nanoid(10), type:'banner', variant:'custom'       as BannerVariant, title:'Custom Banner',  body:'Enter text here.',          size:'standard', align:'left', showOnExport:true })} />
                      </RibbonGroup>
                      <RibbonGroup label="Safety Images">
                        <RibbonInsertBtn icon={<ShieldCheck size={12} />} label="PPE Banner"      accent="orange" onClick={() => appendBlock({ id:nanoid(10), type:"image", src:"/airo-assets/images/safety-badges/ppe-banner-strip",      alt:"PPE Required", size:"full", align:"center", preserveAspectRatio:true })} />
                        <RibbonInsertBtn icon={<BarChart2   size={12} />} label="Risk Assessment" accent="red"    onClick={() => appendBlock({ id:nanoid(10), type:"risk_matrix", title:"Risk Assessment Matrix", showLegend:true, showOnExport:true })} />
                        <RibbonInsertBtn icon={<BarChart2   size={12} />} label="Risk Matrix Banner" accent="amber"  onClick={() => appendBlock({ id:nanoid(10), type:"risk_matrix_banner" })} />
                      </RibbonGroup>
                      <RibbonGroup label="Image">
                        <ImageInsertPanel onInsert={(block) => appendBlock(block)} />
                      </RibbonGroup>
                      <RibbonGroup label="Layout">
                        <RibbonInsertBtn icon={<FileText size={12} />}   label="Rich Text Block"  onClick={() => appendBlock({ id:nanoid(10), type:'rich_text', html:'<p>Enter rich text…</p>' })} />
                        <RibbonInsertBtn icon={<LayoutGrid size={12} />} label="Two-Column Grid"  onClick={() => { const c1=nanoid(8),c2=nanoid(8); appendBlock({ id:nanoid(10), type:'columns', columns:[{id:c1,width:1,blocks:[{id:nanoid(10),type:'text',content:'Left column',align:'left'}]},{id:c2,width:1,blocks:[{id:nanoid(10),type:'text',content:'Right column',align:'left'}]}], gap:'md' }); }} />
                      </RibbonGroup>
                    </RibbonPanel>
                  )}

                  {/* VIEW panel */}
                  {activeTab === 'view' && (
                    <RibbonPanel title="View">
                      <RibbonGroup label="Zoom">
                        <div className="flex items-center gap-1 px-1 pb-1">
                          <button onClick={() => setZoomLevel((z) => Math.max(25, z - 10))} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors" title="Zoom out"><ZoomOut size={13} /></button>
                          <span className="flex-1 text-center text-xs font-semibold text-slate-700 tabular-nums">{zoomLevel}%</span>
                          <button onClick={() => setZoomLevel((z) => Math.min(200, z + 10))} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors" title="Zoom in"><ZoomIn size={13} /></button>
                        </div>
                        {[50, 75, 100, 125, 150].map((pct) => (
                          <button key={pct} onClick={() => setZoomLevel(pct)} className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${zoomLevel === pct ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>{pct}%</button>
                        ))}
                        <button onClick={() => setZoomLevel(100)} className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-md transition-colors mt-0.5" title="Reset zoom"><RotateCcw size={11} />Reset</button>
                      </RibbonGroup>
                      <RibbonGroup label="Orientation">
                        <button onClick={() => useDocumentStore.getState().setPageLayout({ ...pageLayout, orientation: 'portrait' })} className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-md transition-colors ${pageLayout.orientation !== 'landscape' ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>
                          <span className="inline-block w-3 h-4 border-2 border-current rounded-sm flex-shrink-0" />Portrait
                        </button>
                        <button onClick={() => useDocumentStore.getState().setPageLayout({ ...pageLayout, orientation: 'landscape' })} className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-md transition-colors ${pageLayout.orientation === 'landscape' ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>
                          <span className="inline-block w-4 h-3 border-2 border-current rounded-sm flex-shrink-0" />Landscape
                        </button>
                      </RibbonGroup>
                    </RibbonPanel>
                  )}

                {/* Canvas — full width on mobile, shares row with ribbon on desktop */}
                <div className="flex-1 flex min-h-0">
                  {renderCanvas('build')}
                </div>
              </>
            )}
          </>
        )}

      </div>

      {/* ── Status bar (desktop only) ─────────────────────────────────────────── */}
      <div className="hidden sm:flex items-center justify-end gap-2 px-3 py-1 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <span className="text-[10px] text-slate-400 capitalize">{pageLayout.orientation}</span>
        <div className="w-px h-3 bg-slate-300" />
        <button onClick={() => setZoomLevel((z) => Math.max(25, z - 10))} className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"><ZoomOut size={11} /></button>
        <span className="text-[10px] font-semibold text-slate-600 tabular-nums w-8 text-center">{zoomLevel}%</span>
        <button onClick={() => setZoomLevel((z) => Math.min(200, z + 10))} className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"><ZoomIn size={11} /></button>
        <button onClick={() => setZoomLevel(100)} className="text-[10px] text-slate-400 hover:text-slate-700 transition-colors px-1">Reset</button>
      </div>

      {/* ── Mobile: floating "Add Block" FAB (build mode only) ───────────────── */}
      {appMode === 'build' && buildSubMode === 'edit' && (
        <div className="sm:hidden">
          {/* FAB */}
          <button
            onClick={() => setShowMobileTools((v) => !v)}
            className="fixed bottom-6 right-5 z-[60] w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center transition-transform active:scale-95"
            aria-label="Insert block"
          >
            <Layers size={20} />
          </button>

          {/* Bottom sheet */}
          <AnimatePresence>
            {showMobileTools && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[55] bg-black/40"
                  onClick={() => setShowMobileTools(false)}
                />
                {/* Sheet */}
                <motion.div
                  initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="fixed bottom-0 left-0 right-0 z-[56] bg-white rounded-t-2xl shadow-2xl flex flex-col"
                  style={{ maxHeight: '70dvh' }}
                >
                  {/* Sheet handle */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100 flex-shrink-0">
                    <span className="text-xs font-bold text-slate-700">Insert Block</span>
                    <button onClick={() => setShowMobileTools(false)} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500"><X size={14} /></button>
                  </div>

                  {/* Tab selector */}
                  <div className="flex gap-1 px-3 py-2 overflow-x-auto flex-shrink-0 border-b border-slate-100">
                    {RIBBON_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                          activeTab === tab.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {tab.icon}{tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Scrollable insert buttons */}
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
                    {/* STRUCTURE */}
                    {activeTab === 'structure' && (<>
                      <MobileInsertBtn icon={<Upload size={13} />} label="Import DOCX / PDF" primary onClick={() => { setShowDocxImporter(true); setShowMobileTools(false); }} />
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-2 pb-0.5">Blocks</p>
                      <MobileInsertBtn icon={<Hash size={13} />} label="Title (H1)" onClick={() => { appendBlock({ id:nanoid(10), type:'heading', content:'Document Title', level:1, align:'left' }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Hash size={13} />} label="Heading (H2)" onClick={() => { appendBlock({ id:nanoid(10), type:'heading', content:'Section Heading', level:2, align:'left' }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Hash size={13} />} label="Sub-section (H3)" onClick={() => { appendBlock({ id:nanoid(10), type:'heading', content:'Sub-section', level:3, align:'left' }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Type size={13} />} label="Paragraph" onClick={() => { appendBlock({ id:nanoid(10), type:'text', content:'Enter text here…', align:'left' }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<AlignLeft size={13} />} label="Rich Text" onClick={() => { appendBlock({ id:nanoid(10), type:'rich_text', html:'<p>Click to type…</p>' }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<List size={13} />} label="Bullet List" onClick={() => { appendBlock({ id:nanoid(10), type:'rich_text', html:'<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>' }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Minus size={13} />} label="Divider" onClick={() => { appendBlock({ id:nanoid(10), type:'divider', style:'solid', thickness:1 }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<AlignLeft size={13} />} label="Page Break" onClick={() => { appendBlock({ id:nanoid(10), type:'page_break' }); setShowMobileTools(false); }} />
                    </>)}

                    {/* TABLES */}
                    {activeTab === 'tables' && (<>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-1 pb-0.5">Insert Table</p>
                      <MobileInsertBtn icon={<Table2 size={13} />} label="Blank Table" onClick={() => { const c1=nanoid(8),c2=nanoid(8),c3=nanoid(8); appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:[{id:c1,header:'Column 1',cellType:'text',width:1},{id:c2,header:'Column 2',cellType:'text',width:1},{id:c3,header:'Column 3',cellType:'text',width:1}], rows:Array.from({length:3},()=>({id:nanoid(8),cells:{[c1]:'', [c2]:'', [c3]:''}})), stripedRows:true }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<LayoutGrid size={13} />} label="Detail Grid" onClick={() => { const c1=nanoid(8),c2=nanoid(8); appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:[{id:c1,header:'Field',cellType:'text',width:1},{id:c2,header:'Value',cellType:'text',width:2}], rows:[{id:nanoid(8),cells:{[c1]:'Job Number',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Client',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Site Address',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Date',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Supervisor',[c2]:''}}], stripedRows:false }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Zap size={13} />} label="SWMS Risk Table" onClick={() => { const cols=[{id:nanoid(8),header:'Hazard / Risk',cellType:'text' as const,width:2},{id:nanoid(8),header:'Who is at Risk',cellType:'text' as const,width:1},{id:nanoid(8),header:'Initial Risk Rating',cellType:'text' as const,width:1},{id:nanoid(8),header:'Control Measures',cellType:'text' as const,width:2},{id:nanoid(8),header:'Residual Risk',cellType:'text' as const,width:1},{id:nanoid(8),header:'Responsible',cellType:'text' as const,width:1}]; appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:cols, rows:Array.from({length:3},()=>({id:nanoid(8),cells:Object.fromEntries(cols.map(c=>[c.id,'']))})), stripedRows:true }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<PenLine size={13} />} label="Sign-Off Table" onClick={() => { const cols=[{id:nanoid(8),header:'Name',cellType:'text' as const,width:2},{id:nanoid(8),header:'Role',cellType:'text' as const,width:1},{id:nanoid(8),header:'Signature',cellType:'text' as const,width:2},{id:nanoid(8),header:'Date',cellType:'text' as const,width:1}]; appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:cols, rows:Array.from({length:4},()=>({id:nanoid(8),cells:Object.fromEntries(cols.map(c=>[c.id,'']))})), stripedRows:false }); setShowMobileTools(false); }} />
                    </>)}

                    {/* FORM FIELDS */}
                    {activeTab === 'form_fields' && (<>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-1 pb-0.5">Insert Field</p>
                      <MobileInsertBtn icon={<FileText size={13} />} label="Short Text"       onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'short_text',    label:'Text Field',       required:false }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<FileText size={13} />} label="Long Text"        onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'long_text',     label:'Long Text',        required:false }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<CheckSquare size={13} />} label="Yes / No"      onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'yes_no',        label:'Yes / No',         required:false }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Calendar size={13} />} label="Date"             onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'date',          label:'Date',             required:false }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<List size={13} />} label="Choice / Dropdown"    onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'single_choice', label:'Choice',           required:false, options:['Option A','Option B','Option C'] }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<PenLine size={13} />} label="Signature"         onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'signature',     label:'Signature',        required:false }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Camera size={13} />} label="Photo / Evidence"   onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'photo',         label:'Photo / Evidence', required:false }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<FileText size={13} />} label="File Upload"      onClick={() => { appendBlock({ id:nanoid(10), type:'field', fieldType:'file_upload',   label:'File Upload',      required:false }); setShowMobileTools(false); }} />
                    </>)}

                    {/* SYSTEM FIELDS */}
                    {activeTab === 'system_fields' && (<>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-1 pb-0.5">Job</p>
                      <MobileInsertBtn icon={<Briefcase size={13} />} label="Job Number"   onClick={() => { appendSysToken('job.number',       'Job Number');   setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Briefcase size={13} />} label="Job Name"     onClick={() => { appendSysToken('job.name',         'Job Name');     setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<MapPin size={13} />}    label="Site Address" onClick={() => { appendSysToken('job.site_address', 'Site Address'); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Building2 size={13} />} label="Client"       onClick={() => { appendSysToken('job.client',       'Client');       setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<User size={13} />}      label="Supervisor"   onClick={() => { appendSysToken('job.supervisor',   'Supervisor');   setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Calendar size={13} />}  label="Start Date"   onClick={() => { appendSysToken('job.start_date',   'Start Date');   setShowMobileTools(false); }} />
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-2 pb-0.5">Company</p>
                      <MobileInsertBtn icon={<Building2 size={13} />} label="Company Name" onClick={() => { appendSysToken('company.name', 'Company Name'); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Building2 size={13} />} label="Company ABN"  onClick={() => { appendSysToken('company.abn',  'Company ABN');  setShowMobileTools(false); }} />
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-2 pb-0.5">Document</p>
                      <MobileInsertBtn icon={<User size={13} />}          label="Current User"    onClick={() => { appendSysToken('user.name',    'Current User');    setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Calendar size={13} />}      label="Today's Date"    onClick={() => { appendSysToken('date.today',   "Today's Date");    setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<ClipboardList size={13} />} label="Doc Number"      onClick={() => { appendSysToken('doc.number',   'Document Number'); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<ClipboardList size={13} />} label="Revision"        onClick={() => { appendSysToken('doc.revision', 'Revision');        setShowMobileTools(false); }} />
                    </>)}

                    {/* ADVANCED */}
                    {activeTab === 'advanced' && (<>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-1 pb-0.5">Banners</p>
                      <MobileInsertBtn icon={<Info size={13} />}         label="Info"         accent="blue"   onClick={() => { appendBlock({ id:nanoid(10), type:'banner', variant:'info'         as BannerVariant, title:'Note',         body:'Enter information here.',   size:'standard', align:'left', showOnExport:true }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<AlertTriangle size={13} />} label="Warning"      accent="amber"  onClick={() => { appendBlock({ id:nanoid(10), type:'banner', variant:'warning'      as BannerVariant, title:'Warning',       body:'Enter warning here.',       size:'standard', align:'left', showOnExport:true }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<AlertOctagon size={13} />}  label="Danger"       accent="red"    onClick={() => { appendBlock({ id:nanoid(10), type:'banner', variant:'danger'       as BannerVariant, title:'Danger',        body:'Enter danger notice here.', size:'standard', align:'left', showOnExport:true }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<Shield size={13} />}        label="Safety"       accent="orange" onClick={() => { appendBlock({ id:nanoid(10), type:'banner', variant:'safety'       as BannerVariant, title:'Safety Notice', body:'Enter safety info here.',   size:'standard', align:'left', showOnExport:true }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<ShieldAlert size={13} />}   label="Safety First" accent="yellow" onClick={() => { appendBlock({ id:nanoid(10), type:'banner', variant:'safety_first' as BannerVariant, title:'SAFETY FIRST', body:'THINK SAFE. WORK SAFE.',    size:'standard', align:'left', showOnExport:true }); setShowMobileTools(false); }} />
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-2 pb-0.5">Layout</p>
                      <MobileInsertBtn icon={<FileText size={13} />}   label="Rich Text Block" onClick={() => { appendBlock({ id:nanoid(10), type:'rich_text', html:'<p>Enter rich text…</p>' }); setShowMobileTools(false); }} />
                      <MobileInsertBtn icon={<LayoutGrid size={13} />} label="Two-Column Grid" onClick={() => { const c1=nanoid(8),c2=nanoid(8); appendBlock({ id:nanoid(10), type:'columns', columns:[{id:c1,width:1,blocks:[{id:nanoid(10),type:'text',content:'Left column',align:'left'}]},{id:c2,width:1,blocks:[{id:nanoid(10),type:'text',content:'Right column',align:'left'}]}], gap:'md' }); setShowMobileTools(false); }} />
                    </>)}

                    {/* VIEW */}
                    {activeTab === 'view' && (<>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-1 pb-0.5">Zoom</p>
                      <div className="flex items-center gap-2 px-1 py-1">
                        <button onClick={() => setZoomLevel((z) => Math.max(25, z - 10))} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 active:bg-slate-200"><ZoomOut size={15} /></button>
                        <span className="flex-1 text-center text-sm font-bold text-slate-700 tabular-nums">{zoomLevel}%</span>
                        <button onClick={() => setZoomLevel((z) => Math.min(200, z + 10))} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 active:bg-slate-200"><ZoomIn size={15} /></button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-1 py-1">
                        {[50, 75, 100, 125, 150].map((pct) => (
                          <button key={pct} onClick={() => setZoomLevel(pct)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${zoomLevel === pct ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{pct}%</button>
                        ))}
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-2 pb-0.5">Orientation</p>
                      <div className="flex gap-2 px-1">
                        <button onClick={() => useDocumentStore.getState().setPageLayout({ ...pageLayout, orientation: 'portrait' })} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors ${pageLayout.orientation !== 'landscape' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <span className="inline-block w-3 h-4 border-2 border-current rounded-sm" />Portrait
                        </button>
                        <button onClick={() => useDocumentStore.getState().setPageLayout({ ...pageLayout, orientation: 'landscape' })} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors ${pageLayout.orientation === 'landscape' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <span className="inline-block w-4 h-3 border-2 border-current rounded-sm" />Landscape
                        </button>
                      </div>
                    </>)}

                    <div className="h-4" />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showDocxImporter && (
          <DocxImporter
            templateId={templateId}
            hasExistingBlocks={blocks.length > 0}
            onClose={() => setShowDocxImporter(false)}
            onImported={handleDocxImported}
            onOpenInStudio={(result) => {
              // Immediately update the live HTML so the canvas switches without
              // waiting for the parent re-fetch round-trip
              setLiveHtmlContent(result.htmlContent);
              setShowDocxImporter(false);
              // Notify parent to re-fetch the template (switches isHtmlDoc → true)
              if (result.id) onSaved?.(result.id);
            }}
            onSaveFirst={handleSaveFirst}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBlocksImporter && (
          <BlocksJsonImporter templateId={templateId} hasExistingBlocks={blocks.length > 0} onClose={() => setShowBlocksImporter(false)} onImported={handleDocxImported} onSaveFirst={handleSaveFirst} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Slim left panel wrapper used by non-structure tabs */
function RibbonPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hidden sm:flex w-44 flex-shrink-0 border-r border-slate-200 bg-white flex-col overflow-y-auto">
      <div className="px-3 pt-2.5 pb-1 border-b border-slate-100 bg-slate-50">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
        {children}
        <div className="h-4" />
      </div>
    </div>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-2 pb-1">{label}</p>
      {children}
    </div>
  );
}

function RibbonInsertBtn({ icon, label, onClick, primary = false, accent }: {
  icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean; accent?: string;
}) {
  const accentMap: Record<string, string> = {
    blue: 'text-blue-600 hover:bg-blue-50', amber: 'text-amber-600 hover:bg-amber-50',
    red: 'text-red-600 hover:bg-red-50', green: 'text-green-600 hover:bg-green-50',
    orange: 'text-violet-700 hover:bg-violet-50', yellow: 'text-yellow-700 hover:bg-yellow-50',
  };
  const accentCls = accent ? accentMap[accent] ?? '' : '';
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors text-left ${
        primary ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
        : accentCls ? `text-slate-600 ${accentCls}`
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
      }`}>
      <span className={`flex-shrink-0 ${primary ? 'text-primary' : accentCls ? '' : 'text-slate-400'}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Image insert panel — size + align pickers then insert */
function ImageInsertPanel({ onInsert }: { onInsert: (block: DocumentBlock) => void }) {
  const { sourceJobId } = useDocumentStore();
  const [tab, setTab] = useState<'upload' | 'job'>('upload');
  const [size, setSize]   = useState<'small' | 'medium' | 'large' | 'full'>('medium');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const SIZE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large', full: 'Full width' };

  const handleFileInsert = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', file.name);
      const res = await fetch('/api/files', { method: 'POST', body: fd });
      const data = await res.json() as { file?: { id: number }; error?: string };
      if (!res.ok || !data.file?.id) throw new Error(data.error ?? 'Upload failed');
      const src = ['/api/files', String(data.file.id), 'download'].join('/') + '?inline=1';
      onInsert({ id: nanoid(10), type: 'image', src, alt: file.name.replace(/\.[^.]+$/, ''), size, align, preserveAspectRatio: true });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-1 mb-1 rounded-lg border border-slate-200 bg-slate-50 p-2 flex flex-col gap-2">
      {/* Tab bar — only shown for job reports */}
      {sourceJobId && (
        <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-white">
          <button onClick={() => setTab('upload')}
            className={`flex-1 py-1 text-[10px] font-semibold transition-colors ${tab === 'upload' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700'}`}>
            Upload / URL
          </button>
          <button onClick={() => setTab('job')}
            className={`flex-1 py-1 text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 ${tab === 'job' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700'}`}>
            <Camera size={10} /> From job
          </button>
        </div>
      )}

      {tab === 'job' && sourceJobId ? (
        <JobPhotoPicker
          jobId={sourceJobId}
          size={size}
          align={align}
          onInsertPhoto={(src, alt) =>
            onInsert({ id: nanoid(10), type: 'image', src, alt, size, align, preserveAspectRatio: true })
          }
        />
      ) : (
        <>
          <p className="text-[9px] text-slate-400 leading-tight">Pick size &amp; align, then click Insert. Use the right panel to change after inserting.</p>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Size</p>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(SIZE_LABELS) as (keyof typeof SIZE_LABELS)[]).map((s) => (
                <button key={s} onClick={() => setSize(s)}
                  className={`py-1 rounded text-[10px] font-semibold transition-colors ${size === s ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary'}`}>
                  {SIZE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Align</p>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} onClick={() => setAlign(a)} title={a}
                  className={`flex-1 py-1.5 rounded flex items-center justify-center transition-colors ${align === a ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-primary/40 hover:text-primary'}`}>
                  {a === 'left' && <AlignLeft size={12} />}{a === 'center' && <AlignCenter size={12} />}{a === 'right' && <AlignRight size={12} />}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image size={11} /> {uploading ? 'Uploading…' : 'Insert image'}
          </button>
          {uploadError && <p className="text-[10px] text-red-500">{uploadError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileInsert(f); e.target.value = ''; }}
          />
        </>
      )}
    </div>
  );
}

// ── MobileInsertBtn — full-width tap target for the mobile bottom sheet ──────
function MobileInsertBtn({
  icon, label, onClick, primary = false, accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  accent?: string;
}) {
  const accentMap: Record<string, string> = {
    blue: 'text-blue-600', amber: 'text-amber-600', red: 'text-red-600',
    green: 'text-green-600', orange: 'text-violet-700', yellow: 'text-yellow-700',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left active:scale-[0.98] ${
        primary
          ? 'bg-primary/10 text-primary border border-primary/20'
          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
      }`}
    >
      <span className={`flex-shrink-0 ${primary ? 'text-primary' : accent ? accentMap[accent] ?? 'text-slate-400' : 'text-slate-400'}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
