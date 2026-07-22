/**
 * POST /api/safety/ai/draft
 * Dazza Safety AI — streaming GPT-4o endpoint for:
 *  - Drafting SWMS content from a work activity description
 *  - Drafting Safety Plan sections
 *  - Suggesting SWMS from job scope
 *
 * Body: { mode: 'swms' | 'plan' | 'suggest', prompt: string, context?: string }
 * Response: text/event-stream (SSE)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
const SYSTEM_PROMPTS: Record<string, string> = {
  swms: `You are Dazza, an expert Australian WHS safety consultant and SWMS writer for the construction industry.
Your job is to draft professional Safe Work Method Statements (SWMS) that comply with Australian WHS legislation.

When drafting a SWMS, structure your response as JSON with these fields:
{
  "title": "...",
  "work_activity": "...",
  "scope": "...",
  "hazards": "...",
  "controls": "...",
  "ppe_required": "...",
  "legislation": "...",
  "emergency_procedures": "..."
}

Be specific, practical, and compliant with Australian WHS Act 2011 and relevant codes of practice.
Use plain language. Include specific hazards and hierarchy of controls (eliminate, substitute, isolate, engineer, admin, PPE).`,

  plan: `You are Dazza, an expert Australian WHS safety consultant for the construction industry.
Your job is to help draft Site Safety Plan sections that comply with Australian WHS legislation.

Provide practical, specific content for the requested section. Be concise but thorough.
Reference relevant Australian standards and codes of practice where appropriate.`,

  suggest: `You are Dazza, an expert Australian WHS safety consultant for the construction industry.
Based on the job scope provided, identify which SWMS documents are required.

Respond with a JSON array of suggested SWMS titles and work activities:
[
  { "title": "...", "work_activity": "...", "reason": "..." },
  ...
]

Consider all high-risk construction work as defined under the WHS Regulations 2017.
Be thorough — it's better to suggest more than miss a critical one.`,
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { mode = 'swms', prompt, context } = req.body as {
      mode?: 'swms' | 'plan' | 'suggest';
      prompt?: string;
      context?: string;
    };

    if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'AI not configured — OPENAI_API_KEY not set' });

    const userMessage = context
      ? `Context: ${context}\n\n${prompt}`
      : prompt;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.swms },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!openaiRes.ok || !openaiRes.body) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', errText);
      res.write(`data: ${JSON.stringify({ error: 'OpenAI request failed' })}\n\n`);
      res.end();
      return;
    }

    const reader = openaiRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        } catch { /* skip malformed */ }
      }
    }

    res.end();
  } catch (err) {
    console.error('POST /api/safety/ai/draft error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'AI draft failed' });
    }
    res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
    res.end();
  }
}
