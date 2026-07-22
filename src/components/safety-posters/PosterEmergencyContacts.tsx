// Emergency Contacts Poster — generic industry-standard layout.
// No company names or branding. Site-specific fields filled by user.

export interface EmergencyContactsData {
  projectName?: string;
  siteAddress?: string;
  siteSupervisor?: string;
  siteSupervisorPhone?: string;
  firstAidOfficer?: string;
  firstAidOfficerPhone?: string;
  nearestHospital?: string;
  nearestHospitalAddress?: string;
  medicalCentre?: string;
  medicalCentreAddress?: string;
  electricityEmergency?: string;
  gasEmergency?: string;
  waterEmergency?: string;
  extraService1Label?: string;
  extraService1Number?: string;
  extraService2Label?: string;
  extraService2Number?: string;
}

export default function PosterEmergencyContacts({ data }: { data: EmergencyContactsData }) {
  const rows = [
    { service: 'Emergency Services (Police / Fire / Ambulance)', contact: '000', bold: true },
    { service: 'Electricity Emergency', contact: data.electricityEmergency || '13 19 62' },
    { service: 'Gas Emergency', contact: data.gasEmergency || '1800 GAS GAS (1800 427 427)' },
    { service: 'Water Emergency', contact: data.waterEmergency || 'Contact local water authority' },
    ...(data.extraService1Label ? [{ service: data.extraService1Label, contact: data.extraService1Number || '' }] : []),
    ...(data.extraService2Label ? [{ service: data.extraService2Label, contact: data.extraService2Number || '' }] : []),
    { service: 'Site Supervisor', contact: data.siteSupervisor ? `${data.siteSupervisor}${data.siteSupervisorPhone ? ' · ' + data.siteSupervisorPhone : ''}` : 'See site office' },
    { service: 'First Aid Officer', contact: data.firstAidOfficer ? `${data.firstAidOfficer}${data.firstAidOfficerPhone ? ' · ' + data.firstAidOfficerPhone : ''}` : 'See site office' },
    { service: 'Nearest Medical Centre', contact: data.medicalCentre ? `${data.medicalCentre}${data.medicalCentreAddress ? ' · ' + data.medicalCentreAddress : ''}` : 'See site induction' },
    { service: 'Nearest Hospital', contact: data.nearestHospital ? `${data.nearestHospital}${data.nearestHospitalAddress ? ' · ' + data.nearestHospitalAddress : ''}` : 'See site induction' },
  ];

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#111', color: '#fff', width: '100%', maxWidth: 800, margin: '0 auto', padding: 0, borderRadius: 6, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: '#111', padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '4px solid #dc2626' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 52, height: 52, border: '3px solid #dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚠️</div>
          <div>
            {data.projectName && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{data.projectName}{data.siteAddress ? ` · ${data.siteAddress}` : ''}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>IN AN EMERGENCY</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626', letterSpacing: 2 }}>DIAL 000</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Police · Fire · Ambulance</div>
        </div>
      </div>

      {/* Title bar */}
      <div style={{ background: '#dc2626', padding: '14px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 2, color: '#fff' }}>EMERGENCY CONTACTS</div>
      </div>

      {/* Table */}
      <div style={{ padding: '0 28px 24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr style={{ background: '#374151' }}>
              <th style={{ color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 16px', textAlign: 'left', width: '45%' }}>Service</th>
              <th style={{ color: '#fff', fontWeight: 800, fontSize: 13, padding: '10px 16px', textAlign: 'left' }}>Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#1f2937' : '#111' }}>
                <td style={{ color: '#d1d5db', fontSize: 13, padding: '10px 16px', borderBottom: '1px solid #374151', fontWeight: r.bold ? 700 : 400 }}>{r.service}</td>
                <td style={{ color: r.bold ? '#fff' : '#f9fafb', fontSize: r.bold ? 18 : 13, padding: '10px 16px', borderBottom: '1px solid #374151', fontWeight: r.bold ? 900 : 600 }}>{r.contact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ background: '#1f2937', borderTop: '2px solid #374151', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13 }}>🩺</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#d1d5db', letterSpacing: 1 }}>
          Think Safe &nbsp;•&nbsp; Work Safe &nbsp;•&nbsp; Go Home Safe
        </div>
        <div style={{ fontSize: 13 }}>🚨</div>
      </div>
    </div>
  );
}
