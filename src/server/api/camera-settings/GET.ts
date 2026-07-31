/**
 * GET /api/camera-settings
 * Returns the current user's camera settings (or defaults if not yet saved).
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

interface CameraSettingsRow {
  backup_to_roll: number;
  quality: string;
  notes_enabled: number;
  overlay_enabled: number;
  overlay_date_format: string;
  overlay_time_format: string;
  overlay_text_color: string;
  overlay_font_size: number;
}

const DEFAULTS = {
  backupToRoll: false,
  quality: 'high',
  notesEnabled: true,
  overlayEnabled: false,
  overlayDateFormat: 'dd MM yyyy',
  overlayTimeFormat: '24h',
  overlayTextColor: 'white',
  overlayFontSize: 12,
};

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

    const rows = await db.execute(sql`
      SELECT backup_to_roll, quality, notes_enabled, overlay_enabled,
             overlay_date_format, overlay_time_format, overlay_text_color, overlay_font_size
      FROM camera_settings
      WHERE company_id = ${profile.companyId} AND user_id = ${session.user.id}
      LIMIT 1
    `) as unknown as [CameraSettingsRow[], unknown];

    const row = rows[0]?.[0];
    if (!row) return res.json({ settings: DEFAULTS });

    return res.json({
      settings: {
        backupToRoll: row.backup_to_roll === 1,
        quality: row.quality ?? DEFAULTS.quality,
        notesEnabled: row.notes_enabled === 1,
        overlayEnabled: row.overlay_enabled === 1,
        overlayDateFormat: row.overlay_date_format ?? DEFAULTS.overlayDateFormat,
        overlayTimeFormat: row.overlay_time_format ?? DEFAULTS.overlayTimeFormat,
        overlayTextColor: row.overlay_text_color ?? DEFAULTS.overlayTextColor,
        overlayFontSize: row.overlay_font_size ?? DEFAULTS.overlayFontSize,
      },
    });
  } catch (e) {
    console.error('[camera-settings GET]', e);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
}
