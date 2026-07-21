/**
 * RiskMatrixBlock
 * ─────────────────────────────────────────────────────────────────────────────
 * Full AS/NZS risk assessment document block matching the reference layout:
 *   • Risk Assessment Method panel
 *   • Hierarchy of Controls pyramid (6 steps — Elimination through PPE)
 *   • Safety Requirements panel
 *   • Likelihood Rating table
 *   • Consequence Rating table
 *   • 5×5 Risk Matrix
 *   • Risk Level Actions
 *   • Stop Work panel
 */
import { useDocumentStore } from '../useDocumentStore';
import type { RiskMatrixBlock } from '../types';
import { sanitiseHtml } from '../sanitiseHtml';

interface Props {
  block: RiskMatrixBlock;
  columnsBlockId?: string;
  columnId?: string;
}

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  red:    '#cc1f1f',
  orange: '#e85d04',
  amber:  '#f59e0b',
  green:  '#16a34a',
  dark:   '#1a1a1a',
  white:  '#ffffff',
  grey:   '#f3f4f6',
  border: '#d1d5db',
  text:   '#111827',
  muted:  '#6b7280',
};

// ── Hierarchy of Controls ─────────────────────────────────────────────────────
const HIERARCHY = [
  { step: '1. ELIMINATION',    sub: 'Eliminate the hazard',    bg: '#16a34a', text: '#fff', width: '40%' },
  { step: '2. SUBSTITUTION',   sub: 'Substitute the hazard',   bg: '#65a30d', text: '#fff', width: '52%' },
  { step: '3. ISOLATION',      sub: 'Isolate the hazard',      bg: '#ca8a04', text: '#fff', width: '64%' },
  { step: '4. ENGINEERING',    sub: 'Engineering controls',    bg: '#d97706', text: '#fff', width: '76%' },
  { step: '5. ADMINISTRATIVE', sub: 'Administrative controls', bg: '#ea580c', text: '#fff', width: '88%' },
  { step: '6. PPE',            sub: 'PPE',                     bg: '#dc2626', text: '#fff', width: '100%' },
];

// ── Likelihood ────────────────────────────────────────────────────────────────
const LIKELIHOOD = [
  { label: 'RARE',           desc: 'May occur only in exceptional circumstances',   bg: '#16a34a' },
  { label: 'UNLIKELY',       desc: 'Could occur at some time',                      bg: '#65a30d' },
  { label: 'POSSIBLE',       desc: 'Might occur at some time',                      bg: '#ca8a04' },
  { label: 'LIKELY',         desc: 'Will probably occur in most circumstances',     bg: '#ea580c' },
  { label: 'ALMOST CERTAIN', desc: 'Expected to occur frequently',                  bg: '#dc2626' },
];

// ── Consequence ───────────────────────────────────────────────────────────────
const CONSEQUENCE = [
  { label: 'INSIGNIFICANT', desc: 'Minor first aid only',              bg: '#16a34a' },
  { label: 'MINOR',         desc: 'Medical treatment required',        bg: '#65a30d' },
  { label: 'MODERATE',      desc: 'Serious injury requiring time off', bg: '#ca8a04' },
  { label: 'MAJOR',         desc: 'Permanent injury',                  bg: '#ea580c' },
  { label: 'CATASTROPHIC',  desc: 'Fatality',                          bg: '#dc2626' },
];

// ── 5×5 Matrix (row = likelihood top→bottom Almost Certain→Rare, col = consequence left→right) ──
type R = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
const MATRIX: R[][] = [
  ['MEDIUM', 'HIGH',   'EXTREME', 'EXTREME', 'EXTREME'], // Almost Certain
  ['MEDIUM', 'HIGH',   'HIGH',    'EXTREME', 'EXTREME'], // Likely
  ['LOW',    'MEDIUM', 'HIGH',    'HIGH',    'EXTREME'], // Possible
  ['LOW',    'LOW',    'MEDIUM',  'HIGH',    'HIGH'   ], // Unlikely
  ['LOW',    'LOW',    'MEDIUM',  'MEDIUM',  'HIGH'   ], // Rare
];

const CELL: Record<R, { bg: string; text: string }> = {
  LOW:     { bg: '#16a34a', text: '#fff' },
  MEDIUM:  { bg: '#ca8a04', text: '#fff' },
  HIGH:    { bg: '#ea580c', text: '#fff' },
  EXTREME: { bg: '#dc2626', text: '#fff' },
};

const LIKELIHOOD_ROWS = [
  { label: 'ALMOST CERTAIN', sub: 'Expected to occur frequently' },
  { label: 'LIKELY',         sub: 'Will probably occur in most circumstances' },
  { label: 'POSSIBLE',       sub: 'Might occur at some time' },
  { label: 'UNLIKELY',       sub: 'Could occur at some time' },
  { label: 'RARE',           sub: 'May occur only in exceptional circumstances' },
];

const CONSEQUENCE_COLS = ['INSIGNIFICANT', 'MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC'];

// ── Risk Level Actions ────────────────────────────────────────────────────────
const RISK_ACTIONS: { rating: R; action: string; bg: string }[] = [
  { rating: 'LOW',     action: 'Manage through routine procedures and supervision.',                    bg: '#16a34a' },
  { rating: 'MEDIUM',  action: 'Implement additional controls and monitor regularly.',                  bg: '#ca8a04' },
  { rating: 'HIGH',    action: 'Immediate management attention required before work proceeds.',         bg: '#ea580c' },
  { rating: 'EXTREME', action: 'Stop work immediately until risk is controlled.',                       bg: '#dc2626' },
];

// ── Shared cell style helper ──────────────────────────────────────────────────
const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
  border: `1px solid ${C.border}`,
  padding: '5px 6px',
  fontSize: 9,
  verticalAlign: 'middle',
  lineHeight: 1.35,
  ...extra,
});

// ── Component ─────────────────────────────────────────────────────────────────
export default function RiskMatrixBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();

  const update = (patch: Partial<RiskMatrixBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  const companyName = 'Your Company';

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 10, color: C.text, lineHeight: 1.4 }}>

      {/* ── Editable title ── */}
      {mode === 'edit' ? (
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => update({ title: e.currentTarget.textContent ?? '' })}
          style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, outline: 'none', cursor: 'text' }}
          dangerouslySetInnerHTML={{ __html: sanitiseHtml(block.title) }}
        />
      ) : (
        block.title && (
          <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{block.title}</p>
        )
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 1 — Method | Hierarchy | Safety Requirements
      ══════════════════════════════════════════════════════════════════════ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <tbody>
          <tr>
            {/* ── Risk Assessment Method ── */}
            <td style={{ ...cell(), width: '32%', verticalAlign: 'top', background: C.white }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ background: C.red, borderRadius: 4, padding: '3px 6px' }}>
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>⚠</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Risk Assessment Method</span>
              </div>
              <p style={{ fontSize: 8.5, marginBottom: 6, color: C.muted }}>
                {companyName} uses this Risk Matrix to assess hazards and determine the appropriate control measures for all work activities.
              </p>
              <p style={{ fontWeight: 700, fontSize: 8.5, marginBottom: 4 }}>Risk assessments are to be completed:</p>
              <ul style={{ paddingLeft: 14, margin: 0, fontSize: 8.5, color: C.text }}>
                <li style={{ marginBottom: 3 }}>Prior to commencing work</li>
                <li style={{ marginBottom: 3 }}>When site conditions change</li>
                <li style={{ marginBottom: 3 }}>Following incidents or near misses</li>
                <li>When new hazards are identified</li>
              </ul>
            </td>

            {/* ── Hierarchy of Controls ── */}
            <td style={{ ...cell(), width: '36%', verticalAlign: 'top', background: C.white, textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Hierarchy of Controls
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                {HIERARCHY.map((h) => (
                  <div
                    key={h.step}
                    style={{
                      background: h.bg,
                      color: h.text,
                      width: h.width,
                      padding: '4px 8px',
                      textAlign: 'center',
                      fontSize: 8,
                      fontWeight: 700,
                      lineHeight: 1.3,
                      clipPath: 'polygon(0 0, 100% 0, 92% 100%, 8% 100%)',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 8.5 }}>{h.step}</div>
                    <div style={{ fontWeight: 400, fontSize: 7.5, opacity: 0.9 }}>{h.sub}</div>
                  </div>
                ))}
              </div>
            </td>

            {/* ── Safety Requirements ── */}
            <td style={{ ...cell(), width: '32%', verticalAlign: 'top', background: C.white }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ background: C.red, borderRadius: 4, padding: '3px 6px' }}>
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Safety Requirements</span>
              </div>
              <p style={{ fontSize: 8.5, marginBottom: 6, color: C.muted }}>
                All workers, subcontractors and visitors are required to:
              </p>
              {[
                'Participate in risk assessments',
                'Follow Safe Work Method Statements (SWMS)',
                'Report hazards immediately',
                'Stop work if conditions become unsafe',
                'Assist in maintaining a safe workplace',
              ].map((req) => (
                <div key={req} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
                  <span style={{ color: C.red, fontWeight: 900, fontSize: 10, lineHeight: 1.2, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 8.5 }}>{req}</span>
                </div>
              ))}
              <p style={{ fontSize: 8, color: C.muted, marginTop: 8, fontStyle: 'italic' }}>
                {companyName} is committed to achieving <strong>Zero Harm</strong> through effective risk management and continual improvement.
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 2 — Likelihood Rating | Consequence Rating
      ══════════════════════════════════════════════════════════════════════ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <tbody>
          <tr>
            {/* Likelihood Rating */}
            <td style={{ width: '50%', verticalAlign: 'top', paddingRight: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th colSpan={2} style={{ background: C.dark, color: '#fff', textAlign: 'center', padding: '5px 8px', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      Likelihood Rating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LIKELIHOOD.map((l) => (
                    <tr key={l.label}>
                      <td style={{ background: l.bg, color: '#fff', fontWeight: 800, fontSize: 8.5, padding: '4px 8px', width: '38%', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {l.label}
                      </td>
                      <td style={{ background: C.white, fontSize: 8.5, padding: '4px 8px', border: `1px solid ${C.border}` }}>
                        {l.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>

            {/* Consequence Rating */}
            <td style={{ width: '50%', verticalAlign: 'top', paddingLeft: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th colSpan={2} style={{ background: C.dark, color: '#fff', textAlign: 'center', padding: '5px 8px', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      Consequence Rating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CONSEQUENCE.map((c) => (
                    <tr key={c.label}>
                      <td style={{ background: c.bg, color: '#fff', fontWeight: 800, fontSize: 8.5, padding: '4px 8px', width: '38%', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {c.label}
                      </td>
                      <td style={{ background: C.white, fontSize: 8.5, padding: '4px 8px', border: `1px solid ${C.border}` }}>
                        {c.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 3 — 5×5 Risk Matrix
      ══════════════════════════════════════════════════════════════════════ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr>
            <th colSpan={7} style={{ background: C.dark, color: '#fff', textAlign: 'center', padding: '5px 8px', fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Risk Matrix
            </th>
          </tr>
          <tr>
            {/* Corner */}
            <th style={{ background: '#374151', color: '#fff', fontSize: 8, fontWeight: 700, padding: '5px 6px', border: `1px solid ${C.border}`, width: '22%', textAlign: 'center' }}>
              <div style={{ color: '#9ca3af', fontSize: 7.5, marginBottom: 2 }}>LIKELIHOOD</div>
              <div style={{ borderTop: '1px solid #6b7280', paddingTop: 2, color: '#9ca3af', fontSize: 7.5 }}>CONSEQUENCE →</div>
            </th>
            {CONSEQUENCE_COLS.map((col) => (
              <th key={col} style={{ background: '#374151', color: '#fff', fontSize: 7.5, fontWeight: 700, padding: '5px 4px', border: `1px solid ${C.border}`, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((row, ri) => (
            <tr key={ri}>
              <td style={{ background: '#374151', color: '#fff', fontSize: 8, fontWeight: 700, padding: '5px 6px', border: `1px solid ${C.border}`, lineHeight: 1.3 }}>
                <div style={{ fontWeight: 800, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>{LIKELIHOOD_ROWS[ri].label}</div>
                <div style={{ fontSize: 7.5, color: '#9ca3af', fontWeight: 400, marginTop: 1 }}>{LIKELIHOOD_ROWS[ri].sub}</div>
              </td>
              {row.map((rating, ci) => (
                <td key={ci} style={{ background: CELL[rating].bg, color: CELL[rating].text, fontSize: 8, fontWeight: 800, textAlign: 'center', padding: '8px 4px', border: '2px solid #fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {rating}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ══════════════════════════════════════════════════════════════════════
          ROW 4 — Risk Level Actions | Stop Work
      ══════════════════════════════════════════════════════════════════════ */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            {/* Risk Level Actions */}
            <td style={{ width: '65%', verticalAlign: 'top', paddingRight: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th colSpan={2} style={{ background: C.dark, color: '#fff', textAlign: 'center', padding: '5px 8px', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      Risk Level Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_ACTIONS.map((a) => (
                    <tr key={a.rating}>
                      <td style={{ background: a.bg, color: '#fff', fontWeight: 800, fontSize: 8.5, padding: '5px 10px', width: '22%', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {a.rating}
                      </td>
                      <td style={{ background: C.white, fontSize: 8.5, padding: '5px 10px', border: `1px solid ${C.border}` }}>
                        {a.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>

            {/* Stop Work panel */}
            <td style={{ width: '35%', verticalAlign: 'top', paddingLeft: 6 }}>
              <div style={{ background: C.dark, padding: '10px 12px', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {/* Stop hand icon */}
                <div style={{ background: C.red, borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 20, lineHeight: 1 }}>✋</span>
                </div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.3 }}>
                  STOP WORK<br />IF CONDITIONS<br />ARE UNSAFE
                </div>
                {['THINK SAFE', 'WORK SAFE', 'GO HOME SAFE'].map((s) => (
                  <div key={s} style={{ background: '#374151', color: '#fff', fontWeight: 800, fontSize: 8.5, padding: '4px 16px', width: '100%', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {s}
                  </div>
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
