/**
 * Smart Document Builder — Main Orchestrator (Structure-First Edition)
 * ─────────────────────────────────────────────────────────────────────────────
 * Default experience: structure view (block canvas + inspector, drag/drop)
 * Preview mode: rendered A4 document preview
 *
 * Underlying block engine is unchanged — PDF export, logic, fields all work.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Save, Undo2, Redo2, Eye, Loader2, CheckCircle,
  AlertCircle, FileText, Library, Layers,
  ChevronDown, Trash2, Printer, Download, Upload,
  Table2, FormInput, Cpu,
  Hash, Type, List, Minus, AlignLeft,
  LayoutGrid, PenLine, Zap, Camera,
  CheckSquare, Calendar, Briefcase, MapPin, User,
  Building2, ClipboardList,
  Info, AlertTriangle, AlertOctagon, Shield, ShieldAlert,
  Image, AlignCenter, AlignRight,
  ZoomIn, ZoomOut, Monitor, RotateCcw,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useDocumentStore } from './useDocumentStore';
import StructurePanel from './StructurePanel';
import DocxImporter from './DocxImporter';
import BlocksJsonImporter from './BlocksJsonImporter';
import DocumentPdfTab from './DocumentPdfTab';
import { usePermissions } from '@/lib/usePermissions';
import type { DocumentTemplate, DocumentBlock, BuilderTab, TemplatePdfSettings, BannerVariant, PaperSize, Orientation, MarginPreset } from './types';
import { DEFAULT_TEMPLATE_PDF_SETTINGS } from './types';

interface Props {
  template?: DocumentTemplate | null;
  onClose: () => void;
  onSaved?: (id: number) => void;
}


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

export default function DocumentBuilder({ template, onClose, onSaved }: Props) {
  const {
    isDirty, isSaving, setIsSaving, markSaved,
    loadTemplate, resetToBlank, getSerialised, templateId, templateName, templateType,
    undo, redo, canUndo, canRedo, reorderBlocks, prependBlocks, appendBlocks, blocks,
    pageLayout,
  } = useDocumentStore();

  const [showDocxImporter, setShowDocxImporter]     = useState(false);
  const [showBlocksImporter, setShowBlocksImporter] = useState(false);
  const [saveStatus, setSaveStatus]                 = useState<'idle' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab]                   = useState<BuilderTab>('structure');
  const [pdfSettings, setPdfSettings]               = useState<TemplatePdfSettings>(
    template?.pdfSettings ?? { ...DEFAULT_TEMPLATE_PDF_SETTINGS }
  );
  const [showPublishModal, setShowPublishModal]     = useState(false);
  const [showDocTypeMenu, setShowDocTypeMenu]       = useState(false);
  const [zoomLevel, setZoomLevel]                   = useState(100); // percent

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
      const payload = { ...getSerialised(), pdfSettings };
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
      if (!res.ok || data.error) throw new Error(data.error ?? 'Save failed');
      const savedId = data.id ?? templateId!;
      markSaved(savedId);
      setSaveStatus('saved');
      onSaved?.(savedId);
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
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
      const payload = { ...getSerialised(), pdfSettings };
      const res = await fetch('/api/document-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      });
      const data = await res.json() as { id?: number; ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Save failed');
      const savedId = data.id!;
      markSaved(savedId);
      setSaveStatus('saved');
      onSaved?.(savedId);
      setTimeout(() => setSaveStatus('idle'), 2500);
      return savedId;
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [getSerialised, markSaved, onSaved, pdfSettings]);

  const docTypeLabel = DOC_TYPE_LABELS[templateType ?? ''] ?? 'Document';

  // Ribbon tab definitions — Layout + Theme first, then insert tabs
  const RIBBON_TABS: { id: BuilderTab; label: string; icon: React.ReactNode }[] = [
    { id: 'layout',        label: 'Layout',        icon: <LayoutGrid size={13} /> },
    { id: 'theme',         label: 'Theme',         icon: <Image size={13} /> },
    { id: 'structure',     label: 'Structure',     icon: <Layers size={13} /> },
    { id: 'tables',        label: 'Tables',        icon: <Table2 size={13} /> },
    { id: 'form_fields',   label: 'Form Fields',   icon: <FormInput size={13} /> },
    { id: 'system_fields', label: 'System Fields', icon: <Cpu size={13} /> },
    { id: 'advanced',      label: 'Advanced',      icon: <ShieldAlert size={13} /> },
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
        <div className="flex-1" />
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={undo} disabled={!canUndo()} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Undo (⌘Z)"><Undo2 size={13} /></button>
          <button onClick={redo} disabled={!canRedo()} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Redo (⌘Y)"><Redo2 size={13} /></button>
          <div className="w-px h-4 bg-slate-300" />
          <button onClick={() => setShowDocxImporter(true)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"><Upload size={12} /> Import</button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"><Printer size={12} /> Print</button>
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"><Download size={12} /> Download</button>
          <div className="w-px h-4 bg-slate-300" />
          {templateId && <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={12} /> Delete</button>}
          {isPlatformOwner && templateId && (
            <button onClick={() => setShowPublishModal(true)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors border border-slate-300"><Library size={12} /> Publish</button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={isSaving || (!isDirty && !!templateId)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${saveStatus === 'saved' ? 'bg-green-500 text-white' : saveStatus === 'error' ? 'bg-red-500 text-white' : 'bg-primary text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed'}`}
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : saveStatus === 'saved' ? <CheckCircle size={13} /> : saveStatus === 'error' ? <AlertCircle size={13} /> : <Save size={13} />}
            {isSaving ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Row 2: Ribbon tab strip ───────────────────────────────────────────── */}
      <div className="flex items-end px-3 bg-white border-b border-slate-200 flex-shrink-0">
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
        <div className="flex-1" />
        <button onClick={() => useDocumentStore.getState().setMode('preview')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-b-2 border-transparent transition-colors">
          <Eye size={13} /> Preview
        </button>
      </div>

      {/* ── Main body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

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

        {/* STRUCTURE / TABLES / FORM FIELDS / SYSTEM FIELDS / ADVANCED — insert strip + canvas */}
        {(activeTab === 'structure' || activeTab === 'tables' || activeTab === 'form_fields' || activeTab === 'system_fields' || activeTab === 'advanced' || activeTab === 'view') && (
          <>
            {/* STRUCTURE insert strip */}
            {activeTab === 'structure' && (
              <div className="w-44 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
                <div className="px-2 pt-2.5 pb-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">Import</p>
                  <RibbonInsertBtn icon={<Upload size={12} />} label="Import DOCX / PDF" onClick={() => setShowDocxImporter(true)} primary />
                </div>
                <div className="px-2 pt-2 pb-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">Structure</p>
                  <RibbonInsertBtn icon={<Hash size={12} />} label="Title (H1)" onClick={() => appendBlock({ id: nanoid(10), type: 'heading', content: 'Document Title', level: 1, align: 'left' })} />
                  <RibbonInsertBtn icon={<Hash size={12} />} label="Heading (H2)" onClick={() => appendBlock({ id: nanoid(10), type: 'heading', content: 'Section Heading', level: 2, align: 'left' })} />
                  <RibbonInsertBtn icon={<Hash size={12} />} label="Sub-section (H3)" onClick={() => appendBlock({ id: nanoid(10), type: 'heading', content: 'Sub-section', level: 3, align: 'left' })} />
                  <RibbonInsertBtn icon={<Type size={12} />} label="Paragraph" onClick={() => appendBlock({ id: nanoid(10), type: 'text', content: 'Enter text here…', align: 'left' })} />
                  <RibbonInsertBtn icon={<List size={12} />} label="Bullet List" onClick={() => appendBlock({ id: nanoid(10), type: 'rich_text', html: '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>' })} />
                  <RibbonInsertBtn icon={<Minus size={12} />} label="Divider" onClick={() => appendBlock({ id: nanoid(10), type: 'divider', style: 'solid', thickness: 1 })} />
                  <RibbonInsertBtn icon={<AlignLeft size={12} />} label="Page Break" onClick={() => appendBlock({ id: nanoid(10), type: 'page_break' })} />
                </div>
                <div className="h-4" />
              </div>
            )}

            {/* TABLES insert strip */}
            {activeTab === 'tables' && (
              <RibbonPanel title="Tables">
                <RibbonGroup label="Insert Table">
                  <RibbonInsertBtn icon={<Table2 size={12} />} label="Blank Table" onClick={() => { const c1=nanoid(8),c2=nanoid(8),c3=nanoid(8); appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:[{id:c1,header:'Column 1',cellType:'text',width:1},{id:c2,header:'Column 2',cellType:'text',width:1},{id:c3,header:'Column 3',cellType:'text',width:1}], rows:Array.from({length:3},()=>({id:nanoid(8),cells:{[c1]:'', [c2]:'', [c3]:''}})), stripedRows:true }); }} />
                  <RibbonInsertBtn icon={<LayoutGrid size={12} />} label="Detail Grid" onClick={() => { const c1=nanoid(8),c2=nanoid(8); appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:[{id:c1,header:'Field',cellType:'text',width:1},{id:c2,header:'Value',cellType:'text',width:2}], rows:[{id:nanoid(8),cells:{[c1]:'Job Number',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Client',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Site Address',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Date',[c2]:''}},{id:nanoid(8),cells:{[c1]:'Supervisor',[c2]:''}}], stripedRows:false }); }} />
                  <RibbonInsertBtn icon={<Zap size={12} />} label="SWMS Risk Table" onClick={() => { const cols=[{id:nanoid(8),header:'Hazard / Risk',cellType:'text' as const,width:2},{id:nanoid(8),header:'Who is at Risk',cellType:'text' as const,width:1},{id:nanoid(8),header:'Initial Risk Rating',cellType:'text' as const,width:1},{id:nanoid(8),header:'Control Measures',cellType:'text' as const,width:2},{id:nanoid(8),header:'Residual Risk',cellType:'text' as const,width:1},{id:nanoid(8),header:'Responsible',cellType:'text' as const,width:1}]; appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:cols, rows:Array.from({length:3},()=>({id:nanoid(8),cells:Object.fromEntries(cols.map(c=>[c.id,'']))})), stripedRows:true }); }} />
                  <RibbonInsertBtn icon={<PenLine size={12} />} label="Sign-Off Table" onClick={() => { const cols=[{id:nanoid(8),header:'Name',cellType:'text' as const,width:2},{id:nanoid(8),header:'Role',cellType:'text' as const,width:1},{id:nanoid(8),header:'Signature',cellType:'text' as const,width:2},{id:nanoid(8),header:'Date',cellType:'text' as const,width:1}]; appendBlock({ id:nanoid(10), type:'table', mode:'static', columns:cols, rows:Array.from({length:4},()=>({id:nanoid(8),cells:Object.fromEntries(cols.map(c=>[c.id,'']))})), stripedRows:false }); }} />
                </RibbonGroup>
              </RibbonPanel>
            )}

            {/* FORM FIELDS insert strip */}
            {activeTab === 'form_fields' && (
              <RibbonPanel title="Form Fields">
                <RibbonGroup label="Insert Field">
                  <RibbonInsertBtn icon={<FileText size={12} />} label="Short Text"       onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'short_text',    label:'Text Field',       required:false })} />
                  <RibbonInsertBtn icon={<FileText size={12} />} label="Long Text"        onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'long_text',     label:'Long Text',        required:false })} />
                  <RibbonInsertBtn icon={<CheckSquare size={12} />} label="Yes / No"      onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'yes_no',        label:'Yes / No',         required:false })} />
                  <RibbonInsertBtn icon={<Calendar size={12} />} label="Date"             onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'date',          label:'Date',             required:false })} />
                  <RibbonInsertBtn icon={<List size={12} />} label="Choice / Dropdown"    onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'single_choice', label:'Choice',           required:false, options:['Option A','Option B','Option C'] })} />
                  <RibbonInsertBtn icon={<PenLine size={12} />} label="Signature"         onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'signature',     label:'Signature',        required:false })} />
                  <RibbonInsertBtn icon={<Camera size={12} />} label="Photo / Evidence"   onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'photo',         label:'Photo / Evidence', required:false })} />
                  <RibbonInsertBtn icon={<FileText size={12} />} label="File Upload"      onClick={() => appendBlock({ id:nanoid(10), type:'field', fieldType:'file_upload',   label:'File Upload',      required:false })} />
                </RibbonGroup>
              </RibbonPanel>
            )}

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
                {/* Zoom controls */}
                <RibbonGroup label="Zoom">
                  <div className="flex items-center gap-1 px-1 pb-1">
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(25, z - 10))}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                      title="Zoom out"
                    ><ZoomOut size={13} /></button>
                    <span className="flex-1 text-center text-xs font-semibold text-slate-700 tabular-nums">{zoomLevel}%</span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                      title="Zoom in"
                    ><ZoomIn size={13} /></button>
                  </div>
                  {/* Preset zoom buttons */}
                  {[50, 75, 100, 125, 150].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setZoomLevel(pct)}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${zoomLevel === pct ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                    >{pct}%</button>
                  ))}
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-md transition-colors mt-0.5"
                    title="Reset zoom"
                  ><RotateCcw size={11} />Reset</button>
                </RibbonGroup>

                {/* Orientation toggle */}
                <RibbonGroup label="Orientation">
                  <button
                    onClick={() => useDocumentStore.getState().setPageLayout({ ...pageLayout, orientation: 'portrait' })}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-md transition-colors ${pageLayout.orientation !== 'landscape' ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    <span className="inline-block w-3 h-4 border-2 border-current rounded-sm flex-shrink-0" />
                    Portrait
                  </button>
                  <button
                    onClick={() => useDocumentStore.getState().setPageLayout({ ...pageLayout, orientation: 'landscape' })}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-md transition-colors ${pageLayout.orientation === 'landscape' ? 'bg-primary/10 text-primary font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                  >
                    <span className="inline-block w-4 h-3 border-2 border-current rounded-sm flex-shrink-0" />
                    Landscape
                  </button>
                </RibbonGroup>
              </RibbonPanel>
            )}

            {/* Canvas — always visible for insert tabs */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              <StructurePanel zoom={zoomLevel} />
            </div>
          </>
        )}

      </div>

      {/* ── Status bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 px-3 py-1 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <span className="text-[10px] text-slate-400 capitalize">{pageLayout.orientation}</span>
        <div className="w-px h-3 bg-slate-300" />
        <button onClick={() => setZoomLevel((z) => Math.max(25, z - 10))} className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"><ZoomOut size={11} /></button>
        <span className="text-[10px] font-semibold text-slate-600 tabular-nums w-8 text-center">{zoomLevel}%</span>
        <button onClick={() => setZoomLevel((z) => Math.min(200, z + 10))} className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"><ZoomIn size={11} /></button>
        <button onClick={() => setZoomLevel(100)} className="text-[10px] text-slate-400 hover:text-slate-700 transition-colors px-1">Reset</button>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showDocxImporter && (
          <DocxImporter templateId={templateId} hasExistingBlocks={blocks.length > 0} onClose={() => setShowDocxImporter(false)} onImported={handleDocxImported} onSaveFirst={handleSaveFirst} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBlocksImporter && (
          <BlocksJsonImporter templateId={templateId} hasExistingBlocks={blocks.length > 0} onClose={() => setShowBlocksImporter(false)} onImported={handleDocxImported} onSaveFirst={handleSaveFirst} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPublishModal && templateId && (
          <PublishToLibraryModal templateId={templateId} templateName={templateName} onClose={() => setShowPublishModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Slim left panel wrapper used by non-structure tabs */
function RibbonPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-44 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
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
    orange: 'text-orange-600 hover:bg-orange-50', yellow: 'text-yellow-700 hover:bg-yellow-50',
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
  const [size, setSize]   = useState<'small' | 'medium' | 'large' | 'full'>('medium');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const SIZE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large', full: 'Full width' };
  return (
    <div className="mx-1 mb-1 rounded-lg border border-slate-200 bg-slate-50 p-2 flex flex-col gap-2">
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
      <button onClick={() => onInsert({ id: nanoid(10), type: 'image', src: '', alt: '', size, align, preserveAspectRatio: true })}
        className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5">
        <Image size={11} /> Insert image
      </button>
    </div>
  );
}

// ── Publish to Library Modal ──────────────────────────────────────────────────

const LIBRARY_TYPES = ['form', 'procedure', 'policy', 'swms', 'recipe'] as const;
type LibraryType = typeof LIBRARY_TYPES[number];

function PublishToLibraryModal({
  templateId,
  templateName,
  onClose,
}: {
  templateId: number;
  templateName: string;
  onClose: () => void;
}) {
  const [title, setTitle]         = useState(templateName);
  const [type, setType]           = useState<LibraryType>('form');
  const [category, setCategory]   = useState('');
  const [discipline, setDiscipline] = useState('');
  const [summary, setSummary]     = useState('');
  const [status, setStatus]       = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]   = useState('');

  const handlePublish = async () => {
    if (!title.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/document-templates/${templateId}/publish-to-library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: title.trim(), type, category, discipline, summary }),
      });
      const data = await res.json() as { ok?: boolean; libraryItemId?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Publish failed');
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed');
      setStatus('error');
    }
  };

  const inp = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
              <Library size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Publish to Global Library</p>
              <p className="text-xs text-slate-400">Available to all companies immediately</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {status === 'success' ? (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
              <CheckCircle size={28} className="text-green-500" />
            </div>
            <p className="text-base font-bold text-slate-800">Published!</p>
            <p className="text-sm text-slate-500">
              <strong>{title}</strong> is now live in the global library.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inp}
                placeholder="Document title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as LibraryType)}
                  className={`${inp} appearance-none`}
                >
                  {LIBRARY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inp}
                  placeholder="e.g. Safety"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Discipline
              </label>
              <input
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className={inp}
                placeholder="e.g. Construction"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Summary{' '}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                className={`${inp} resize-none`}
                placeholder="Brief description shown in the library"
              />
            </div>
            {status === 'error' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                <AlertCircle size={13} />
                {errorMsg}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handlePublish()}
                disabled={!title.trim() || status === 'loading'}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <><Loader2 size={13} className="animate-spin" />Publishing…</>
                ) : (
                  <><Library size={13} />Publish</>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
