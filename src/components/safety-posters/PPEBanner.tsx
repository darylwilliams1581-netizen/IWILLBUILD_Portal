// PPE Requirements Banner — compact single-row strip for SWMS print output.
// Light background with orange accent label and bordered icon cells — print-friendly.

const PPE_ITEMS = [
  { icon: '🪖', label: 'SAFETY\nHELMET' },
  { icon: '👟', label: 'SAFETY\nFOOTWEAR' },
  { icon: '🥽', label: 'EYE\nPROTECTION' },
  { icon: '🧤', label: 'GLOVES' },
  { icon: '🎧', label: 'HEARING\nPROTECTION' },
  { icon: '🦺', label: 'HI-VIS\nCLOTHING' },
  { icon: '😷', label: 'RESPIRATORY\nPROTECTION' },
  { icon: '🪢', label: 'FALL ARREST\nHARNESS' },
  { icon: '⚡', label: 'ELEC.\nGLOVES' },
];

export default function PPEBanner() {
  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      background: '#fff',
      border: '2px solid #7c3aed',
      borderRadius: 6,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'stretch',
    }}>
      {/* Left label — orange only, no black */}
      <div style={{
        background: '#7c3aed',
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 60,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 18 }}>🦺</div>
        <div style={{
          fontSize: 7,
          fontWeight: 900,
          color: '#fff',
          textAlign: 'center',
          letterSpacing: 0.5,
          marginTop: 4,
          lineHeight: 1.3,
          whiteSpace: 'pre-line',
        }}>{'PPE\nREQUIRED'}</div>
      </div>

      {/* Icon strip — white background */}
      <div style={{
        flex: 1,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '8px 10px',
        gap: 4,
      }}>
        {PPE_ITEMS.map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: 34,
              height: 34,
              background: '#fff9f5',
              border: '1.5px solid #7c3aed',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
            }}>
              {item.icon}
            </div>
            <div style={{
              fontSize: 6,
              fontWeight: 700,
              color: '#c2410c',
              textAlign: 'center',
              lineHeight: 1.2,
              whiteSpace: 'pre-line',
            }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
