/**
 * POST /api/notes/migrate
 * Idempotent — creates entity_notes, note_tag_tasks, note_comments tables.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    // ── entity_notes ─────────────────────────────────────────────────────────
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
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_entity_notes_entity  ON entity_notes(entity_type, entity_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_entity_notes_company ON entity_notes(company_id)`));

    // ── note_tag_tasks ────────────────────────────────────────────────────────
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
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_assignee ON note_tag_tasks(assignee_user_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_entity   ON note_tag_tasks(entity_type, entity_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_company  ON note_tag_tasks(company_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tag_tasks_status   ON note_tag_tasks(status)`));

    // ── note_comments ─────────────────────────────────────────────────────────
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
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_note_comments_note ON note_comments(note_id)`));

    res.json({ ok: true, message: 'Notes migration complete' });
  } catch (err) {
    console.error('[notes/migrate]', err);
    res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
}
