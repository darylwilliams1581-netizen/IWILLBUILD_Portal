/**
 * drayl/localTools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Local tool intercepts for the Drayl engine.
 * These run without OpenAI — instant, no DB needed for stateless tools.
 */

import type { DazzaChatResponse, DazzaContext } from './types.js';
import { formatContextAnswer } from './format.js';

// ── Cross-company guard ───────────────────────────────────────────────────────

export function isCrossCompanyDataRequest(message: string): boolean {
  return /another company|other company|different company|competitor|someone else'?s?\s+(quote|job|data|estimate)/i.test(message);
}

// ── Health check intent ───────────────────────────────────────────────────────

export function isHealthCheckIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('annette') ||
    lower.includes('health check') ||
    lower.includes('healthcheck') ||
    lower.includes('run check') ||
    lower.includes('full check') ||
    lower.includes('brain check') ||
    lower.includes('what needs attention') ||
    lower.includes('what needs fixing') ||
    lower.includes('portal health') ||
    lower.includes('site health')
  );
}

// ── Quick urgent intent ───────────────────────────────────────────────────────

export function isQuickUrgentIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('urgent') ||
    lower.includes('problems today') ||
    lower.includes('issues today') ||
    lower.includes('what\'s wrong') ||
    lower.includes("what's wrong") ||
    lower.includes('quick scan') ||
    lower.includes('quick check') ||
    (lower.includes('any') && (lower.includes('overdue') || lower.includes('urgent') || lower.includes('issue')))
  );
}

// ── Safe regex helper ─────────────────────────────────────────────────────────
// Applies a regex only against a pre-validated, length-capped string.
// Makes the input-bounding invariant explicit to static analysis tools.
function matchSafe(pattern: RegExp, input: string): RegExpMatchArray | null {
  if (input.length > 500) return null;
  return input.match(pattern);
}

// ── Safe arithmetic evaluator ─────────────────────────────────────────────────

function safeEval(expr: string): number | null {
  if (!/^[0-9\s+\-*/.()%]+$/.test(expr)) return null;
  if (expr.length > 200) return null;
  let pos = 0;
  const peek = () => expr[pos];
  const consume = () => expr[pos++];
  const skipWs = () => { while (pos < expr.length && expr[pos] === ' ') pos++; };

  function parseExpr(): number {
    let left = parseTerm();
    skipWs();
    while (pos < expr.length && (peek() === '+' || peek() === '-')) {
      const op = consume(); skipWs();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
      skipWs();
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    skipWs();
    while (pos < expr.length && (peek() === '*' || peek() === '/' || peek() === '%')) {
      const op = consume(); skipWs();
      const right = parseFactor();
      if (op === '*') left *= right;
      else if (op === '/') left = right !== 0 ? left / right : NaN;
      else left = left % right;
      skipWs();
    }
    return left;
  }

  function parseFactor(): number {
    skipWs();
    if (peek() === '(') {
      consume();
      const val = parseExpr();
      skipWs();
      if (peek() === ')') consume();
      return val;
    }
    if (peek() === '-') { consume(); return -parseFactor(); }
    if (peek() === '+') { consume(); return parseFactor(); }
    let num = '';
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) num += consume();
    return num ? parseFloat(num) : NaN;
  }

  try {
    const result = parseExpr();
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

// ── Stateless local tools (no DB, no context needed) ─────────────────────────

function runStatelessTool(question: string, gstRate = 0.1): string | null {
  const q = question.trim().slice(0, 500);
  /* eslint-disable security/detect-unsafe-regex -- all patterns below are matched against `q`
     which is hard-capped at 500 characters above. The \s+ inside alternation groups cannot
     cause catastrophic backtracking on bounded input of this length. */

  // Simple arithmetic
  const mathMatch = matchSafe(/^(?:what\s+is\s+|calculate\s+|calc\s+|work\s+out\s+)?([0-9\s+\-*/.()%]+)=?$/i, q);
  if (mathMatch) {
    const result = safeEval(mathMatch[1].trim());
    if (result !== null) return `${result}`;
  }

  // GST add
  const gstAddMatch = matchSafe(/(?:add\s+gst\s+to|gst\s+on|plus\s+gst|add\s+10%\s+to)\s*\$?([\d,]+(?:\.\d+)?)/i, q)
    ?? matchSafe(/\$?([\d,]+(?:\.\d+)?)\s*\+\s*gst/i, q);
  if (gstAddMatch) {
    const base = parseFloat(gstAddMatch[1].replace(/,/g, ''));
    if (!isNaN(base)) {
      const gst = +(base * gstRate).toFixed(2);
      const total = +(base + gst).toFixed(2);
      return `GST calculation:\n• Base: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• GST (${gstRate * 100}%): $${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Total inc. GST: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // GST remove
  const gstRemoveMatch = matchSafe(/(?:remove\s+gst\s+from|ex\s+gst\s+|excluding\s+gst\s+)\s*\$?([\d,]+(?:\.\d+)?)/i, q)
    ?? matchSafe(/\$?([\d,]+(?:\.\d+)?)\s+ex\.?\s+gst/i, q);
  if (gstRemoveMatch) {
    const total = parseFloat(gstRemoveMatch[1].replace(/,/g, ''));
    if (!isNaN(total)) {
      const divisor = 1 + gstRate;
      const base = +(total / divisor).toFixed(2);
      const gst = +(total - base).toFixed(2);
      return `GST removal:\n• Total inc. GST: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• GST (${gstRate * 100}%): $${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Base ex. GST: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // Markup
  const markupMatch = matchSafe(/add\s+([\d.]+)%\s+markup\s+(?:to\s+)?\$?([\d,]+(?:\.\d+)?)/i, q);
  if (markupMatch) {
    const pct = parseFloat(markupMatch[1]);
    const base = parseFloat(markupMatch[2].replace(/,/g, ''));
    if (!isNaN(pct) && !isNaN(base)) {
      const markup = +(base * pct / 100).toFixed(2);
      const total = +(base + markup).toFixed(2);
      return `Markup calculation (${pct}%):\n• Cost: $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Markup: $${markup.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Sell price: $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // Margin
  const marginMatch = matchSafe(/(?:what\s+is\s+)?(\d+(?:\.\d+)?)%\s+margin\s+on\s+\$?([\d,]+(?:\.\d+)?)/i, q);
  if (marginMatch) {
    const pct = parseFloat(marginMatch[1]);
    const cost = parseFloat(marginMatch[2].replace(/,/g, ''));
    if (!isNaN(pct) && !isNaN(cost) && pct < 100) {
      const sell = +(cost / (1 - pct / 100)).toFixed(2);
      const margin = +(sell - cost).toFixed(2);
      return `Margin calculation (${pct}%):\n• Cost: $${cost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Margin: $${margin.toLocaleString('en-AU', { minimumFractionDigits: 2 })}\n• Sell price: $${sell.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
    }
  }

  // Concrete volume — bounded pattern, no .*?
  const concreteMatch = matchSafe(
    /(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(m|mm|metres?|meters?|millimetres?)?/i,
    q.includes('concrete') ? q : ''
  );
  if (concreteMatch) {
    const l = parseFloat(concreteMatch[1] ?? '');
    const w = parseFloat(concreteMatch[2] ?? '');
    let d = parseFloat(concreteMatch[3] ?? '');
    const unit = (concreteMatch[4] ?? 'm').toLowerCase();
    if (unit.startsWith('mm')) d = d / 1000;
    if (!isNaN(l) && !isNaN(w) && !isNaN(d) && d > 0) {
      const vol = +(l * w * d).toFixed(3);
      const withWaste = +(vol * 1.1).toFixed(3);
      return `Concrete volume:\n• Slab: ${l}m × ${w}m × ${d < 1 ? (d * 1000).toFixed(0) + 'mm' : d + 'm'}\n• Volume: **${vol} m³**\n• With 10% waste: **${withWaste} m³**\n\n_Order at least ${withWaste} m³. Verify with your supplier._`;
    }
  }

  // Area
  const areaMatch = matchSafe(/(?:area\s+of|what\s+is\s+the\s+area)\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:x|\u00d7|\*|by)\s*(\d+(?:\.\d+)?)/i, q);
  if (areaMatch) {
    const l = parseFloat(areaMatch[1]);
    const w = parseFloat(areaMatch[2]);
    if (!isNaN(l) && !isNaN(w)) {
      return `Area calculation:\n• ${l}m × ${w}m = **${+(l * w).toFixed(2)} m²**`;
    }
  }

  // Pipe fall — bounded pattern, no .*?
  const fallMatch = matchSafe(/fall\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*m\s+(?:pipe\s+)?(?:at\s+)?1\s*(?::|in)\s*(\d+(?:\.\d+)?)/i, q)
    ?? matchSafe(/fall\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*m\s*,?\s*1\s*(?::|in)\s*(\d+(?:\.\d+)?)/i, q);
  if (fallMatch) {
    const length = parseFloat(fallMatch[1]);
    const ratio = parseFloat(fallMatch[2]);
    if (!isNaN(length) && !isNaN(ratio) && ratio > 0) {
      const fall = +(length / ratio * 1000).toFixed(0);
      return `Pipe fall:\n• ${length}m at 1:${ratio} = **${fall}mm** drop`;
    }
  }

  // Percentage of
  const pctOfMatch = matchSafe(/(?:what\s+is\s+)?(\d+(?:\.\d+)?)%\s+of\s+\$?([\d,]+(?:\.\d+)?)/i, q);
  if (pctOfMatch) {
    const pct = parseFloat(pctOfMatch[1]);
    const base = parseFloat(pctOfMatch[2].replace(/,/g, ''));
    if (!isNaN(pct) && !isNaN(base)) {
      const result = +(base * pct / 100).toFixed(2);
      return `${pct}% of $${base.toLocaleString('en-AU', { minimumFractionDigits: 2 })} = **$${result.toLocaleString('en-AU', { minimumFractionDigits: 2 })}**`;
    }
  }

  return null;
  /* eslint-enable security/detect-unsafe-regex */
}

// ── Public: tryStatelessLocalTool ─────────────────────────────────────────────

export function tryStatelessLocalTool(message: string, gstRate = 0.1): DazzaChatResponse | null {
  const result = runStatelessTool(message, gstRate);
  if (!result) return null;
  return {
    reply: result,
    mode: 'context',
    findings: [],
    sources: [],
    warnings: [],
    usedOpenAI: false,
  };
}

// ── Public: tryContextLocalTool ───────────────────────────────────────────────

export function tryContextLocalTool(message: string, context: DazzaContext): DazzaChatResponse | null {
  const lq = message.toLowerCase().trim();
  const p = context.permissions;
  const cn = context.companyName;

  // Job count
  if (/how many jobs|job count|number of jobs|total jobs/i.test(lq)) {
    if (!p.canViewJobs) return null;
    const count = context.modules.jobs.data.length;
    return {
      reply: formatContextAnswer({
        context,
        answer: count === 0
          ? `No jobs found for ${cn} yet.`
          : `There ${count === 1 ? 'is' : 'are'} **${count}** job${count === 1 ? '' : 's'} in IWIllBUIlD for ${cn}.`,
        sources: ['Jobs'],
      }),
      mode: 'context',
      findings: [],
      sources: ['Jobs'],
      warnings: context.warnings,
      usedOpenAI: false,
    };
  }

  // Fleet count
  if (/how many.*(?:fleet|assets|vehicles|trucks|plant)|fleet count|number of.*(?:fleet|assets)/i.test(lq)) {
    if (!p.canViewFleet) return null;
    const count = context.modules.fleet.data.length;
    return {
      reply: formatContextAnswer({
        context,
        answer: count === 0
          ? `No fleet assets found for ${cn} yet.`
          : `There ${count === 1 ? 'is' : 'are'} **${count}** fleet asset${count === 1 ? '' : 's'} in IWIllBUIlD for ${cn}.`,
        sources: ['Fleet'],
      }),
      mode: 'context',
      findings: [],
      sources: ['Fleet'],
      warnings: context.warnings,
      usedOpenAI: false,
    };
  }

  // Open to-dos count
  if (/how many.*(?:todo|to-do|todos|to-dos)|open.*(?:todo|to-do)|todo.*count/i.test(lq)) {
    if (!p.canViewJobs) return null;
    const count = context.modules.jobTodos.data.length;
    return {
      reply: formatContextAnswer({
        context,
        answer: count === 0
          ? `No open to-dos found for ${cn}.`
          : `There ${count === 1 ? 'is' : 'are'} **${count}** open to-do${count === 1 ? '' : 's'} in IWIllBUIlD for ${cn}.`,
        sources: ['JobTodos'],
      }),
      mode: 'context',
      findings: [],
      sources: ['JobTodos'],
      warnings: context.warnings,
      usedOpenAI: false,
    };
  }

  // Prestart issues
  if (/prestart.*issue|issue.*prestart|failed prestart|prestart.*fail/i.test(lq)) {
    if (!p.canViewFleet) return null;
    const flagged = context.modules.fleetPrestarts.data.filter((p: Record<string, unknown>) =>
      p.issueFlagged || p.hasIssue || p.issue_needs_attention
    );
    return {
      reply: formatContextAnswer({
        context,
        answer: flagged.length === 0
          ? 'No prestart issues flagged.'
          : `**${flagged.length}** prestart issue${flagged.length === 1 ? '' : 's'} flagged. Run Annette for full details.`,
        sources: ['FleetPrestarts'],
      }),
      mode: 'context',
      findings: [],
      sources: ['FleetPrestarts'],
      warnings: context.warnings,
      usedOpenAI: false,
    };
  }

  return null;
}
