/**
 * PUT /api/camera-settings
 * Upserts the current user's camera settings.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

interface SettingsBody {
  backupToRoll?: boolean;
  quality?: string;
  notesEnabled?: boolean;
  overlayEnabled?: boolean;
  overlayDateFormat?: string;
  overlayTimeFormat?: string;
  overlayTextColor?: string;
  overlayFontSize?: number;
}

const VALID_QUALITY    = ['low', 'medium', 'high'];
const VALID_DATE_FMT   = ['dd MM yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'];
const VALID_TIME_FMT   = ['24h', '12h'];
const VALID_COLOR      = ['white', 'black'];
const VALID_FONT_SIZE  = [10, 12, 14, 16];

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

    const body = req.body as SettingsBody;

    const backupToRoll   = body.backupToRoll   === true ? 1 : 0;
    const quality        = VALID_QUALITY.includes(body.quality ?? '')    ? body.quality!        : 'high';
    const notesEnabled   = body.notesEnabled   === false ? 0 : 1;
    const overlayEnabled = body.overlayEnabled === true  ? 1 : 0;
    const overlayDateFmt = VALID_DATE_FMT.includes(body.overlayDateFormat ?? '') ? body.overlayDateFormat! : 'dd MM yyyy';
    const overlayTimeFmt = VALID_TIME_FMT.includes(body.overlayTimeFormat ?? '') ? body.overlayTimeFormat! : '24h';
    const overlayColor   = VALID_COLOR.includes(body.overlayTextColor ?? '')     ? body.overlayTextColor!  : 'white';
    const overlaySize    = VALID_FONT_SIZE.includes(body.overlayFontSize ?? 0)   ? body.overlayFontSize!   : 12;

    await db.execute(sql`
      INSERT INTO camera_settings
        (company_id, user_id, backup_to_roll, quality, notes_enabled,
         overlay_enabled, overlay_date_format, overlay_time_format,
         overlay_text_color, overlay_font_size)
      VALUES
        (${profile.companyId}, ${session.user.id}, ${backupToRoll}, ${quality}, ${notesEnabled},
         ${overlayEnabled}, ${overlayDateFmt}, ${overlayTimeFmt}, ${overlayColor}, ${overlaySize})
      ON DUPLICATE KEY UPDATE
        backup_to_roll      = VALUES(backup_to_roll),
        quality             = VALUES(quality),
        notes_enabled       = VALUES(notes_enabled),
        overlay_enabled     = VALUES(overlay_enabled),
        overlay_date_format = VALUES(overlay_date_format),
        overlay_time_format = VALUES(overlay_time_format),
        overlay_text_color  = VALUES(overlay_text_color),
        overlay_font_size   = VALUES(overlay_font_size),
        updated_at          = NOW()
    `);

    return res.json({ ok: true });
  } catch (e) {
    console.error('[camera-settings PUT]', e);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
}
