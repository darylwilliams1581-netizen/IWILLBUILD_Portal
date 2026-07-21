/**
 * RiskMatrixBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact single-block banner version of the risk matrix.
 * Designed to sit at the top of any document as a quick-reference strip.
 *
 * Layout (horizontal):
 *   [RISK ASSESSMENT] | LOW ▸ action | MEDIUM ▸ action | HIGH ▸ action | EXTREME ▸ action
 *
 * Second row:
 *   Hierarchy of Controls pills in one line
 */

import type { Block } from '../types';

interface Props {
  block: Block;
  columnsBlockId?: string;
  columnId?: string;
}

const LEVELS = [
  { label: 'LOW',     bg: '#16a34a', text: '#fff', action: 'Manage by routine procedures' },
  { label: 'MEDIUM',  bg: '#ca8a04', text: '#fff', action: 'Management attention required' },
  { label: 'HIGH',    bg: '#ea580c', text: '#fff', action: 'Senior management action required' },
  { label: 'EXTREME', bg: '#dc2626', text: '#fff', action: 'Stop work — immediate action' },
];

const HIERARCHY = [
  { step: '1. ELIMINATION',    bg: '#15803d' },
  { step: '2. SUBSTITUTION',   bg: '#4d7c0f' },
  { step: '3. ISOLATION',      bg: '#a16207' },
  { step: '4. ENGINEERING',    bg: '#b45309' },
  { step: '5. ADMINISTRATIVE', bg: '#c2410c' },
  { step: '6. PPE',            bg: '#b91c1c' },
];

export default function RiskMatrixBanner({ block }: Props) {
  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden', borderRadius: 4, border: '1px solid #1e293b' }}>

      {/* ── Row 1: Title + Risk Levels ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#0f172a' }}>

        {/* Title pill */}
        <div style={{
          background: '#dc2626',
          color: '#fff',
          fontWeight: 900,
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          writingMode: 'horizontal-tb',
          whiteSpace: 'nowrap',
          gap: 4,
          minWidth: 90,
        }}>
          <span style={{ fontSize: 13 }}>⚠</span>
          <span style={{ lineHeight: 1.3 }}>RISK<br />MATRIX</span>
        </div>

        {/* Level columns */}
        <div style={{ display: 'flex', flex: 1 }}>
          {LEVELS.map((l) => (
            <div key={l.label} style={{ flex: 1, borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column' }}>
              {/* Coloured label */}
              <div style={{
                background: l.bg,
                color: l.text,
                fontWeight: 900,
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                textAlign: 'center',
                padding: '4px 4px 3px',
              }}>
                {l.label}
              </div>
              {/* Action text */}
              <div style={{
                background: '#1e293b',
                color: '#e2e8f0',
                fontSize: 7.5,
                padding: '4px 6px',
                lineHeight: 1.35,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
              }}>
                {l.action}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 2: Hierarchy of Controls ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#0f172a', borderTop: '1px solid #1e293b' }}>

        {/* Label */}
        <div style={{
          background: '#1e293b',
          color: '#94a3b8',
          fontWeight: 700,
          fontSize: 7.5,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          minWidth: 90,
        }}>
          HIERARCHY<br />OF CONTROLS
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '4px 6px', gap: 3 }}>
          {HIERARCHY.map((h, i) => (
            <div key={h.step} style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
              <div style={{
                background: h.bg,
                color: '#fff',
                fontWeight: 800,
                fontSize: 7,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
                padding: '3px 6px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                textAlign: 'center',
                flex: 1,
              }}>
                {h.step}
              </div>
              {i < HIERARCHY.length - 1 && (
                <span style={{ color: '#475569', fontSize: 9, flexShrink: 0 }}>›</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 3: Stop Work strip ── */}
      <div style={{
        background: '#dc2626',
        color: '#fff',
        fontWeight: 800,
        fontSize: 7.5,
        textTransform: 'uppercase',
        letterSpacing: 1,
        textAlign: 'center',
        padding: '3px 8px',
      }}>
        ✋ &nbsp; STOP WORK IF CONDITIONS ARE UNSAFE &nbsp; • &nbsp; THINK SAFE &nbsp; • &nbsp; WORK SAFE &nbsp; • &nbsp; GO HOME SAFE
      </div>

    </div>
  );
}
