/**
 * Smart Document Builder — Main Orchestrator
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen modal that wraps the entire builder experience:
 * - Top toolbar (mode switcher, save, undo/redo, close)
 * - Left: BlockLibrarySidebar
 * - Centre: BlockCanvas
 * - Right: BlockInspector
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Save, Undo2, Redo2, Eye, Edit3, Loader2, CheckCircle,
  AlertCircle, FileText, FileOutput,
} from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import BlockCanvas from './BlockCanvas';
import BlockLibrarySidebar from './BlockLibrarySidebar';
import BlockInspector from './BlockInspector';
import DocxImporter from './DocxImporter';
import DocumentPdfTab from './DocumentPdfTab';
import type { DocumentTemplate, DocumentBlock, BuilderTab, TemplatePdfSettings } from './types';
import { DEFAULT_TEMPLATE_PDF_SETTINGS } from './types';

interface Props {
  /** Pass an existing template to edit, or null to create new */
  template?: DocumentTemplate | null;
  onClose: () => void;
  onSaved?: (id: number) => void;
}

export default function DocumentBuilder({ template, onClose, onSaved }: Props) {
  const {
    mode, setMode, isDirty, isSaving, setIsSaving, markSaved,
    loadTemplate, resetToBlank, getSerialised, templateId, templateName,
    undo, redo, canUndo, canRedo, reorderBlocks, prependBlocks, appendBlocks, blocks,
  } = useDocumentStore();

  const [showDocxImporter, setShowDocxImporter] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<BuilderTab>('content');
  const [pdfSettings, setPdfSettings] = useState<TemplatePdfSettings>(
    template?.pdfSettings ?? { ...DEFAULT_TEMPLATE_PDF_SETTINGS }
  );

  // Load template on mount
  useEffect(() => {
    if (template) {
      loadTemplate(template);
      setPdfSettings({ ...DEFAULT_TEMPLATE_PDF_SETTINGS, ...(template.pdfSettings ?? {}) });
    } else {
      resetToBlank();
      setPdfSettings({ ...DEFAULT_TEMPLATE_PDF_SETTINGS });
    }
  }, [template?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/document-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
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

  const handleDocxImported = (importedBlocks: DocumentBlock[], _docxName: string, insertMode: 'replace' | 'prepend' | 'append') => {
    if (insertMode === 'prepend') {
      prependBlocks(importedBlocks);
    } else if (insertMode === 'append') {
      appendBlocks(importedBlocks);
    } else {
      reorderBlocks(importedBlocks);
    }
  };

  /** Auto-save before DOCX import when templateId is null. Returns the saved id or null on failure. */
  const handleSaveFirst = useCallback(async (): Promise<number | null> => {
    // Always read live state — never rely on closure values which may be stale
    const liveId = useDocumentStore.getState().templateId;
    if (liveId) return liveId;

    // If a save is already in flight, wait for it to finish (up to 8 s) then return the id
    if (useDocumentStore.getState().isSaving) {
      const start = Date.now();
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (!useDocumentStore.getState().isSaving || Date.now() - start > 8000) {
            clearInterval(check);
            resolve();
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white shadow-sm flex-shrink-0">
        {/* Left: close + title */}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Close builder"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{templateName}</span>
          {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}
        </div>

        {/* ── Tab switcher ─────────────────────────────────────────────────── */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5 ml-3">
          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'content' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Edit3 size={11} /> Content
          </button>
          <button
            onClick={() => setActiveTab('pdf_output')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'pdf_output' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileOutput size={11} /> PDF Output
          </button>
        </div>

        <div className="flex-1" />

        {/* Undo / redo — only shown in content tab */}
        {activeTab === 'content' && (
          <>
            <button
              onClick={undo}
              disabled={!canUndo()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (⌘Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (⌘Y)"
            >
              <Redo2 size={14} />
            </button>

            {/* Mode switcher */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {(['edit', 'preview', 'fill'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize ${
                    mode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m === 'edit' ? <><Edit3 size={11} className="inline mr-1" />Edit</> : m === 'preview' ? <><Eye size={11} className="inline mr-1" />Preview</> : 'Fill'}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving || (!isDirty && !!templateId && activeTab === 'content')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            saveStatus === 'saved' ? 'bg-green-500 text-white' :
            saveStatus === 'error' ? 'bg-red-500 text-white' :
            'bg-primary text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
          title="Save (⌘S)"
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> :
           saveStatus === 'saved' ? <CheckCircle size={13} /> :
           saveStatus === 'error' ? <AlertCircle size={13} /> :
           <Save size={13} />}
          {isSaving ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
        </button>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────────── */}
      {activeTab === 'content' ? (
        <div className="flex flex-1 overflow-hidden">
          <BlockLibrarySidebar onImportDocx={() => setShowDocxImporter(true)} />
          <BlockCanvas />
          <BlockInspector />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden bg-slate-50">
          {/* PDF Output tab — centred scrollable panel */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-6 px-4">
              <DocumentPdfTab
                settings={pdfSettings}
                onChange={(next) => { setPdfSettings(next); }}
                templateName={templateName}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── DOCX Importer modal ───────────────────────────────────────────────── */}
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
    </div>
  );
}
