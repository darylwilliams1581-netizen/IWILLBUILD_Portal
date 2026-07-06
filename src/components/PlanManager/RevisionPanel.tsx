/**
 * RevisionPanel — shows revision history, save/new revision/lock controls, and audit log.
 */
import React, { useState } from 'react';
import { GitBranch, Lock, Save, Plus, ChevronDown, ChevronUp, Clock, User } from 'lucide-react';
import type { DrawingRevision } from './types';

interface AuditEntry {
  id: number;
  actor_id: string;
  action: string;
  details_json: string;
  created_at: string;
}

interface Props {
  drawingId: number;
  revisions: DrawingRevision[];
  auditLog: AuditEntry[];
  currentRevisionId?: number;
  isDirty: boolean;
  saving: boolean;
  isLocked: boolean;
  onSave: () => void;
  onNewRevision: (name?: string) => void;
  onLock: (revisionId: number) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    created: 'Drawing created',
    pdf_uploaded: 'PDF uploaded',
    annotations_saved: 'Annotations saved',
    new_revision: 'New revision created',
    revision_locked: 'Revision locked',
    share_created: 'Share link created',
    archived: 'Drawing archived',
    restored: 'Drawing restored',
  };
  return map[action] ?? action;
}

export default function RevisionPanel({
  drawingId, revisions, auditLog, currentRevisionId, isDirty, saving, isLocked,
  onSave, onNewRevision, onLock,
}: Props) {
  const [showNewRevModal, setShowNewRevModal] = useState(false);
  const [newRevName, setNewRevName] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const currentRev = revisions.find(r => r.id === currentRevisionId);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 w-64 flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-orange-400" />
          <span className="text-sm font-semibold text-slate-200">Revisions</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Save controls */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onSave}
            disabled={!isDirty || saving || isLocked}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={13} />
            {saving ? 'Saving…' : 'Save Annotations'}
          </button>
          <button
            onClick={() => setShowNewRevModal(true)}
            disabled={isLocked}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-slate-600 text-slate-300 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={13} />
            Save as New Revision
          </button>
        </div>

        {/* Current revision badge */}
        {currentRev && (
          <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-300">Current</span>
              {currentRev.locked && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full border border-amber-400/20">
                  <Lock size={9} /> Locked
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-slate-100">{currentRev.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">Rev {currentRev.revision_no}</p>
            {!currentRev.locked && (
              <button
                onClick={() => onLock(currentRev.id)}
                className="mt-2 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Lock size={11} /> Finalize & Lock
              </button>
            )}
          </div>
        )}

        {/* Revision list */}
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">History</p>
          {revisions.map(rev => (
            <div
              key={rev.id}
              className={[
                'rounded-lg px-3 py-2 border transition-colors',
                rev.id === currentRevisionId
                  ? 'border-orange-500/40 bg-orange-500/5'
                  : 'border-slate-700/50 bg-slate-800/50',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">{rev.name}</span>
                {rev.locked && <Lock size={10} className="text-amber-400 flex-shrink-0" />}
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Rev {rev.revision_no}</p>
              {rev.created_at && (
                <p className="text-[10px] text-slate-600 mt-0.5">{formatDate(rev.created_at)}</p>
              )}
            </div>
          ))}
        </div>

        {/* Audit log toggle */}
        <button
          onClick={() => setShowAudit(s => !s)}
          className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors px-1"
        >
          <span className="flex items-center gap-1.5"><Clock size={12} /> Audit Log</span>
          {showAudit ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showAudit && (
          <div className="flex flex-col gap-1.5">
            {auditLog.slice(0, 20).map(entry => (
              <div key={entry.id} className="flex flex-col gap-0.5 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40">
                <span className="text-[11px] font-medium text-slate-300">{actionLabel(entry.action)}</span>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <User size={9} />
                  <span className="truncate">{entry.actor_id.slice(0, 8)}…</span>
                  <span>·</span>
                  <span>{formatDate(entry.created_at)}</span>
                </div>
              </div>
            ))}
            {auditLog.length === 0 && (
              <p className="text-[11px] text-slate-600 px-2">No audit entries yet.</p>
            )}
          </div>
        )}
      </div>

      {/* New revision modal */}
      {showNewRevModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-72 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 mb-3">Save as New Revision</h3>
            <input
              autoFocus
              type="text"
              placeholder="Revision name (e.g. Rev 2 — Client Changes)"
              value={newRevName}
              onChange={e => setNewRevName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowNewRevModal(false); setNewRevName(''); }}
                className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onNewRevision(newRevName || undefined);
                  setShowNewRevModal(false);
                  setNewRevName('');
                }}
                className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
