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
  Settings, Table2, FormInput, Cpu, LayoutTemplate,
} from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import DocSidebar from './DocSidebar';
import StructurePanel from './StructurePanel';
import DocxImporter from './DocxImporter';
import BlocksJsonImporter from './BlocksJsonImporter';
import DocumentPdfTab from './DocumentPdfTab';
import { usePermissions } from '@/lib/usePermissions';
import type { DocumentTemplate, DocumentBlock, BuilderTab, TemplatePdfSettings } from './types';
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
  } = useDocumentStore();

  const [showDocxImporter, setShowDocxImporter]     = useState(false);
  const [showBlocksImporter, setShowBlocksImporter] = useState(false);
  const [saveStatus, setSaveStatus]                 = useState<'idle' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab]                   = useState<BuilderTab>('structure');
  const [pdfSettings, setPdfSettings]               = useState<TemplatePdfSettings>(
    template?.pdfSettings ?? { ...DEFAULT_TEMPLATE_PDF_SETTINGS }
  );
  const [leftCollapsed, setLeftCollapsed]           = useState(true);
  const [showPublishModal, setShowPublishModal]     = useState(false);
  const [showDocTypeMenu, setShowDocTypeMenu]       = useState(false);
  const { isPlatformOwner } = usePermissions();

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

  // Ribbon tab definitions
  const RIBBON_TABS: { id: BuilderTab; label: string; icon: React.ReactNode }[] = [
    { id: 'file',          label: 'File',          icon: <Settings size={13} /> },
    { id: 'structure',     label: 'Structure',     icon: <Layers size={13} /> },
    { id: 'tables',        label: 'Tables',        icon: <Table2 size={13} /> },
    { id: 'form_fields',   label: 'Form Fields',   icon: <FormInput size={13} /> },
    { id: 'system_fields', label: 'System Fields', icon: <Cpu size={13} /> },
    { id: 'view',          label: 'View',          icon: <LayoutTemplate size={13} /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      onClick={() => setShowDocTypeMenu(false)}
    >
      {/* ── Row 1: Title bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">

        {/* Close */}
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors flex-shrink-0"
          title="Close"
        >
          <X size={14} />
        </button>

        <div className="w-px h-4 bg-slate-300 flex-shrink-0" />

        {/* Doc name — inline editable */}
        <FileText size={13} className="text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={templateName}
          onChange={(e) => useDocumentStore.getState().setTemplateName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-semibold text-slate-800 bg-transparent border-none outline-none w-48 min-w-0 hover:bg-white focus:bg-white focus:ring-1 focus:ring-primary/40 rounded px-1.5 py-0.5 transition-colors"
          placeholder="Untitled document"
          title="Click to rename"
        />
        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}

        <div className="w-px h-4 bg-slate-300 flex-shrink-0" />

        {/* Doc type dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setShowDocTypeMenu((v) => !v); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold hover:bg-primary/20 transition-colors"
          >
            {docTypeLabel}
            <ChevronDown size={10} />
          </button>
          {showDocTypeMenu && (
            <div
              className="absolute top-8 left-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 min-w-[150px]"
              onClick={(e) => e.stopPropagation()}
            >
              {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    useDocumentStore.getState().setTemplateType(key as DocumentTemplate['templateType']);
                    setShowDocTypeMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    templateType === key
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Undo / Redo */}
          <button onClick={undo} disabled={!canUndo()} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Undo (⌘Z)">
            <Undo2 size={13} />
          </button>
          <button onClick={redo} disabled={!canRedo()} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Redo (⌘Y)">
            <Redo2 size={13} />
          </button>

          <div className="w-px h-4 bg-slate-300" />

          {/* Import */}
          <button
            onClick={() => setShowDocxImporter(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            title="Import DOCX"
          >
            <Upload size={12} /> Import
          </button>

          {/* Print */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            title="Print"
          >
            <Printer size={12} /> Print
          </button>

          {/* Download */}
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            title="Download PDF"
          >
            <Download size={12} /> Download
          </button>

          <div className="w-px h-4 bg-slate-300" />

          {/* Delete */}
          {templateId && (
            <button
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
              title="Delete document"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}

          {/* Publish to Library */}
          {isPlatformOwner && templateId && (
            <button
              onClick={() => setShowPublishModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors border border-slate-300"
            >
              <Library size={12} /> Publish
            </button>
          )}

          {/* Save */}
          <button
            onClick={() => void handleSave()}
            disabled={isSaving || (!isDirty && !!templateId)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${
              saveStatus === 'saved'
                ? 'bg-green-500 text-white'
                : saveStatus === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-primary text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
            title="Save (⌘S)"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : saveStatus === 'saved' ? <CheckCircle size={13} /> : saveStatus === 'error' ? <AlertCircle size={13} /> : <Save size={13} />}
            {isSaving ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Row 2: Ribbon tab strip ───────────────────────────────────────────── */}
      <div className="flex items-end gap-0 px-3 bg-white border-b border-slate-200 flex-shrink-0">
        {RIBBON_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        {/* Preview toggle — far right of ribbon */}
        <div className="flex-1" />
        <button
          onClick={() => useDocumentStore.getState().setMode('preview')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-b-2 border-transparent transition-colors mb-0"
        >
          <Eye size={13} /> Preview
        </button>
      </div>

      {/* ── Tab panels ───────────────────────────────────────────────────────── */}

      {/* FILE tab — settings, PDF output */}
      {activeTab === 'file' && (
        <div className="flex flex-1 overflow-hidden bg-slate-50">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-6 px-4">
              <DocumentPdfTab
                settings={pdfSettings}
                onChange={(next) => setPdfSettings(next)}
                templateName={templateName}
              />
            </div>
          </div>
        </div>
      )}

      {/* STRUCTURE tab — full-width block canvas */}
      {activeTab === 'structure' && (
        <div className="flex flex-1 overflow-hidden">
          <DocSidebar
            onImportDocx={() => setShowDocxImporter(true)}
            collapsed={leftCollapsed}
            onToggleCollapse={() => setLeftCollapsed((v) => !v)}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <StructurePanel />
          </div>
        </div>
      )}

      {/* TABLES tab */}
      {activeTab === 'tables' && (
        <RibbonPlaceholder
          icon={<Table2 size={32} className="text-slate-300" />}
          title="Tables"
          description="Insert and manage tables — coming soon."
        />
      )}

      {/* FORM FIELDS tab */}
      {activeTab === 'form_fields' && (
        <RibbonPlaceholder
          icon={<FormInput size={32} className="text-slate-300" />}
          title="Form Fields"
          description="Add input fields, checkboxes, signatures and dropdowns — coming soon."
        />
      )}

      {/* SYSTEM FIELDS tab */}
      {activeTab === 'system_fields' && (
        <RibbonPlaceholder
          icon={<Cpu size={32} className="text-slate-300" />}
          title="System Fields"
          description="Insert dynamic fields like job number, date, worker name, company — coming soon."
        />
      )}

      {/* VIEW tab */}
      {activeTab === 'view' && (
        <div className="flex flex-1 overflow-hidden bg-slate-50">
          <div className="max-w-xl mx-auto py-8 px-4 w-full">
            <h2 className="text-sm font-bold text-slate-700 mb-4">Layout &amp; Theme</h2>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
              <p className="text-xs text-slate-500">Page size, margins, fonts and colour theme for this document.</p>
              <DocumentPdfTab
                settings={pdfSettings}
                onChange={(next) => setPdfSettings(next)}
                templateName={templateName}
              />
            </div>
          </div>
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
            onSaveFirst={handleSaveFirst}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBlocksImporter && (
          <BlocksJsonImporter
            templateId={templateId}
            hasExistingBlocks={blocks.length > 0}
            onClose={() => setShowBlocksImporter(false)}
            onImported={handleDocxImported}
            onSaveFirst={handleSaveFirst}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPublishModal && templateId && (
          <PublishToLibraryModal
            templateId={templateId}
            templateName={templateName}
            onClose={() => setShowPublishModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function RibbonPlaceholder({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        {icon}
        <p className="text-sm font-semibold text-slate-500">{title}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
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
