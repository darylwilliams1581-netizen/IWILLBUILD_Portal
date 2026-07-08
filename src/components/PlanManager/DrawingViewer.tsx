/**
 * DrawingViewer — full-screen viewer shell combining PdfViewer, AnnotationToolbar,
 * RevisionPanel, and ShareModal for a single drawing.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Share2, Upload, AlertCircle, Loader2, Lock } from 'lucide-react';
import PdfViewer from './PdfViewer';
import AnnotationToolbar from './AnnotationToolbar';
import RevisionPanel from './RevisionPanel';
import ShareModal from './ShareModal';
import type { ToolType, AnnotationStyle } from './types';
import type { DrawingDetail } from './usePlanManager';
import type { usePlanManager } from './usePlanManager';

type PlanManagerHook = ReturnType<typeof usePlanManager>;

interface Props {
  detail: DrawingDetail;
  hook: PlanManagerHook;
  onClose: () => void;
}

const DEFAULT_STYLE: AnnotationStyle = {
  color: '#ef4444',
  strokeWidth: 2,
  opacity: 1,
  fontSize: 14,
  fontWeight: 'normal',
  fillColor: 'none',
  fillOpacity: 0.15,
};

export default function DrawingViewer({ detail, hook, onClose }: Props) {
  const { state, loadPageAnnotations, setPageAnnotations, saveAnnotations,
    setPage, setScale, rotate, setFitWidth, setTotalPages,
    uploadPdf, createRevision, lockRevision, createShareToken } = hook;

  const { viewer, annotations, dirtyPages, saving, uploading } = state;
  const { drawing, revisions, auditLog } = detail;

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeStyle, setActiveStyle] = useState<AnnotationStyle>(DEFAULT_STYLE);
  const [showShare, setShowShare] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isLocked = Boolean(
    revisions.find(r => r.id === drawing.current_revision_id)?.locked
  );

  // Load annotations for current page when page changes
  useEffect(() => {
    if (!drawing.id || !drawing.current_revision_id) return;
    if (!annotations.has(viewer.currentPage)) {
      loadPageAnnotations(drawing.id, viewer.currentPage, drawing.current_revision_id);
    }
  }, [drawing.id, drawing.current_revision_id, viewer.currentPage, annotations, loadPageAnnotations]);

  const handleStyleChange = useCallback((partial: Partial<AnnotationStyle>) => {
    setActiveStyle(s => ({ ...s, ...partial }));
  }, []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const result = await uploadPdf(drawing.id, file);
    if ('error' in result) {
      setUploadError(result.error);
    } else {
      // Reload drawing detail to get new source_file_path
      await hook.loadDrawing(drawing.id);
    }
    e.target.value = '';
  }, [drawing.id, uploadPdf, hook]);

  const handleNewRevision = useCallback(async (name?: string) => {
    await createRevision(drawing.id, name);
  }, [drawing.id, createRevision]);

  const handleLock = useCallback(async (revisionId: number) => {
    await lockRevision(drawing.id, revisionId);
  }, [drawing.id, lockRevision]);

  const hasPdf = Boolean(drawing.source_file_path);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-slate-100 truncate max-w-[240px]">{drawing.title}</span>
          {drawing.revision_name && (
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              {drawing.revision_name}
            </span>
          )}
          {isLocked && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
              <Lock size={9} /> Locked
            </span>
          )}
          {dirtyPages.size > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />
          )}
        </div>

        <div className="flex-1" />

        {/* Upload PDF */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-xs font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {hasPdf ? 'Replace PDF' : 'Upload PDF'}
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />

        {/* Share */}
        <button
          onClick={() => setShowShare(true)}
          disabled={!hasPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Share2 size={13} /> Share
        </button>
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-900/40 border-b border-red-700/40 text-xs text-red-300">
          <AlertCircle size={13} /> {uploadError}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Annotation toolbar (left) */}
        <div className="flex-shrink-0 p-2 bg-slate-900 border-r border-slate-700 flex items-start">
          <AnnotationToolbar
            activeTool={activeTool}
            activeStyle={activeStyle}
            isLocked={isLocked}
            onToolChange={setActiveTool}
            onStyleChange={handleStyleChange}
          />
        </div>

        {/* PDF viewer (center) */}
        {hasPdf ? (
          <PdfViewer
            fileUrl={drawing.source_file_path!}
            currentPage={viewer.currentPage}
            totalPages={viewer.totalPages}
            scale={viewer.scale}
            rotation={viewer.rotation}
            fitWidth={viewer.fitWidth}
            activeTool={activeTool}
            activeStyle={activeStyle}
            isLocked={isLocked}
            annotations={annotations}
            onPageChange={setPage}
            onScaleChange={setScale}
            onRotate={rotate}
            onFitWidth={setFitWidth}
            onTotalPages={setTotalPages}
            onAnnotationsChange={setPageAnnotations}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
            <Upload size={40} className="text-slate-600" />
            <p className="text-sm font-semibold text-slate-400">No PDF uploaded yet</p>
            <p className="text-xs text-slate-600">Click "Upload PDF" to add a drawing file</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              Upload PDF
            </button>
          </div>
        )}

        {/* Revision panel (right) */}
        <RevisionPanel
          drawingId={drawing.id}
          revisions={revisions}
          auditLog={auditLog}
          currentRevisionId={drawing.current_revision_id}
          isDirty={dirtyPages.size > 0}
          saving={saving}
          isLocked={isLocked}
          onSave={saveAnnotations}
          onNewRevision={handleNewRevision}
          onLock={handleLock}
        />
      </div>

      {/* Share modal */}
      {showShare && (
        <ShareModal
          drawingId={drawing.id}
          drawingTitle={drawing.title}
          revisionId={drawing.current_revision_id}
          onClose={() => setShowShare(false)}
          onGenerate={createShareToken}
        />
      )}
    </div>
  );
}
