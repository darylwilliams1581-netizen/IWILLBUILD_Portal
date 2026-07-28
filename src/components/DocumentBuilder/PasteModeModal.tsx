/**
 * PasteModeModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown when the user pastes content from Microsoft Word (or any rich source).
 * Mirrors Word's own "Paste Options" popup — three modes:
 *
 *   Keep Formatting   — preserve headings, bold, italic, underline, lists,
 *                       tables, alignment, and safe inline colours from Word.
 *   Match Studio Style — same structure but strip all colours / font sizes so
 *                        the document inherits the current Studio theme.
 *   Plain Text         — extract text only, no formatting at all.
 *
 * The modal is lightweight and keyboard-accessible (Escape to cancel,
 * 1/2/3 shortcuts, Enter confirms the focused option).
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ClipboardPaste, Paintbrush, Type, X } from 'lucide-react';
import type { PasteMode } from './pageEditorBridge';

interface Props {
  /** Whether the source looks like a Word document */
  isWord: boolean;
  onSelect: (mode: PasteMode) => void;
  onCancel: () => void;
}

const OPTIONS: {
  mode: PasteMode;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  shortcut: string;
}[] = [
  {
    mode: 'keep',
    icon: <ClipboardPaste size={20} />,
    label: 'Keep Formatting',
    sublabel: 'Preserve headings, bold, tables, colours and alignment from the source document.',
    shortcut: '1',
  },
  {
    mode: 'studio',
    icon: <Paintbrush size={20} />,
    label: 'Match Studio Style',
    sublabel: 'Keep structure (headings, lists, tables) but apply your Studio theme — colours and font sizes reset.',
    shortcut: '2',
  },
  {
    mode: 'plain',
    icon: <Type size={20} />,
    label: 'Plain Text',
    sublabel: 'Strip all formatting. Paste as plain paragraphs only.',
    shortcut: '3',
  },
];

export default function PasteModeModal({ isWord, onSelect, onCancel }: Props) {
  const [focused, setFocused] = useState<PasteMode>('keep');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key === '1') { onSelect('keep'); return; }
      if (e.key === '2') { onSelect('studio'); return; }
      if (e.key === '3') { onSelect('plain'); return; }
      if (e.key === 'Enter') { onSelect(focused); return; }
      if (e.key === 'ArrowDown') {
        setFocused((f) => {
          const idx = OPTIONS.findIndex((o) => o.mode === f);
          return OPTIONS[(idx + 1) % OPTIONS.length].mode;
        });
      }
      if (e.key === 'ArrowUp') {
        setFocused((f) => {
          const idx = OPTIONS.findIndex((o) => o.mode === f);
          return OPTIONS[(idx - 1 + OPTIONS.length) % OPTIONS.length].mode;
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, onSelect, onCancel]);

  // Focus trap
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div
        ref={dialogRef}
        tabIndex={-1}
        initial={{ scale: 0.96, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 6 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md outline-none overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Paste options"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">
              {isWord ? 'Paste from Word' : 'Paste options'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose how to paste your content
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Options */}
        <div className="p-3 flex flex-col gap-1.5">
          {OPTIONS.map(({ mode, icon, label, sublabel, shortcut }) => (
            <button
              key={mode}
              onClick={() => onSelect(mode)}
              onMouseEnter={() => setFocused(mode)}
              className={[
                'flex items-start gap-3.5 w-full text-left px-4 py-3.5 rounded-xl border transition-all',
                focused === mode
                  ? 'border-primary/50 bg-violet-50 shadow-sm'
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
              ].join(' ')}
            >
              {/* Icon */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                focused === mode ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'
              }`}>
                {icon}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${focused === mode ? 'text-primary' : 'text-slate-700'}`}>
                    {label}
                  </span>
                  <kbd className="text-[10px] font-mono bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded border border-slate-200">
                    {shortcut}
                  </kbd>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{sublabel}</p>
              </div>

              {/* Selected indicator */}
              {focused === mode && (
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
              )}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Press <kbd className="font-mono bg-slate-100 px-1 rounded">1</kbd> <kbd className="font-mono bg-slate-100 px-1 rounded">2</kbd> <kbd className="font-mono bg-slate-100 px-1 rounded">3</kbd> or click · <kbd className="font-mono bg-slate-100 px-1 rounded">Esc</kbd> to cancel
          </p>
          <button
            onClick={() => onSelect(focused)}
            className="px-4 py-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Paste
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
