/**
 * GET /api/notifications/alerts
 * Returns real-time alerts for the current user based on their permissions
 * and notification preferences. No fake data — all from the database.
 *
 * Alert types:
 *  - todo_overdue      — open to-dos past due date
 *  - todo_due_today    — open to-dos due today
 *  - fleet_service_due — fleet assets with service due within 14 days
 *  - fleet_rego_due    — fleet assets with rego expiry within 14 days
 *  - fleet_flag        — fleet prestarts with unresolved attention flags
 *  - form_completed    — form submissions completed in last 7 days
 *  - estimate_approved — estimates approved in last 7 days
 *
 * Query params:
 *  - unreadOnly=true  — only return unread alerts
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { DEFAULT_PREFS, type NotificationPrefs } from '../prefs/GET.js';

export interface Alert {
  id: string;          // deterministic: type_sourceId
  type: string;
  title: string;
  message: string;
  link?: string;
  createdAt: string;
  read: boolean;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const companyId = profile.companyId;
    const role = profile.role ?? 'worker';
    const isOwner = role === 'owner';
    const isAdmin = isOwner || role === 'admin' || profile.permAdmin === true;
    const canJobs       = isAdmin || profile.permJobs       !== false;
    const canFleet      = isAdmin || profile.permFleet      !== false;
    const canForms      = isAdmin || profile.permForms      !== false;
    const canEstimating = isAdmin || profile.permEstimating !== false;
    const seeDollars    = isAdmin || profile.permSeeDollars === true;

    // Load notification prefs
    let prefs: NotificationPrefs = { ...DEFAULT_PREFS };
    if (profile.notificationPrefs) {
      try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(profile.notificationPrefs) }; } catch { /* defaults */ }
    }

    // Load read alert IDs from profile (stored as JSON array in notificationPrefs.readIds)
    let readIds: Set<string> = new Set();
    if (profile.notificationPrefs) {
      try {
        const stored = JSON.parse(profile.notificationPrefs) as { readIds?: string[] };
        if (Array.isArray(stored.readIds)) readIds = new Set(stored.readIds);
      } catch { /* ignore */ }
    }

    if (!prefs.enabled) {
      return res.json({ alerts: [], unreadCount: 0 });
    }

    const alerts: Alert[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const in14  = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ago7  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    // ── Overdue to-dos ────────────────────────────────────────────────────────
    if (canJobs && prefs.todoOverdue) {
      const rows = await db.execute(
        sql`SELECT t.id, t.title, t.due_date, j.id as job_id, j.name as job_name
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${companyId}
              AND t.status = 'Open'
              AND t.due_date IS NOT NULL
              AND t.due_date < ${today}
            ORDER BY t.due_date ASC
            LIMIT 20`
      ) as unknown as Array<{ id: number; title: string; due_date: string; job_id: number; job_name: string }>;

      for (const r of rows) {
        const id = `todo_overdue_${r.id}`;
        alerts.push({
          id,
          type: 'todo_overdue',
          title: 'Overdue To-Do',
          message: `"${r.title}" on ${r.job_name} was due ${r.due_date}`,
          link: `/jobs/${r.job_id}?tab=todos`,
          createdAt: r.due_date,
          read: readIds.has(id),
        });
      }
    }

    // ── Due today to-dos ──────────────────────────────────────────────────────
    if (canJobs && prefs.todoDueToday) {
      const rows = await db.execute(
        sql`SELECT t.id, t.title, j.id as job_id, j.name as job_name
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${companyId}
              AND t.status = 'Open'
              AND t.due_date = ${today}
            ORDER BY t.id ASC
            LIMIT 20`
      ) as unknown as Array<{ id: number; title: string; job_id: number; job_name: string }>;

      for (const r of rows) {
        const id = `todo_today_${r.id}`;
        alerts.push({
          id,
          type: 'todo_due_today',
          title: 'Due Today',
          message: `"${r.title}" on ${r.job_name}`,
          link: `/jobs/${r.job_id}?tab=todos`,
          createdAt: today,
          read: readIds.has(id),
        });
      }
    }

    // ── Fleet service due ─────────────────────────────────────────────────────
    if (canFleet && prefs.fleetServiceDue) {
      const rows = await db.execute(
        sql`SELECT id, name, service_date
            FROM fleet_assets
            WHERE company_id = ${companyId}
              AND archived = 0
              AND service_date IS NOT NULL
              AND service_date <= ${in14}
            ORDER BY service_date ASC
            LIMIT 20`
      ) as unknown as Array<{ id: number; name: string; service_date: string }>;

      for (const r of rows) {
        const overdue = r.service_date < today;
        const id = `fleet_service_${r.id}`;
        alerts.push({
          id,
          type: 'fleet_service_due',
          title: overdue ? 'Service Overdue' : 'Service Due Soon',
          message: `${r.name} — service ${overdue ? 'was due' : 'due'} ${r.service_date}`,
          link: `/fleet/${r.id}`,
          createdAt: r.service_date,
          read: readIds.has(id),
        });
      }
    }

    // ── Fleet rego due ────────────────────────────────────────────────────────
    if (canFleet && prefs.fleetRegoDue) {
      const rows = await db.execute(
        sql`SELECT id, name, rego_expiry
            FROM fleet_assets
            WHERE company_id = ${companyId}
              AND archived = 0
              AND rego_not_applicable = 0
              AND rego_expiry IS NOT NULL
              AND rego_expiry <= ${in14}
            ORDER BY rego_expiry ASC
            LIMIT 20`
      ) as unknown as Array<{ id: number; name: string; rego_expiry: string }>;

      for (const r of rows) {
        const overdue = r.rego_expiry < today;
        const id = `fleet_rego_${r.id}`;
        alerts.push({
          id,
          type: 'fleet_rego_due',
          title: overdue ? 'Rego Expired' : 'Rego Expiring Soon',
          message: `${r.name} — rego ${overdue ? 'expired' : 'expires'} ${r.rego_expiry}`,
          link: `/fleet/${r.id}`,
          createdAt: r.rego_expiry,
          read: readIds.has(id),
        });
      }
    }

    // ── Fleet prestart flags ──────────────────────────────────────────────────
    if (canFleet && prefs.fleetPrestartFlag) {
      const rows = await db.execute(
        sql`SELECT fp.id, fp.issue_comment, fp.created_at, fa.id as asset_id, fa.name as asset_name
            FROM fleet_prestarts fp
            JOIN fleet_assets fa ON fa.id = fp.asset_id
            WHERE fa.company_id = ${companyId}
              AND fp.issue_needs_attention = 1
            ORDER BY fp.created_at DESC
            LIMIT 20`
      ) as unknown as Array<{ id: number; issue_comment: string; created_at: string; asset_id: number; asset_name: string }>;

      for (const r of rows) {
        const id = `fleet_flag_${r.id}`;
        alerts.push({
          id,
          type: 'fleet_flag',
          title: 'Fleet Attention Required',
          message: `${r.asset_name}: ${r.issue_comment ?? 'Prestart issue flagged'}`,
          link: `/fleet/${r.asset_id}`,
          createdAt: String(r.created_at),
          read: readIds.has(id),
        });
      }
    }

    // ── Forms completed (last 7 days) ─────────────────────────────────────────
    if (canForms && prefs.formCompleted) {
      const rows = await db.execute(
        sql`SELECT s.id, s.updated_at, ft.name as template_name, j.id as job_id, j.name as job_name
            FROM job_form_submissions s
            LEFT JOIN form_templates ft ON ft.id = s.template_id
            LEFT JOIN jobs j ON j.id = s.job_id
            WHERE s.company_id = ${companyId}
              AND s.status = 'completed'
              AND s.updated_at >= ${ago7}
            ORDER BY s.updated_at DESC
            LIMIT 20`
      ) as unknown as Array<{ id: number; updated_at: string; template_name: string; job_id: number; job_name: string }>;

      for (const r of rows) {
        const id = `form_completed_${r.id}`;
        alerts.push({
          id,
          type: 'form_completed',
          title: 'Form Completed',
          message: `${r.template_name ?? 'Form'} completed${r.job_name ? ` on ${r.job_name}` : ''}`,
          link: r.job_id ? `/jobs/${r.job_id}?tab=forms` : undefined,
          createdAt: String(r.updated_at),
          read: readIds.has(id),
        });
      }
    }

    // ── Estimates approved (last 7 days) ──────────────────────────────────────
    if (canEstimating && prefs.estimateApproved) {
      const rows = await db.execute(
        sql`SELECT e.id, e.title, e.updated_at, j.name as job_name
            FROM estimates e
            LEFT JOIN jobs j ON j.id = e.job_id
            WHERE e.company_id = ${companyId}
              AND e.status = 'approved'
              AND e.updated_at >= ${ago7}
            ORDER BY e.updated_at DESC
            LIMIT 20`
      ) as unknown as Array<{ id: number; title: string; updated_at: string; job_name: string }>;

      for (const r of rows) {
        const id = `estimate_approved_${r.id}`;
        alerts.push({
          id,
          type: 'estimate_approved',
          title: 'Estimate Approved',
          message: seeDollars
            ? `${r.title}${r.job_name ? ` — ${r.job_name}` : ''}`
            : `${r.title}${r.job_name ? ` — ${r.job_name}` : ''}`,
          link: `/estimates/${r.id}`,
          createdAt: String(r.updated_at),
          read: readIds.has(id),
        });
      }
    }

    // Sort: unread first, then by date desc
    alerts.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const unreadCount = alerts.filter((a) => !a.read).length;

    res.json({ alerts, unreadCount });
  } catch (error) {
    console.error('GET /api/notifications/alerts error:', error);
    res.status(500).json({ error: 'Failed to load alerts' });
  }
}
