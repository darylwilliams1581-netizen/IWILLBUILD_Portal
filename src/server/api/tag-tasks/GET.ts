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
import { getDb } from '@/server/db/config.js';
import { getAuth } from '@/lib/auth/auth.js';
import { db as drizzleDb } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? '']));
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await drizzleDb.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const rawDb = getDb();

    // Ensure table exists
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

    const mine = req.query.mine === 'true';
    const status = (req.query.status as string) ?? 'all';
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;
    const search = (req.query.search as string)?.trim() ?? '';
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['company_id = ?'];
    const params: (string | number)[] = [profile.companyId];

    if (mine) { conditions.push('assignee_user_id = ?'); params.push(session.user.id); }
    if (status !== 'all') { conditions.push('status = ?'); params.push(status); }
    if (entityType) { conditions.push('entity_type = ?'); params.push(entityType); }
    if (entityId) { conditions.push('entity_id = ?'); params.push(entityId); }
    if (search) {
      conditions.push('(note_body LIKE ? OR assignee_name LIKE ? OR entity_label LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRow = await rawDb.get<{ total: number }>(
      `SELECT COUNT(*) as total FROM note_tag_tasks ${where}`, params,
    );
    const total = countRow?.total ?? 0;

    const rows = await rawDb.all<Record<string, unknown>[]>(
      `SELECT * FROM note_tag_tasks ${where} ORDER BY
         CASE status WHEN 'open' THEN 0 ELSE 1 END,
         CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END,
         due_date ASC, created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const tasks = rows.map((t) => ({
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
