/**
 * VersionHistoryPanel — shows Dazza-created version history with restore action.
 */
import { History, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { AssistantVersion } from './types';

interface Props {
  versions: AssistantVersion[];
  onRestore: (versionId: string) => void;
  isRestoring: boolean;
}

export default function VersionHistoryPanel({ versions, onRestore, isRestoring }: Props) {
  const [open, setOpen] = useState(false);

  if (versions.length === 0) return null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <History size={12} />
          Version history ({versions.length})
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="max-h-48 overflow-y-auto">
          {versions.map(v => (
            <div key={v.id} className="flex items-start gap-2 px-3 py-2 border-t border-border/50 hover:bg-muted/30 group">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  v{v.versionNumber} — {v.instructionSummary || 'No summary'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {v.operationsCount} op{v.operationsCount !== 1 ? 's' : ''} · {new Date(v.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => onRestore(v.id)}
                disabled={isRestoring}
                title="Restore this version"
                className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-30"
              >
                <RotateCcw size={10} />
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
