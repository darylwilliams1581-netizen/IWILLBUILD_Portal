/**
 * GET /api/notes?entityType=job|fleet&entityId=123
 * Returns notes + tasks + comments for a job or fleet asset.
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth.js';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function ensureTables() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS entity_notes (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      company_id      INT          NOT NULL,
      entity_type     VARCHAR(20)  NOT NULL,
      entity_id       INT          NOT NULL,
      entity_label    VARCHAR(255),
      note_type       VARCHAR(20)  NOT NULL DEFAULT 'note',
      body            TEXT         NOT NULL,
      author_user_id  VARCHAR(255) NOT NULL,
      author_name     VARCHAR(255) NOT NULL DEFAULT '',
      mentions_json   TEXT         NOT NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS note_tag_tasks (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      company_id            INT          NOT NULL,
      note_id               INT          NOT NULL,
      entity_type           VARCHAR(20)  NOT NULL,
      entity_id             INT          NOT NULL,
      entity_label          VARCHAR(255),
      note_type             VARCHAR(20)  NOT NULL DEFAULT 'todo',
      note_body             TEXT         NOT NULL,
      created_by_user_id    VARCHAR(255) NOT NULL,
      created_by_name       VARCHAR(255) NOT NULL DEFAULT '',
      assignee_user_id      VARCHAR(255) NOT NULL,
      assignee_name         VARCHAR(255) NOT NULL DEFAULT '',
      status                VARCHAR(20)  NOT NULL DEFAULT 'open',
      due_date              VARCHAR(30),
      completed_at          DATETIME,
      completed_by_user_id  VARCHAR(255),
      completed_by_name     VARCHAR(255),
      created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS note_comments (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      note_id         INT          NOT NULL,
      company_id      INT          NOT NULL,
      author_user_id  VARCHAR(255) NOT NULL,
      author_name     VARCHAR(255) NOT NULL DEFAULT '',
      body            TEXT         NOT NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? '']));
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId required' });

    await ensureTables();

    const companyId = profile.companyId;
    const eType = String(entityType);
    const eId = Number(entityId);

    const [notesRows] = await db.execute(sql.raw(
      `SELECT * FROM entity_notes WHERE company_id=${companyId} AND entity_type='${eType}' AND entity_id=${eId} ORDER BY created_at DESC`
    )) as unknown as [Record<string, unknown>[], unknown];

    const notes: Record<string, unknown>[] = Array.isArray(notesRows) ? notesRows : [];
    const noteIds = notes.map((n) => n.id as number);

    let tasks: Record<string, unknown>[] = [];
    let comments: Record<string, unknown>[] = [];

    if (noteIds.length > 0) {
      const idList = noteIds.join(',');
      const [taskRows] = await db.execute(sql.raw(
        `SELECT * FROM note_tag_tasks WHERE note_id IN (${idList}) ORDER BY created_at DESC`
      )) as unknown as [Record<string, unknown>[], unknown];
      tasks = Array.isArray(taskRows) ? taskRows : [];

      const [commentRows] = await db.execute(sql.raw(
        `SELECT * FROM note_comments WHERE note_id IN (${idList}) ORDER BY created_at ASC`
      )) as unknown as [Record<string, unknown>[], unknown];
      comments = Array.isArray(commentRows) ? commentRows : [];
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
