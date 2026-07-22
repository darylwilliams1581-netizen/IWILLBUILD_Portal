/**
 * POST /api/notes
 * Create a note. If noteType is 'todo' or 'action' and mentions exist,
 * automatically creates a tag_task for each mentioned user.
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth.js';
import { db } from '../../db/client.js';
import { profiles, user } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { parseMentions } from '@/lib/notes-types.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? '']));
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // Get author name
    const authorUser = await db.query.user.findFirst({ where: eq(user.id, session.user.id) });
    const authorName = authorUser?.name ?? session.user.email ?? 'Unknown';

    const { entityType, entityId, entityLabel, noteType, body, dueDate } = req.body as {
      entityType: string;
      entityId: number;
      entityLabel?: string;
      noteType: string;
      body: string;
      dueDate?: string;
    };

    if (!entityType || !entityId || !body?.trim()) {
      return res.status(400).json({ error: 'entityType, entityId and body are required' });
    }
    if (!['job', 'fleet'].includes(entityType)) return res.status(400).json({ error: 'Invalid entityType' });
    if (!['note', 'todo', 'action'].includes(noteType ?? 'note')) return res.status(400).json({ error: 'Invalid noteType' });

    // Fetch all company members for mention resolution
    const memberRows = await db
      .select({ userId: profiles.userId, name: user.name })
      .from(profiles)
      .innerJoin(user, eq(profiles.userId, user.id))
      .where(eq(profiles.companyId, profile.companyId));

    const members = memberRows.map((r) => ({ userId: r.userId, name: r.name ?? 'Unknown' }));
    const mentions = parseMentions(body, members);

    const companyId = profile.companyId;
    const eType = entityType.replace(/'/g, "''");
    const eId = Number(entityId);
    const eLabel = entityLabel ? `'${entityLabel.replace(/'/g, "''")}'` : 'NULL';
    const nType = (noteType ?? 'note').replace(/'/g, "''");
    const bodyEsc = body.trim().replace(/'/g, "''");
    const authorIdEsc = session.user.id.replace(/'/g, "''");
    const authorNameEsc = authorName.replace(/'/g, "''");
    const mentionsJson = JSON.stringify(mentions).replace(/'/g, "''");

    // Insert note
    const [insertResult] = await db.execute(sql.raw(
      `INSERT INTO entity_notes (company_id, entity_type, entity_id, entity_label, note_type, body, author_user_id, author_name, mentions_json)
       VALUES (${companyId}, '${eType}', ${eId}, ${eLabel}, '${nType}', '${bodyEsc}', '${authorIdEsc}', '${authorNameEsc}', '${mentionsJson}')`
    )) as unknown as [{ insertId?: number }, unknown];

    const noteId = (insertResult as { insertId?: number })?.insertId ?? 0;

    // Create tag tasks for each mentioned user (only for todo/action types)
    const createdTasks: Record<string, unknown>[] = [];
    if ((noteType === 'todo' || noteType === 'action') && mentions.length > 0) {
      for (const mention of mentions) {
        const assigneeIdEsc = mention.userId.replace(/'/g, "''");
        const assigneeNameEsc = mention.name.replace(/'/g, "''");
        const dueDateVal = dueDate ? `'${dueDate}'` : 'NULL';

        const [taskResult] = await db.execute(sql.raw(
          `INSERT INTO note_tag_tasks
             (company_id, note_id, entity_type, entity_id, entity_label, note_type, note_body,
              created_by_user_id, created_by_name, assignee_user_id, assignee_name, status, due_date)
           VALUES (${companyId}, ${noteId}, '${eType}', ${eId}, ${eLabel}, '${nType}', '${bodyEsc}',
                   '${authorIdEsc}', '${authorNameEsc}', '${assigneeIdEsc}', '${assigneeNameEsc}', 'open', ${dueDateVal})`
        )) as unknown as [{ insertId?: number }, unknown];

        const taskId = (taskResult as { insertId?: number })?.insertId ?? 0;
        createdTasks.push({
          id: taskId, noteId, entityType, entityId, entityLabel: entityLabel ?? null,
          noteType, noteBody: body.trim(),
          createdByUserId: session.user.id, createdByName: authorName,
          assigneeUserId: mention.userId, assigneeName: mention.name,
          status: 'open', dueDate: dueDate ?? null,
          completedAt: null, completedByUserId: null, completedByName: null,
          createdAt: new Date().toISOString(),
        });
      }
    }

    res.status(201).json({
      note: {
        id: noteId, entityType, entityId, entityLabel: entityLabel ?? null,
        noteType: noteType ?? 'note', body: body.trim(),
        authorUserId: session.user.id, authorName,
        mentions, tasks: createdTasks, comments: [],
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[POST /api/notes]', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
}
