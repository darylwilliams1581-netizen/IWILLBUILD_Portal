// Lift and Move Safely Poster — derived from manual handling reference material.
// No company names or branding.

export interface LiftSafelyData {
  projectName?: string;
  siteAddress?: string;
}

const TIPS = [
  { icon: '👥', text: 'Use help or an aid for awkward or heavy loads.' },
  { icon: '⏰', text: 'Take breaks when doing repetitive tasks.' },
  { icon: '📦', text: 'Store awkward or heavy items at waist height.' },
  { icon: '🚫', text: 'Do not throw items.' },
  { icon: '🏗️', text: 'Control the release of loads.' },
];

const TECHNIQUE = [
  'Plan the lift — check the load, clear the path.',
  'Position feet shoulder-width apart, close to the load.',
  'Bend at the knees, keep back straight.',
  'Grip the load firmly with both hands.',
  'Lift using your legs, not your back.',
  'Keep the load close to your body.',
  'Turn with your feet — do not twist your back.',
  'Lower the load by bending your knees.',
];

export default function PosterLiftSafely({ data }: { data: LiftSafelyData }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#fff', color: '#111', width: '100%', maxWidth: 700, margin: '0 auto', padding: 0, borderRadius: 6, overflow: 'hidden', border: '4px solid #111' }}>

      {/* Title */}
      <div style={{ background: '#fff', padding: '20px 28px 8px', borderBottom: '3px solid #7f1d1d' }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: '#7f1d1d', lineHeight: 1, letterSpacing: -1 }}>LIFT AND</div>
        <div style={{ fontSize: 40, fontWeight: 900, color: '#7f1d1d', lineHeight: 1, letterSpacing: -1 }}>MOVE SAFELY</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginTop: 6 }}>Avoid stressing your body.</div>
        {data.projectName && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{data.projectName}{data.siteAddress ? ` · ${data.siteAddress}` : ''}</div>}
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

        {/* Left — illustration placeholder + technique */}
        <div style={{ padding: '20px 20px', borderRight: '2px solid #e5e7eb' }}>
          <div style={{ background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: 8, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 48 }}>🏋️</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Correct lifting posture</div>
            </div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 12, color: '#7f1d1d', marginBottom: 8 }}>CORRECT TECHNIQUE</div>
          {TECHNIQUE.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5, fontSize: 11, color: '#374151', lineHeight: 1.4 }}>
              <span style={{ color: '#7f1d1d', fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>{t}
            </div>
          ))}
        </div>

        {/* Right — tips */}
        <div style={{ padding: '20px 20px' }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: '#7f1d1d', marginBottom: 12 }}>KEY RULES</div>
          {TIPS.map((tip, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < TIPS.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
              <div style={{ width: 40, height: 40, background: '#7f1d1d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {tip.icon}
              </div>
              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, fontWeight: 600 }}>{tip.text}</div>
            </div>
          ))}

          <div style={{ background: '#7f1d1d', borderRadius: 6, padding: '12px 14px', marginTop: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: '#fff', marginBottom: 4 }}>REMEMBER</div>
            <div style={{ fontSize: 11, color: '#fecaca', lineHeight: 1.5 }}>
              If a load is too heavy or awkward — stop and get help. No load is worth a back injury.
            </div>
          </div>
        </div>
      </div>

      {/* Footer chevron */}
      <div style={{ background: '#7f1d1d', padding: '10px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>
          Think Safe &nbsp;•&nbsp; Work Safe &nbsp;•&nbsp; Go Home Safe
        </div>
      </div>
    </div>
  );
}
