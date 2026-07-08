/**
 * GET /api/notes?entityType=job|fleet&entityId=123
 * Returns notes + tasks + comments for a job or fleet asset.
 */
import type { Request, Response } from 'express';
import { getDb } from '@/server/db/config.js';
import { getAuth } from '@/lib/auth/auth.js';
import { db as drizzleDb } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

async function ensureTables(rawDb: ReturnType<typeof getDb>) {
  await rawDb.run(`CREATE TABLE IF NOT EXISTS entity_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, entity_label TEXT,
    note_type TEXT NOT NULL DEFAULT 'note', body TEXT NOT NULL,
    author_user_id TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '',
    mentions_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await rawDb.run(`CREATE TABLE IF NOT EXISTS note_tag_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL,
    note_id INTEGER NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
    entity_label TEXT, note_type TEXT NOT NULL DEFAULT 'todo', note_body TEXT NOT NULL DEFAULT '',
    created_by_user_id TEXT NOT NULL, created_by_name TEXT NOT NULL DEFAULT '',
    assignee_user_id TEXT NOT NULL, assignee_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open', due_date TEXT,
    completed_at TEXT, completed_by_user_id TEXT, completed_by_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await rawDb.run(`CREATE TABLE IF NOT EXISTS note_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, note_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL, author_user_id TEXT NOT NULL,
    author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? '']));
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await drizzleDb.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId required' });

    const rawDb = getDb();
    await ensureTables(rawDb);

    const notes = await rawDb.all<Record<string, unknown>[]>(
      `SELECT * FROM entity_notes WHERE company_id=? AND entity_type=? AND entity_id=? ORDER BY created_at DESC`,
      [profile.companyId, entityType, Number(entityId)],
    );

    const noteIds = notes.map((n) => n.id as number);
    let tasks: Record<string, unknown>[] = [];
    let comments: Record<string, unknown>[] = [];

    if (noteIds.length > 0) {
      const placeholders = noteIds.map(() => '?').join(',');
      tasks = await rawDb.all<Record<string, unknown>[]>(
        `SELECT * FROM note_tag_tasks WHERE note_id IN (${placeholders}) ORDER BY created_at DESC`,
        noteIds,
      );
      comments = await rawDb.all<Record<string, unknown>[]>(
        `SELECT * FROM note_comments WHERE note_id IN (${placeholders}) ORDER BY created_at ASC`,
        noteIds,
      );
    }

    // Assemble notes with nested tasks + comments
    const assembled = notes.map((n) => ({
      id: n.id,
      entityType: n.entity_type,
      entityId: n.entity_id,
      entityLabel: n.entity_label,
      noteType: n.note_type,
      body: n.body,
      authorUserId: n.author_user_id,
      authorName: n.author_name,
      mentions: (() => { try { return JSON.parse(n.mentions_json as string); } catch { return []; } })(),
      createdAt: n.created_at,
      tasks: tasks
        .filter((t) => t.note_id === n.id)
        .map((t) => ({
          id: t.id, noteId: t.note_id, entityType: t.entity_type, entityId: t.entity_id,
          entityLabel: t.entity_label, noteType: t.note_type, noteBody: t.note_body,
          createdByUserId: t.created_by_user_id, createdByName: t.created_by_name,
          assigneeUserId: t.assignee_user_id, assigneeName: t.assignee_name,
          status: t.status, dueDate: t.due_date, completedAt: t.completed_at,
          completedByUserId: t.completed_by_user_id, completedByName: t.completed_by_name,
          createdAt: t.created_at,
        })),
      comments: comments
        .filter((c) => c.note_id === n.id)
        .map((c) => ({
          id: c.id, noteId: c.note_id, authorUserId: c.author_user_id,
          authorName: c.author_name, body: c.body, createdAt: c.created_at,
        })),
    }));

    res.json({ notes: assembled });
  } catch (err) {
    console.error('[GET /api/notes]', err);
    res.status(500).json({ error: 'Failed to load notes' });
  }
}
