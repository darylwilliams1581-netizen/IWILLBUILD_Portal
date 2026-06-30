/**
 * POST /api/share-links
 * Create a new secure share link.
 * Returns the raw token ONCE — never stored in DB.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateShareToken, hashToken } from '../../lib/share-tokens.js';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader } from 'mysql2';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const {
      link_type,
      target_type,
      target_id,
      title,
      permissions,   // string[] e.g. ['upload','download']
      metadata,      // object
      expires_at,    // ISO string or null
      password,      // plain text — will be hashed
      max_uses,
      allowed_file_types,  // string[] e.g. ['pdf','jpg']
      max_file_size_mb,    // number
    } = req.body as {
      link_type: string;
      target_type: string;
      target_id: string;
      title: string;
      permissions: string[];
      metadata?: Record<string, unknown>;
      expires_at?: string | null;
      password?: string;
      max_uses?: number | null;
      allowed_file_types?: string[];
      max_file_size_mb?: number;
    };

    if (!link_type || !target_type || !target_id || !title) {
      return res.status(400).json({ error: 'link_type, target_type, target_id and title are required' });
    }

    const rawToken = generateShareToken();
    const tokenHash = hashToken(rawToken);

    let passwordHash: string | null = null;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const permissionsJson = JSON.stringify(permissions ?? ['view']);
    const metadataObj = {
      rail_type: 'secure_share_link',
      target_module: target_type,
      target_id,
      allowed_actions: permissions ?? ['view'],
      allowed_file_types: allowed_file_types ?? null,
      max_file_size_mb: max_file_size_mb ?? null,
      security: {
        expires: !!expires_at,
        password_required: !!password,
        audit_logged: true,
      },
      ...(metadata ?? {}),
    };
    const metadataJson = JSON.stringify(metadataObj);

    const expiresAtVal = expires_at ? new Date(expires_at) : null;

    const [result] = await db.execute(sql`
      INSERT INTO secure_share_links
        (company_id, created_by_user_id, token_hash, link_type, target_type, target_id,
         title, permissions_json, metadata_json, expires_at, password_hash, max_uses, use_count, revoked)
      VALUES
        (${profile.companyId}, ${session.user.id}, ${tokenHash}, ${link_type}, ${target_type}, ${target_id},
         ${title}, ${permissionsJson}, ${metadataJson}, ${expiresAtVal}, ${passwordHash}, ${max_uses ?? null}, 0, 0)
    `) as unknown as [ResultSetHeader];

    const insertId = result.insertId;

    // Log creation event
    await db.execute(sql`
      INSERT INTO secure_share_events
        (share_link_id, company_id, event_type, ip_address, user_agent)
      VALUES
        (${insertId}, ${profile.companyId}, 'created',
         ${req.ip ?? null}, ${req.headers['user-agent']?.slice(0, 500) ?? null})
    `);

    const publicUrl = `https://iwillbuild.com/share/${rawToken}`;

    return res.status(201).json({
      id: insertId,
      rawToken,
      publicUrl,
      title,
      link_type,
      target_type,
      target_id,
      permissions: permissions ?? ['view'],
      expires_at: expiresAtVal,
      max_uses: max_uses ?? null,
    });
  } catch (err) {
    console.error('POST /api/share-links error:', err);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
}
