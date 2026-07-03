/**
 * AccountingTab — Settings → Accounting
 * ─────────────────────────────────────────────────────────────────────────────
 * SHELVED: Xero, QuickBooks Online, and MYOB integrations are under development.
 * This tab shows a "Coming Soon" state for all three providers.
 * Re-enable by restoring the full AccountingTab implementation when ready.
 */
import { Clock, Receipt, Building2, BookOpen } from 'lucide-react';

interface Provider {
  name: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
}

const PROVIDERS: Provider[] = [
  {
    name: 'Xero',
    description: 'Sync invoices, contacts, and payments with your Xero organisation.',
    icon: <Receipt className="w-6 h-6 text-blue-500" />,
    badge: 'Coming soon',
  },
  {
    name: 'QuickBooks Online',
    description: 'Push invoices and customer records directly into QuickBooks.',
    icon: <BookOpen className="w-6 h-6 text-green-500" />,
    badge: 'Coming soon',
  },
  {
    name: 'MYOB AccountRight',
    description: 'Connect MYOB to keep your job costs and invoices in sync.',
    icon: <Building2 className="w-6 h-6 text-purple-500" />,
    badge: 'Under development',
  },
];

export default function AccountingTab() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Accounting Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your accounting software to sync invoices, contacts, and payments automatically.
        </p>
      </div>

      {/* Coming soon banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <Clock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">Accounting integrations are coming soon</p>
          <p className="text-sm text-amber-700 mt-0.5">
            We're finalising the OAuth flows and sync engine for all three providers. They'll appear here ready to connect once live.
          </p>
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid gap-4">
        {PROVIDERS.map((provider) => (
          <div
            key={provider.name}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 opacity-60"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                {provider.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{provider.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">{provider.description}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {provider.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
