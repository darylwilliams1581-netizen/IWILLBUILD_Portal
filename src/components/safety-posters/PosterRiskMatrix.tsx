// Risk Matrix Poster — derived from industry-standard 5x5 risk matrix reference material.
// No company names or branding. Generic WHS content only.

export interface RiskMatrixData {
  projectName?: string;
  siteAddress?: string;
  date?: string;
}

const LIKELIHOOD = [
  { label: 'ALMOST CERTAIN', sub: 'Expected to occur frequently', color: '#dc2626' },
  { label: 'LIKELY', sub: 'Will probably occur in most circumstances', color: '#ea580c' },
  { label: 'POSSIBLE', sub: 'Might occur at some time', color: '#ca8a04' },
  { label: 'UNLIKELY', sub: 'Could occur at some time', color: '#16a34a' },
  { label: 'RARE', sub: 'May occur only in exceptional circumstances', color: '#15803d' },
];

const CONSEQUENCE = ['INSIGNIFICANT', 'MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC'];
const CONSEQUENCE_DESC = ['Minor first aid only', 'Medical treatment required', 'Serious injury requiring time off', 'Permanent injury', 'Fatality'];

// 5x5 matrix: [likelihood row 0-4][consequence col 0-4]
const MATRIX: Array<Array<{ label: string; color: string; text: string }>> = [
  [
    { label: 'MEDIUM', color: '#ca8a04', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
    { label: 'EXTREME', color: '#dc2626', text: '#fff' },
    { label: 'EXTREME', color: '#dc2626', text: '#fff' },
    { label: 'EXTREME', color: '#dc2626', text: '#fff' },
  ],
  [
    { label: 'MEDIUM', color: '#ca8a04', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
    { label: 'EXTREME', color: '#dc2626', text: '#fff' },
    { label: 'EXTREME', color: '#dc2626', text: '#fff' },
  ],
  [
    { label: 'LOW',    color: '#16a34a', text: '#fff' },
    { label: 'MEDIUM', color: '#ca8a04', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
    { label: 'EXTREME', color: '#dc2626', text: '#fff' },
  ],
  [
    { label: 'LOW',    color: '#16a34a', text: '#fff' },
    { label: 'LOW',    color: '#16a34a', text: '#fff' },
    { label: 'MEDIUM', color: '#ca8a04', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
  ],
  [
    { label: 'LOW',    color: '#16a34a', text: '#fff' },
    { label: 'LOW',    color: '#16a34a', text: '#fff' },
    { label: 'MEDIUM', color: '#ca8a04', text: '#fff' },
    { label: 'MEDIUM', color: '#ca8a04', text: '#fff' },
    { label: 'HIGH',   color: '#ea580c', text: '#fff' },
  ],
];

const RISK_ACTIONS = [
  { level: 'LOW',     color: '#16a34a', action: 'Manage through routine procedures and supervision.' },
  { level: 'MEDIUM',  color: '#ca8a04', action: 'Implement additional controls and monitor regularly.' },
  { level: 'HIGH',    color: '#ea580c', action: 'Immediate management attention required before work proceeds.' },
  { level: 'EXTREME', color: '#dc2626', action: 'Stop work immediately until risk is controlled.' },
];

const HIERARCHY = [
  { step: '1. ELIMINATION',    sub: 'Eliminate the hazard',       color: '#15803d' },
  { step: '2. SUBSTITUTION',   sub: 'Substitute the hazard',      color: '#16a34a' },
  { step: '3. ISOLATION',      sub: 'Isolate the hazard',         color: '#ca8a04' },
  { step: '4. ENGINEERING',    sub: 'Engineering controls',       color: '#ea580c' },
  { step: '5. ADMINISTRATIVE', sub: 'Administrative controls',    color: '#dc2626' },
  { step: '6. PPE',            sub: 'PPE',                        color: '#991b1b' },
];

export default function PosterRiskMatrix({ data }: { data: RiskMatrixData }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#fff', width: '100%', maxWidth: 900, margin: '0 auto', padding: 0, color: '#111' }}>

      {/* Header */}
      <div style={{ background: '#111', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>RISK MATRIX</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>WORKPLACE HEALTH, SAFETY &amp; ENVIRONMENT</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ background: '#dc2626', color: '#fff', fontWeight: 900, fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>ZERO HARM</div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>EVERYONE. EVERY DAY.</div>
        </div>
      </div>

      {data.projectName && (
        <div style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', padding: '8px 24px', fontSize: 12, color: '#475569' }}>
          <strong>Project:</strong> {data.projectName}{data.siteAddress ? ` · ${data.siteAddress}` : ''}{data.date ? ` · ${data.date}` : ''}
        </div>
      )}

      {/* Three-column info row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '2px solid #e2e8f0' }}>
        {/* Risk Assessment Method */}
        <div style={{ padding: '16px 20px', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>!</span>
            RISK ASSESSMENT METHOD
          </div>
          <p style={{ fontSize: 11, lineHeight: 1.5, color: '#374151', margin: 0 }}>
            Use this Risk Matrix to assess hazards and determine appropriate control measures for all work activities.
          </p>
          <p style={{ fontSize: 11, lineHeight: 1.5, color: '#374151', marginTop: 8 }}>Risk assessments must be completed:</p>
          <ul style={{ fontSize: 11, paddingLeft: 16, margin: '4px 0 0', color: '#374151', lineHeight: 1.6 }}>
            <li>Prior to commencing work</li>
            <li>When site conditions change</li>
            <li>Following incidents or near misses</li>
            <li>When new hazards are identified</li>
          </ul>
        </div>

        {/* Hierarchy of Controls */}
        <div style={{ padding: '16px 20px', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>HIERARCHY OF CONTROLS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {HIERARCHY.map((h, i) => (
              <div key={i} style={{ background: h.color, color: '#fff', padding: '5px 10px', borderRadius: 3, fontSize: 10, fontWeight: 700, textAlign: 'center', width: `${100 - i * 10}%`, margin: '0 auto' }}>
                {h.step}<br /><span style={{ fontWeight: 400, fontSize: 9 }}>{h.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Safety Requirements */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>✓</span>
            SAFETY REQUIREMENTS
          </div>
          <p style={{ fontSize: 11, color: '#374151', margin: '0 0 6px' }}>All workers, subcontractors and visitors are required to:</p>
          {['Participate in risk assessments', 'Follow Safe Work Method Statements (SWMS)', 'Report hazards immediately', 'Stop work if conditions become unsafe', 'Assist in maintaining a safe workplace'].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#dc2626', fontWeight: 900, fontSize: 13, lineHeight: 1 }}>✓</span>
              <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.4 }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Likelihood & Consequence tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px 24px', borderBottom: '2px solid #e2e8f0' }}>
        {/* Likelihood */}
        <div>
          <div style={{ background: '#111', color: '#fff', fontWeight: 800, fontSize: 12, padding: '6px 12px', textAlign: 'center', marginBottom: 4 }}>LIKELIHOOD RATING</div>
          {LIKELIHOOD.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ background: l.color, color: '#fff', fontWeight: 800, fontSize: 10, padding: '6px 10px', display: 'flex', alignItems: 'center' }}>{l.label}</div>
              <div style={{ fontSize: 10, padding: '6px 10px', color: '#374151', display: 'flex', alignItems: 'center' }}>{l.sub}</div>
            </div>
          ))}
        </div>
        {/* Consequence */}
        <div>
          <div style={{ background: '#111', color: '#fff', fontWeight: 800, fontSize: 12, padding: '6px 12px', textAlign: 'center', marginBottom: 4 }}>CONSEQUENCE RATING</div>
          {CONSEQUENCE.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ background: LIKELIHOOD[Math.min(i, 4)].color, color: '#fff', fontWeight: 800, fontSize: 10, padding: '6px 10px', display: 'flex', alignItems: 'center' }}>{c}</div>
              <div style={{ fontSize: 10, padding: '6px 10px', color: '#374151', display: 'flex', alignItems: 'center' }}>{CONSEQUENCE_DESC[i]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Matrix grid */}
      <div style={{ padding: '16px 24px', borderBottom: '2px solid #e2e8f0' }}>
        <div style={{ background: '#111', color: '#fff', fontWeight: 800, fontSize: 14, padding: '8px 12px', textAlign: 'center', marginBottom: 8 }}>RISK MATRIX</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>
              <th style={{ background: '#111', color: '#fff', padding: '6px 8px', fontWeight: 800, width: 140 }}>LIKELIHOOD</th>
              {CONSEQUENCE.map((c) => (
                <th key={c} style={{ background: '#374151', color: '#fff', padding: '6px 4px', fontWeight: 700, textAlign: 'center' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LIKELIHOOD.map((l, ri) => (
              <tr key={ri}>
                <td style={{ background: l.color, color: '#fff', fontWeight: 800, padding: '8px 10px', fontSize: 10, lineHeight: 1.3 }}>
                  <div>{l.label}</div>
                  <div style={{ fontWeight: 400, fontSize: 9, opacity: 0.9 }}>{l.sub}</div>
                </td>
                {MATRIX[ri].map((cell, ci) => (
                  <td key={ci} style={{ background: cell.color, color: cell.text, fontWeight: 800, textAlign: 'center', padding: '8px 4px', fontSize: 11 }}>{cell.label}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Risk Level Actions + Stop Work */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, padding: '16px 24px' }}>
        <div>
          <div style={{ background: '#111', color: '#fff', fontWeight: 800, fontSize: 12, padding: '6px 12px', textAlign: 'center', marginBottom: 4 }}>RISK LEVEL ACTIONS</div>
          {RISK_ACTIONS.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ background: r.color, color: '#fff', fontWeight: 800, fontSize: 11, padding: '7px 10px', display: 'flex', alignItems: 'center' }}>{r.level}</div>
              <div style={{ fontSize: 11, padding: '7px 10px', color: '#374151', display: 'flex', alignItems: 'center' }}>{r.action}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#111', color: '#fff', padding: '16px 20px', borderRadius: 6, textAlign: 'center', minWidth: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 24 }}>✋</div>
          </div>
          <div style={{ fontWeight: 900, fontSize: 14, color: '#dc2626', lineHeight: 1.2 }}>STOP WORK<br />IF CONDITIONS<br />ARE UNSAFE</div>
          <div style={{ fontSize: 11, color: '#d1d5db', lineHeight: 1.6 }}>THINK SAFE<br />WORK SAFE<br />GO HOME SAFE</div>
        </div>
      </div>
    </div>
  );
}
