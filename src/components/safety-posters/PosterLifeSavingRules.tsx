// Life Saving Rules Poster — 12 rules in a 3x4 grid.
// Derived from industry-standard life saving rules reference material.
// No company names or branding.

export interface LifeSavingRulesData {
  projectName?: string;
  siteAddress?: string;
}

const RULES = [
  { icon: '🧗', title: 'WORKING AT HEIGHTS', desc: 'Adhere to fall protection requirements at all times when working at heights.' },
  { icon: '🚗', title: 'ROAD SAFETY', desc: 'Obey all traffic rules while driving and walking for road safety.' },
  { icon: '📋', title: 'PERMIT TO WORK', desc: 'Obtain relevant Permit to Work authorisation before beginning a task.' },
  { icon: '🏗️', title: 'LIFTING OPERATIONS', desc: 'Adhere to all precautions and continuously assess risks during lifting operations.' },
  { icon: '🚪', title: 'CONFINED SPACE', desc: 'Obtain a valid permit to work before entering a confined space.' },
  { icon: '🔥', title: 'IGNITION SOURCES / FLAMMABLE MATERIAL', desc: 'Keep ignition sources outside flammable areas. Stop work and report if 1% methane is detected.' },
  { icon: '🔒', title: 'LOCK-OUT AND ISOLATION', desc: 'Follow Lock-Out and Isolation procedure before work begins.' },
  { icon: '🪖', title: 'WEAR CORRECT PPE', desc: 'Wear the correct PPE correctly at all times.' },
  { icon: '🚫', title: 'ALCOHOL OR DRUGS', desc: 'Entering the workplace while under the influence of alcohol or drugs is prohibited.' },
  { icon: '📝', title: 'ADHERE TO PROCEDURES', desc: 'Adhere to procedures prescribed before, during and at the end of tasks.' },
  { icon: '🚜', title: 'HEAVY MOBILE EQUIPMENT', desc: 'Keep a safe distance from operational Heavy Mobile Equipment (HME).' },
  { icon: '⛏️', title: 'EXCAVATION / FALL OF GROUND', desc: 'Adhere to excavation permit requirements and remain under a supported roof.' },
];

export default function PosterLifeSavingRules({ data }: { data: LifeSavingRulesData }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#111', color: '#fff', width: '100%', maxWidth: 900, margin: '0 auto', padding: 0, borderRadius: 6, overflow: 'hidden' }}>

      {/* Hazard stripe header */}
      <div style={{ height: 16, background: 'repeating-linear-gradient(45deg, #dc2626, #dc2626 10px, #111 10px, #111 20px)' }} />

      {/* Title */}
      <div style={{ padding: '16px 24px', borderBottom: '2px solid #374151' }}>
        {data.projectName && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{data.projectName}{data.siteAddress ? ` · ${data.siteAddress}` : ''}</div>}
      </div>

      {/* Rules grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, padding: '2px', background: '#374151' }}>
        {RULES.map((r, i) => (
          <div key={i} style={{ background: '#1f2937', padding: '16px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 52, height: 52, background: '#7f1d1d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              {r.icon}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 11, color: '#f9fafb', marginBottom: 4, lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ fontSize: 10, color: '#d1d5db', lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Life Saving Rules footer */}
      <div style={{ background: '#7f1d1d', padding: '16px 24px', borderTop: '2px solid #dc2626' }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>LIFE SAVING RULES</div>
        <div style={{ width: '100%', height: 1, background: '#dc2626', marginBottom: 10 }} />
        {[
          'These rules are for your safety and must be adhered to, to prevent injuries and save lives.',
          'Safety is our highest priority — not adhering to these rules will require corrective action.',
          'Each rule has a list of behaviours that are part of our existing policies, procedures and practices.',
          'These rules apply to all employees, service providers and visitors that work at or visit this site.',
        ].map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: '#fecaca', lineHeight: 1.5 }}>
            <span style={{ color: '#dc2626', fontWeight: 900 }}>•</span>{t}
          </div>
        ))}
      </div>

      {/* Hazard stripe footer */}
      <div style={{ height: 16, background: 'repeating-linear-gradient(45deg, #dc2626, #dc2626 10px, #111 10px, #111 20px)' }} />
    </div>
  );
}
