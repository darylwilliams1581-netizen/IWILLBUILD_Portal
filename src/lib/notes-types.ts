/**
 * Shared types for the Note Tagging & Tag Tasks system.
 * Used by both frontend components and API handlers.
 */

// ── Note types ────────────────────────────────────────────────────────────────

export type NoteType = 'note' | 'todo' | 'action';
export type NoteEntityType = 'job' | 'fleet';

export const NOTE_TYPE_META: Record<NoteType, { label: string; color: string; bg: string; border: string }> = {
  note:   { label: 'Note',   color: 'text-slate-600',  bg: 'bg-slate-50',   border: 'border-slate-200' },
  todo:   { label: 'Task',    color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'  },
  action: { label: 'Action', color: 'text-violet-800', bg: 'bg-violet-50',  border: 'border-violet-200'},
};

// ── Task urgency ──────────────────────────────────────────────────────────────

export type TaskUrgency = 'normal' | 'soon' | 'overdue' | 'today';

export function getTaskUrgency(dueDateIso: string | null | undefined): TaskUrgency {
  if (!dueDateIso) return 'normal';
  const due = new Date(dueDateIso);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'overdue';
  if (diffDays < 1) return 'today';
  if (diffDays <= 3) return 'soon';
  return 'normal';
}

export const URGENCY_META: Record<TaskUrgency, { label: string; dot: string; badge: string }> = {
  normal:  { label: '',        dot: 'bg-slate-300',   badge: '' },
  soon:    { label: 'Due soon',  dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  today:   { label: 'Due today', dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-800 border-violet-200' },
  overdue: { label: 'Overdue',   dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200' },
};

// ── API shapes ────────────────────────────────────────────────────────────────

export interface MentionedUser {
  userId: string;
  name: string;
}

export interface TagTask {
  id: number;
  noteId: number;
  entityType: NoteEntityType;
  entityId: number;
  entityLabel: string | null;
  noteType: NoteType;
  noteBody: string;
  createdByUserId: string;
  createdByName: string;
  assigneeUserId: string;
  assigneeName: string;
  status: 'open' | 'completed';
  dueDate: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  completedByName: string | null;
  createdAt: string;
  urgency?: TaskUrgency;
}

export interface NoteComment {
  id: number;
  noteId: number;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Note {
  id: number;
  entityType: NoteEntityType;
  entityId: number;
  entityLabel: string | null;
  noteType: NoteType;
  body: string;
  authorUserId: string;
  authorName: string;
  mentions: MentionedUser[];
  tasks: TagTask[];
  comments: NoteComment[];
  createdAt: string;
}

// ── Mention parsing ───────────────────────────────────────────────────────────

/** Extract @mention tokens from note body text */
export function parseMentions(body: string, members: MentionedUser[]): MentionedUser[] {
  const mentioned: MentionedUser[] = [];
  const seen = new Set<string>();
  // Match @Name (greedy word chars + spaces up to 40 chars)
  const regex = /@([\w][\w ]{0,38}[\w]|[\w]{1,40})/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    const token = m[1].trim().toLowerCase();
    const match = members.find((mb) => mb.name.toLowerCase() === token);
    if (match && !seen.has(match.userId)) {
      seen.add(match.userId);
      mentioned.push(match);
    }
  }
  return mentioned;
}

/** Replace @Name tokens with styled spans (for display) */
export function renderMentions(body: string): string {
  return body.replace(/@([\w][\w ]{0,38}[\w]|[\w]{1,40})/g, (match) => {
    return `<span class="mention-chip">${match}</span>`;
  });
}
