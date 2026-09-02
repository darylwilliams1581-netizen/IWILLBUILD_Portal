/**
 * POST /api/integrations/onedrive/upload-file
 * ─────────────────────────────────────────────────────────────────────────────
 * Transfers a portal file (from company_files) to the connected OneDrive.
 * The file is streamed from local storage and uploaded to:
 *   /IWIllBUIlD/<jobName or 'Company Files'>/<originalFileName>
 *
 * Body: { fileId: number }
 *
 * Returns: { ok: true, oneDriveUrl: string, oneDrivePath: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles, companyFiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';
import { getDownloadStream } from '../../../../storage/storage-service.js';
import { BUCKET_COMPANY_FILES } from '../../../../storage/storage-service.js';

// ── Token refresh helper ──────────────────────────────────────────────────────

async function getValidAccessToken(companyId: number): Promise<string> {
  const [rows] = await db.execute(
    sql`SELECT access_token, refresh_token, expires_at FROM onedrive_connections WHERE company_id = ${companyId} LIMIT 1`
  ) as unknown as [Array<{ access_token: string; refresh_token: string; expires_at: string }>, unknown];

  const conn = rows?.[0];
  if (!conn) throw new Error('OneDrive not connected');

  const expiresAt = new Date(conn.expires_at);
  const nowPlusFive = new Date(Date.now() + 5 * 60 * 1000); // 5-min buffer

  if (expiresAt > nowPlusFive) {
    return conn.access_token;
  }

  // Refresh the token
  const { getSecret } = await import('#airo/secrets');
  const clientId     = getSecret('AZURE_CLIENT_ID');
  const clientSecret = getSecret('AZURE_CLIENT_SECRET');
  const tenantId     = getSecret('AZURE_TENANT_ID') ?? 'common';

  if (!clientId || !clientSecret) throw new Error('Azure secrets not configured');

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: conn.refresh_token,
        grant_type:    'refresh_token',
      }).toString(),
    }
  );

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000);

  await db.execute(sql.raw(`
    UPDATE onedrive_connections
    SET access_token = ${JSON.stringify(tokens.access_token)},
        refresh_token = ${JSON.stringify(tokens.refresh_token)},
        expires_at = ${JSON.stringify(newExpiry.toISOString().slice(0, 19).replace('T', ' '))},
        updated_at = NOW()
    WHERE company_id = ${companyId}
  `));

  return tokens.access_token;
}

// ── Buffer from stream ────────────────────────────────────────────────────────

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

    const { fileId } = req.body as { fileId?: number };
    if (!fileId) return res.status(400).json({ error: 'fileId is required' });

    // Load the file record — must belong to this company
    const fileRecord = await db.query.companyFiles.findFirst({
      where: and(
        eq(companyFiles.id, fileId),
        eq(companyFiles.companyId, profile.companyId)
      ),
    });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });

    // Get a valid access token (auto-refreshes if needed)
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(profile.companyId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not connected')) {
        return res.status(400).json({ error: 'OneDrive is not connected. Connect it in Settings → Integrations.' });
      }
      return res.status(503).json({ error: `OneDrive token error: ${msg}` });
    }

    // Stream the file from local storage into a buffer
    const { stream, mimeType } = await getDownloadStream(fileRecord.storedName, BUCKET_COMPANY_FILES);
    const fileBuffer = await streamToBuffer(stream);

    // Build the OneDrive folder path
    // /IWIllBUIlD/Company Files/<filename>  (or /IWIllBUIlD/<jobId>/<filename> if job-linked)
    const folderName = fileRecord.jobId ? `Job ${fileRecord.jobId}` : 'Company Files';
    const safeName = fileRecord.originalName.replace(/[/\\:*?"<>|]/g, '_');
    const oneDrivePath = `/IWIllBUIlD/${folderName}/${safeName}`;

    // Microsoft Graph upload session (supports files up to 250 MB)
    const uploadSessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:${oneDrivePath}:/createUploadSession`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'rename',
            name: safeName,
          },
        }),
      }
    );

    if (!uploadSessionRes.ok) {
      const body = await uploadSessionRes.text();
      console.error('[onedrive-upload] createUploadSession failed:', body);
      return res.status(502).json({ error: 'Failed to create OneDrive upload session. Check your OneDrive permissions.' });
    }

    const { uploadUrl } = await uploadSessionRes.json() as { uploadUrl: string };

    // Upload the file bytes
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(fileBuffer.length),
        'Content-Range': `bytes 0-${fileBuffer.length - 1}/${fileBuffer.length}`,
        'Content-Type': mimeType,
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok && uploadRes.status !== 201) {
      const body = await uploadRes.text();
      console.error('[onedrive-upload] upload failed:', body);
      return res.status(502).json({ error: 'File upload to OneDrive failed' });
    }

    const uploadedItem = await uploadRes.json() as { webUrl?: string; name?: string };

    console.log(`[onedrive] Company ${profile.companyId} uploaded "${fileRecord.originalName}" → ${oneDrivePath}`);

    res.json({
      ok: true,
      oneDriveUrl: uploadedItem.webUrl ?? null,
      oneDrivePath,
      fileName: uploadedItem.name ?? safeName,
    });
  } catch (err) {
    console.error('POST /api/integrations/onedrive/upload-file error:', err);
    res.status(500).json({ error: 'Failed to transfer file to OneDrive' });
  }
}
