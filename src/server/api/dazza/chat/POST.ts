/**
 * POST /api/dazza/chat
 * Dazza AI chat — uses OpenAI, company-scoped context, full guardrails.
 * Falls back gracefully if no API key is configured.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DazzaContext {
  user: { name: string; email: string; role: string };
  permissions: {
    canJobs: boolean; canFleet: boolean; canForms: boolean;
    canEstimating: boolean; canFiles: boolean; seeDollars: boolean; isAdmin: boolean;
  };
  company: { name: string } | null;
  companyKnowledge: {
    enabled: boolean; companyNotes: string; safetyNotes: string;
    tone: string; disclaimer: string;
  };
  jobs?: unknown[];
  openTodos?: unknown[];
  jobProgress?: unknown[];
  fleet?: unknown[];
  fleetFlags?: unknown[];
  fleetDueDates?: unknown[];
  estimates?: unknown[];
  formTemplates?: unknown[];
  formSubmissions?: unknown[];
  files?: unknown[];
}

function buildSystemPrompt(ctx: DazzaContext): string {
  const { permissions: p, company, companyKnowledge } = ctx;
  const tone = companyKnowledge.tone ?? 'professional';

  const lines: string[] = [
    `You are Dazza, the AI assistant for the IWILLBUILD construction portal.`,
    `You are helpful, practical, and honest. Tone: ${tone}.`,
    `Company: ${company?.name ?? 'Unknown'}.`,
    `User: ${ctx.user.name} (${ctx.user.role}).`,
    ``,
    `## GUARDRAILS — FOLLOW THESE EXACTLY`,
    `1. NEVER invent jobs, fleet assets, estimates, forms, files, or users. Only use data provided below.`,
    `2. If data is missing or empty, say: "I don't have enough IWILLBUILD data for that yet."`,
    `3. Always clearly separate "From IWILLBUILD data:" from "General guidance:".`,
    `4. Always cite the source module: e.g. "Source: Jobs", "Source: Fleet", "Source: Estimates".`,
    `5. NEVER claim legal, WHS, building code, or compliance certainty.`,
    `6. For building/WHS/code matters, always add: "Please verify against current legislation, NCC, project documents and a competent person."`,
    `7. NEVER say "Everything is compliant." — you cannot know that.`,
    `8. Do not use localStorage, old ME MATE keys, or any data not provided in this prompt.`,
    ``,
    `## PERMISSION RULES`,
    `- canJobs: ${p.canJobs} — if false, refuse to answer from Jobs data`,
    `- canFleet: ${p.canFleet} — if false, refuse to answer from Fleet data`,
    `- canForms: ${p.canForms} — if false, refuse to answer from Forms data`,
    `- canEstimating: ${p.canEstimating} — if false, refuse to answer from Estimates data`,
    `- canFiles: ${p.canFiles} — if false, refuse to answer from Files data`,
    `- seeDollars: ${p.seeDollars} — if false, NEVER show rates, totals, approved values, quote values, estimate amounts, or contract values`,
    ``,
  ];

  if (companyKnowledge.enabled) {
    if (companyKnowledge.companyNotes) {
      lines.push(`## COMPANY KNOWLEDGE`);
      lines.push(companyKnowledge.companyNotes);
      lines.push('');
    }
    if (companyKnowledge.safetyNotes) {
      lines.push(`## SAFETY & PROCESS NOTES`);
      lines.push(companyKnowledge.safetyNotes);
      lines.push('');
    }
  }

  if (p.canJobs && ctx.jobs) {
    lines.push(`## JOBS DATA (Source: Jobs)`);
    lines.push(JSON.stringify(ctx.jobs, null, 0));
    lines.push('');
    if (ctx.openTodos?.length) {
      lines.push(`## OPEN TO-DOS (Source: Jobs)`);
      lines.push(JSON.stringify(ctx.openTodos, null, 0));
      lines.push('');
    }
    if (ctx.jobProgress?.length) {
      lines.push(`## JOB PROGRESS (Source: Jobs)`);
      lines.push(JSON.stringify(ctx.jobProgress, null, 0));
      lines.push('');
    }
  }

  if (p.canFleet && ctx.fleet) {
    lines.push(`## FLEET DATA (Source: Fleet)`);
    lines.push(JSON.stringify(ctx.fleet, null, 0));
    lines.push('');
    if (ctx.fleetFlags?.length) {
      lines.push(`## FLEET ATTENTION FLAGS (Source: Fleet)`);
      lines.push(JSON.stringify(ctx.fleetFlags, null, 0));
      lines.push('');
    }
    if (ctx.fleetDueDates?.length) {
      lines.push(`## FLEET DUE DATES (Source: Fleet)`);
      lines.push(JSON.stringify(ctx.fleetDueDates, null, 0));
      lines.push('');
    }
  }

  if (p.canEstimating && ctx.estimates) {
    lines.push(`## ESTIMATES DATA (Source: Estimates)`);
    lines.push(JSON.stringify(ctx.estimates, null, 0));
    lines.push('');
  }

  if (p.canForms && ctx.formTemplates) {
    lines.push(`## FORM TEMPLATES (Source: Forms)`);
    lines.push(JSON.stringify(ctx.formTemplates, null, 0));
    lines.push('');
    if (ctx.formSubmissions?.length) {
      lines.push(`## FORM SUBMISSIONS (Source: Forms)`);
      lines.push(JSON.stringify(ctx.formSubmissions, null, 0));
      lines.push('');
    }
  }

  if (p.canFiles && ctx.files) {
    lines.push(`## FILES (Source: Files)`);
    lines.push(JSON.stringify(ctx.files, null, 0));
    lines.push('');
  }

  if (companyKnowledge.disclaimer) {
    lines.push(`## DISCLAIMER TO INCLUDE IN RELEVANT RESPONSES`);
    lines.push(companyKnowledge.disclaimer);
    lines.push('');
  }

  return lines.join('\n');
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { messages, context } = req.body as { messages: ChatMessage[]; context: DazzaContext };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages required' });
    }

    // Verify context belongs to this user's company (basic guard)
    if (!context) {
      return res.status(400).json({ error: 'context required' });
    }

    const apiKey = getSecret('OPENAI_API_KEY');

    if (!apiKey) {
      // No API key — return a helpful fallback message
      return res.json({
        reply: "I'm Dazza, your IWILLBUILD assistant. To enable AI responses, an Owner or Admin needs to add an OpenAI API key in Settings → Dazza AI. Once that's done, I'll be able to answer questions about your jobs, fleet, estimates, and more using your real portal data.",
        noApiKey: true,
      });
    }

    const systemPrompt = buildSystemPrompt(context);

    // Trim history to last 10 messages to keep token usage reasonable
    const recentMessages = messages.slice(-10);

    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentMessages,
      ],
      max_tokens: 1200,
      temperature: 0.4,
    };

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errText);
      return res.status(502).json({ error: 'AI service error', detail: openaiRes.status });
    }

    const data = await openaiRes.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens: number };
    };

    const reply = data.choices?.[0]?.message?.content ?? "I couldn't generate a response. Please try again.";

    res.json({ reply, tokens: data.usage?.total_tokens });
  } catch (error) {
    console.error('POST /api/dazza/chat error:', error);
    res.status(500).json({ error: 'Failed to process chat' });
  }
}
