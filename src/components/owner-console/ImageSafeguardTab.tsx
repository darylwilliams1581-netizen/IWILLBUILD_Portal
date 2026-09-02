/**
 * ImageSafeguardTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner Console — Image Safeguard panel.
 *
 * The in-app scanner has been removed. This panel documents the new direction:
 * a separate Cloudflare service on the same R2 photo store.
 *
 * No scan button, no run list, no CSV export, no live classifier calls.
 */

import { Shield, Info } from 'lucide-react';

export default function ImageSafeguardTab() {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield size={20} className="text-violet-500 shrink-0" />
        <div>
          <h2 className="text-base font-semibold text-slate-800">Image Safeguard</h2>
          <p className="text-xs text-slate-500 mt-0.5">Platform image audit policy</p>
        </div>
      </div>

      {/* Status banner */}
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Info size={15} className="text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-slate-600 leading-relaxed">
          Image scanning is not active inside the IWIllBUIlD application.
        </p>
      </div>

      {/* Direction statement */}
      <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 space-y-4 text-sm text-slate-700 leading-relaxed">
        <p>
          The owner-developer is building a separate Cloudflare service on the same R2 photo
          store. Backend scans run in that confined service. Only review flags and notes are
          kept in its database. Photo bytes stay in R2. Results are not posted to Dazza, not
          emailed to clients, and not sent to other jobs.
        </p>

        <p>
          Flags are checked against the platform misconduct policy (sexual content, graphic
          violence, and other prohibited use). A flag is a prompt for owner review. It is not
          an automatic finding of misconduct.
        </p>

        <p>
          Ordinary work photos — crew, customers on site, plant, defects, safety evidence —
          are expected. Clients are not notified of routine review flags.
        </p>

        <p>
          If the owner reviews a file and reasonably believes it is a matter for authorities,
          the owner may restrict access and report it through official channels (eSafety /
          police). The scanner does not contact authorities.
        </p>
      </div>
    </div>
  );
}
