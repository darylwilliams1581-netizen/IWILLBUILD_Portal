/**
 * drayl/format.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reply formatters for the Drayl engine.
 */

import type { AnnetteFinding, DazzaContext, ModuleName } from './types.js';

export const COMPLIANCE_NOTE =
  '⚠️ Compliance note: This is guidance only. Verify against current legislation, project documents, and a competent person on site.';

// ── Annette health-check reply ────────────────────────────────────────────────

interface FormatAnnetteReplyOptions {
  findings: AnnetteFinding[];
  context: DazzaContext;
  aiGuidance?: string;
  includeGeneralGuidance?: boolean;
}

export function formatAnnetteReply({
  findings,
  context,
  aiGuidance,
  includeGeneralGuidance,
}: FormatAnnetteReplyOptions): string {
  const lines: string[] = [];

  lines.push(`## Annette Health Check — ${context.companyName}`);
  lines.push(`_${new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}_`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('✅ No immediate findings. Everything looks clean.');
  } else {
    const critical = findings.filter((f) => f.severity === 'critical');
    const warnings = findings.filter((f) => f.severity === 'warning');
    const info     = findings.filter((f) => f.severity === 'info');

    if (critical.length > 0) {
      lines.push('### 🔴 Critical / Urgent');
      for (const f of critical) {
        lines.push(`**${f.title}**`);
        lines.push(f.detail);
        lines.push(`→ _${f.recommendedAction}_`);
        lines.push('');
      }
    }

    if (warnings.length > 0) {
      lines.push('### 🟡 Needs Attention');
      for (const f of warnings) {
        lines.push(`**${f.title}**`);
        lines.push(f.detail);
        lines.push(`→ _${f.recommendedAction}_`);
        lines.push('');
      }
    }

    if (info.length > 0) {
      lines.push('### 🔵 Info');
      for (const f of info) {
        lines.push(`**${f.title}**`);
        lines.push(f.detail);
        lines.push(`→ _${f.recommendedAction}_`);
        lines.push('');
      }
    }
  }

  if (aiGuidance && includeGeneralGuidance) {
    lines.push('---');
    lines.push('### 🧠 AI Guidance');
    lines.push(aiGuidance);
    lines.push('');
  }

  // Source modules
  const usedModules = Array.from(new Set(findings.map((f) => f.module)));
  lines.push(`📦 **Source modules:** ${usedModules.length > 0 ? usedModules.join(', ') : 'All permitted modules'}`);
  lines.push(`📊 **Confidence:** High — sourced directly from IWIllBUIlD portal data`);

  if (context.warnings.length > 0) {
    lines.push('');
    lines.push('⚠️ Module warnings:');
    for (const w of context.warnings) {
      lines.push(`- ${w}`);
    }
  }

  return lines.join('\n');
}

// ── General context answer ────────────────────────────────────────────────────

interface FormatContextAnswerOptions {
  context: DazzaContext;
  answer: string;
  sources: ModuleName[];
  aiGuidance?: string;
}

export function formatContextAnswer({
  context,
  answer,
  sources,
  aiGuidance,
}: FormatContextAnswerOptions): string {
  const lines: string[] = [];

  lines.push('📋 **From IWIllBUIlD data:**');
  lines.push(answer);

  if (aiGuidance) {
    lines.push('');
    lines.push('🧠 **AI reasoning:**');
    lines.push(aiGuidance);
  }

  lines.push('');
  lines.push(`📦 **Source modules:** ${sources.join(', ')}`);
  lines.push(`📊 **Confidence:** ${aiGuidance ? 'High — IWIllBUIlD data + AI reasoning' : 'High — IWIllBUIlD portal data'}`);

  if (context.warnings.length > 0) {
    lines.push('');
    lines.push('⚠️ Module warnings:');
    for (const w of context.warnings) {
      lines.push(`- ${w}`);
    }
  }

  return lines.join('\n');
}
