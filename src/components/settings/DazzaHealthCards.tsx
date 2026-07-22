/**
 * DazzaHealthCards — Annette health-check findings UI
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders structured finding cards from the Annette Protocol health check.
 * Severity: critical (🔴) → warning (🟠) → info (🔵)
 * Findings are pre-sorted Critical → Warning → Info before being passed in.
 */
import { useState, useEffect } from 'react';

export interface AnnetteFindingCard {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  module: string;
  title: string;
  detail: string;
  recommendedAction: string;
  sourceIds?: string[];
}

const SEVERITY_ORDER: Record<AnnetteFindingCard['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Sort findings Critical → Warning → Info */
export function sortFindings(findings: AnnetteFindingCard[]): AnnetteFindingCard[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

function getSeverityIcon(severity: AnnetteFindingCard['severity']): string {
  if (severity === 'critical') return '🔴';
  if (severity === 'warning')  return '🟠';
  return '🔵';
}

function getSeverityLabel(severity: AnnetteFindingCard['severity']): string {
  if (severity === 'critical') return 'URGENT';
  if (severity === 'warning')  return 'NEEDS ATTENTION';
  return 'INFO';
}

function getCardStyle(severity: AnnetteFindingCard['severity']): {
  card: string;
  header: string;
  badge: string;
  action: string;
  border: string;
} {
  if (severity === 'critical') return {
    card:   'bg-red-50',
    header: 'bg-red-100',
    badge:  'bg-red-200 text-red-800',
    action: 'bg-red-100 border-red-200 text-red-800',
    border: 'border-red-200',
  };
  if (severity === 'warning') return {
    card:   'bg-amber-50',
    header: 'bg-amber-100',
    badge:  'bg-amber-200 text-amber-800',
    action: 'bg-amber-100 border-amber-200 text-amber-800',
    border: 'border-amber-200',
  };
  return {
    card:   'bg-blue-50',
    header: 'bg-blue-100',
    badge:  'bg-blue-200 text-blue-800',
    action: 'bg-blue-100 border-blue-200 text-blue-800',
    border: 'border-blue-200',
  };
}

function FindingCard({ finding }: { finding: AnnetteFindingCard }) {
  const s = getCardStyle(finding.severity);
  return (
    <article
      className={`rounded-xl border ${s.border} ${s.card} overflow-hidden`}
      aria-label={`${finding.severity} finding: ${finding.title}`}
    >
      {/* Header */}
      <div className={`${s.header} px-4 py-2.5 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2">
          <span className="text-base leading-none" aria-hidden="true">
            {getSeverityIcon(finding.severity)}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
            {getSeverityLabel(finding.severity)}
          </span>
        </div>
        <span className="text-xs text-slate-500 font-medium shrink-0">
          Source: {finding.module}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <h4 className="text-sm font-bold text-slate-800 leading-snug">
          {finding.title}
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed">
          {finding.detail}
        </p>

        {/* Recommended action */}
        <div className={`rounded-lg border ${s.action} px-3 py-2 mt-1`}>
          <p className="text-xs font-semibold mb-0.5">Next action:</p>
          <p className="text-xs leading-relaxed">{finding.recommendedAction}</p>
        </div>

        {/* Affected IDs */}
        {finding.sourceIds && finding.sourceIds.length > 0 && (
          <p className="text-xs text-slate-400 mt-0.5">
            Affects:{' '}
            {finding.sourceIds.slice(0, 4).join(', ')}
            {finding.sourceIds.length > 4 && ` +${finding.sourceIds.length - 4} more`}
          </p>
        )}
      </div>
    </article>
  );
}

export function DazzaHealthCards({
  findings,
}: {
  findings: AnnetteFindingCard[];
}) {
  if (!findings.length) return null;

  const sorted = sortFindings(findings);
  const criticalCount = sorted.filter((f) => f.severity === 'critical').length;
  const warningCount  = sorted.filter((f) => f.severity === 'warning').length;
  const infoCount     = sorted.filter((f) => f.severity === 'info').length;

  return (
    <div
      className="flex flex-col gap-3"
      aria-label="Annette health check results"
    >
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {criticalCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-bold bg-red-100 text-red-700 border border-red-200 rounded-full px-3 py-1">
            🔴 {criticalCount} Urgent
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
            🟠 {warningCount} Needs Attention
          </span>
        )}
        {infoCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
            🔵 {infoCount} Info
          </span>
        )}
      </div>

      {/* Cards — sorted Critical → Warning → Info */}
      {sorted.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}
