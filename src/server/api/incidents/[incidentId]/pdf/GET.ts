/**
 * GET /api/incidents/:incidentId/pdf
 * Generate a printable HTML page for the incident report.
 * Returns text/html — the client opens it in a new tab and calls window.print().
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

function esc(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(v: unknown): string {
  if (!v) return '—';
  try {
    return new Date(String(v)).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(v); }
}

function fmtDateTime(v: unknown): string {
  if (!v) return '—';
  try {
    return new Date(String(v)).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(v); }
}

function row(label: string, value: unknown) {
  return `<tr><td class="lbl">${esc(label)}</td><td>${esc(value ?? '—')}</td></tr>`;
}

function section(title: string, content: string) {
  return `<div class="section"><h2>${esc(title)}</h2>${content}</div>`;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const incidentId = parseInt(req.params.incidentId, 10);
    if (isNaN(incidentId)) return res.status(400).json({ error: 'Invalid ID' });

    // Fetch incident
    const [inc] = await db.execute(sql.raw(
      `SELECT i.*, c.name AS company_name
       FROM incidents i
       LEFT JOIN companies c ON c.id = i.company_id
       WHERE i.id = ${incidentId} AND i.company_id = ${profile.companyId}
       LIMIT 1`
    )) as unknown as Array<Record<string, unknown>>;
    if (!inc) return res.status(404).json({ error: 'Not found' });

    // Fetch corrective actions
    const actions = await db.execute(sql.raw(
      `SELECT * FROM incident_corrective_actions WHERE incident_id = ${incidentId} ORDER BY id ASC`
    )) as unknown as Array<Record<string, unknown>>;

    // Fetch third parties
    const thirds = await db.execute(sql.raw(
      `SELECT * FROM incident_third_parties WHERE incident_id = ${incidentId} ORDER BY id ASC`
    )) as unknown as Array<Record<string, unknown>>;

    // Fetch attachments (images only for inline display)
    const attachments = await db.execute(sql.raw(
      `SELECT * FROM incident_attachments WHERE incident_id = ${incidentId} ORDER BY created_at ASC`
    )).catch(() => []) as unknown as Array<Record<string, unknown>>;

    const severityColour: Record<string, string> = {
      low: '#16a34a', medium: '#d97706', high: '#dc2626', critical: '#7f1d1d',
    };
    const sevCol = severityColour[(String(inc.severity ?? '')).toLowerCase()] ?? '#374151';

    const imageAttachments = (attachments as Array<Record<string, unknown>>).filter(a => String(a.file_type) === 'image');
    const docAttachments = (attachments as Array<Record<string, unknown>>).filter(a => String(a.file_type) !== 'image');

    const imagesHtml = imageAttachments.length
      ? `<div class="photo-grid">${imageAttachments.map(a =>
          `<div class="photo-item"><img src="${esc(a.public_url)}" alt="${esc(a.original_name)}" /><p>${esc(a.original_name)}</p></div>`
        ).join('')}</div>`
      : '<p class="none">No photos attached.</p>';

    const docsHtml = docAttachments.length
      ? `<ul>${docAttachments.map(a => `<li>${esc(a.original_name)} (${esc(a.file_type)})</li>`).join('')}</ul>`
      : '';

    const actionsHtml = (actions as Array<Record<string, unknown>>).length
      ? `<table class="full"><thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>
          ${(actions as Array<Record<string, unknown>>).map(a => `<tr>
            <td>${esc(a.action)}</td>
            <td>${esc(a.owner ?? '—')}</td>
            <td>${fmtDate(a.due_date)}</td>
            <td>${esc(a.status)}</td>
          </tr>`).join('')}
        </tbody></table>`
      : '<p class="none">No corrective actions recorded.</p>';

    const thirdsHtml = (thirds as Array<Record<string, unknown>>).length
      ? (thirds as Array<Record<string, unknown>>).map(t => `
          <div class="third-party">
            <strong>${esc(t.name || t.company_org || 'Unknown')}</strong>
            ${t.company_org ? `<span> — ${esc(t.company_org)}</span>` : ''}
            ${t.role_type ? `<span class="badge">${esc(t.role_type)}</span>` : ''}
            <p>${esc(t.involvement)}</p>
            <p class="meta">
              ${t.contact_phone ? `📞 ${esc(t.contact_phone)}` : ''}
              ${t.contact_email ? ` ✉ ${esc(t.contact_email)}` : ''}
              ${t.is_witness ? ' · Witness' : ''}
              ${t.injury_damage_alleged ? ' · Injury/damage alleged' : ''}
              ${t.statement_taken ? ' · Statement taken' : ''}
            </p>
          </div>`).join('')
      : '<p class="none">No third parties recorded.</p>';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Incident Report #${esc(inc.incident_number ?? incidentId)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 24px; }
  .header { background: #b91c1c; color: #fff; padding: 20px 24px; border-radius: 8px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .header .sub { font-size: 13px; opacity: 0.85; margin-top: 4px; }
  .header .meta { text-align: right; font-size: 12px; opacity: 0.85; }
  .severity-badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; color: #fff; background: ${sevCol}; margin-top: 6px; }
  .section { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .section h2 { background: #f3f4f6; padding: 8px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; border-bottom: 1px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; }
  table.full { width: 100%; }
  td, th { padding: 7px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #6b7280; }
  td.lbl { width: 38%; font-weight: 600; color: #374151; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  .none { padding: 12px 14px; color: #9ca3af; font-style: italic; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 14px; }
  .photo-item { width: 140px; }
  .photo-item img { width: 140px; height: 105px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
  .photo-item p { font-size: 10px; color: #6b7280; margin-top: 3px; word-break: break-all; }
  .third-party { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; }
  .third-party:last-child { border-bottom: none; }
  .badge { display: inline-block; background: #f3f4f6; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin-left: 6px; }
  .meta { color: #6b7280; font-size: 11px; margin-top: 4px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
  .sig-block { display: flex; gap: 32px; margin-top: 8px; }
  .sig-line { flex: 1; border-top: 1px solid #374151; padding-top: 4px; font-size: 11px; color: #374151; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
    .page { padding: 0; }
    .header { border-radius: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      <div class="sub">${esc(inc.company_name ?? '')}</div>
      <h1>Incident Report #${esc(inc.incident_number ?? incidentId)}</h1>
      <div class="sub">${esc(inc.incident_type ?? '')}</div>
      <div class="severity-badge">${esc(String(inc.severity ?? '').toUpperCase())}</div>
    </div>
    <div class="meta">
      <div>Status: <strong>${esc(inc.status ?? '')}</strong></div>
      <div>Date: ${fmtDate(inc.incident_date)}</div>
      <div>Time: ${esc(inc.incident_time ?? '—')}</div>
      <div style="margin-top:8px;font-size:10px;">Printed: ${new Date().toLocaleString('en-AU')}</div>
    </div>
  </div>

  ${section('Incident Details', `<table>
    ${row('Reported by', inc.reported_by)}
    ${row('Date', fmtDate(inc.incident_date))}
    ${row('Time', inc.incident_time)}
    ${row('Location / site', inc.location)}
    ${row('Job', inc.job_name ? `${inc.job_name}${inc.job_number ? ' (' + inc.job_number + ')' : ''}` : null)}
    ${row('Incident type', inc.incident_type)}
    ${row('Severity', inc.severity)}
    ${row('Status', inc.status)}
  </table>`)}

  ${section('Description', `<table>
    ${row('Description', inc.description)}
    ${row('Immediate action taken', inc.immediate_action_taken)}
    ${row('Person injured / involved', inc.person_injured)}
    ${row('Medical treatment required', inc.medical_treatment_required ? 'Yes' : 'No')}
    ${row('Witnesses', inc.witnesses)}
    ${row('Additional notes', inc.notes)}
  </table>`)}

  ${section('Corrective Actions', actionsHtml)}

  ${section('Third Parties / Witnesses', thirdsHtml)}

  ${imageAttachments.length || docAttachments.length
    ? section('Photos & Attachments', imagesHtml + docsHtml)
    : ''}

  ${inc.closed_by ? section('Sign-off', `<table>
    ${row('Closed by', inc.closed_by)}
    ${row('Closed at', fmtDateTime(inc.closed_at))}
    ${row('Manager sign-off', inc.manager_sign_off)}
  </table>`) : ''}

  <div class="footer">
    <span>${esc(inc.company_name ?? '')} — Incident Report #${esc(inc.incident_number ?? incidentId)}</span>
    <span>Generated ${new Date().toLocaleString('en-AU')}</span>
  </div>

  <div style="margin-top:40px;">
    <p style="font-size:11px;color:#374151;font-weight:600;margin-bottom:16px;">SIGNATURES</p>
    <div class="sig-block">
      <div class="sig-line">Reported by: ${esc(inc.reported_by ?? '')}<br/><br/><br/>Signature &amp; Date</div>
      <div class="sig-line">Supervisor / Manager<br/><br/><br/>Signature &amp; Date</div>
    </div>
  </div>

</div>
<script>
  // Auto-trigger print dialog when opened in a new tab
  window.addEventListener('load', () => { window.print(); });
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="incident-${incidentId}.html"`);
    return res.send(html);
  } catch (e) {
    console.error('[incident pdf GET]', e);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
