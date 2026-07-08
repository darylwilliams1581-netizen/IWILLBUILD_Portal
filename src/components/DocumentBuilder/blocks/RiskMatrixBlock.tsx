/**
 * RiskMatrixBlock
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a 5×5 AS/NZS-style risk matrix (Likelihood × Consequence) with
 * colour-coded cells: green / yellow / orange / red.
 *
 * Matches the standard Australian construction / WHS risk matrix layout.
 */
import { useDocumentStore } from '../useDocumentStore';
import type { RiskMatrixBlock } from '../types';

interface Props {
  block: RiskMatrixBlock;
  columnsBlockId?: string;
  columnId?: string;
}

// ── Matrix data ───────────────────────────────────────────────────────────────

const LIKELIHOOD_LABELS = [
  { key: 'A', label: 'Almost Certain', sub: 'Expected to occur in most circumstances' },
  { key: 'B', label: 'Likely',         sub: 'Will probably occur in most circumstances' },
  { key: 'C', label: 'Possible',       sub: 'Might occur at some time' },
  { key: 'D', label: 'Unlikely',       sub: 'Could occur at some time' },
  { key: 'E', label: 'Rare',           sub: 'May occur only in exceptional circumstances' },
];

const CONSEQUENCE_LABELS = [
  { key: '1', label: 'Insignificant', sub: 'No injuries / minimal loss' },
  { key: '2', label: 'Minor',         sub: 'First aid / minor loss' },
  { key: '3', label: 'Moderate',      sub: 'Medical treatment / moderate loss' },
  { key: '4', label: 'Major',         sub: 'Extensive injuries / major loss' },
  { key: '5', label: 'Catastrophic',  sub: 'Death / huge loss' },
];

type CellRating = 'low' | 'medium' | 'high' | 'extreme';

// Row = Likelihood (A→E), Col = Consequence (1→5)
const MATRIX: CellRating[][] = [
  ['high',    'high',    'extreme', 'extreme', 'extreme'], // A – Almost Certain
  ['medium',  'high',    'high',    'extreme', 'extreme'], // B – Likely
  ['low',     'medium',  'high',    'extreme', 'extreme'], // C – Possible
  ['low',     'low',     'medium',  'high',    'extreme'], // D – Unlikely
  ['low',     'low',     'medium',  'high',    'high'   ], // E – Rare
];

const CELL_STYLES: Record<CellRating, { bg: string; text: string; label: string }> = {
  low:     { bg: '#22c55e', text: '#fff',     label: 'LOW' },
  medium:  { bg: '#eab308', text: '#1a1a1a',  label: 'MEDIUM' },
  high:    { bg: '#f97316', text: '#fff',     label: 'HIGH' },
  extreme: { bg: '#dc2626', text: '#fff',     label: 'EXTREME' },
};

const LEGEND_ITEMS: { rating: CellRating; action: string }[] = [
  { rating: 'extreme', action: 'Immediate action required — stop work if necessary' },
  { rating: 'high',    action: 'Senior management attention required' },
  { rating: 'medium',  action: 'Management responsibility must be specified' },
  { rating: 'low',     action: 'Manage by routine procedures' },
];

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

  return (
    <div className="my-2 font-sans" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      {/* Title */}
      {mode === 'edit' ? (
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => update({ title: e.currentTarget.textContent ?? '' })}
          className="text-base font-bold text-slate-800 mb-2 outline-none cursor-text"
          dangerouslySetInnerHTML={{ __html: block.title }}
        />
      ) : (
        block.title && (
          <p className="text-base font-bold text-slate-800 mb-2">{block.title}</p>
        )
      )}

      {/* Matrix table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480, tableLayout: 'fixed' }}>
          <colgroup>
            {/* Likelihood label col */}
            <col style={{ width: '18%' }} />
            {/* 5 consequence cols */}
            {CONSEQUENCE_LABELS.map((c) => (
              <col key={c.key} style={{ width: '16.4%' }} />
            ))}
          </colgroup>

          {/* Header row — Consequence labels */}
          <thead>
            <tr>
              {/* Corner cell */}
              <th
                style={{
                  background: '#1e293b',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '6px 4px',
                  textAlign: 'center',
                  border: '1px solid #334155',
                  verticalAlign: 'bottom',
                }}
              >
                <div style={{ color: '#94a3b8', fontSize: 8, marginBottom: 2 }}>LIKELIHOOD</div>
                <div style={{ borderTop: '1px solid #475569', paddingTop: 2, color: '#94a3b8', fontSize: 8 }}>CONSEQUENCE →</div>
              </th>
              {CONSEQUENCE_LABELS.map((c) => (
                <th
                  key={c.key}
                  style={{
                    background: '#1e293b',
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '5px 3px',
                    textAlign: 'center',
                    border: '1px solid #334155',
                    lineHeight: 1.3,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 1 }}>{c.key}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{c.label}</div>
                  <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 1, fontWeight: 400 }}>{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body rows — Likelihood × Consequence */}
          <tbody>
            {LIKELIHOOD_LABELS.map((l, rowIdx) => (
              <tr key={l.key}>
                {/* Likelihood label cell */}
                <td
                  style={{
                    background: '#1e293b',
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '5px 4px',
                    border: '1px solid #334155',
                    lineHeight: 1.3,
                    verticalAlign: 'middle',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 1 }}>{l.key}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{l.label}</div>
                  <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 1, fontWeight: 400 }}>{l.sub}</div>
                </td>

                {/* Rating cells */}
                {MATRIX[rowIdx].map((rating, colIdx) => {
                  const style = CELL_STYLES[rating];
                  return (
                    <td
                      key={colIdx}
                      style={{
                        background: style.bg,
                        color: style.text,
                        fontSize: 8,
                        fontWeight: 800,
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        padding: '8px 2px',
                        border: '2px solid #fff',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      {style.label}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      {block.showLegend && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LEGEND_ITEMS.map(({ rating, action }) => {
            const s = CELL_STYLES[rating];
            return (
              <div
                key={rating}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  flex: '1 1 200px',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    background: s.bg,
                    color: s.text,
                    fontSize: 7,
                    fontWeight: 800,
                    padding: '3px 6px',
                    borderRadius: 3,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    minWidth: 56,
                    textAlign: 'center',
                  }}
                >
                  {s.label}
                </div>
                <span style={{ fontSize: 8, color: '#475569', lineHeight: 1.4 }}>{action}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
