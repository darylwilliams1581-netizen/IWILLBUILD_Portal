// Emergency Assembly Point Poster — generic industry-standard layout.
// No company names or branding. Site-specific fields filled by user.

export interface EmergencyAssemblyData {
  projectName?: string;
  siteAddress?: string;
  assemblyPointDescription?: string;
  siteSupervisor?: string;
  siteSupervisorPhone?: string;
  firstAidOfficer?: string;
  firstAidOfficerPhone?: string;
  nearestHospital?: string;
  electricityEmergency?: string;
}

const STEPS = [
  'Stop work immediately.',
  'Make plant and equipment safe where possible.',
  'Proceed calmly to the Emergency Assembly Point.',
  'Report to the Site Supervisor / Emergency Warden.',
  'Await further instructions.',
  'Do not re-enter the worksite until authorised.',
];

export default function PosterEmergencyAssembly({ data }: { data: EmergencyAssemblyData }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#111', color: '#fff', width: '100%', maxWidth: 900, margin: '0 auto', padding: 0, borderRadius: 6, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#111', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #dc2626' }}>
        <div>
          {data.projectName && <div style={{ fontSize: 12, color: '#9ca3af' }}>{data.projectName}{data.siteAddress ? ` · ${data.siteAddress}` : ''}</div>}
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1, marginTop: 2 }}>EMERGENCY ASSEMBLY POINT</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>MUSTER POINT</div>
        </div>
        <div style={{ width: 60, height: 60, background: '#15803d', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
          🏃
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

        {/* Left column */}
        <div style={{ padding: '20px 20px', borderRight: '2px solid #374151' }}>
          {/* Assembly point description */}
          <div style={{ background: '#15803d', borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🏃</span> EMERGENCY ASSEMBLY POINT
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, color: '#dcfce7' }}>
              {data.assemblyPointDescription || 'The designated Emergency Assembly Point (Muster Point) is located at the site entry. This area is safe, accessible and suitable for all personnel to assemble during an emergency evacuation.'}
            </p>
          </div>

          {/* In an emergency */}
          <div style={{ background: '#dc2626', borderRadius: 4, padding: '8px 12px', marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>IN AN EMERGENCY</div>
          </div>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <div style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: '#e5e7eb' }}>{s}</div>
            </div>
          ))}

          {/* Keep access clear */}
          <div style={{ background: '#ca8a04', borderRadius: 6, padding: '10px 14px', marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 13, color: '#111' }}>KEEP ACCESS CLEAR</div>
              <div style={{ fontSize: 11, color: '#1c1917' }}>Emergency access must remain clear at all times.</div>
            </div>
          </div>
        </div>

        {/* Right column — map placeholder */}
        <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#1f2937', borderRadius: 8, flex: 1, minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #374151' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
            <div style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '0 20px' }}>
              Site map / aerial photo<br />
              <span style={{ fontSize: 11 }}>Mark the Emergency Assembly Point on your printed copy</span>
            </div>
          </div>
          <div style={{ background: '#1f2937', borderRadius: 6, padding: '10px 14px', border: '1px solid #374151' }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>LEGEND</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: '#dc2626', fontSize: 16 }}>★</span>
              <span style={{ color: '#d1d5db' }}>Emergency Assembly Point</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom info row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 0, borderTop: '2px solid #374151' }}>
        <div style={{ padding: '12px 16px', borderRight: '1px solid #374151' }}>
          <div style={{ fontWeight: 800, fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>EMERGENCY CONTACTS</div>
          {[
            { label: '📞 Emergency Services', val: '000' },
            { label: '⚡ Electricity Emergency', val: data.electricityEmergency || '13 19 62' },
            { label: '👷 Site Supervisor', val: data.siteSupervisor ? `${data.siteSupervisor}${data.siteSupervisorPhone ? ' · ' + data.siteSupervisorPhone : ''}` : 'See site office' },
            { label: '➕ First Aid Officer', val: data.firstAidOfficer ? `${data.firstAidOfficer}${data.firstAidOfficerPhone ? ' · ' + data.firstAidOfficerPhone : ''}` : 'See site office' },
          ].map((r, i) => (
            <div key={i} style={{ fontSize: 10, color: '#d1d5db', marginBottom: 3 }}><span style={{ color: '#9ca3af' }}>{r.label}:</span> {r.val}</div>
          ))}
        </div>
        <div style={{ padding: '12px 16px', borderRight: '1px solid #374151' }}>
          <div style={{ fontWeight: 800, fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>IMPORTANT INFORMATION</div>
          {['Report all incidents, hazards and near misses.', 'All personnel must sign in and out daily.', 'Visitors and subcontractors must be briefed on emergency procedures.', 'Head counts will be conducted at the assembly point.'].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, fontSize: 10, color: '#d1d5db', marginBottom: 3 }}>
              <span style={{ color: '#15803d' }}>✓</span>{r}
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 16px', borderRight: '1px solid #374151' }}>
          <div style={{ fontWeight: 800, fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>SAFETY REMINDERS</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {['🪖 THINK SAFE', '🏗️ WORK SAFE', '🏠 GO HOME SAFE'].map((r, i) => (
              <div key={i} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, textAlign: 'center', color: '#d1d5db', padding: 4 }}>{r}</div>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px 16px', background: '#15803d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minWidth: 120 }}>
          <div style={{ fontWeight: 900, fontSize: 13, lineHeight: 1.3 }}>YOUR SAFETY<br />IS OUR PRIORITY</div>
          <div style={{ fontWeight: 900, fontSize: 16, marginTop: 6, color: '#fff' }}>ZERO HARM</div>
        </div>
      </div>

      {/* Footer strip */}
      <div style={{ background: '#111', borderTop: '2px solid #dc2626', padding: '8px 24px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 1 }}>
        STOP WORK IF CONDITIONS ARE UNSAFE &nbsp;|&nbsp; LOOK OUT FOR YOUR MATES &nbsp;|&nbsp; EVERYONE GOES HOME SAFE EVERY DAY
      </div>
    </div>
  );
}
