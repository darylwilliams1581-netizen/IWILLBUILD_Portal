/**
 * drayl/openai.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenAI explanation helper for the Drayl engine.
 * Sends context + question to OpenAI and returns the AI guidance text.
 * Portal data always wins — this is explanation/drafting only.
 */

import type { AnnetteFinding, DazzaContext } from './types.js';

interface ExplainOptions {
  apiKey: string;
  model?: string;
  userMessage: string;
  context: DazzaContext;
  findings?: AnnetteFinding[];
}

const SYSTEM_PROMPT = `You are Dazza, the IWILLBUILD portal AI assistant for Australian construction companies.

RULES:
- You are given live portal data from IWILLBUILD. Portal data ALWAYS wins over your training knowledge on factual matters.
- Never invent job names, fleet assets, form data, or financial figures. If the data is not in the context, say so.
- Never expose API keys, tokens, passwords, raw SQL, or internal file paths.
- Safety/WHS/legal answers are guidance only — always recommend a competent person on site.
- Be practical, direct, and use Australian English. Keep it professional but plain.
- If Annette findings are provided, explain them clearly and suggest concrete next actions.
- Do not repeat the raw data back verbatim — synthesise and explain.
- Keep responses concise — under 400 words unless the question genuinely needs more.`;

function buildContextSummary(context: DazzaContext): string {
  const lines: string[] = [
    `Company: ${context.companyName}`,
    `User: ${context.user.name} (${context.user.role})`,
    `Jobs loaded: ${context.modules.jobs.data.length}`,
    `Open to-dos: ${context.modules.jobTodos.data.length}`,
    `Fleet assets: ${context.modules.fleet.data.length}`,
    `Fleet prestarts: ${context.modules.fleetPrestarts.data.length}`,
    `Forms: ${context.modules.forms.data.length}`,
    `Estimates: ${context.modules.estimates.data.length}`,
    `Files: ${context.modules.files.data.length}`,
  ];
  if (context.warnings.length > 0) {
    lines.push(`Module warnings: ${context.warnings.join('; ')}`);
  }
  return lines.join('\n');
}

function buildFindingsSummary(findings: AnnetteFinding[]): string {
  if (findings.length === 0) return 'No Annette findings.';
  return findings.map((f) =>
    `[${f.severity.toUpperCase()}] ${f.title}: ${f.detail} → ${f.recommendedAction}`
  ).join('\n');
}

export async function explainWithOpenAI(options: ExplainOptions): Promise<string> {
  const { apiKey, model = 'gpt-4o', userMessage, context, findings } = options;

  const contextSummary = buildContextSummary(context);
  const findingsSummary = findings ? buildFindingsSummary(findings) : '';

  const userContent = [
    `Portal context:\n${contextSummary}`,
    findingsSummary ? `Annette findings:\n${findingsSummary}` : '',
    `Question: ${userMessage}`,
  ].filter(Boolean).join('\n\n');

  const models = model === 'gpt-4o' ? ['gpt-4o', 'gpt-4o-mini'] : [model, 'gpt-4o-mini'];

  for (const m of models) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: m,
          max_tokens: 600,
          temperature: 0.3,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
      });

      if (!res.ok) {
        if (res.status === 404 && m !== models[models.length - 1]) continue; // try next model
        const errText = await res.text();
        throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (err) {
      if (m !== models[models.length - 1]) continue;
      throw err;
    }
  }

  return '';
}
