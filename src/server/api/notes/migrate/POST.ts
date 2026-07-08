/**
 * POST /api/notes/migrate
 * Idempotent — creates entity_notes, note_tag_tasks, note_comments tables.
 */
import type { Request, Response } from 'express';
import { getDb } from '@/server/db/config.js';

export default async function handler(_req: Request, res: Response) {
  try {
    const db = getDb();

    // ── entity_notes ─────────────────────────────────────────────────────────
    await db.run(`
      CREATE TABLE IF NOT EXISTS entity_notes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id      INTEGER NOT NULL,
        entity_type     TEXT    NOT NULL CHECK(entity_type IN ('job','fleet')),
        entity_id       INTEGER NOT NULL,
        entity_label    TEXT,
        note_type       TEXT    NOT NULL DEFAULT 'note' CHECK(note_type IN ('note','todo','action')),
        body            TEXT    NOT NULL,
        author_user_id  TEXT    NOT NULL,
        author_name     TEXT    NOT NULL DEFAULT '',
        mentions_json   TEXT    NOT NULL DEFAULT '[]',
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_entity_notes_entity ON entity_notes(entity_type, entity_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_entity_notes_company ON entity_notes(company_id)`);

    // ── note_tag_tasks ────────────────────────────────────────────────────────
    await db.run(`
      CREATE TABLE IF NOT EXISTS note_tag_tasks (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id            INTEGER NOT NULL,
        note_id               INTEGER NOT NULL REFERENCES entity_notes(id) ON DELETE CASCADE,
        entity_type           TEXT    NOT NULL,
        entity_id             INTEGER NOT NULL,
        entity_label          TEXT,
        note_type             TEXT    NOT NULL DEFAULT 'todo',
        note_body             TEXT    NOT NULL DEFAULT '',
        created_by_user_id    TEXT    NOT NULL,
        created_by_name       TEXT    NOT NULL DEFAULT '',
        assignee_user_id      TEXT    NOT NULL,
        assignee_name         TEXT    NOT NULL DEFAULT '',
        status                TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),
        due_date              TEXT,
        completed_at          TEXT,
        completed_by_user_id  TEXT,
        completed_by_name     TEXT,
        created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_assignee ON note_tag_tasks(assignee_user_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_entity   ON note_tag_tasks(entity_type, entity_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_company  ON note_tag_tasks(company_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_status   ON note_tag_tasks(status)`);

    // ── note_comments ─────────────────────────────────────────────────────────
    await db.run(`
      CREATE TABLE IF NOT EXISTS note_comments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id         INTEGER NOT NULL REFERENCES entity_notes(id) ON DELETE CASCADE,
        company_id      INTEGER NOT NULL,
        author_user_id  TEXT    NOT NULL,
        author_name     TEXT    NOT NULL DEFAULT '',
        body            TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_note_comments_note ON note_comments(note_id)`);

    res.json({ ok: true, message: 'Notes migration complete' });
  } catch (err) {
    console.error('[notes/migrate]', err);
    res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
}
