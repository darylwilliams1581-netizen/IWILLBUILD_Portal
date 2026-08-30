/**
 * DazzaBuilderAssistant
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared AI assistant panel for Studio Document Builder and Forms Builder.
 *
 * Layout variants (driven by viewport):
 *   sidebar      — desktop: collapsible right sidebar, ~380px, builder resizes
 *   slide-over   — tablet: right-side slide-over panel
 *   bottom-sheet — mobile/Capacitor: bottom sheet with collapsed/half/full states
 *
 * Security: owner-only. Non-owners never see this component (checked via
 * usePermissions). All API calls enforce server-side owner auth.
 */
import {
  useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot, X, ChevronRight, ChevronLeft, Send, Square,
  Paperclip, Trash2, AlertCircle, ChevronUp, ChevronDown,
  FileText, ClipboardList, Loader2,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { useDazzaBuilderChat } from './useDazzaBuilderChat';
import PhaseIndicator from './PhaseIndicator';
import ProposedChangeCard from './ProposedChangeCard';
import VersionHistoryPanel from './VersionHistoryPanel';
import type { BuilderContext, PanelLayout, ChatMessage } from './types';

// ── Storage key for open/collapsed state ──────────────────────────────────────
const STORAGE_KEY = 'dazza-builder-panel-open';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  builderContext: BuilderContext;
  /** Called after Dazza successfully applies changes — builder should reload */
  onApplied?: (versionId: string, versionNumber: number) => void;
  /** Called when panel open state changes — builder adjusts its width */
  onOpenChange?: (open: boolean) => void;
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, onApply, onUndo, isApplying }: {
  msg: ChatMessage;
  onApply: (change: import('./types').ProposedChange) => void;
  onUndo: () => void;
  isApplying: boolean;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] ${isUser ? 'order-1' : 'order-2'}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
              <Bot size={9} className="text-white" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">Dazza</span>
          </div>
        )}
        {msg.content && (
          <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-violet-600 text-white rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm'
          }`}>
            {msg.content}
          </div>
        )}
        {msg.proposedChange && (
          <div className="mt-2">
            <ProposedChangeCard
              change={msg.proposedChange}
              onApply={onApply}
              onUndo={onUndo}
              isApplying={isApplying}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Context label ─────────────────────────────────────────────────────────────

function ContextLabel({ ctx }: { ctx: BuilderContext }) {
  const Icon = ctx.builderType === 'document' ? FileText : ClipboardList;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/60 border border-border/50 max-w-full overflow-hidden">
      <Icon size={11} className="text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground truncate">
        {ctx.templateId
          ? `${ctx.builderType === 'document' ? 'Doc' : 'Form'}: ${ctx.templateName || `#${ctx.templateId}`}`
          : `${ctx.builderType === 'document' ? 'Document' : 'Form'} Builder`}
      </span>
      {ctx.hasUnsavedChanges && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DazzaBuilderAssistant({ builderContext, onApplied, onOpenChange }: Props) {
  const { isPlatformOwner, loading: permLoading } = usePermissions();

  // Panel state
  const [isOpen, setIsOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const [layout, setLayout] = useState<PanelLayout>('sidebar');
  const [bottomSheetState, setBottomSheetState] = useState<'collapsed' | 'half' | 'full'>('collapsed');

  // Input
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending attachments (uploaded but not yet sent)
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ id: string; name: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    messages, phase, phaseLabel, pendingChange, isApplying,
    versions, error, sendMessage, stopStreaming, applyChange,
    undoChange, restoreVersion, clearConversation,
  } = useDazzaBuilderChat({ builderContext, onApplied });

  // Determine layout from viewport
  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w < 768) setLayout('bottom-sheet');
      else if (w < 1100) setLayout('slide-over');
      else setLayout('sidebar');
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Persist open state
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(isOpen)); } catch {}
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    if (layout === 'bottom-sheet') setBottomSheetState('half');
  }, [layout]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (layout === 'bottom-sheet') setBottomSheetState('collapsed');
  }, [layout]);

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;
    const ids = pendingAttachments.map(a => a.id);
    sendMessage(inputText, ids.length ? ids : undefined);
    setInputText('');
    setPendingAttachments([]);
    setUploadError(null);
  }, [inputText, pendingAttachments, sendMessage]);

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = '';
    setUploadError(null);

    // Client-side type guard — mirrors Stage 1 allowlist on the server
    const allowed = ['.txt', '.md', '.json'];
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!allowed.includes(ext)) {
      setUploadError(`"${file.name}" isn't supported. Attach a .txt, .md, or .json file.`);
      return;
    }

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await fetch('/api/dazza/attachments/upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok) {
        setUploadError(data.message ?? 'Upload failed');
        return;
      }
      setPendingAttachments(prev => [...prev, { id: data.attachmentId, name: data.safeFilename }]);
    } catch {
      setUploadError('Upload failed — please try again');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const isStreaming = phase === 'reading' || phase === 'planning';

  // Don't render for non-owners
  if (permLoading) return null;
  if (!isPlatformOwner) return null;

  // ── FAB (when closed) ──────────────────────────────────────────────────────
  if (!isOpen) {
    if (layout === 'bottom-sheet') {
      return (
        <button
          onClick={handleOpen}
          className="fixed bottom-20 right-4 z-[100] w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center safe-bottom"
          aria-label="Open Dazza Builder Assistant"
        >
          <Bot size={20} className="text-white" />
        </button>
      );
    }

    // Sidebar/slide-over: show a collapsed tab on the right edge
    return (
      <button
        onClick={handleOpen}
        className="fixed top-1/2 -translate-y-1/2 right-0 z-[100] flex flex-col items-center gap-1.5 px-1.5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-l-xl shadow-lg transition-colors"
        aria-label="Open Dazza Builder Assistant"
        style={{ writingMode: 'vertical-rl' }}
      >
        <Bot size={16} />
        <span className="text-[10px] font-bold tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          Dazza
        </span>
      </button>
    );
  }

  // ── Panel content ──────────────────────────────────────────────────────────
  const panelContent = (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shrink-0">
          <Bot size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground leading-none">Dazza</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Builder Assistant</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              title="Clear conversation"
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
          {layout === 'sidebar' ? (
            <button
              onClick={handleClose}
              title="Collapse panel"
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleClose}
              title="Close"
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Context label */}
      <div className="px-3 py-2 border-b border-border/50 shrink-0">
        <ContextLabel ctx={builderContext} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
              <Bot size={20} className="text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Dazza Builder Assistant</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                Ask me to create, edit or improve your {builderContext.builderType === 'document' ? 'document template' : 'form template'}.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
              {builderContext.builderType === 'document' ? (
                <>
                  <SuggestionChip text="Add a signature block" onSelect={t => { setInputText(t); inputRef.current?.focus(); }} />
                  <SuggestionChip text="Add a table with 3 columns" onSelect={t => { setInputText(t); inputRef.current?.focus(); }} />
                  <SuggestionChip text="Improve the PDF layout" onSelect={t => { setInputText(t); inputRef.current?.focus(); }} />
                </>
              ) : (
                <>
                  <SuggestionChip text="Add a required text field" onSelect={t => { setInputText(t); inputRef.current?.focus(); }} />
                  <SuggestionChip text="Add a photo upload field" onSelect={t => { setInputText(t); inputRef.current?.focus(); }} />
                  <SuggestionChip text="Add conditional visibility" onSelect={t => { setInputText(t); inputRef.current?.focus(); }} />
                </>
              )}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onApply={applyChange}
            onUndo={undoChange}
            isApplying={isApplying}
          />
        ))}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Phase indicator */}
      {phase !== 'idle' && (
        <div className="px-3 py-1.5 border-t border-border/50 shrink-0">
          <PhaseIndicator phase={phase} label={phaseLabel} />
        </div>
      )}

      {/* Version history */}
      <VersionHistoryPanel
        versions={versions}
        onRestore={restoreVersion}
        isRestoring={isApplying}
      />

      {/* Input area */}
      <div className="px-3 py-2.5 border-t border-border shrink-0">
        {/* Pending attachment chips */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingAttachments.map(att => (
              <div key={att.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-700 max-w-[180px]">
                <Paperclip size={10} className="shrink-0" />
                <span className="truncate">{att.name}</span>
                <button
                  onClick={() => setPendingAttachments(prev => prev.filter(a => a.id !== att.id))}
                  className="shrink-0 hover:text-red-500 transition-colors ml-0.5"
                  title="Remove attachment"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Upload error */}
        {uploadError && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-red-600">
            <AlertCircle size={11} />
            <span>{uploadError}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask Dazza to edit your ${builderContext.builderType === 'document' ? 'document' : 'form'}…`}
              rows={2}
              disabled={isStreaming || isApplying}
              className="w-full resize-none rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-colors disabled:opacity-50 max-h-32"
            />
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                title="Stop"
                className="w-8 h-8 rounded-xl bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isApplying}
                title="Send"
                className="w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
              >
                <Send size={13} />
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || pendingAttachments.length >= 4}
              title={isUploading ? 'Uploading…' : pendingAttachments.length >= 4 ? 'Max 4 attachments' : 'Attach reference file (.txt, .md, .json)'}
              className="w-8 h-8 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors disabled:opacity-40"
            >
              {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );

  // ── Sidebar layout ─────────────────────────────────────────────────────────
  if (layout === 'sidebar') {
    return (
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 380, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="h-full border-l border-border overflow-hidden shrink-0"
        style={{ width: 380 }}
        data-testid="dazza-builder-sidebar"
      >
        {panelContent}
      </motion.div>
    );
  }

  // ── Slide-over layout (tablet) ─────────────────────────────────────────────
  if (layout === 'slide-over') {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-[99] bg-black/20"
          onClick={handleClose}
          aria-hidden="true"
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.25, ease: 'easeOut' as const }}
          className="fixed top-0 right-0 bottom-0 z-[100] w-[380px] max-w-[90vw] shadow-2xl"
          data-testid="dazza-builder-slide-over"
        >
          {panelContent}
        </motion.div>
      </>
    );
  }

  // ── Bottom sheet layout (mobile/Capacitor) ─────────────────────────────────
  const sheetHeights: Record<string, string> = {
    collapsed: '0px',
    half: '50vh',
    full: '90vh',
  };

  return (
    <>
      {bottomSheetState !== 'collapsed' && (
        <div
          className="fixed inset-0 z-[99] bg-black/20"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}
      <motion.div
        animate={{ height: sheetHeights[bottomSheetState] }}
        transition={{ duration: 0.25, ease: 'easeOut' as const }}
        className="fixed bottom-0 left-0 right-0 z-[100] rounded-t-2xl shadow-2xl overflow-hidden safe-bottom"
        style={{ maxHeight: '90vh' }}
        data-testid="dazza-builder-bottom-sheet"
      >
        {/* Drag handle + height controls */}
        <div className="flex items-center justify-between px-4 py-2 bg-background border-b border-border shrink-0">
          <div className="w-8 h-1 rounded-full bg-border mx-auto" />
          <div className="flex items-center gap-2 absolute right-3">
            <button
              onClick={() => setBottomSheetState(s => s === 'full' ? 'half' : 'full')}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
            >
              {bottomSheetState === 'full' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            <button onClick={handleClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden" style={{ height: 'calc(100% - 40px)' }}>
          {panelContent}
        </div>
      </motion.div>
    </>
  );
}

// ── Suggestion chip ────────────────────────────────────────────────────────────

function SuggestionChip({ text, onSelect }: { text: string; onSelect: (t: string) => void }) {
  return (
    <button
      onClick={() => onSelect(text)}
      className="w-full text-left px-3 py-2 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {text}
    </button>
  );
}
