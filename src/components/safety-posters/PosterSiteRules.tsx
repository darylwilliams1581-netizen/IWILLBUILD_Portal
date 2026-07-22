// Site Rules Poster — generic construction site rules.
// No company names or branding. Site-specific fields filled by user.

export interface SiteRulesData {
  projectName?: string;
  siteAddress?: string;
  siteSpeedLimit?: string;
  additionalRules?: string;
}

const RULES = [
  { icon: '📋', title: 'INDUCTION', desc: 'All workers, visitors and contractors must complete a site induction before entering the work area.' },
  { icon: '🪖', title: 'PPE MANDATORY', desc: 'Hard hat, hi-vis vest and steel-capped boots must be worn at all times. Additional PPE as required by task.' },
  { icon: '🚫', title: 'NO ALCOHOL OR DRUGS', desc: 'No person is permitted on site under the influence of alcohol or drugs. Random testing may be conducted.' },
  { icon: '📵', title: 'MOBILE PHONES', desc: 'No mobile phone use while operating plant, equipment or vehicles. Hands-free only while driving.' },
  { icon: '🚬', title: 'SMOKING', desc: 'Smoking in designated areas only. No smoking within 10 metres of flammable materials or fuel storage.' },
  { icon: '🚗', title: 'SPEED LIMIT', desc: 'Maximum site speed limit applies at all times. Pedestrians have right of way.' },
  { icon: '🏗️', title: 'PLANT & EQUIPMENT', desc: 'Only licensed and competent operators may operate plant. Pre-start inspections mandatory. Tag out defective plant.' },
  { icon: '⚠️', title: 'HAZARD REPORTING', desc: 'All hazards, near misses and incidents must be reported to the site supervisor immediately.' },
  { icon: '🧹', title: 'HOUSEKEEPING', desc: 'Work areas must be kept clean and tidy. Walkways and emergency exits must remain clear at all times.' },
  { icon: '🌿', title: 'ENVIRONMENTAL', desc: 'No materials or chemicals to be discharged to stormwater drains. Spills must be contained and reported.' },
  { icon: '👥', title: 'VISITORS', desc: 'All visitors must sign in at the site office and be accompanied by a site representative at all times.' },
  { icon: '🚨', title: 'EMERGENCY', desc: 'Familiarise yourself with emergency assembly points and evacuation routes on arrival. Call 000 if required.' },
];

export default function PosterSiteRules({ data }: { data: SiteRulesData }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#111', color: '#fff', width: '100%', maxWidth: 900, margin: '0 auto', padding: 0, borderRadius: 6, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#dc2626', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>SITE RULES</div>
          <div style={{ fontSize: 12, color: '#fecaca', marginTop: 2 }}>ALL PERSONS ON SITE MUST COMPLY</div>
          {data.projectName && <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 4 }}>{data.projectName}{data.siteAddress ? ` · ${data.siteAddress}` : ''}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {data.siteSpeedLimit && (
            <div style={{ background: '#fff', color: '#dc2626', fontWeight: 900, fontSize: 20, borderRadius: '50%', width: 60, height: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '3px solid #111' }}>
              <div style={{ fontSize: 8, fontWeight: 700 }}>MAX</div>
              <div style={{ fontSize: 18, lineHeight: 1 }}>{data.siteSpeedLimit}</div>
              <div style={{ fontSize: 7 }}>km/h</div>
            </div>
          )}
        </div>
      </div>

      {/* Rules grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, padding: '2px', background: '#374151' }}>
        {RULES.map((r, i) => (
          <div key={i} style={{ background: '#1f2937', padding: '14px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, background: '#dc2626', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {r.icon}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 10, color: '#f9fafb', marginBottom: 3 }}>{r.title}</div>
              <div style={{ fontSize: 10, color: '#d1d5db', lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {data.additionalRules && (
        <div style={{ background: '#1f2937', padding: '12px 20px', borderTop: '2px solid #374151' }}>
          <div style={{ fontWeight: 800, fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>ADDITIONAL SITE RULES</div>
          <div style={{ fontSize: 11, color: '#d1d5db', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{data.additionalRules}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ background: '#111', borderTop: '2px solid #dc2626', padding: '10px 24px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: 1 }}>
        STOP WORK IF CONDITIONS ARE UNSAFE &nbsp;|&nbsp; LOOK OUT FOR YOUR MATES &nbsp;|&nbsp; EVERYONE GOES HOME SAFE EVERY DAY
      </div>
    </div>
  );
}
