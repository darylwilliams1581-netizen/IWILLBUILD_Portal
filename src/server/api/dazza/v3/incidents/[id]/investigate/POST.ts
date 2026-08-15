/**
 * POST /api/dazza/v3/incidents/:id/investigate
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only. Deep AI investigation of an incident.
 * Streams the investigation report as SSE.
 * On completion, stores the repair_prompt and investigation_report on the incident.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../../lib/platform-owner-guard.js';
import { isDazzaV3Enabled, streamDazzaV3 } from '../../../../../../lib/dazza-v3-brain.js';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';

function sseWrite(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!isDazzaV3Enabled()) {
      return res.status(404).json({ error: 'Dazza V3 not enabled.' });
    }

    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };

    // Load incident
    const [rows] = await db.execute(sql.raw(`
      SELECT * FROM dazza_incidents WHERE id = '${id.replace(/'/g, "''")}' LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.[0]) return res.status(404).json({ error: 'Incident not found.' });
    const incident = rows[0];

    // Build investigation prompt
    const investigationPrompt = `
Investigate this incident thoroughly. Use all available tools to gather evidence.

INCIDENT ID: ${incident.id}
TITLE: ${incident.title}
TYPE: ${incident.incident_type}
SEVERITY: ${incident.severity}
STATUS: ${incident.status}
AFFECTED ROUTE: ${incident.affected_route ?? 'unknown'}
AFFECTED COMPANY: ${incident.affected_company_id ?? 'unknown'}
FIRST SEEN: ${incident.first_seen_at}
LAST SEEN: ${incident.last_seen_at}
EVENT COUNT: ${incident.event_count}
DESCRIPTION: ${incident.description}
EVIDENCE: ${incident.evidence_json ?? 'none stored'}

Use your tools to:
1. Look up the affected company and users
2. Check recent bug reports for related issues
3. Check recent incidents for patterns
4. Review platform health
5. Check approved memory for known issues

Then produce a complete investigation report in the required format, ending with a full Airo repair prompt.
`.trim();

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullReport = '';

    await streamDazzaV3({
      ownerContext: {
        userId: ownerInfo.userId,
        email: ownerInfo.email,
        isPlatformOwner: ownerInfo.isPlatformOwner,
      },
      conversationId: null,
      userMessage: investigationPrompt,
      mode: 'investigation',
      incidentId: id,
      onToken: (token) => {
        fullReport += token;
        sseWrite(res, { type: 'token', content: token });
      },
      onToolCall: (name, status) => sseWrite(res, { type: 'tool_call', name, status }),
      onDone: async (meta) => {
        // Extract Airo repair prompt from the report
        const repairMatch = fullReport.match(/\*\*AIRO REPAIR PROMPT\*\*[:\s]*([\s\S]+?)(?:\n\*\*|$)/i);
        const repairPrompt = repairMatch?.[1]?.trim() ?? '';

        // Store investigation results
        try {
          await db.execute(sql.raw(`
            UPDATE dazza_incidents
            SET investigation_report = '${esc(fullReport.slice(0, 20000))}',
                repair_prompt = '${esc(repairPrompt.slice(0, 5000))}',
                status = 'investigating',
                updated_at = NOW()
            WHERE id = '${id.replace(/'/g, "''")}'
          `));
        } catch (e) {
          console.warn('[investigate] failed to save report:', e);
        }

        sseWrite(res, { type: 'done', ...meta, repairPromptExtracted: !!repairPrompt });
      },
      onError: (msg) => sseWrite(res, { type: 'error', message: msg }),
    });

    res.end();
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dazza/v3/incidents/:id/investigate]', msg);
    if (!res.headersSent) return res.status(500).json({ error: msg });
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
    res.end();
  }
}
