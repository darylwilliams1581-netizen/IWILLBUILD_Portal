// PPE Requirements Poster — derived from industry-standard PPE reference material.
// No company names or branding.

export interface PPEData {
  projectName?: string;
  siteAddress?: string;
  additionalRequirements?: string;
}

const PPE_ITEMS = [
  { icon: '🪖', label: 'SAFETY\nHELMET' },
  { icon: '👟', label: 'SAFETY\nFOOTWEAR' },
  { icon: '🥽', label: 'EYE\nPROTECTION' },
  { icon: '🧤', label: 'GENERAL PURPOSE\nGLOVES' },
  { icon: '⚡', label: 'ELECTRICAL\nGLOVES' },
  { icon: '🎧', label: 'HEARING\nPROTECTION' },
  { icon: '🦺', label: 'HI-VIS\nCLOTHING' },
  { icon: '😷', label: 'RESPIRATORY\nPROTECTION' },
  { icon: '🪢', label: 'FALL ARREST\nHARNESS' },
];

const COMMITMENTS = [
  'Always wear the required PPE as defined in Safe Work Procedures (SWP), Safe Work Method Statements (SWMS), risk assessments and site rules.',
  'Always inspect PPE before use and replace it if damaged or unserviceable.',
  'Ensure you are trained in using the PPE required for the task and ask your supervisor if unsure.',
  'Ensure all workers, contractors and visitors are wearing the required PPE for the task they are undertaking.',
  'Always wear the correct PPE when handling hazardous substances in line with the Safety Data Sheet (SDS).',
  'Report to your supervisor if there are insufficient stocks of PPE or if any item is damaged.',
];

export default function PosterPPE({ data }: { data: PPEData }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#111', color: '#fff', width: '100%', maxWidth: 900, margin: '0 auto', padding: 0, borderRadius: 6, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#111', padding: '16px 24px', borderBottom: '3px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>PPE REQUIREMENTS</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>PERSONAL PROTECTIVE EQUIPMENT</div>
          {data.projectName && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{data.projectName}{data.siteAddress ? ` · ${data.siteAddress}` : ''}</div>}
        </div>
        <div style={{ background: '#dc2626', borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🦺</div>
      </div>

      {/* PPE icons row */}
      <div style={{ background: '#1f2937', padding: '16px 24px', borderBottom: '2px solid #374151' }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {PPE_ITEMS.map((item, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 64, height: 64, background: '#111', border: '2px solid #dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                {item.icon}
              </div>
              <div style={{ fontSize: 8, fontWeight: 700, color: '#dc2626', textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-line' }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

        {/* Left — PPE title block */}
        <div style={{ padding: '24px', background: '#1a0a0a', borderRight: '2px solid #374151', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#dc2626', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🛡️</div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1 }}>Personal</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1 }}>Protective</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626', lineHeight: 1 }}>Equipment</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#dc2626' }}>(PPE)</div>
            </div>
          </div>
          {data.additionalRequirements && (
            <div style={{ background: '#374151', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: '#d1d5db', lineHeight: 1.5 }}>
              <strong>Additional Site Requirements:</strong><br />{data.additionalRequirements}
            </div>
          )}
        </div>

        {/* Right — commitments */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb', marginBottom: 12, lineHeight: 1.4 }}>
            I will inspect and wear the correct item of PPE for the task being undertaken in my workplace.
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 10 }}>I will:</div>
          {COMMITMENTS.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{ background: '#dc2626', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0, marginTop: 1 }}>✓</div>
              <div style={{ fontSize: 11, color: '#d1d5db', lineHeight: 1.5 }}>{c}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: '#1f2937', borderTop: '2px solid #374151', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: 1 }}>
          Think Safe &nbsp;•&nbsp; Work Safe &nbsp;•&nbsp; Go Home Safe
        </div>
      </div>
    </div>
  );
}
