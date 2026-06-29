// PPE Requirements Banner — compact single-row strip for SWMS print output.
// Shows the PPE icon set in a horizontal banner, not the full poster.

const PPE_ITEMS = [
  { icon: '🪖', label: 'SAFETY\nHELMET' },
  { icon: '👟', label: 'SAFETY\nFOOTWEAR' },
  { icon: '🥽', label: 'EYE\nPROTECTION' },
  { icon: '🧤', label: 'GLOVES' },
  { icon: '⚡', label: 'ELEC.\nGLOVES' },
  { icon: '🎧', label: 'HEARING\nPROTECTION' },
  { icon: '🦺', label: 'HI-VIS\nCLOTHING' },
  { icon: '😷', label: 'RESPIRATORY\nPROTECTION' },
  { icon: '🪢', label: 'FALL ARREST\nHARNESS' },
];

export default function PPEBanner() {
  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      background: '#111',
      color: '#fff',
      width: '100%',
      borderRadius: 5,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'stretch',
    }}>
      {/* Left label */}
      <div style={{
        background: '#dc2626',
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 64,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 20 }}>🦺</div>
        <div style={{ fontSize: 7, fontWeight: 900, color: '#fff', textAlign: 'center', letterSpacing: 0.5, marginTop: 4, lineHeight: 1.3 }}>PPE{'\n'}REQUIRED</div>
      </div>

      {/* Icon strip */}
      <div style={{
        flex: 1,
        background: '#1f2937',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '8px 12px',
        gap: 6,
      }}>
        {PPE_ITEMS.map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: 36,
              height: 36,
              background: '#111',
              border: '1.5px solid #dc2626',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}>
              {item.icon}
            </div>
            <div style={{
              fontSize: 6,
              fontWeight: 700,
              color: '#dc2626',
              textAlign: 'center',
              lineHeight: 1.2,
              whiteSpace: 'pre-line',
            }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Right tagline */}
      <div style={{
        background: '#374151',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 72,
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 7,
          fontWeight: 700,
          color: '#9ca3af',
          textAlign: 'center',
          lineHeight: 1.6,
          letterSpacing: 0.3,
        }}>
          Think Safe{'\n'}Work Safe{'\n'}Go Home Safe
        </div>
      </div>
    </div>
  );
}
