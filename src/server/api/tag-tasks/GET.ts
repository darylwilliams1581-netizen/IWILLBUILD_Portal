/**
 * GET /api/tag-tasks
 * Global filtered task list. Supports:
 *   ?mine=true           — only tasks assigned to the caller
 *   ?status=open|completed|all  (default: all)
 *   ?entityType=job|fleet
 *   ?entityId=123
 *   ?search=text
 *   ?page=1&limit=30
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth.js';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? '']));
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // Ensure table exists
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

    const mine = req.query.mine === 'true';
    const status = (req.query.status as string) ?? 'all';
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;
    const search = (req.query.search as string)?.trim() ?? '';
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const offset = (page - 1) * limit;

    const companyId = profile.companyId;
    const conditions: string[] = [`company_id = ${companyId}`];

    if (mine) conditions.push(`assignee_user_id = '${session.user.id.replace(/'/g, "''")}'`);
    if (status !== 'all') conditions.push(`status = '${status.replace(/'/g, "''")}'`);
    if (entityType) conditions.push(`entity_type = '${entityType.replace(/'/g, "''")}'`);
    if (entityId) conditions.push(`entity_id = ${entityId}`);
    if (search) {
      const s = search.replace(/'/g, "''");
      conditions.push(`(note_body LIKE '%${s}%' OR assignee_name LIKE '%${s}%' OR entity_label LIKE '%${s}%')`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) as total FROM note_tag_tasks ${where}`
    )) as unknown as [Array<{ total: number }>, unknown];
    const total = Array.isArray(countRows) && countRows[0] ? Number(countRows[0].total) : 0;

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM note_tag_tasks ${where}
       ORDER BY
         CASE status WHEN 'open' THEN 0 ELSE 1 END,
         CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END,
         due_date ASC, created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    )) as unknown as [Record<string, unknown>[], unknown];

    const safeRows: Record<string, unknown>[] = Array.isArray(rows) ? rows : [];

    const tasks = safeRows.map((t) => ({
      id: t.id, noteId: t.note_id, entityType: t.entity_type, entityId: t.entity_id,
      entityLabel: t.entity_label, noteType: t.note_type, noteBody: t.note_body,
      createdByUserId: t.created_by_user_id, createdByName: t.created_by_name,
      assigneeUserId: t.assignee_user_id, assigneeName: t.assignee_name,
      status: t.status, dueDate: t.due_date, completedAt: t.completed_at,
      completedByUserId: t.completed_by_user_id, completedByName: t.completed_by_name,
      createdAt: t.created_at,
    }));

    res.json({ tasks, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[GET /api/tag-tasks]', err);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
}
